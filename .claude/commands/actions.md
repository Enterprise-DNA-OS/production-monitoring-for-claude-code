---
description: Improvement actions from the production meeting: open one, list what is open and overdue, close one with its result.
---

- List: `npm run production -- actions --json`. Overdue first, with owner and days overdue.
- Open: `npm run production -- action open "<title>" --machine=<machine> --reason=<stop reason it targets> --owner=<name> --due=YYYY-MM-DD --actor=NAME`. Tie it to a machine and a stop reason whenever possible, so `/insights` can show later whether it worked.
- Close: `npm run production -- action done <code> "<what was done and what changed>" --actor=NAME`, or `action drop <code> "<why>"`.

Never close an action the owner has not reported done.
