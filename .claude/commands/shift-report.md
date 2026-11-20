---
description: The shift report for one date and shift (the last shift by default): every machine's count, rejects and OEE, the long and unexplained stops, and the checks done, failed or missing.
---

Run `npm run production -- shift-report [YYYY-MM-DD] [shift] --json`.

Present it in four parts: machines (count, rejects, availability, performance, quality, OEE), stops over 10 minutes or with no reason, rejects by reason, and checks. A failed check with no corrective action, or a check not recorded, goes at the top in bold.

For the handover note to keep or forward, use `/draft-shift-report`.
