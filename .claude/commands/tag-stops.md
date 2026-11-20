---
description: Give the stops nobody explained a reason, run by run, so the downtime numbers are whole.
---

1. Run `npm run production -- unexplained --json`. Show them by machine and shift with the start time and minutes.
2. Ask the operator (or read their note) what each one was. Match to `npm run production -- reasons`.
3. Tag each: `npm run production -- tag <machine> <reason> --date=YYYY-MM-DD --shift=<code> --at=HH:MM --actor=NAME`, or a stop id from the list instead of the machine. `--all` gives every unexplained stop on that run the same reason, only when the operator says they were all the same.
4. If a cause has no reason code yet, propose one with `/add` and wait for a yes.

Never pick a reason for the operator. A stop stays unexplained until someone who was there says why.
