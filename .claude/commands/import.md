---
description: Bring records in from CSV: machines, products and ideal rates, runs, stops and rejects, or an Evocon report by column map.
---

Read `docs/replace-evocon.md` first.

1. Always dry-run first: `npm run production -- import <machines|products|runs|stops|scrap> <file.csv> --dry-run`. Show what would load and what would be skipped.
2. For an Evocon report saved as CSV, copy `examples/evocon-stops-map.example.json` or `examples/evocon-runs-map.example.json`, put the CSV's own column names in it, then `npm run production -- import evocon <file.csv> --map=<map.json> --dry-run`.
3. Import in order: machines, products, runs, then stops and rejects (they attach to runs).
4. Load with `--actor=NAME` once the dry run looks right. Nothing loads twice: runs, stops and rejects already in are skipped.

An unknown stop reason stops the import and lists the names: add them with `/add` or map them to an existing code, then import again.
