---
description: OEE by machine for the last 7 days (or 28 with oee-28): availability, performance and quality, against each machine's target, worst first.
---

Run `npm run production -- oee --json` (or `oee-28 --json` when asked about the month).

Show machine, availability, performance, quality, OEE and target as percentages. Below the table say which of the three drags each machine under target, in one line per machine.

Performance above 100% means the ideal cycle time is set too slow for that product: say so and point to `/rates`. Do not change it without a yes.
