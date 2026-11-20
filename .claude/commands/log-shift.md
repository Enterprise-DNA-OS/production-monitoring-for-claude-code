---
description: Record a shift on one machine as the crew reports it: the product and count, every stop with its reason, the rejects and the checks. OEE is worked out from these; never type an OEE figure in.
---

The operator describes a shift in their own words, for example "PK-1 day shift, salt 150, 19,800 bags. Seal jaw 45 minutes at 8, two jams, 120 leaking seals, metal detector passed."

1. Read the setup first so the codes are right: `npm run production -- reasons --json`, `scrap-reasons --json`, `shifts --json`, and `machine <machine> --json` for its checks.
2. Say back in a short table what you will record, with the codes you matched. Ask only if a reason or product does not match anything.
3. Record, in this order, each with `--actor=<operator's name>`:
   - `npm run production -- run <machine> --shift=<code> --product=<code> --count=<n> [--date=YYYY-MM-DD] [--crew=]`
   - one `stop <machine> <minutes> <reason> --shift=<code> [--at=HH:MM]` per stop, planned ones (breaks) included. A stop with no reason given is recorded with no reason; do not guess one.
   - `scrap <machine> <qty> <reason> --shift=<code>` per reject reason
   - `check <machine> <check> pass|fail --shift=<code> --by=<name>` per check done. A fail needs `--action="what was done"`; if the operator has not said, record the fail and say the product must be held.
4. Show the run's OEE: `npm run production -- shift-report <date> <shift> --json`, that machine's row.

Never change a run already recorded without saying so; use `--update` only when the operator corrects a count.
