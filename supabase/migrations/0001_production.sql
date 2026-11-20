-- Production Monitoring for Claude Code: the schema.
-- A plant's machines (stations), shifts, products and their ideal cycle times, and one run per
-- machine per shift: the count off the machine, every stop with its reason and every reject with
-- its reason. OEE is worked out in the views below from those three things, never typed in.
-- Also: the checks a machine needs (pre-start, CCP, weekly guard tests) and the improvement
-- actions raised in the production meeting. Money is stored in integer cents.

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table settings (
  key text primary key,
  value text not null,
  note text not null default '',
  updated_at timestamptz not null default now()
);

-- A machine is anything you count output from: a bagger, a filler, a press, a whole line.
create table machines (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  area text not null default '',
  default_ideal_cycle_seconds numeric(10,3) not null check (default_ideal_cycle_seconds > 0),
  target_oee numeric(4,3) not null default 0.650 check (target_oee between 0 and 1),
  status text not null default 'active' check (status in ('active', 'idle', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  starts time not null,
  minutes int not null check (minutes between 1 and 1440),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  unit text not null default 'unit',
  unit_cost_cents int not null default 0 check (unit_cost_cents >= 0),  -- what one reject costs
  currency text not null default 'NZD' check (currency in ('NZD', 'AUD', 'USD', 'EUR')),
  allergens text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The ideal cycle time of a product on a machine: seconds per unit at the speed it is built for.
create table product_rates (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references machines(id),
  product_id uuid not null references products(id),
  ideal_cycle_seconds numeric(10,3) not null check (ideal_cycle_seconds > 0),
  created_at timestamptz not null default now(),
  unique (machine_id, product_id)
);

-- Planned stops (breaks, planned maintenance, no orders) come off planned production time.
-- Unplanned stops are the availability loss. `loss` groups them into the six big losses.
create table stop_reasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null check (kind in ('planned', 'unplanned')),
  loss text not null check (loss in ('breakdown', 'changeover', 'minor', 'material', 'people', 'quality', 'planned')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table scrap_reasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  stage text not null default 'running' check (stage in ('startup', 'running')),
  created_at timestamptz not null default now()
);

-- One machine, one date, one shift: what ran and how many came off.
create table runs (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references machines(id),
  run_date date not null,
  shift_id uuid not null references shifts(id),
  product_id uuid not null references products(id),
  crew text not null default '',
  shift_minutes int not null check (shift_minutes between 1 and 1440),
  total_count int not null default 0 check (total_count >= 0),
  note text not null default '',
  actor text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (machine_id, run_date, shift_id)
);
create index runs_date on runs (run_date);

create table stops (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id),
  reason_id uuid references stop_reasons(id),        -- null until someone says why: an unexplained stop
  starts_at time,
  minutes numeric(7,2) not null check (minutes > 0),
  note text not null default '',
  actor text not null default '',
  created_at timestamptz not null default now()
);
create index stops_run on stops (run_id);

create table scrap (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id),
  reason_id uuid not null references scrap_reasons(id),
  qty int not null check (qty > 0),
  note text not null default '',
  actor text not null default '',
  created_at timestamptz not null default now()
);
create index scrap_run on scrap (run_id);

-- Checks: pre-start, CCP verification, guard and interlock tests. `frequency` says how often.
create table check_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  frequency text not null check (frequency in ('shift', 'daily', 'weekly')),
  source text not null default '',
  created_at timestamptz not null default now()
);

create table machine_checks (
  machine_id uuid not null references machines(id),
  check_type_id uuid not null references check_types(id),
  primary key (machine_id, check_type_id)
);

create table check_records (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references machines(id),
  check_type_id uuid not null references check_types(id),
  run_id uuid references runs(id),
  done_on date not null,
  result text not null check (result in ('pass', 'fail')),
  done_by text not null default '',
  corrective_action text not null default '',
  actor text not null default '',
  created_at timestamptz not null default now()
);
create index check_records_machine on check_records (machine_id, check_type_id, done_on);

