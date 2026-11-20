---
description: Show or set the ideal cycle time of a product on a machine: the speed OEE performance is measured against.
---

- Show: `npm run production -- products --json` (the ideal_cycle column) and `/insights` question 5 for how each product actually runs.
- Set: `npm run production -- set-rate <machine> <product> <seconds per unit> --actor=NAME`.

The ideal is the speed the machine is built for with that product (the nameplate or the best sustained rate), not the average. A performance above 100% means the ideal is too slow. Changing an ideal changes every past OEE figure for that product on that machine: say so, show the before and after OEE from `oee-28`, and wait for a yes.
