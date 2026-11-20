# Moving off Evocon

You can switch in a day and keep your history. Evocon says on its reports page that any report can be exported to Excel or PDF, that you can download the raw data behind a report, and that Professional and Enterprise plans include API access ([evocon.com/feature/reports](https://evocon.com/feature/reports/), [evocon.com/pricing](https://evocon.com/pricing), both read 20 November 2026). This guide uses the Excel export, saved as CSV.

## 1. Set up the plant (an hour)

Write three small CSV files and load them. Copy the shapes in `examples/`.

| File | Columns | From Evocon |
|---|---|---|
| `machines.csv` | code, name, area, ideal_cycle_seconds, target_oee | Your stations. Use the same names as Evocon so the reports match. |
| `products.csv` | code, name, unit, unit_cost, currency, `ideal_seconds_<machine>` per machine | Your products and the target speeds set on each station. Evocon sets a speed per product; convert units an hour to seconds per unit (3600 divided by the hourly speed). |
| shifts and reasons | `add shift`, `add stop-reason`, `add scrap-reason` | Your shift times and downtime reasons. Mark each reason planned or unplanned the same way Evocon does, so OEE comes out the same. |

```bash
npm run production -- import machines machines.csv --dry-run
npm run production -- import machines machines.csv --actor="Your Name"
npm run production -- import products products.csv --actor="Your Name"
```

## 2. Bring the history across

Export the reports from Evocon to Excel for the period you want (three months is plenty for trends) and save each as CSV. Then copy the map files in `examples/`, put your CSV's own column headings on the right, and import:

```bash
npm run production -- import evocon quantities.csv --map=my-runs-map.json --dry-run
npm run production -- import evocon quantities.csv --map=my-runs-map.json --actor="Your Name"
npm run production -- import evocon downtime.csv --map=my-stops-map.json --actor="Your Name"
npm run production -- import scrap scrap.csv --actor="Your Name"
```

- Runs first (one row per station, date and shift with the total count), then stops and rejects, which attach to runs.
- Dates can be `2026-11-03`, `03/11/2026` or `03.11.2026`. Durations can be minutes (`25`) or `h:mm:ss` (`0:25:00`).
- A stop with a blank reason loads as unexplained; tag it later with `/tag-stops`.
- A reason the system does not know stops the import and lists it. Add it or rename it in the CSV, then run again.
- Nothing loads twice. Run the same file again and the rows already in are skipped.

## 3. Check the numbers match

Pick one week and compare: `npm run production -- oee-28` against Evocon's OEE report for the same machines and dates. If performance differs, the ideal speeds differ (step 1). If availability differs, a reason is planned in one system and unplanned in the other.

## 4. Keep going

From the next shift, the crew reports each shift with `/log-shift`, or a supervisor imports the day's counts from your PLC or historian export with `import runs`.

## What does not carry over

- **The live tablet screen and the sensor counting.** See [why-no-front-end.md](why-no-front-end.md). Your sensors and cables stay yours; Evocon's own device is rented, and Evocon's pricing page says you return it if you stop.
- **Second-by-second speed traces.** This version keeps one count per run and each stop with its minutes. Speed loss is worked out per run, not per minute.
- **Evocon's checklists, alerts and scheduled email reports.** Checks live in `check_types` and are recorded with `/checks`; the shift report and weekly review are drafted to `drafts/` for a person to send.
- **User accounts and permissions.** Access is whoever can open the folder or the database.

Enterprise DNA does all of this for you, including the column maps, the PLC or historian feed and a live screen at the machine if you want one: [enterprisedna.co/omni/instead-of/evocon](https://enterprisedna.co/omni/instead-of/evocon).
