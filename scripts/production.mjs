#!/usr/bin/env node
// Production Monitoring for Claude Code: the one CLI. Human tables by default, --json for machines.
//   npm run production -- --help
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import {
  TABLES, IMPORTERS, reads, insights, shiftReport, machineBrief, recordRun, recordStop, tagStops, recordScrap, recordCheck, correctCheck,
  openAction, closeAction, setRate, setStatus, add, transaction, resolve, required,
} from './lib/production.mjs';

const money = (v, row) => {
  if (v === null || v === undefined) return '';
  return `${row.currency ? row.currency + ' ' : ''}${(Number(v) / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const PCT = new Set(['availability', 'performance', 'quality', 'oee', 'target_oee', 'oee_now']);
const cell = (v, k, row) => {
  if (k.endsWith('_cents')) return money(v, row);
  if (v === null || v === undefined) return '';
  if (PCT.has(k)) return `${(Number(v) * 100).toFixed(1)}%`;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};
function grid(rows) {
  if (!rows.length) return '  (none)';
  const keys = Object.keys(rows[0]).filter((k) => k !== 'currency' || !Object.keys(rows[0]).some((x) => x.endsWith('_cents')));
  const labels = keys.map((k) => k.replace(/_cents$/, ''));
  const body = rows.map((r) => keys.map((k) => cell(r[k], k, r)));
  const widths = keys.map((_, i) => Math.min(60, Math.max(labels[i].length, ...body.map((b) => b[i].length))));
  const fit = (s, i) => (s.length > widths[i] ? s.slice(0, widths[i] - 3) + '...' : s.padEnd(widths[i]));
  const line = (arr) => '  ' + arr.map(fit).join('  ').trimEnd();
  return [line(labels), '  ' + widths.map((w) => '-'.repeat(w)).join('  '), ...body.map(line)].join('\n');
}
export function format(result) {
  if (Array.isArray(result)) {
    if (result[0]?.question) return result.map((x, i) => `${i + 1}. ${x.question}\n${grid(x.rows)}`).join('\n\n');
    return grid(result);
  }
  if (result && typeof result === 'object') {
    const entries = Object.entries(result);
    const isTable = (v) => v && typeof v === 'object' && !(Array.isArray(v) && v.every((x) => typeof x !== 'object'));
    const scalars = entries.filter(([, v]) => !isTable(v)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('; ') || '(none)' : v ?? ''}`);
    const blocks = entries.filter(([, v]) => isTable(v)).map(([k, v]) => `${k}\n${format(Array.isArray(v) ? v : [v])}`);
    return [scalars.join('\n'), ...blocks].filter(Boolean).join('\n\n');
  }
  return String(result);
}

export function parseArgs(args) {
  const opts = {};
  const pos = [];
  for (const a of args) {
    if (a.startsWith('--')) {
      const i = a.indexOf('=');
      opts[a.slice(2, i < 0 ? undefined : i)] = i < 0 ? true : a.slice(i + 1);
    } else pos.push(a);
  }
  return { opts, pos };
}
const ALLOWED = ['json', 'actor', 'dry-run', 'map', 'date', 'shift', 'product', 'count', 'crew', 'minutes', 'note', 'update', 'at', 'all', 'by', 'action',
  'machine', 'reason', 'owner', 'due', 'on', 'help'];

function writePrivate(dir, name, text) {
  const out = path.join(process.env.OUTPUT_DIR || REPO_ROOT, dir);
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  const file = path.join(out, name);
  fs.writeFileSync(file, text, { mode: 0o600 });
  return file;
}
const pct = (v) => (v === null || v === undefined ? '' : `${(Number(v) * 100).toFixed(1)}%`);

