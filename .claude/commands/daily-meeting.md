---
description: Run the daily production meeting: yesterday's shifts against target, the top three losses, the failed checks and the open actions with their owners.
---

1. `npm run production -- shift-report <yesterday> D --json` and the same for each other shift that ran yesterday (`npm run production -- shifts`).
2. `npm run production -- pareto --json` for the top three losses, and `npm run production -- actions --json`.
3. Write the agenda in this order, one screen long:
   - Safety and food safety: failed or missing checks from yesterday.
   - Yesterday: OEE by machine and shift against target, one line each.
   - Top three losses: reason, minutes, the machine it hit hardest.
   - Actions: open ones with owner and due date, overdue first.
   - New actions: suggest at most two, each tied to one of the top losses.
4. After the meeting, open the actions the team agreed: `npm run production -- action open "<title>" --machine= --reason= --owner= --due= --actor=NAME`.

Do not open an action the team did not agree to.
