-- Demo data: Harbourside Snacks Demo, a fictional Auckland snack plant with four packing machines,
-- a cartoner and a spare bagger, on two shifts a day, seven days a week. Four weeks of runs are
-- generated with the problems a plant meets planted on purpose: stops nobody gave a reason for,
-- a seal jaw that keeps failing on PK-2, a metal detector check failed with no corrective action,
-- a missed pre-start, a weekly guard test overdue, a high-scrap shift, a cartoner whose ideal speed
-- is set too slow, an overdue action and a spare machine nobody has run for weeks.
-- Dates are relative to today. Idempotent: a second run does nothing.
do $$
declare
  d int;
  si int;
  mi int;
  r_id uuid;
  m record;
  sh record;
  prod text;
  prev_prod text;
  ideal numeric;
  factor numeric;
  down numeric;
  planned numeric;
  total int;
  rdate date;
  machines_order text[] := array['PK-1', 'PK-2', 'PK-3', 'CT-1', 'PK-4'];
begin
  if exists (select 1 from machines where code = 'PK-1') then return; end if;

  insert into settings (key, value, note) values
    ('scrap_limit_pct', '3', 'A run with more scrap than this share of its count needs a person'),
    ('repeat_breakdown_count', '3', 'The same breakdown this many times on one machine in 7 days is a repeat'),
    ('quiet_machine_days', '4', 'An active machine with no run for this many days is flagged'),
    ('minor_stop_minutes', '5', 'Stops this short or shorter are minor stops in the insights');

  insert into machines (code, name, area, default_ideal_cycle_seconds, target_oee, status) values
    ('PK-1', 'Vertical bagger 1', 'Packing', 1.000, 0.650, 'active'),
    ('PK-2', 'Vertical bagger 2', 'Packing', 0.800, 0.650, 'active'),
    ('PK-3', 'Multipack bagger', 'Packing', 2.400, 0.600, 'active'),
    ('CT-1', 'Cartoner', 'End of line', 1.500, 0.700, 'active'),
    ('PK-4', 'Vertical bagger 4 (spare)', 'Packing', 1.000, 0.650, 'active');

  insert into shifts (code, name, starts, minutes) values
    ('D', 'Day', '06:00', 480),
    ('A', 'Afternoon', '14:00', 480);

  insert into products (code, name, unit, unit_cost_cents, currency, allergens) values
    ('SALT-150', 'Sea salt chips 150g', 'bag', 95, 'NZD', ''),
    ('SCO-150', 'Sour cream and chives chips 150g', 'bag', 105, 'NZD', 'milk'),
    ('SALT-45', 'Sea salt chips 45g', 'bag', 38, 'NZD', ''),
    ('MP-6', 'Sea salt multipack 6 x 45g', 'bag', 260, 'NZD', ''),
    ('CTN-12', 'Carton of 12 x 150g', 'carton', 1300, 'NZD', '');

  insert into product_rates (machine_id, product_id, ideal_cycle_seconds)
  select mm.id, p.id, x.secs from (values
    ('PK-1', 'SALT-150', 1.000), ('PK-1', 'SCO-150', 1.090), ('PK-2', 'SALT-45', 0.800),
    ('PK-3', 'MP-6', 2.400), ('CT-1', 'CTN-12', 1.500), ('PK-4', 'SALT-150', 1.000)
  ) as x(mc, pc, secs) join machines mm on mm.code = x.mc join products p on p.code = x.pc;

  insert into stop_reasons (code, name, kind, loss) values
    ('BREAK', 'Meal break', 'planned', 'planned'),
    ('PM', 'Planned maintenance', 'planned', 'planned'),
    ('NOORD', 'No orders', 'planned', 'planned'),
    ('JAM', 'Film jam', 'unplanned', 'minor'),
    ('SEAL', 'Seal jaw fault', 'unplanned', 'breakdown'),
    ('ELEC', 'Electrical fault', 'unplanned', 'breakdown'),
    ('MD', 'Metal detector fault', 'unplanned', 'breakdown'),
    ('CHG', 'Changeover', 'unplanned', 'changeover'),
    ('FILM', 'Waiting for film', 'unplanned', 'material'),
    ('PROD', 'Waiting for product from the fryer', 'unplanned', 'material'),
    ('STARVED', 'Starved: no bags from packing', 'unplanned', 'material'),
    ('CREW', 'No operator', 'unplanned', 'people'),
    ('QA', 'Quality hold', 'unplanned', 'quality');

  insert into scrap_reasons (code, name, stage) values
    ('STARTUP', 'Start-up waste', 'startup'),
    ('SEAL', 'Leaking seal', 'running'),
    ('WT', 'Underweight', 'running'),
    ('MDR', 'Metal detector reject', 'running'),
    ('CRUSH', 'Crushed carton', 'running');

  insert into check_types (code, name, frequency, source) values
    ('PRE', 'Pre-start: guards, interlocks and emergency stop', 'shift', 'Health and Safety at Work Act 2015, s36(3)(b)'),
    ('CCP-MD', 'CCP 1: metal detector test pieces (ferrous, non-ferrous, stainless)', 'shift', 'Codex CXC 1-1969 HACCP principles 4, 5 and 7'),
    ('GUARD-W', 'Weekly interlock function test', 'weekly', 'Health and Safety at Work Act 2015, s36(3)(b)');

  insert into machine_checks (machine_id, check_type_id)
  select mm.id, ct.id from machines mm cross join check_types ct
  where ct.code in ('PRE', 'GUARD-W') or (ct.code = 'CCP-MD' and mm.code in ('PK-1', 'PK-2', 'PK-3'));

  -- Four weeks of runs, oldest first, so each run knows what ran before it.
  for d in reverse 27..1 loop
    rdate := current_date - d;
    for sh in select * from shifts order by starts loop
      si := case sh.code when 'D' then 0 else 1 end;
      for mi in 1..5 loop
        select * into m from machines where code = machines_order[mi];
        if m.code = 'PK-4' and d < 20 then continue; end if;
        prod := case m.code
          when 'PK-1' then case when si = 1 and d % 3 = 0 then 'SCO-150' else 'SALT-150' end
          when 'PK-2' then 'SALT-45' when 'PK-3' then 'MP-6' when 'CT-1' then 'CTN-12' else 'SALT-150' end;
        select p.code into prev_prod from runs ru join products p on p.id = ru.product_id join shifts s2 on s2.id = ru.shift_id
          where ru.machine_id = m.id order by ru.run_date desc, s2.starts desc limit 1;

        insert into runs (machine_id, run_date, shift_id, product_id, crew, shift_minutes, actor)
        values (m.id, rdate, sh.id, (select id from products where code = prod), case si when 0 then 'Crew A' else 'Crew B' end, sh.minutes, 'demo')
        returning id into r_id;

        -- Planned: the meal break, and planned maintenance on the cartoner once a week.
        insert into stops (run_id, reason_id, starts_at, minutes, actor) values (r_id, (select id from stop_reasons where code = 'BREAK'), sh.starts + interval '4 hours', 30, 'demo');
        if m.code = 'CT-1' and d % 7 = 4 and si = 0 then
          insert into stops (run_id, reason_id, starts_at, minutes, actor) values (r_id, (select id from stop_reasons where code = 'PM'), sh.starts + interval '1 hour', 60, 'demo');
        end if;
        -- Changeovers. Sour cream to salt is an allergen clean; it got shorter once A-002 closed.
        if prev_prod is not null and prev_prod <> prod then
          insert into stops (run_id, reason_id, starts_at, minutes, actor) values (r_id, (select id from stop_reasons where code = 'CHG'), sh.starts,
            case when prev_prod = 'SCO-150' then case when d > 14 then 55 else 40 end else 25 end, 'demo');
        end if;
        -- Film jams: two to six short stops a run.
        for total in 1..(2 + (d + mi + si) % 5) loop
          insert into stops (run_id, reason_id, starts_at, minutes, actor) values (r_id, (select id from stop_reasons where code = 'JAM'), sh.starts + make_interval(mins => 40 * total), 4, 'demo');
        end loop;
        if m.code = 'PK-2' and si = 0 and d in (1, 2, 3, 5) then
          insert into stops (run_id, reason_id, starts_at, minutes, note, actor) values (r_id, (select id from stop_reasons where code = 'SEAL'), sh.starts + interval '2 hours', 50, 'Jaw temperature dropping', 'demo');
        end if;
        if m.code = 'PK-2' and d in (12, 19) then
          insert into stops (run_id, reason_id, starts_at, minutes, actor) values (r_id, (select id from stop_reasons where code = 'ELEC'), sh.starts + interval '5 hours', 25, 'demo');
        end if;
        if m.code = 'CT-1' then
          insert into stops (run_id, reason_id, starts_at, minutes, actor) values (r_id, (select id from stop_reasons where code = 'STARVED'), sh.starts + interval '30 minutes', 20 + (d % 4) * 10, 'demo');
        end if;
        if m.code = 'PK-3' and d % 5 = 0 then
          insert into stops (run_id, reason_id, starts_at, minutes, actor) values (r_id, (select id from stop_reasons where code = 'FILM'), sh.starts + interval '3 hours', 20, 'demo');
        end if;
        if m.code like 'PK-%' and d % 7 = 2 and si = 1 then
          insert into stops (run_id, reason_id, starts_at, minutes, actor) values (r_id, (select id from stop_reasons where code = 'PROD'), sh.starts + interval '6 hours', 15, 'demo');
        end if;
        if m.code = 'PK-3' and d = 9 and si = 1 then
          insert into stops (run_id, reason_id, starts_at, minutes, actor) values (r_id, (select id from stop_reasons where code = 'CREW'), sh.starts, 45, 'demo');
        end if;
        if m.code = 'PK-1' and d = 1 and si = 1 then
          insert into stops (run_id, reason_id, starts_at, minutes, note, actor) values (r_id, (select id from stop_reasons where code = 'MD'), sh.starts + interval '1 hour', 25, 'Failed the stainless test piece', 'demo');
          insert into stops (run_id, reason_id, starts_at, minutes, actor) values
            (r_id, null, sh.starts + interval '3 hours', 12, 'demo'), (r_id, null, sh.starts + interval '5 hours', 8, 'demo'), (r_id, null, sh.starts + interval '6 hours', 6, 'demo');
        end if;
        if m.code = 'PK-3' and d = 2 and si = 0 then
          insert into stops (run_id, reason_id, starts_at, minutes, actor) values (r_id, null, sh.starts + interval '2 hours', 18, 'demo');
        end if;

        -- The count: run time at the machine's real pace. The cartoner runs faster than its ideal.
        select coalesce(sum(s.minutes) filter (where r.kind = 'planned'), 0), coalesce(sum(s.minutes) filter (where r.kind is distinct from 'planned'), 0)
          into planned, down from stops s left join stop_reasons r on r.id = s.reason_id where s.run_id = r_id;
        select coalesce(pr.ideal_cycle_seconds, m.default_ideal_cycle_seconds) into ideal from product_rates pr
          where pr.machine_id = m.id and pr.product_id = (select id from products where code = prod);
        factor := case m.code when 'PK-1' then 0.80 when 'PK-2' then 0.70 when 'PK-3' then 0.78 when 'CT-1' then 1.05 else 0.80 end - ((d * 7 + si) % 5) * 0.01;
        total := floor((sh.minutes - planned - down) * 60 / ideal * factor);
        update runs set total_count = total where id = r_id;

        -- Rejects.
        if m.code like 'PK-%' then
          insert into scrap (run_id, reason_id, qty, actor) values (r_id, (select id from scrap_reasons where code = 'STARTUP'), 40, 'demo');
          insert into scrap (run_id, reason_id, qty, actor) values (r_id, (select id from scrap_reasons where code = 'SEAL'),
            greatest(1, round(total * case when m.code = 'PK-3' and d = 3 and si = 1 then 0.05 when m.code = 'PK-2' then 0.012 else 0.007 end)), 'demo');
          insert into scrap (run_id, reason_id, qty, actor) values (r_id, (select id from scrap_reasons where code = 'WT'), greatest(1, round(total * 0.005)), 'demo');
        else
          insert into scrap (run_id, reason_id, qty, actor) values (r_id, (select id from scrap_reasons where code = 'CRUSH'), greatest(1, round(total * 0.004)), 'demo');
        end if;

        -- Checks: a pre-start every run (PK-3 missed one), a metal detector check on the baggers
        -- (PK-1 failed yesterday afternoon and nobody wrote what was done about it).
        if not (m.code = 'PK-3' and d = 2 and si = 1) then
          insert into check_records (machine_id, check_type_id, run_id, done_on, result, done_by, actor)
          values (m.id, (select id from check_types where code = 'PRE'), r_id, rdate, 'pass', case si when 0 then 'Crew A lead' else 'Crew B lead' end, 'demo');
        end if;
        if m.code in ('PK-1', 'PK-2', 'PK-3') then
          insert into check_records (machine_id, check_type_id, run_id, done_on, result, done_by, actor)
          values (m.id, (select id from check_types where code = 'CCP-MD'), r_id, rdate,
                  case when m.code = 'PK-1' and d = 1 and si = 1 then 'fail' else 'pass' end, case si when 0 then 'Crew A lead' else 'Crew B lead' end, 'demo');
        end if;
      end loop;
    end loop;
    -- The weekly interlock test, done on the day shift. CT-1's this week was missed.
    if d in (3, 10, 17, 24) then
      insert into check_records (machine_id, check_type_id, done_on, result, done_by, actor)
      select m2.id, (select id from check_types where code = 'GUARD-W'), rdate, 'pass', 'Hemi Walker', 'demo'
      from machines m2 where m2.code in ('PK-1', 'PK-2', 'PK-3', 'PK-4', 'CT-1') and not (m2.code = 'CT-1' and d = 3) and not (m2.code = 'PK-4' and d < 20);
    end if;
  end loop;
  -- PK-4 is parked but still marked active: its weekly test lapsed with its runs.

  insert into actions (code, machine_id, reason_id, title, owner, opened_on, due_on, status, closed_on, result) values
    ('A-001', (select id from machines where code = 'PK-2'), (select id from stop_reasons where code = 'SEAL'), 'Replace the seal jaw heater and thermocouple on PK-2', 'Hemi Walker', current_date - 6, current_date - 2, 'open', null, ''),
    ('A-002', (select id from machines where code = 'PK-1'), (select id from stop_reasons where code = 'CHG'), 'Pre-stage the allergen clean kit before the sour cream to salt changeover', 'Sarah Lim', current_date - 21, current_date - 14, 'done', current_date - 14, 'Kit staged at the end of each sour cream run'),
    ('A-003', (select id from machines where code = 'PK-3'), (select id from stop_reasons where code = 'FILM'), 'Move the film reel store next to PK-3', 'Jo Patel', current_date - 4, current_date + 10, 'open', null, '');

  insert into notes (machine_id, actor, body) values
    ((select id from machines where code = 'PK-2'), 'Hemi Walker', 'Heater ordered from the OEM, five working days.');
end $$;