-- Improvement actions from the daily production meeting.
create table actions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  machine_id uuid references machines(id),
  reason_id uuid references stop_reasons(id),
  title text not null,
  owner text not null default '',
  opened_on date not null default current_date,
  due_on date,
  status text not null default 'open' check (status in ('open', 'done', 'dropped')),
  closed_on date,
  result text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references machines(id),
  actor text not null default '',
  body text not null,
  created_at timestamptz not null default now()
);

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  source_file text not null default '',
  rows_read int not null default 0,
  rows_loaded int not null default 0,
  actor text not null default '',
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['settings', 'machines', 'products', 'runs', 'actions'] loop
    execute format('create trigger %I before update on %I for each row execute function touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- views

-- Every run with its OEE. Planned time is the shift less planned stops. Run time is planned time
-- less unplanned and unexplained stops. Performance is ideal time for the count over run time.
create view run_oee as
with st as (
  select s.run_id,
         coalesce(sum(s.minutes) filter (where r.kind = 'planned'), 0) as planned_stop_min,
         coalesce(sum(s.minutes) filter (where r.kind = 'unplanned' or s.reason_id is null), 0) as down_min,
         coalesce(sum(s.minutes) filter (where s.reason_id is null), 0) as unexplained_min,
         count(*) filter (where s.reason_id is null) as unexplained_stops
  from stops s left join stop_reasons r on r.id = s.reason_id group by s.run_id
), sc as (
  select run_id, sum(qty)::int as scrap from scrap group by run_id
), base as (
  select ru.id, ru.machine_id, m.code as machine, ru.run_date, sh.code as shift, sh.name as shift_name, p.code as product, p.name as product_name,
         ru.crew, ru.shift_minutes, ru.total_count,
         coalesce(st.planned_stop_min, 0) as planned_stop_min, coalesce(st.down_min, 0) as down_min,
         coalesce(st.unexplained_min, 0) as unexplained_min, coalesce(st.unexplained_stops, 0)::int as unexplained_stops,
         coalesce(sc.scrap, 0) as scrap, coalesce(pr.ideal_cycle_seconds, m.default_ideal_cycle_seconds) as ideal_cycle_seconds,
         p.unit_cost_cents, p.currency, m.target_oee
  from runs ru join machines m on m.id = ru.machine_id join shifts sh on sh.id = ru.shift_id join products p on p.id = ru.product_id
  left join product_rates pr on pr.machine_id = ru.machine_id and pr.product_id = ru.product_id
  left join st on st.run_id = ru.id left join sc on sc.run_id = ru.id
)
select b.*,
       b.machine || ' ' || b.run_date || ' ' || b.shift as run,
       greatest(b.shift_minutes - b.planned_stop_min, 0) as planned_min,
       greatest(b.shift_minutes - b.planned_stop_min - b.down_min, 0) as run_min,
       greatest(b.total_count - b.scrap, 0) as good,
       round(b.total_count * b.ideal_cycle_seconds / 60.0, 2) as ideal_min,
       round(greatest(b.total_count - b.scrap, 0) * b.ideal_cycle_seconds / 60.0, 2) as good_ideal_min,
       case when b.shift_minutes - b.planned_stop_min > 0 then round((b.shift_minutes - b.planned_stop_min - b.down_min) / (b.shift_minutes - b.planned_stop_min)::numeric, 3) end as availability,
       case when b.shift_minutes - b.planned_stop_min - b.down_min > 0 then round(b.total_count * b.ideal_cycle_seconds / 60.0 / (b.shift_minutes - b.planned_stop_min - b.down_min), 3) end as performance,
       case when b.total_count > 0 then round(greatest(b.total_count - b.scrap, 0)::numeric / b.total_count, 3) end as quality,
       case when b.shift_minutes - b.planned_stop_min > 0 then round(greatest(b.total_count - b.scrap, 0) * b.ideal_cycle_seconds / 60.0 / (b.shift_minutes - b.planned_stop_min), 3) end as oee,
       (b.scrap * b.unit_cost_cents)::bigint as scrap_cost_cents
from base b;

-- OEE by machine over a window. Sums the minutes first, so long and short runs weigh fairly.
create view machine_oee_7d as
select m.code as machine, m.name, m.area, m.target_oee, count(o.id)::int as runs,
       coalesce(sum(o.planned_min), 0) as planned_min, coalesce(sum(o.down_min), 0) as down_min,
       coalesce(sum(o.total_count), 0)::bigint as total, coalesce(sum(o.good), 0)::bigint as good, coalesce(sum(o.scrap), 0)::bigint as scrap,
       case when sum(o.planned_min) > 0 then round(sum(o.run_min) / sum(o.planned_min), 3) end as availability,
       case when sum(o.run_min) > 0 then round(sum(o.ideal_min) / sum(o.run_min), 3) end as performance,
       case when sum(o.total_count) > 0 then round(sum(o.good)::numeric / sum(o.total_count), 3) end as quality,
       case when sum(o.planned_min) > 0 then round(sum(o.good_ideal_min) / sum(o.planned_min), 3) end as oee
from machines m left join run_oee o on o.machine_id = m.id and o.run_date > current_date - 7
where m.status <> 'retired'
group by m.id order by m.code;

create view machine_oee_28d as
select m.code as machine, m.name, m.area, m.target_oee, count(o.id)::int as runs,
       coalesce(sum(o.planned_min), 0) as planned_min, coalesce(sum(o.down_min), 0) as down_min,
       coalesce(sum(o.total_count), 0)::bigint as total, coalesce(sum(o.good), 0)::bigint as good, coalesce(sum(o.scrap), 0)::bigint as scrap,
       case when sum(o.planned_min) > 0 then round(sum(o.run_min) / sum(o.planned_min), 3) end as availability,
       case when sum(o.run_min) > 0 then round(sum(o.ideal_min) / sum(o.run_min), 3) end as performance,
       case when sum(o.total_count) > 0 then round(sum(o.good)::numeric / sum(o.total_count), 3) end as quality,
       case when sum(o.planned_min) > 0 then round(sum(o.good_ideal_min) / sum(o.planned_min), 3) end as oee
from machines m left join run_oee o on o.machine_id = m.id and o.run_date > current_date - 28
where m.status <> 'retired'
group by m.id order by m.code;

-- Every stop with its run, machine and reason.
create view stop_detail as
select s.id, ru.run_date, m.code as machine, sh.code as shift, p.code as product, s.starts_at, s.minutes,
       coalesce(r.code, '(no reason)') as reason, coalesce(r.name, 'Unexplained') as reason_name,
       coalesce(r.kind, 'unplanned') as kind, coalesce(r.loss, 'unexplained') as loss, s.note, ru.id as run_id, m.id as machine_id
from stops s join runs ru on ru.id = s.run_id join machines m on m.id = ru.machine_id join shifts sh on sh.id = ru.shift_id
join products p on p.id = ru.product_id left join stop_reasons r on r.id = s.reason_id;

-- Pareto of unplanned stop minutes over 28 days.
create view stop_pareto as
with x as (
  select reason, reason_name, loss, count(*)::int as stops, sum(minutes) as minutes
  from stop_detail where kind = 'unplanned' and run_date > current_date - 28 group by reason, reason_name, loss
)
select reason, reason_name, loss, stops, minutes,
       round(100.0 * minutes / nullif(sum(minutes) over (), 0), 1) as pct,
       round(100.0 * sum(minutes) over (order by minutes desc, reason) / nullif(sum(minutes) over (), 0), 1) as cumulative_pct
from x order by minutes desc, reason;

-- A changeover is a stop with loss 'changeover'; the product pair is the last run before it on the
-- same machine and the run it belongs to.
create view changeovers as
with seq as (
  select ru.id, ru.machine_id, ru.run_date, sh.starts, p.code as product,
         lag(p.code) over (partition by ru.machine_id order by ru.run_date, sh.starts) as from_product
  from runs ru join shifts sh on sh.id = ru.shift_id join products p on p.id = ru.product_id
)
select m.code as machine, q.run_date, q.from_product, q.product as to_product, sum(s.minutes) as minutes
from seq q join machines m on m.id = q.machine_id join stops s on s.run_id = q.id join stop_reasons r on r.id = s.reason_id and r.loss = 'changeover'
group by m.code, q.run_date, q.starts, q.from_product, q.product;

-- When each check was last done on each machine that needs it, and whether it is due.
create view check_status as
select m.code as machine, ct.code as check_code, ct.name as check_name, ct.frequency,
       max(cr.done_on) as last_done,
       (array_agg(cr.result order by cr.done_on desc, cr.created_at desc))[1] as last_result,
       case ct.frequency when 'weekly' then max(cr.done_on) + 7 when 'daily' then max(cr.done_on) + 1 end as next_due,
       m.id as machine_id, ct.id as check_type_id
from machine_checks mc join machines m on m.id = mc.machine_id and m.status = 'active'
join check_types ct on ct.id = mc.check_type_id
left join check_records cr on cr.machine_id = mc.machine_id and cr.check_type_id = mc.check_type_id
group by m.code, m.id, ct.code, ct.name, ct.frequency, ct.id;

-- What needs a person. One row per item; `due` orders the list.
create view attention as
select 'unexplained stops' as item, machine || ' ' || run_date || ' ' || shift as what,
       count(*) || ' stops, ' || sum(minutes) || ' min with no reason' as why, run_date as due
from stop_detail where reason = '(no reason)' and run_date > current_date - 7
group by machine, run_date, shift
union all
select 'OEE under target', machine, 'OEE ' || round(oee * 100) || '% last 7 days against ' || round(target_oee * 100) || '%', current_date
from machine_oee_7d where runs > 0 and oee < target_oee
union all
select 'repeat breakdown', machine || ' ' || reason, count(*) || ' stops, ' || sum(minutes) || ' min in 7 days', max(run_date)
from stop_detail where loss = 'breakdown' and run_date > current_date - 7
group by machine, reason having count(*) >= (select coalesce(max(value::int), 3) from settings where key = 'repeat_breakdown_count')
union all
select 'ideal speed looks wrong', machine || ' ' || product, 'ran at ' || round(avg(performance) * 100) || '% of ideal speed over ' || count(*) || ' runs', max(run_date)
from run_oee where run_date > current_date - 14 and performance is not null
group by machine, product having avg(performance) > 1.02
union all
select 'scrap over limit', machine || ' ' || run_date || ' ' || shift, round(100.0 * scrap / nullif(total_count, 0), 1) || '% scrap, ' || scrap || ' units', run_date
from run_oee where run_date > current_date - 7 and total_count > 0
  and 100.0 * scrap / total_count > (select coalesce(max(value::numeric), 3) from settings where key = 'scrap_limit_pct')
union all
select 'no production recorded', m.code, 'active, last run ' || coalesce(max(ru.run_date)::text, 'never'), coalesce(max(ru.run_date), current_date)
from machines m left join runs ru on ru.machine_id = m.id
where m.status = 'active' group by m.code
having coalesce(max(ru.run_date), current_date - 999) < current_date - (select coalesce(max(value::int), 4) from settings where key = 'quiet_machine_days')
union all
select 'action overdue', a.code || ' ' || a.title, 'owner ' || a.owner || ', due ' || a.due_on, a.due_on
from actions a where a.status = 'open' and a.due_on < current_date
union all
select 'check failed', cs.machine || ' ' || cs.check_code, cs.check_name || ' failed on ' || cs.last_done, cs.last_done
from check_status cs where cs.last_result = 'fail'
union all
select 'check overdue', machine || ' ' || check_code, check_name || ', last done ' || coalesce(last_done::text, 'never'), coalesce(next_due, current_date)
from check_status where frequency <> 'shift' and coalesce(next_due, current_date - 1) < current_date;
