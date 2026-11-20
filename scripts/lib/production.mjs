// Production monitoring: machines, shifts, runs, stops, scrap, checks and actions.
// Every function takes the db handle from lib/db.mjs. Nothing here sends or deletes.
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, pick } from './csv.mjs';

export const TABLES = ['settings', 'machines', 'shifts', 'products', 'product_rates', 'stop_reasons', 'scrap_reasons', 'runs', 'stops', 'scrap',
  'check_types', 'machine_checks', 'check_records', 'actions', 'notes', 'import_batches'];

export function required(v, what) {
  if (v === undefined || v === null || v === true || String(v).trim() === '') throw new Error(`Missing ${what}`);
  return String(v).trim();
}
export function isoDate(v, what = 'date') {
  const s = required(v, what);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + 'T00:00:00Z'))) throw new Error(`${what} must be YYYY-MM-DD, got "${s}"`);
  return s;
}
export function whole(v, what) {
  const s = required(v, what).replace(/,/g, '');
  if (!/^\d+$/.test(s)) throw new Error(`${what} must be a whole number, got "${s}"`);
  return Number(s);
}
export function positive(v, what) {
  const s = required(v, what).replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(s) || Number(s) <= 0) throw new Error(`${what} must be a number above zero, got "${s}"`);
  return Number(s);
}
// "1,234.50", "$12" -> integer cents
export function cents(v, what = 'amount') {
  const s = required(v, what).replace(/[$,\s]/g, '').replace(/^(NZD|AUD|USD|EUR)/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error(`${what} is not a money amount: "${v}"`);
  const [w, frac = ''] = s.split('.');
  return Number(w) * 100 + Number(frac.padEnd(2, '0'));
}
// "25", "25.5", "0:25:00", "1:05" (h:mm) -> minutes
export function minutesOf(v, what = 'minutes') {
  const s = required(v, what);
  const hms = s.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (hms) return Number(hms[1]) * 60 + Number(hms[2]) + Number(hms[3] || 0) / 60;
  return positive(s, what);
}
// YYYY-MM-DD, or DD/MM/YYYY and DD.MM.YYYY as reports in NZ, AU and Europe print them.
export function anyDate(v, what = 'date') {
  const s = required(v, what).slice(0, 10);
  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmy) return isoDate(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`, what);
  return isoDate(s, what);
}
const today = () => new Date().toISOString().slice(0, 10);

const FINDERS = {
  machines: { sql: 'select id, code, name, area, status from machines', keys: ['code', 'name'] },
  shifts: { sql: 'select id, code, name, starts, minutes from shifts', keys: ['code', 'name'] },
  products: { sql: 'select id, code, name, unit from products', keys: ['code', 'name'] },
  stop_reasons: { sql: 'select id, code, name, kind, loss from stop_reasons where active', keys: ['code', 'name'] },
  scrap_reasons: { sql: 'select id, code, name, stage from scrap_reasons', keys: ['code', 'name'] },
  check_types: { sql: 'select id, code, name, frequency from check_types', keys: ['code', 'name'] },
  actions: { sql: 'select id, code, title, owner, status from actions', keys: ['code', 'title'] },
};
// Find one row by code or name, exact first, then partly. Ambiguous: throw with the candidates.
export async function resolve(db, kind, ref) {
  const q = required(ref, `${kind.replace(/s$/, '').replace('_', ' ')} reference`).toLowerCase();
  const rows = await db.query(FINDERS[kind].sql);
  const val = (r, k) => String(r[k] ?? '').toLowerCase();
  const exact = rows.filter((r) => FINDERS[kind].keys.some((k) => val(r, k) === q));
  const hits = exact.length ? exact : rows.filter((r) => FINDERS[kind].keys.some((k) => val(r, k).includes(q)) || String(r.id).startsWith(q));
  if (hits.length === 1) return hits[0];
  const e = new Error(hits.length ? `"${ref}" matches ${hits.length} ${kind.replace('_', ' ')}; be more specific` : `No ${kind.replace('_', ' ')} matches "${ref}"`);
  e.candidates = hits.map(({ id, ...rest }) => ({ id: String(id).slice(0, 8), ...rest }));
  throw e;
}

export async function transaction(db, actor, fn) {
  required(actor, '--actor=NAME (who is making this change)');
  await db.exec('BEGIN');
  try {
    const out = await fn();
    await db.exec('COMMIT');
    return out;
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

async function findRun(db, machineRef, date, shiftRef) {
  const m = await resolve(db, 'machines', machineRef);
  const d = isoDate(date || today(), '--date');
  if (!shiftRef) {
    const runs = await db.query('select ru.id, s.code as shift from runs ru join shifts s on s.id = ru.shift_id where ru.machine_id = $1 and ru.run_date = $2 order by s.starts', [m.id, d]);
    if (runs.length === 1) return { id: runs[0].id, machine: m, date: d, shift: runs[0].shift };
    const e = new Error(runs.length ? `${m.code} ran ${runs.length} shifts on ${d}; add --shift=` : `No run recorded for ${m.code} on ${d}. Record it first with: run ${m.code} --date=${d} --shift=CODE --product=CODE --count=N`);
    e.candidates = runs;
    throw e;
  }
  const s = await resolve(db, 'shifts', shiftRef);
  const [r] = await db.query('select id from runs where machine_id = $1 and run_date = $2 and shift_id = $3', [m.id, d, s.id]);
  if (!r) throw new Error(`No run recorded for ${m.code} on ${d} ${s.code}. Record it first with: run ${m.code} --date=${d} --shift=${s.code} --product=CODE --count=N`);
  return { id: r.id, machine: m, date: d, shift: s.code };
}

// ---------------------------------------------------------------- reads

export const COMPLIANCE_SQL = `
select 'SHIFT_CHECK_MISSING' as rule, 'high' as severity, o.run as record, ct.name as detail,
       'no ' || ct.code || ' recorded for a run that made ' || o.total_count || ' units' as finding, ct.source
from run_oee o join machine_checks mc on mc.machine_id = o.machine_id join check_types ct on ct.id = mc.check_type_id and ct.frequency = 'shift'
where o.run_date > current_date - 14
  and not exists (select 1 from check_records cr where cr.run_id = o.id and cr.check_type_id = ct.id)
union all
select 'FAILED_NO_CORRECTIVE_ACTION', 'high', m.code || ' ' || ct.code || ' ' || cr.done_on, ct.name,
       'failed, and no corrective action is written against it', ct.source
from check_records cr join machines m on m.id = cr.machine_id join check_types ct on ct.id = cr.check_type_id
where cr.result = 'fail' and cr.corrective_action = '' and cr.done_on > current_date - 28
union all
select 'HOLD_SINCE_LAST_GOOD_CHECK', 'high', m.code || ' ' || ct.code || ' ' || cr.done_on, ct.name,
       (select coalesce(sum(o.total_count), 0) from runs o join shifts os on os.id = o.shift_id
        where o.machine_id = cr.machine_id and (o.run_date, os.starts) <= (fr.run_date, fs.starts)
          and (o.run_date, os.starts) > (coalesce(lp.run_date, '1900-01-01'::date), coalesce(lp.starts, '00:00'::time)))
       || ' units made since the last passing check' || coalesce(' (' || lp.run_date || ')', '') || ': hold them and re-check', ct.source
from check_records cr join machines m on m.id = cr.machine_id join check_types ct on ct.id = cr.check_type_id
join runs fr on fr.id = cr.run_id join shifts fs on fs.id = fr.shift_id
left join lateral (select pr.run_date, ps.starts from check_records p join runs pr on pr.id = p.run_id join shifts ps on ps.id = pr.shift_id
                   where p.machine_id = cr.machine_id and p.check_type_id = cr.check_type_id and p.result = 'pass' and (pr.run_date, ps.starts) < (fr.run_date, fs.starts)
                   order by pr.run_date desc, ps.starts desc limit 1) lp on true
where cr.result = 'fail' and ct.code like 'CCP%' and cr.done_on > current_date - 28 and cr.corrective_action !~* 'held|hold|re-?check|released|destroy'
union all
select 'PERIODIC_CHECK_OVERDUE', 'medium', cs.machine || ' ' || cs.check_code, cs.check_name,
       'last done ' || coalesce(cs.last_done::text, 'never') || ', due ' || coalesce(cs.next_due::text, 'now'), ct.source
from check_status cs join check_types ct on ct.id = cs.check_type_id
where cs.frequency <> 'shift' and coalesce(cs.next_due, current_date - 1) < current_date
order by 2, 1, 3`;

export const reads = {
  machines: `select m.code, m.name, m.area, m.default_ideal_cycle_seconds as ideal_seconds, m.target_oee, m.status,
                    (select max(run_date) from runs r where r.machine_id = m.id) as last_run from machines m order by m.code`,
  products: `select p.code, p.name, p.unit, p.unit_cost_cents, p.currency, p.allergens,
                    coalesce(string_agg(m.code || ' ' || pr.ideal_cycle_seconds || 's', ', ' order by m.code), '') as ideal_cycle
             from products p left join product_rates pr on pr.product_id = p.id left join machines m on m.id = pr.machine_id
             where p.active group by p.id order by p.code`,
  shifts: `select code, name, starts, minutes from shifts where active order by starts`,
  reasons: `select code, name, kind, loss from stop_reasons where active order by kind desc, loss, code`,
  'scrap-reasons': `select code, name, stage from scrap_reasons order by code`,
  oee: `select machine, name, runs, planned_min, down_min, total, good, availability, performance, quality, oee, target_oee from machine_oee_7d order by oee nulls last`,
  'oee-28': `select machine, name, runs, planned_min, down_min, total, good, availability, performance, quality, oee, target_oee from machine_oee_28d order by oee nulls last`,
  runs: `select run, product, crew, planned_min, down_min, total_count as total, scrap, availability, performance, quality, oee from run_oee
         where run_date >= current_date - 2 order by run_date desc, shift, machine`,
  trend: `select machine, to_char(date_trunc('week', run_date), 'YYYY-MM-DD') as week_of, count(*)::int as runs,
                 round(sum(good_ideal_min) / nullif(sum(planned_min), 0), 3) as oee,
                 round(sum(run_min) / nullif(sum(planned_min), 0), 3) as availability,
                 round(sum(ideal_min) / nullif(sum(run_min), 0), 3) as performance,
                 round(sum(good)::numeric / nullif(sum(total_count), 0), 3) as quality
          from run_oee where run_date > current_date - 28 group by machine, date_trunc('week', run_date) order by machine, week_of`,
  pareto: `select reason, reason_name, loss, stops, minutes, pct, cumulative_pct from stop_pareto`,
  losses: `select o.machine,
                  round(sum(coalesce(st.breakdown, 0)), 0) as breakdown_min, round(sum(coalesce(st.changeover, 0)), 0) as changeover_min,
                  round(sum(coalesce(st.minor, 0)), 0) as minor_stop_min, round(sum(coalesce(st.other, 0)), 0) as other_stop_min,
                  round(sum(greatest(o.run_min - o.ideal_min, 0)), 0) as speed_loss_min,
                  round(sum(coalesce(sc.startup, 0) * o.ideal_cycle_seconds / 60.0), 0) as startup_reject_min,
                  round(sum(coalesce(sc.running, 0) * o.ideal_cycle_seconds / 60.0), 0) as reject_min
           from run_oee o
           left join (select s.run_id, sum(s.minutes) filter (where r.loss = 'breakdown') as breakdown, sum(s.minutes) filter (where r.loss = 'changeover') as changeover,
                             sum(s.minutes) filter (where r.loss = 'minor') as minor, sum(s.minutes) filter (where r.loss in ('material', 'people', 'quality') or s.reason_id is null) as other
                      from stops s left join stop_reasons r on r.id = s.reason_id group by s.run_id) st on st.run_id = o.id
           left join (select x.run_id, sum(x.qty) filter (where sr.stage = 'startup') as startup, sum(x.qty) filter (where sr.stage = 'running') as running
                      from scrap x join scrap_reasons sr on sr.id = x.reason_id group by x.run_id) sc on sc.run_id = o.id
           where o.run_date > current_date - 28 group by o.machine order by o.machine`,
  changeovers: `select machine, from_product, to_product, count(*)::int as times, round(avg(minutes), 1) as avg_min, min(minutes) as best_min, max(minutes) as worst_min,
                       max(run_date) as last
                from changeovers where run_date > current_date - 28 group by machine, from_product, to_product order by avg_min desc`,
  rejects: `select o.machine, sr.code as reason, sr.name, sum(x.qty)::int as units, o.currency, sum(x.qty * o.unit_cost_cents)::bigint as cost_cents
          from scrap x join scrap_reasons sr on sr.id = x.reason_id join run_oee o on o.id = x.run_id
          where o.run_date > current_date - 28 group by o.machine, sr.code, sr.name, o.currency order by cost_cents desc`,
  unexplained: `select id, run_date, machine, shift, starts_at, minutes, note from stop_detail where reason = '(no reason)' and run_date > current_date - 14 order by run_date desc, machine, starts_at`,
  actions: `select a.code, a.title, m.code as machine, r.code as reason, a.owner, a.opened_on, a.due_on,
                   case when a.due_on < current_date then current_date - a.due_on end as days_overdue
            from actions a left join machines m on m.id = a.machine_id left join stop_reasons r on r.id = a.reason_id
            where a.status = 'open' order by a.due_on nulls last, a.code`,
  checks: `select machine, check_code, check_name, frequency, last_done, last_result, next_due from check_status order by machine, check_code`,
  attention: `select item, what, why, due from attention order by due, item`,
  compliance: COMPLIANCE_SQL,
};

export const QUESTIONS = [
  ['Which machines lost the most time to unplanned stops in the last four weeks, and to what?',
    `select machine, reason, reason_name, count(*)::int as stops, round(sum(minutes) / 60.0, 1) as hours from stop_detail
     where kind = 'unplanned' and run_date > current_date - 28 group by machine, reason, reason_name order by sum(minutes) desc limit 8`],
  ['Which few reasons make up most of the downtime?',
    `select reason, reason_name, stops, minutes, pct, cumulative_pct from stop_pareto limit 5`],
  ['Which changeovers take longest, and how far above the best time?',
    `select machine, from_product, to_product, count(*)::int as times, round(avg(minutes), 1) as avg_min, min(minutes) as best_min,
            round(avg(minutes) - min(minutes), 1) as above_best_min from changeovers where run_date > current_date - 28
     group by machine, from_product, to_product order by avg_min desc`],
  ['Which shift runs each machine better?',
    `select machine, shift, count(*)::int as runs, round(sum(good_ideal_min) / nullif(sum(planned_min), 0), 3) as oee,
            round(sum(run_min) / nullif(sum(planned_min), 0), 3) as availability, round(sum(ideal_min) / nullif(sum(run_min), 0), 3) as performance
     from run_oee where run_date > current_date - 28 group by machine, shift order by machine, shift`],
  ['Which products run furthest below their ideal speed?',
    `select machine, product, count(*)::int as runs, ideal_cycle_seconds as ideal_seconds,
            round(sum(run_min) * 60 / nullif(sum(total_count), 0), 3) as actual_seconds, round(sum(ideal_min) / nullif(sum(run_min), 0), 3) as performance
     from run_oee where run_date > current_date - 28 group by machine, product, ideal_cycle_seconds order by performance`],
  ['What did rejects cost over four weeks, by reason?',
    `select sr.code as reason, sr.name, sum(x.qty)::int as units, o.currency, sum(x.qty * o.unit_cost_cents)::bigint as cost_cents
     from scrap x join scrap_reasons sr on sr.id = x.reason_id join run_oee o on o.id = x.run_id
     where o.run_date > current_date - 28 group by sr.code, sr.name, o.currency order by cost_cents desc`],
  ['How much do the short stops add up to on each machine?',
    `select machine, count(*)::int as stops, round(sum(minutes) / 60.0, 1) as hours, round(avg(minutes), 1) as avg_min from stop_detail
     where kind = 'unplanned' and run_date > current_date - 28
       and minutes <= (select coalesce(max(value::numeric), 5) from settings where key = 'minor_stop_minutes')
     group by machine order by sum(minutes) desc`],
  ['Did the actions we closed work?',
    `select a.code, a.title, m.code as machine, r.code as reason, a.closed_on,
            (select round(avg(s.minutes), 1) from stop_detail s where s.machine_id = a.machine_id and s.reason = r.code and s.run_date between a.closed_on - 28 and a.closed_on - 1) as avg_min_before,
            (select round(avg(s.minutes), 1) from stop_detail s where s.machine_id = a.machine_id and s.reason = r.code and s.run_date >= a.closed_on) as avg_min_since,
            (select count(*)::int from stop_detail s where s.machine_id = a.machine_id and s.reason = r.code and s.run_date >= a.closed_on) as stops_since
     from actions a join machines m on m.id = a.machine_id join stop_reasons r on r.id = a.reason_id where a.status = 'done' order by a.closed_on desc`],
  ['What is one more point of OEE worth on each machine, in good units a week?',
    `select machine, product, round(sum(planned_min * 60 / ideal_cycle_seconds) * 0.01) as good_units_a_week_per_point,
            round(sum(good_ideal_min) / nullif(sum(planned_min), 0), 3) as oee_now
     from run_oee where run_date > current_date - 7 group by machine, product order by good_units_a_week_per_point desc`],
  ['Where is downtime going unexplained?',
    `select machine, count(*)::int as stops, sum(minutes) as minutes, max(run_date) as last from stop_detail
     where reason = '(no reason)' and run_date > current_date - 28 group by machine order by minutes desc`],
];

export async function insights(db) {
  const out = [];
  for (const [question, sql] of QUESTIONS) out.push({ question, rows: await db.query(sql) });
  return out;
}

// The shift report: every machine on one date and shift. Defaults to the last shift with runs.
export async function shiftReport(db, date, shiftRef) {
  let d = date ? isoDate(date, 'date') : null;
  let s = shiftRef ? await resolve(db, 'shifts', shiftRef) : null;
  if (!d || !s) {
    const [last] = await db.query(`select ru.run_date::text as run_date, sh.id, sh.code from runs ru join shifts sh on sh.id = ru.shift_id
      where ($1::date is null or ru.run_date = $1::date) and ($2::uuid is null or sh.id = $2::uuid) order by ru.run_date desc, sh.starts desc limit 1`, [d, s?.id || null]);
    if (!last) throw new Error('No runs recorded yet');
    d = String(last.run_date).slice(0, 10);
    s = s || { id: last.id, code: last.code };
  }
  const runs = await db.query(`select machine, product, crew, planned_min, run_min, total_count as total, scrap, good, availability, performance, quality, oee, target_oee
    from run_oee where run_date = $1 and shift = $2 order by machine`, [d, s.code]);
  const stops = await db.query(`select machine, starts_at, minutes, reason, reason_name, note from stop_detail
    where run_date = $1 and shift = $2 and kind = 'unplanned' and (minutes >= 10 or reason = '(no reason)') order by machine, starts_at`, [d, s.code]);
  const scrap = await db.query(`select o.machine, sr.code as reason, sr.name, sum(x.qty)::int as units from scrap x join scrap_reasons sr on sr.id = x.reason_id join run_oee o on o.id = x.run_id
    where o.run_date = $1 and o.shift = $2 group by o.machine, sr.code, sr.name order by o.machine, units desc`, [d, s.code]);
  const checks = await db.query(`select m.code as machine, ct.code as check_code, cr.result, cr.done_by, cr.corrective_action from check_records cr
    join machines m on m.id = cr.machine_id join check_types ct on ct.id = cr.check_type_id join runs ru on ru.id = cr.run_id
    where ru.run_date = $1 and ru.shift_id = $2 order by m.code, ct.code`, [d, s.id]);
  const missing = await db.query(`select o.machine, ct.code as check_code from run_oee o join machine_checks mc on mc.machine_id = o.machine_id
    join check_types ct on ct.id = mc.check_type_id and ct.frequency = 'shift'
    where o.run_date = $1 and o.shift = $2 and not exists (select 1 from check_records cr where cr.run_id = o.id and cr.check_type_id = ct.id) order by 1, 2`, [d, s.code]);
  return { date: d, shift: s.code, machines: runs, stops_over_10_min_or_unexplained: stops, scrap, checks, checks_missing: missing };
}

export async function machineBrief(db, ref) {
  const m = await resolve(db, 'machines', ref);
  const [machine] = await db.query('select code, name, area, default_ideal_cycle_seconds as ideal_seconds, target_oee, status from machines where id = $1', [m.id]);
  return {
    machine,
    last_7_days: await db.query('select runs, availability, performance, quality, oee from machine_oee_7d where machine = $1', [m.code]),
    last_runs: await db.query('select run, product, total_count as total, scrap, oee from run_oee where machine_id = $1 order by run_date desc, shift desc limit 6', [m.id]),
    top_stops_28_days: await db.query(`select reason, reason_name, count(*)::int as stops, sum(minutes) as minutes from stop_detail where machine_id = $1 and kind = 'unplanned' and run_date > current_date - 28 group by reason, reason_name order by minutes desc limit 5`, [m.id]),
    checks: await db.query('select check_code, frequency, last_done, last_result, next_due from check_status where machine_id = $1', [m.id]),
    actions: await db.query(`select code, title, owner, due_on, status from actions where machine_id = $1 and status = 'open'`, [m.id]),
    notes: await db.query('select created_at::date as on, actor, body from notes where machine_id = $1 order by created_at desc limit 5', [m.id]),
  };
}

// ---------------------------------------------------------------- writes

export async function recordRun(db, machineRef, { date, shift, product, count, crew = '', minutes, note = '', update = false, actor }) {
  const m = await resolve(db, 'machines', machineRef);
  if (m.status === 'retired') throw new Error(`${m.code} is retired`);
  const d = isoDate(date || today(), '--date');
  const s = await resolve(db, 'shifts', required(shift, '--shift'));
  const [existing] = await db.query('select id from runs where machine_id = $1 and run_date = $2 and shift_id = $3', [m.id, d, s.id]);
  if (existing && !update) throw new Error(`${m.code} ${d} ${s.code} is already recorded. Add --update to change its count or product.`);
  const total = whole(count, '--count');
  if (existing) {
    const p = product ? await resolve(db, 'products', product) : null;
    await db.query(`update runs set total_count = $2, product_id = coalesce($3, product_id), crew = case when $4 = '' then crew else $4 end,
      shift_minutes = coalesce($5, shift_minutes), note = case when $6 = '' then note else $6 end, actor = $7 where id = $1`,
      [existing.id, total, p?.id || null, crew, minutes ? whole(minutes, '--minutes') : null, note, actor]);
    return { run: `${m.code} ${d} ${s.code}`, updated: true, total };
  }
  const p = await resolve(db, 'products', required(product, '--product'));
  await db.query('insert into runs (machine_id, run_date, shift_id, product_id, crew, shift_minutes, total_count, note, actor) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [m.id, d, s.id, p.id, crew, minutes ? whole(minutes, '--minutes') : s.minutes, total, note, actor]);
  const [rate] = await db.query('select 1 from product_rates where machine_id = $1 and product_id = $2', [m.id, p.id]);
  return { run: `${m.code} ${d} ${s.code}`, product: p.code, total, warnings: rate ? [] : [`no ideal cycle time for ${p.code} on ${m.code}: using the machine default. Set one with set-rate.`] };
}

export async function recordStop(db, machineRef, minutes, reasonRef, { date, shift, at, note = '', actor }) {
  const run = await findRun(db, machineRef, date, shift);
  const r = reasonRef ? await resolve(db, 'stop_reasons', reasonRef) : null;
  if (at && !/^\d{1,2}:\d{2}$/.test(at)) throw new Error('--at must be HH:MM');
  const mins = minutesOf(minutes, 'stop minutes');
  await db.query('insert into stops (run_id, reason_id, starts_at, minutes, note, actor) values ($1,$2,$3,$4,$5,$6)', [run.id, r?.id || null, at || null, mins, note, actor]);
  return { run: `${run.machine.code} ${run.date} ${run.shift}`, minutes: mins, reason: r ? r.code : '(no reason yet)' };
}

// Give unexplained stops a reason: one stop by id prefix, or the run's unexplained stops.
export async function tagStops(db, ref, reasonRef, { date, shift, at, all = false }) {
  const r = await resolve(db, 'stop_reasons', required(reasonRef, 'reason'));
  let ids;
  if (/^[0-9a-f]{6,}/i.test(ref) && !(await db.query('select 1 from machines where lower(code) = lower($1)', [ref])).length) {
    ids = (await db.query('select id from stops where id::text like $1', [ref.toLowerCase() + '%'])).map((x) => x.id);
    if (ids.length !== 1) throw Object.assign(new Error(ids.length ? `"${ref}" matches ${ids.length} stops` : `No stop starts with "${ref}"`), { candidates: [] });
  } else {
    const run = await findRun(db, ref, date, shift);
    const open = await db.query(`select id, starts_at::text as starts_at, minutes from stops where run_id = $1 and reason_id is null ${at ? 'and starts_at = $2::time' : ''} order by starts_at`, at ? [run.id, at] : [run.id]);
    if (!open.length) throw new Error(`No unexplained stops on ${run.machine.code} ${run.date} ${run.shift}${at ? ` at ${at}` : ''}`);
    if (open.length > 1 && !all) {
      const e = new Error(`${open.length} unexplained stops on that run: add --at=HH:MM, use a stop id, or --all to give them all this reason`);
      e.candidates = open.map((o) => ({ id: String(o.id).slice(0, 8), starts_at: o.starts_at, minutes: o.minutes }));
      throw e;
    }
    ids = open.map((o) => o.id);
  }
  for (const id of ids) await db.query('update stops set reason_id = $2 where id = $1', [id, r.id]);
  return { tagged: ids.length, reason: r.code };
}

export async function recordScrap(db, machineRef, qty, reasonRef, { date, shift, note = '', actor }) {
  const run = await findRun(db, machineRef, date, shift);
  const r = await resolve(db, 'scrap_reasons', required(reasonRef, 'scrap reason'));
  const n = whole(qty, 'scrap quantity');
  if (n <= 0) throw new Error('scrap quantity must be above zero');
  const [{ total, scrap }] = await db.query('select total_count as total, scrap from run_oee where id = $1', [run.id]);
  if (Number(scrap) + n > Number(total)) throw new Error(`That makes ${Number(scrap) + n} rejects from a run that counted ${total}. Fix the run count first (run ... --update).`);
  await db.query('insert into scrap (run_id, reason_id, qty, note, actor) values ($1,$2,$3,$4,$5)', [run.id, r.id, n, note, actor]);
  return { run: `${run.machine.code} ${run.date} ${run.shift}`, reason: r.code, qty: n };
}

export async function recordCheck(db, machineRef, checkRef, result, { date, shift, by = '', action = '', actor }) {
  const m = await resolve(db, 'machines', machineRef);
  const ct = await resolve(db, 'check_types', checkRef);
  if (!['pass', 'fail'].includes(String(result).toLowerCase())) throw new Error('Result must be pass or fail');
  const [applies] = await db.query('select 1 from machine_checks where machine_id = $1 and check_type_id = $2', [m.id, ct.id]);
  if (!applies) throw new Error(`${ct.code} is not set up for ${m.code}. Add it with: add machine-check (see --help)`);
  const d = isoDate(date || today(), '--date');
  let runId = null;
  if (ct.frequency === 'shift') runId = (await findRun(db, m.code, d, shift)).id;
  await db.query('insert into check_records (machine_id, check_type_id, run_id, done_on, result, done_by, corrective_action, actor) values ($1,$2,$3,$4,$5,$6,$7,$8)',
    [m.id, ct.id, runId, d, String(result).toLowerCase(), by, action, actor]);
  const out = { machine: m.code, check: ct.code, date: d, result: String(result).toLowerCase() };
  if (out.result === 'fail' && !action) out.warnings = ['Failed with no corrective action. Write what was done with: correct ' + m.code + ' ' + ct.code + ' "<what was done>"'];
  return out;
}

export async function correctCheck(db, machineRef, checkRef, text) {
  const m = await resolve(db, 'machines', machineRef);
  const ct = await resolve(db, 'check_types', checkRef);
  const [cr] = await db.query(`select id, done_on from check_records where machine_id = $1 and check_type_id = $2 and result = 'fail' order by done_on desc, created_at desc limit 1`, [m.id, ct.id]);
  if (!cr) throw new Error(`No failed ${ct.code} on ${m.code}`);
  await db.query(`update check_records set corrective_action = case when corrective_action = '' then $2 else corrective_action || ' / ' || $2 end where id = $1`, [cr.id, required(text, 'corrective action')]);
  return { machine: m.code, check: ct.code, failed_on: cr.done_on, corrective_action: text };
}

export async function openAction(db, title, { machine, reason, owner = '', due }) {
  const m = machine ? await resolve(db, 'machines', machine) : null;
  const r = reason ? await resolve(db, 'stop_reasons', reason) : null;
  const [{ n }] = await db.query(`select coalesce(max(substring(code from 3)::int), 0) + 1 as n from actions where code ~ '^A-[0-9]+$'`);
  const code = `A-${String(n).padStart(3, '0')}`;
  await db.query('insert into actions (code, machine_id, reason_id, title, owner, due_on) values ($1,$2,$3,$4,$5,$6)',
    [code, m?.id || null, r?.id || null, required(title, 'action title'), owner, due ? isoDate(due, '--due') : null]);
  return { action: code, title, owner, due: due || null };
}

export async function closeAction(db, ref, status, result, { on }) {
  const a = await resolve(db, 'actions', ref);
  if (a.status !== 'open') throw new Error(`${a.code} is already ${a.status}`);
  await db.query('update actions set status = $2, closed_on = $3, result = $4 where id = $1', [a.id, status, isoDate(on || today(), '--on'), result || '']);
  return { action: a.code, status };
}

export async function setRate(db, machineRef, productRef, seconds) {
  const m = await resolve(db, 'machines', machineRef);
  const p = await resolve(db, 'products', productRef);
  const s = positive(seconds, 'ideal cycle seconds');
  const [old] = await db.query('select ideal_cycle_seconds from product_rates where machine_id = $1 and product_id = $2', [m.id, p.id]);
  await db.query(`insert into product_rates (machine_id, product_id, ideal_cycle_seconds) values ($1,$2,$3)
    on conflict (machine_id, product_id) do update set ideal_cycle_seconds = excluded.ideal_cycle_seconds`, [m.id, p.id, s]);
  return { machine: m.code, product: p.code, ideal_cycle_seconds: s, was: old ? Number(old.ideal_cycle_seconds) : null, units_an_hour_at_ideal: Math.round(3600 / s) };
}

export async function setStatus(db, machineRef, status) {
  const m = await resolve(db, 'machines', machineRef);
  if (!['active', 'idle', 'retired'].includes(status)) throw new Error('Status must be active, idle or retired');
  await db.query('update machines set status = $2 where id = $1', [m.id, status]);
  return { machine: m.code, status };
}

const ADDERS = {
  machine: async (db, d) => db.query('insert into machines (code, name, area, default_ideal_cycle_seconds, target_oee) values ($1,$2,$3,$4,$5) returning code',
    [required(d.code, 'code'), required(d.name, 'name'), d.area || '', positive(d.ideal_cycle_seconds ?? d.default_ideal_cycle_seconds, 'ideal_cycle_seconds'), d.target_oee ?? 0.65]),
  product: async (db, d) => db.query('insert into products (code, name, unit, unit_cost_cents, currency, allergens) values ($1,$2,$3,$4,$5,$6) returning code',
    [required(d.code, 'code'), required(d.name, 'name'), d.unit || 'unit', d.unit_cost_cents ?? 0, d.currency || 'NZD', d.allergens || '']),
  shift: async (db, d) => db.query('insert into shifts (code, name, starts, minutes) values ($1,$2,$3,$4) returning code',
    [required(d.code, 'code'), required(d.name, 'name'), required(d.starts, 'starts'), whole(String(d.minutes), 'minutes')]),
  'stop-reason': async (db, d) => db.query('insert into stop_reasons (code, name, kind, loss) values ($1,$2,$3,$4) returning code',
    [required(d.code, 'code'), required(d.name, 'name'), required(d.kind, 'kind'), required(d.loss, 'loss')]),
  'scrap-reason': async (db, d) => db.query('insert into scrap_reasons (code, name, stage) values ($1,$2,$3) returning code', [required(d.code, 'code'), required(d.name, 'name'), d.stage || 'running']),
  'check-type': async (db, d) => db.query('insert into check_types (code, name, frequency, source) values ($1,$2,$3,$4) returning code',
    [required(d.code, 'code'), required(d.name, 'name'), required(d.frequency, 'frequency'), d.source || '']),
  'machine-check': async (db, d) => {
    const m = await resolve(db, 'machines', d.machine);
    const ct = await resolve(db, 'check_types', d.check);
    await db.query('insert into machine_checks (machine_id, check_type_id) values ($1,$2) on conflict do nothing', [m.id, ct.id]);
    return [{ code: `${m.code} ${ct.code}` }];
  },
  setting: async (db, d) => db.query(`insert into settings (key, value, note) values ($1,$2,$3) on conflict (key) do update set value = excluded.value, note = excluded.note returning key as code`,
    [required(d.key, 'key'), String(required(d.value, 'value')), d.note || '']),
};
export async function add(db, kind, data) {
  const fn = ADDERS[kind];
  if (!fn) throw new Error(`add takes ${Object.keys(ADDERS).join('|')}`);
  const [row] = await fn(db, data);
  return { added: kind, code: row.code };
}

// ---------------------------------------------------------------- imports

function rowsOf(file, map) {
  const rows = parseCsv(fs.readFileSync(required(file, 'CSV file'), 'utf8'));
  if (!map) return rows;
  return rows.map((r) => Object.fromEntries(Object.entries(map).filter(([k]) => !k.startsWith('_')).map(([k, col]) => [k, pick(r, col)])));
}
async function batch(db, kind, file, read, loaded, actor) {
  await db.query('insert into import_batches (kind, source_file, rows_read, rows_loaded, actor) values ($1,$2,$3,$4,$5)', [kind, path.basename(file), read, loaded, actor || '']);
}
const loadMap = (m) => (m ? JSON.parse(fs.readFileSync(m, 'utf8')) : null);

export async function importMachines(db, file, { map, dryRun, actor }) {
  const rows = rowsOf(file, loadMap(map));
  const have = new Set((await db.query('select code from machines')).map((r) => r.code.toLowerCase()));
  const fresh = rows.filter((r) => !have.has(pick(r, 'code').toLowerCase()));
  if (dryRun) return { would_load: fresh.length, skipped_existing: rows.length - fresh.length };
  for (const r of fresh) await ADDERS.machine(db, { code: pick(r, 'code'), name: pick(r, 'name'), area: pick(r, 'area'), ideal_cycle_seconds: pick(r, 'ideal_cycle_seconds'), target_oee: pick(r, 'target_oee') || 0.65 });
  await batch(db, 'machines', file, rows.length, fresh.length, actor);
  return { loaded: fresh.length, skipped_existing: rows.length - fresh.length };
}

export async function importProducts(db, file, { map, dryRun, actor }) {
  const rows = rowsOf(file, loadMap(map));
  const have = new Set((await db.query('select code from products')).map((r) => r.code.toLowerCase()));
  const fresh = rows.filter((r) => !have.has(pick(r, 'code').toLowerCase()));
  if (dryRun) return { would_load: fresh.length, skipped_existing: rows.length - fresh.length };
  for (const r of fresh) {
    await ADDERS.product(db, { code: pick(r, 'code'), name: pick(r, 'name'), unit: pick(r, 'unit') || 'unit', unit_cost_cents: pick(r, 'unit_cost') ? cents(pick(r, 'unit_cost')) : 0, currency: pick(r, 'currency') || 'NZD' });
    for (const [k, v] of Object.entries(r)) {
      const mm = k.match(/^ideal_seconds_(.+)$/i);
      if (mm && v) await setRate(db, mm[1], pick(r, 'code'), v);
    }
  }
  await batch(db, 'products', file, rows.length, fresh.length, actor);
  return { loaded: fresh.length, skipped_existing: rows.length - fresh.length };
}

// runs.csv: machine, date, shift, product, total_count[, crew, shift_minutes]. A run already in never loads twice.
export async function importRuns(db, file, { map, dryRun, actor }) {
  const rows = rowsOf(file, loadMap(map));
  const plan = [];
  const skipped = [];
  for (const r of rows) {
    const m = await resolve(db, 'machines', pick(r, 'machine'));
    const s = await resolve(db, 'shifts', pick(r, 'shift'));
    const p = await resolve(db, 'products', pick(r, 'product'));
    const d = anyDate(pick(r, 'date'));
    const label = `${m.code} ${d} ${s.code}`;
    if ((await db.query('select 1 from runs where machine_id = $1 and run_date = $2 and shift_id = $3', [m.id, d, s.id])).length || plan.some((x) => x.label === label)) { skipped.push(label); continue; }
    plan.push({ label, m, s, p, d, total: whole(pick(r, 'total_count', 'count', 'total'), 'total_count'), crew: pick(r, 'crew', 'operator'), minutes: pick(r, 'shift_minutes') ? whole(pick(r, 'shift_minutes'), 'shift_minutes') : s.minutes });
  }
  if (dryRun) return { would_load: plan.length, skipped_already_loaded: skipped };
  for (const x of plan) await db.query('insert into runs (machine_id, run_date, shift_id, product_id, crew, shift_minutes, total_count, actor) values ($1,$2,$3,$4,$5,$6,$7,$8)',
    [x.m.id, x.d, x.s.id, x.p.id, x.crew, x.minutes, x.total, actor || 'import']);
  await batch(db, 'runs', file, rows.length, plan.length, actor);
  return { loaded: plan.length, skipped_already_loaded: skipped };
}

// stops.csv: machine, date, shift, start (HH:MM), minutes (or h:mm:ss), reason (code or name; blank = unexplained), note.
// The same stop (run, start, minutes) never loads twice. An unknown reason stops the import and lists it.
export async function importStops(db, file, { map, dryRun, actor }) {
  const rows = rowsOf(file, loadMap(map));
  const plan = [];
  let skipped = 0;
  const unknown = new Set();
  const reasons = await db.query('select id, code, name from stop_reasons');
  for (const r of rows) {
    const run = await findRun(db, pick(r, 'machine'), anyDate(pick(r, 'date')), pick(r, 'shift'));
    const reasonText = pick(r, 'reason').trim();
    const reason = reasonText ? reasons.find((x) => x.code.toLowerCase() === reasonText.toLowerCase() || x.name.toLowerCase() === reasonText.toLowerCase()) : null;
    if (reasonText && !reason) { unknown.add(reasonText); continue; }
    const start = pick(r, 'start', 'starts_at').slice(0, 5) || null;
    const mins = Math.round(minutesOf(pick(r, 'minutes', 'duration'), 'minutes') * 100) / 100;
    const dup = (await db.query('select 1 from stops where run_id = $1 and starts_at is not distinct from $2::time and minutes = $3', [run.id, start, mins])).length;
    if (dup) { skipped++; continue; }
    plan.push([run.id, reason?.id || null, start, mins, pick(r, 'note', 'comment')]);
  }
  if (unknown.size) throw new Error(`Unknown stop reasons: ${[...unknown].join(', ')}. Add them (add stop-reason) or name the matching code in the file, then import again.`);
  if (dryRun) return { would_load: plan.length, skipped_already_loaded: skipped };
  for (const p of plan) await db.query('insert into stops (run_id, reason_id, starts_at, minutes, note, actor) values ($1,$2,$3,$4,$5,$6)', [...p, actor || 'import']);
  await batch(db, 'stops', file, rows.length, plan.length, actor);
  return { loaded: plan.length, skipped_already_loaded: skipped };
}

// scrap.csv: machine, date, shift, reason, qty.
export async function importScrap(db, file, { map, dryRun, actor }) {
  const rows = rowsOf(file, loadMap(map));
  const plan = [];
  let skipped = 0;
  for (const r of rows) {
    const run = await findRun(db, pick(r, 'machine'), anyDate(pick(r, 'date')), pick(r, 'shift'));
    const reason = await resolve(db, 'scrap_reasons', pick(r, 'reason'));
    const qty = whole(pick(r, 'qty', 'quantity'), 'qty');
    if ((await db.query('select 1 from scrap where run_id = $1 and reason_id = $2 and qty = $3', [run.id, reason.id, qty])).length) { skipped++; continue; }
    plan.push([run.id, reason.id, qty]);
  }
  if (dryRun) return { would_load: plan.length, skipped_already_loaded: skipped };
  for (const p of plan) await db.query('insert into scrap (run_id, reason_id, qty, actor) values ($1,$2,$3,$4)', [...p, actor || 'import']);
  await batch(db, 'scrap', file, rows.length, plan.length, actor);
  return { loaded: plan.length, skipped_already_loaded: skipped };
}

export const IMPORTERS = { machines: importMachines, products: importProducts, runs: importRuns, stops: importStops, scrap: importScrap };
