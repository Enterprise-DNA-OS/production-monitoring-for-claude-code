#!/usr/bin/env node
// npm test: a temporary database, the demo plant, every command, the imports, the dashboards and
// the documents. Set TEST_DATABASE_URL to also run it against a disposable Postgres (its public
// schema is dropped first; never point it at real data).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { seed } from './seed.mjs';
import { run } from './production.mjs';
import { reads } from './lib/production.mjs';

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function suite(label, env) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'production-test-'));
  Object.assign(process.env, { OUTPUT_DIR: tmp, DATA_DIR: path.join(tmp, 'db'), DATABASE_URL: env.DATABASE_URL || '' });
  let db = await getDb();
  try {
    if (db.mode === 'postgres') await db.exec('drop schema public cascade; create schema public;');
    assert.equal((await migrate(db)).ran.length, 1);
    assert.equal((await migrate(db)).ran.length, 0, 'migrate is repeatable');
    await seed(db);
    await seed(db);
    assert.equal((await db.query('select count(*)::int as n from machines'))[0].n, 5, 'seed is idempotent');

    // Every read answers.
    for (const cmd of Object.keys(reads)) assert(Array.isArray(await run(db, [cmd])), cmd);
    for (const cmd of ['insights', 'weekly-review', 'history', 'shift-report']) assert(await run(db, [cmd]), cmd);
    assert.equal((await run(db, ['insights'])).length, 10);
    assert.equal((await run(db, ['machine', 'PK-2'])).machine.code, 'PK-2');

    // The demo hides what a plant meets.
    const att = (await run(db, ['attention'])).map((a) => `${a.item}:${a.what.split(' ')[0]}`);
    for (const want of ['unexplained stops:PK-1', 'unexplained stops:PK-3', 'OEE under target:PK-2', 'repeat breakdown:PK-2', 'ideal speed looks wrong:CT-1',
      'scrap over limit:PK-3', 'no production recorded:PK-4', 'action overdue:A-001', 'check failed:PK-1', 'check overdue:CT-1']) assert(att.includes(want), `attention lacks ${want}`);
    const rules = (await run(db, ['compliance'])).map((c) => `${c.rule}:${c.record}`);
    for (const want of [`FAILED_NO_CORRECTIVE_ACTION:PK-1 CCP-MD ${day(-1)}`, `HOLD_SINCE_LAST_GOOD_CHECK:PK-1 CCP-MD ${day(-1)}`, `SHIFT_CHECK_MISSING:PK-3 ${day(-2)} A`, 'PERIODIC_CHECK_OVERDUE:CT-1 GUARD-W']) assert(rules.includes(want), `compliance lacks ${want}`);
    const oee = await run(db, ['oee']);
    assert.equal(oee[0].machine, 'PK-2', 'the worst machine is first');
    const pk2 = oee[0];
    assert(Math.abs(Number(pk2.oee) - Number(pk2.availability) * Number(pk2.performance) * Number(pk2.quality)) < 0.01, 'OEE is availability x performance x quality');
    const pareto = await run(db, ['pareto']);
    assert.equal(pareto[0].reason, 'JAM');
    assert.equal(Number(pareto[pareto.length - 1].cumulative_pct), 100);
    const co = await run(db, ['changeovers']);
    assert.equal(co[0].from_product, 'SCO-150', 'the allergen clean is the longest changeover');
    const worked = (await run(db, ['insights']))[7].rows[0];
    assert(Number(worked.avg_min_since) < Number(worked.avg_min_before), 'the closed changeover action shows its effect');

    // A shift as the crew records it: the run, stops, rejects and checks. OEE follows from them.
    await assert.rejects(run(db, ['run', 'PK-1', '--shift=D', '--product=SALT-150', '--count=20000']), /--actor/);
    await assert.rejects(run(db, ['run', 'PK-1', `--date=${day(-1)}`, '--shift=D', '--product=SALT-150', '--count=1', '--actor=Test']), /already recorded/);
    const r = await run(db, ['run', 'PK-1', '--shift=D', '--product=SALT-150', '--count=19800', '--crew=Crew A', '--actor=Test']);
    assert.deepEqual(r.warnings, []);
    await run(db, ['stop', 'PK-1', '30', 'BREAK', '--shift=D', '--at=10:00', '--actor=Test']);
    await run(db, ['stop', 'PK-1', '0:45', 'Seal jaw', '--shift=D', '--at=08:00', '--actor=Test']);
    await run(db, ['stop', 'PK-1', '12', '--shift=D', '--at=11:30', '--actor=Test']);
    await run(db, ['stop', 'PK-1', '7', '--shift=D', '--at=12:10', '--actor=Test']);
    await assert.rejects(run(db, ['stop', 'PK-2', '5', 'JAM', '--shift=D', '--actor=Test']), /No run recorded/);
    await assert.rejects(run(db, ['tag', 'PK-1', 'JAM', '--shift=D', '--actor=Test']), (e) => e.candidates.length === 2);
    assert.equal((await run(db, ['tag', 'PK-1', 'JAM', '--shift=D', '--at=11:30', '--actor=Test'])).tagged, 1);
    assert.equal((await run(db, ['tag', 'PK-1', 'FILM', '--shift=D', '--actor=Test'])).tagged, 1);
    await run(db, ['scrap', 'PK-1', '120', 'SEAL', '--shift=D', '--actor=Test']);
    await assert.rejects(run(db, ['scrap', 'PK-1', '999999', 'WT', '--shift=D', '--actor=Test']), /Fix the run count/);
    const [today] = await db.query(`select planned_min, run_min, availability, performance, quality, oee from run_oee where machine = 'PK-1' and run_date = current_date`);
    assert.equal(Number(today.planned_min), 450);
    assert.equal(Number(today.run_min), 386);
    assert.equal(Number(today.quality), Number((19680 / 19800).toFixed(3)));
    assert.equal(Number(today.oee), Number((19680 / 60 / 450).toFixed(3)), 'OEE is good units at ideal speed over planned time');
    await run(db, ['run', 'PK-1', '--shift=D', '--count=20100', '--update', '--actor=Test']);
    assert.equal((await db.query(`select total_count from runs ru join machines m on m.id = ru.machine_id where m.code = 'PK-1' and run_date = current_date`))[0].total_count, 20100);

    const failed = await run(db, ['check', 'PK-1', 'CCP-MD', 'fail', '--shift=D', '--by=Sarah Lim', '--actor=Test']);
    assert(failed.warnings[0].includes('corrective action'));
    await run(db, ['check', 'PK-1', 'PRE', 'pass', '--shift=D', '--actor=Test']);
    await assert.rejects(run(db, ['check', 'CT-1', 'CCP-MD', 'pass', '--actor=Test']), /not set up/);
    await run(db, ['correct', 'PK-1', 'CCP-MD', 'Detector re-calibrated; product since the 06:00 check held and re-checked', '--actor=Test']);
    await run(db, ['correct', 'PK-1', 'CCP-MD', 'Product held and re-checked', '--actor=Test']);
    await run(db, ['check', 'CT-1', 'GUARD-W', 'pass', '--by=Hemi Walker', '--actor=Test']);
    const after = (await run(db, ['compliance'])).map((c) => c.record);
    assert(!after.includes('CT-1 GUARD-W'), 'the weekly test clears the overdue finding');
    assert(!after.some((x) => x.startsWith(`PK-1 CCP-MD ${day(0)}`)), 'a corrected failure that held the product is no longer a finding');

    // Actions, rates, status, notes, setup.
    const act = await run(db, ['action', 'open', 'Swap', 'the', 'seal', 'jaw', 'springs', '--machine=PK-1', '--reason=SEAL', '--owner=Hemi Walker', `--due=${day(5)}`, '--actor=Test']);
    assert.equal(act.action, 'A-004');
    assert.equal((await run(db, ['action', 'done', 'A-001', 'Heater', 'replaced', '--actor=Test'])).status, 'done');
    await assert.rejects(run(db, ['action', 'done', 'A-001', 'again', '--actor=Test']), /already done/);
    assert(!(await run(db, ['attention'])).some((a) => a.item === 'action overdue'));
    const rate = await run(db, ['set-rate', 'CT-1', 'CTN-12', '1.4', '--actor=Test']);
    assert.equal(rate.was, 1.5);
    assert.equal((await run(db, ['status', 'PK-4', 'idle', '--actor=Test'])).status, 'idle');
    assert(!(await run(db, ['attention'])).some((a) => a.what === 'PK-4'), 'an idle machine is not chased');
    await run(db, ['log', 'PK-2', 'OEM tech booked for Thursday', '--actor=Test']);
    fs.writeFileSync(path.join(tmp, 'r.json'), JSON.stringify({ code: 'AIR', name: 'Low air pressure', kind: 'unplanned', loss: 'breakdown' }));
    assert.equal((await run(db, ['add', 'stop-reason', path.join(tmp, 'r.json'), '--actor=Test'])).code, 'AIR');
    await assert.rejects(run(db, ['machine', 'PK']), (e) => e.candidates.length === 4);

    // Imports: a machine, its products and rates, runs (never twice), stops by code or name, rejects, and an Evocon report by column map.
    const ex = (f) => path.join(REPO_ROOT, 'examples', f);
    assert.equal((await run(db, ['import', 'machines', ex('machines.csv'), '--dry-run'])).would_load, 1);
    assert.equal((await run(db, ['import', 'machines', ex('machines.csv'), '--actor=Test'])).loaded, 1);
    assert.equal((await run(db, ['import', 'products', ex('products.csv'), '--actor=Test'])).loaded, 2);
    assert.equal((await run(db, ['import', 'runs', ex('runs.csv'), '--actor=Test'])).loaded, 2);
    assert.equal((await run(db, ['import', 'runs', ex('runs.csv'), '--actor=Test'])).skipped_already_loaded.length, 2, 'a run never loads twice');
    assert.equal((await run(db, ['import', 'stops', ex('stops.csv'), '--actor=Test'])).loaded, 4);
    assert.equal((await run(db, ['import', 'stops', ex('stops.csv'), '--actor=Test'])).skipped_already_loaded, 4);
    assert.equal((await run(db, ['import', 'scrap', ex('scrap.csv'), '--actor=Test'])).loaded, 2);
    const fl = (await db.query(`select down_min, planned_min, unexplained_stops, ideal_cycle_seconds from run_oee where machine = 'FL-1' and shift = 'D'`))[0];
    assert.equal(Number(fl.down_min), 22.5, 'h:mm:ss durations load as minutes');
    assert.equal(Number(fl.planned_min), 450);
    assert.equal(Number(fl.ideal_cycle_seconds), 2.2, 'the product rate from the import is used');
    const bad = path.join(tmp, 'bad-stops.csv');
    fs.writeFileSync(bad, 'machine,date,shift,start,minutes,reason\nFL-1,2026-11-02,D,09:00,5,Gremlins\n');
    await assert.rejects(run(db, ['import', 'stops', bad, '--actor=Test']), /Unknown stop reasons: Gremlins/);
    await assert.rejects(run(db, ['import', 'evocon', ex('stops.csv'), '--actor=Test']), /--map/);
    const evo = path.join(tmp, 'evocon-downtime.csv');
    fs.writeFileSync(evo, 'Station,Date,Shift,Start time,Duration,Reason,Comment\nFL-1,03.11.2026,D,06:00,0:30:00,Meal break,\nFL-1,03.11.2026,D,09:40,0:06:00,,\n');
    await run(db, ['run', 'FL-1', '--date=2026-11-03', '--shift=D', '--product=TRAY-500', '--count=9000', '--actor=Test']);
    assert.equal((await run(db, ['import', 'evocon', evo, `--map=${ex('evocon-stops-map.example.json')}`, '--actor=Test'])).loaded, 2);
    assert.equal((await run(db, ['history'])).length, 8);

    const exp = await run(db, ['export']);
    assert(JSON.parse(fs.readFileSync(exp.file, 'utf8')).tables.runs.length >= 230);
    const draft = await run(db, ['draft-shift-report', day(-1), 'A']);
    const text = fs.readFileSync(draft.file, 'utf8');
    assert(text.includes('DRAFT') && text.includes('PK-1 CCP-MD FAILED'));
    assert(fs.existsSync((await run(db, ['draft-weekly-review'])).file));
    await db.close();
    db = null;

    // The CLI as a person runs it, the dashboards and the documents.
    const cli = (args) => spawnSync(process.execPath, [path.join('scripts', 'production.mjs'), ...args], { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });
    const ok = cli(['oee', '--json']);
    assert.equal(ok.status, 0, ok.stderr);
    assert(Array.isArray(JSON.parse(ok.stdout)));
    const ambiguous = cli(['machine', 'pk', '--json']);
    assert.equal(ambiguous.status, 1);
    assert(JSON.parse(ambiguous.stderr).candidates.length === 4);
    assert(cli(['--help']).stdout.includes('import evocon'));
    for (const script of ['view', 'docs']) {
      const res = spawnSync(process.execPath, [path.join('scripts', `${script}.mjs`)], { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });
      assert.equal(res.status, 0, res.stderr);
    }
    assert.equal(fs.readdirSync(path.join(tmp, 'views')).length, 3);
    const reports = fs.readdirSync(path.join(tmp, 'docs-out', 'shift-report'));
    assert(reports.length >= 5);
    assert(reports.every((f) => !/[:<>"|?*]/.test(f)), 'file names are safe on Windows');
    const ccp = fs.readdirSync(path.join(tmp, 'docs-out', 'ccp-record'));
    assert.equal(ccp.length, 3);
    assert(ccp.some((f) => fs.readFileSync(path.join(tmp, 'docs-out', 'ccp-record', f), 'utf8').includes('Codex CXC 1-1969')));
    console.log(`PASS ${label}: migrate, seed, ${Object.keys(reads).length + 5} reads, a shift recorded (run, stops, tags, rejects, checks) and its OEE checked, actions, rates, 6 imports, export, drafts, 3 dashboards, 2 documents`);
  } finally {
    await db?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

await suite('embedded database', {});
if (process.env.TEST_DATABASE_URL) await suite('Postgres', { DATABASE_URL: process.env.TEST_DATABASE_URL });
