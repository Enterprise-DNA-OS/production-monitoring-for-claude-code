---
description: Add a machine, a product, a shift, a stop reason, a reject reason, a check, a check on a machine, or a setting. Park or retire a machine.
---

1. Write the record as JSON to a temporary file, for example `{"code": "PK-5", "name": "Vertical bagger 5", "area": "Packing", "ideal_cycle_seconds": 1.0, "target_oee": 0.65}`.
   - stop-reason needs `kind` (planned or unplanned) and `loss` (breakdown, changeover, minor, material, people, quality, planned).
   - check-type needs `frequency` (shift, daily, weekly) and a `source`; machine-check is `{"machine": "PK-5", "check": "PRE"}`.
2. `npm run production -- add <kind> <file.json> --actor=NAME`.
3. A machine that is parked: `npm run production -- status <machine> idle --actor=NAME` (it stops being chased for runs and checks).

Planned or unplanned matters: a planned stop comes off planned time and does not count against OEE. Ask if it is not clear.
