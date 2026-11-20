---
description: The six big losses by machine over 28 days, in minutes: breakdowns, changeovers, short stops, other stops, running below ideal speed, start-up rejects and running rejects.
---

Run `npm run production -- losses --json`.

Show the table. For each machine name its biggest loss and one plain sentence on what usually fixes that kind of loss (a breakdown: root cause on the repeat fault; a changeover: prepare before the stop; speed: check the ideal and the settings; rejects: the reason at the top of `/rejects`).