export async function run(db, args) {
  const { opts, pos } = parseArgs(args);
  for (const k of Object.keys(opts)) if (!ALLOWED.includes(k)) throw new Error(`Unknown option --${k}`);
  const [cmd, a, b, ...rest] = pos;
  const actor = opts.actor;
  const words = (...xs) => xs.filter(Boolean).join(' ');

  if (cmd in reads) return db.query(reads[cmd]);
  if (cmd === 'insights') return insights(db);
  if (cmd === 'shift-report') return shiftReport(db, a || opts.date, b || opts.shift);
  if (cmd === 'machine') return machineBrief(db, a);
  if (cmd === 'history') return db.query('select created_at, kind, source_file, rows_read, rows_loaded, actor from import_batches order by created_at desc');
  if (cmd === 'weekly-review') {
    return {
      attention: await db.query(reads.attention),
      oee_last_7_days: await db.query(reads.oee),
      top_losses: await db.query('select reason, reason_name, stops, minutes, pct from stop_pareto limit 5'),
      open_actions: await db.query(reads.actions),
      compliance: await db.query(reads.compliance),
    };
  }
  if (cmd === 'run') return transaction(db, actor, () => recordRun(db, a, { date: opts.date, shift: opts.shift, product: opts.product, count: opts.count, crew: opts.crew || '', minutes: opts.minutes, note: opts.note || '', update: Boolean(opts.update), actor }));
  if (cmd === 'stop') return transaction(db, actor, () => recordStop(db, a, b, words(...rest) || opts.reason, { date: opts.date, shift: opts.shift, at: opts.at, note: opts.note || '', actor }));
  if (cmd === 'tag') return transaction(db, actor, () => tagStops(db, required(a, 'machine or stop id'), words(b, ...rest), { date: opts.date, shift: opts.shift, at: opts.at, all: Boolean(opts.all) }));
  if (cmd === 'scrap') return transaction(db, actor, () => recordScrap(db, a, b, words(...rest), { date: opts.date, shift: opts.shift, note: opts.note || '', actor }));
  if (cmd === 'check') return transaction(db, actor, () => recordCheck(db, a, b, rest[0], { date: opts.date, shift: opts.shift, by: opts.by || '', action: opts.action || '', actor }));
  if (cmd === 'correct') return transaction(db, actor, () => correctCheck(db, a, b, words(...rest)));
  if (cmd === 'action') {
    if (a === 'open') return transaction(db, actor, () => openAction(db, words(b, ...rest), { machine: opts.machine, reason: opts.reason, owner: opts.owner || '', due: opts.due }));
    if (a === 'done' || a === 'drop') return transaction(db, actor, () => closeAction(db, required(b, 'action code'), a === 'done' ? 'done' : 'dropped', words(...rest), { on: opts.on }));
    throw new Error('Use: action open <title> | action done <code> <result> | action drop <code> <why>');
  }
  if (cmd === 'set-rate') return transaction(db, actor, () => setRate(db, a, b, rest[0]));
  if (cmd === 'status') return transaction(db, actor, () => setStatus(db, a, b));
  if (cmd === 'log') {
    return transaction(db, actor, async () => {
      const m = await resolve(db, 'machines', a);
      return db.query('insert into notes (machine_id, actor, body) values ($1,$2,$3) returning body', [m.id, actor, required(words(b, ...rest), 'note')]);
    });
  }
  if (cmd === 'add') {
    const data = JSON.parse(fs.readFileSync(required(b, 'JSON file'), 'utf8'));
    return transaction(db, actor, () => add(db, a, data));
  }
  if (cmd === 'import') {
    const common = { map: opts.map, dryRun: Boolean(opts['dry-run']), actor };
    const doIt = (fn) => (common.dryRun ? fn() : transaction(db, actor, fn));
    if (IMPORTERS[a]) return doIt(() => IMPORTERS[a](db, b, common));
    if (a === 'evocon') {
      const report = opts.map ? JSON.parse(fs.readFileSync(opts.map, 'utf8'))._report : null;
      if (!opts.map || !report) throw new Error('import evocon needs --map=FILE naming the report (_report: runs|stops|scrap) and your Evocon columns (see docs/replace-evocon.md)');
      if (!['runs', 'stops', 'scrap'].includes(report)) throw new Error('_report must be runs, stops or scrap');
      return doIt(() => IMPORTERS[report](db, b, common));
    }
    throw new Error(`Use: import ${Object.keys(IMPORTERS).join('|')}|evocon <csv>`);
  }
  if (cmd === 'export') {
    const data = { format: 'production-monitoring-v1', exported_at: new Date().toISOString(), tables: {} };
    await db.exec('BEGIN READ ONLY');
    try {
      for (const t of TABLES) {
        const order = t === 'settings' ? 'key' : t === 'machine_checks' ? 'machine_id, check_type_id' : 'created_at, id';
        data.tables[t] = await db.query(`select * from ${t} order by ${order}`);
      }
    } finally { await db.exec('ROLLBACK'); }
    const file = writePrivate('exports', `production-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.json`, JSON.stringify(data, null, 2) + '\n');
    return { file, counts: Object.fromEntries(TABLES.map((t) => [t, data.tables[t].length])) };
  }
  if (cmd === 'draft-shift-report') {
    const r = await shiftReport(db, a || opts.date, b || opts.shift);
    const lines = r.machines.map((m) => `| ${m.machine} | ${m.product} | ${m.total} | ${m.scrap} | ${pct(m.availability)} | ${pct(m.performance)} | ${pct(m.quality)} | ${pct(m.oee)} |`).join('\n');
    const stops = r.stops_over_10_min_or_unexplained.map((s) => `- ${s.machine} ${s.starts_at ? String(s.starts_at).slice(0, 5) : ''} ${s.minutes} min: ${s.reason_name}${s.note ? ` (${s.note})` : ''}`).join('\n') || '- None';
    const checks = [...r.checks.filter((c) => c.result === 'fail').map((c) => `- ${c.machine} ${c.check_code} FAILED${c.corrective_action ? `: ${c.corrective_action}` : ', no corrective action written'}`),
      ...r.checks_missing.map((c) => `- ${c.machine} ${c.check_code} not recorded`)].join('\n') || '- All checks recorded and passed';
    const text = `# DRAFT: shift handover, ${r.date} ${r.shift}\n\n| Machine | Product | Count | Rejects | Availability | Performance | Quality | OEE |\n|---|---|---|---|---|---|---|---|\n${lines}\n\n## Stops over 10 minutes, and stops with no reason\n\n${stops}\n\n## Checks\n\n${checks}\n\n## For the next shift\n\n- [Write what the next crew needs to know]\n`;
    return { file: writePrivate('drafts', `shift-report-${r.date}-${r.shift}.md`, text), machines: r.machines.length };
  }
  if (cmd === 'draft-weekly-review') {
    const data = await run(db, ['weekly-review']);
    return { file: writePrivate('drafts', `weekly-review-${new Date().toISOString().slice(0, 10)}.md`, `# Production: weekly review (draft for the plant manager)\n\n\`\`\`\n${format(data)}\n\`\`\`\n`) };
  }
  throw new Error(`Unknown command "${cmd || ''}". Run --help`);
}

