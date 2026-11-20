---
description: The downtime Pareto for the last 28 days: unplanned stop minutes by reason with the running share, so the team fixes the few reasons that cost most.
---

Run `npm run production -- pareto --json`.

Show reason, stops, minutes, share and cumulative share. Name the reasons that make up 80% of the time. If '(no reason)' is in the top five, say the numbers are not yet trustworthy and point to `/tag-stops`.

For the top reason, run `npm run production -- machine <worst machine> --json` and say which machine it hits hardest.
