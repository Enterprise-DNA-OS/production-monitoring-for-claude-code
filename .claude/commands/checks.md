---
description: Pre-start, CCP and weekly checks: record one, see what is due or failed, and write the corrective action on a failed check.
---

- Status: `npm run production -- checks --json`. Failed and overdue first.
- Record: `npm run production -- check <machine> <check> pass|fail [--shift=<code>] [--date=] --by=<name> [--action="..."] --actor=NAME`. Shift checks belong to a run, so the run must be recorded first.
- Corrective action on the last fail: `npm run production -- correct <machine> <check> "<what was done>" --actor=NAME`.

On a failed CCP check, the product made since the last passing check must be held and re-checked. Say how many units that is (`/compliance` works it out) and write "held" and the outcome in the corrective action once the operator confirms it was done. Never write that product was held or released unless the operator says so.
