---
description: Check the records against the rules in docs/compliance.md: shift checks not recorded, failed checks with no corrective action, product to hold after a failed CCP check, and weekly checks overdue, with the rule cited.
---

1. Read `docs/compliance.md`. Each rule has a name, its source, what a breach looks like in the data and the check that finds it.
2. Run `npm run production -- compliance --json`.
3. Report as a table: rule, record, finding, source. A product hold after a failed CCP check comes first: say how many units and from which run.
4. For each finding, draft the fix the operator can approve: the check to record (`/checks`), the corrective action to write once it is done, or the weekly test to book. Make no change without a yes, and never write that product was held, re-checked or released unless the operator says it was.
5. If a rule in `docs/compliance.md` looks out of date, say so and stop. Do not guess at the rules. The operator confirms the rule, then you update the doc and the check together.

Nothing here is legal advice. The doc records the rules the plant has told the system to enforce, with sources.