export const help = `Production Monitoring for Claude Code
Read:    ${Object.keys(reads).join(', ')}
         insights, weekly-review, history, shift-report [YYYY-MM-DD] [shift], machine <machine>
Shift:   run <machine> --shift=D --product=CODE --count=N [--date=YYYY-MM-DD] [--crew=] [--minutes=] [--note=] [--update] --actor=NAME
         stop <machine> <minutes|h:mm> [reason] --shift=D [--date=] [--at=HH:MM] [--note=] --actor=NAME   no reason = unexplained
         tag <machine|stop-id> <reason> [--shift=] [--date=] [--at=HH:MM] [--all] --actor=NAME               give unexplained stops a reason
         scrap <machine> <qty> <reason> --shift=D [--date=] --actor=NAME
Checks:  check <machine> <check> pass|fail [--shift=D] [--date=] [--by=NAME] [--action="what was done"] --actor=NAME
         correct <machine> <check> <what was done> --actor=NAME                                           corrective action on the last fail
Actions: action open <title> [--machine=] [--reason=] [--owner=] [--due=YYYY-MM-DD] --actor=NAME
         action done <code> <result> | action drop <code> <why> --actor=NAME
Setup:   set-rate <machine> <product> <ideal seconds per unit> --actor=NAME
         status <machine> active|idle|retired --actor=NAME
         add machine|product|shift|stop-reason|scrap-reason|check-type|machine-check|setting <json-file> --actor=NAME
         log <machine> <note> --actor=NAME
Import:  import machines|products|runs|stops|scrap <csv> [--map=FILE] [--dry-run] --actor=NAME
         import evocon <csv> --map=FILE [--dry-run] --actor=NAME     an Evocon report saved as CSV, columns named in the map
Out:     export, draft-shift-report [YYYY-MM-DD] [shift], draft-weekly-review
Names match partly and case-insensitively; an ambiguous name lists the candidates and exits 1.
All commands take --json. No command sends email or deletes a record. OEE is worked out from counts, stops and rejects: never typed in.`;

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help')) console.log(help);
  else {
    let db;
    try {
      db = await getDb();
      const result = await run(db, args);
      console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : format(result));
    } catch (e) {
      console.error(args.includes('--json') ? JSON.stringify({ error: e.message, candidates: e.candidates || [] }) : e.message + (e.candidates?.length ? '\n' + format(e.candidates) : ''));
      process.exitCode = 1;
    } finally {
      await db?.close();
    }
  }
}
