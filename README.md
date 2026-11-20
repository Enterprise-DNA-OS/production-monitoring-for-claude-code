<h1 align="center">Production Monitoring for Claude Code</h1>

<p align="center">
  <strong>The open-source production monitoring and OEE system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Evocon data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=evocon">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/evocon?utm_source=github&utm_medium=readme&utm_campaign=evocon">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-evocon">Instead of Evocon</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Production Monitoring for Claude Code does the job you pay Evocon for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Evocon dashboard cannot.

Evocon charges per machine, every month, on an annual agreement: €189 per machine a month on Basic, €249 on Professional and €319 on Enterprise with a one-year term, €159, €209 and €269 on three years, plus €19 a month for each IIoT device it rents you on a one-year term ([evocon.com/pricing](https://evocon.com/pricing), checked 20 November 2026). Sensors, cables, displays, on-site visits and integrations are extra. A plant pays that for every machine it watches.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=evocon).

It is for a plant running packing lines, fillers, presses, moulders or whole lines on shifts, and the people who answer for output: the production manager, the shift leads and maintenance. It holds your machines, shifts, products and the ideal speed of each product on each machine, and one run per machine per shift: the count, every stop with its reason (planned or not) and every reject with its reason. From those it works out availability, performance, quality and OEE, the downtime Pareto, the six big losses, changeover times by product pair and what rejects cost. It also keeps the checks a machine needs (pre-start, CCP verification, weekly guard tests) and the actions from the daily production meeting, and tells you which checks failed with nothing done, which product to hold and whether last month's actions worked.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/production-monitoring-for-claude-code.git
cd production-monitoring-for-claude-code
npm install
npm run demo
```

`npm run demo` builds a throwaway database under `.data/`, loads a fictional Auckland snack plant with five packing machines and a cartoner on two shifts, four weeks of runs, stops, rejects and checks, and writes three dashboards and the documents. Then open the folder in Claude Code and type `/attention`, then `/daily-meeting`.

For a working copy of the demo: `npm run migrate && npm run seed`, then `npm run production -- weekly-review`. Start a real database with `npm run migrate` only; never seed it.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/actions` | Improvement actions from the production meeting: open one, list what is open and overdue, close one with its result. |
| `/add` | Add a machine, a product, a shift, a stop reason, a reject reason, a check, a check on a machine, or a setting. Park or retire a machine. |
| `/attention` | What needs a person: stops nobody gave a reason, machines under their OEE target, repeat breakdowns, ideal speeds that look wrong, high-scrap shifts, machines with no production recorded, overdue actions and failed or overdue checks. |
| `/changeovers` | Changeover times by machine and product pair over 28 days: how often, the average, the best and the worst. |
| `/checks` | Pre-start, CCP and weekly checks: record one, see what is due or failed, and write the corrective action on a failed check. |
| `/compliance` | Check the records against the rules in docs/compliance.md: shift checks not recorded, failed checks with no corrective action, product to hold after a failed CCP check, and weekly checks overdue, with the rule cited. |
| `/customise` | Make this system yours in plain language. Add a field, rename stages, change a rule, add a column to a document. Writes the migration, applies it, updates the commands that touch it. |
| `/daily-meeting` | Run the daily production meeting: yesterday's shifts against target, the top three losses, the failed checks and the open actions with their owners. |
| `/draft-shift-report` | Draft the shift handover note for one date and shift to drafts/: the table, the long stops, the checks and a space for what the next crew needs to know. |
| `/draft-weekly-review` | Save the weekly review as a draft file in drafts/ for the plant manager to read or forward. |
| `/export` | Export every record to one JSON file the plant owns. |
| `/import` | Bring records in from CSV: machines, products and ideal rates, runs, stops and rejects, or an Evocon report by column map. |
| `/insights` | Ten questions about the plant that an OEE dashboard does not answer, run against your records. |
| `/log-shift` | Record a shift on one machine as the crew reports it: the product and count, every stop with its reason, the rejects and the checks. OEE is worked out from these; never type an OEE figure in. |
| `/log` | Add a note to a machine: a fault seen, a part on order, a promise from the OEM. |
| `/losses` | The six big losses by machine over 28 days, in minutes: breakdowns, changeovers, short stops, other stops, running below ideal speed, start-up rejects and running rejects. |
| `/machine` | One machine in one brief: its OEE this week, last runs, top stops, checks, open actions and notes. |
| `/new-view` | Add a read-only HTML view (a dashboard page) from a plain-language description, rendered in the operator's brand by `npm run view`. |
| `/oee` | OEE by machine for the last 7 days (or 28 with oee-28): availability, performance and quality, against each machine's target, worst first. |
| `/pareto` | The downtime Pareto for the last 28 days: unplanned stop minutes by reason with the running share, so the team fixes the few reasons that cost most. |
| `/rates` | Show or set the ideal cycle time of a product on a machine: the speed OEE performance is measured against. |
| `/rejects` | Rejects by machine and reason over 28 days, in units and in what they cost at each product's unit cost. |
| `/shift-report` | The shift report for one date and shift (the last shift by default): every machine's count, rejects and OEE, the long and unexplained stops, and the checks done, failed or missing. |
| `/tag-stops` | Give the stops nobody explained a reason, run by run, so the downtime numbers are whole. |
| `/trend` | Weekly OEE by machine over the last four weeks, with availability, performance and quality, to see whether things are getting better. |
| `/weekly-review` | The Monday review: what needs attention, OEE by machine, the top five losses, open actions and compliance findings. |

Everything runs through one CLI, `npm run production -- --help`. Every command takes `--json`. Names match partly and case-insensitively; an ambiguous name lists the candidates and exits 1. No command sends email or deletes a record.

`npm run view` writes three read-only pages (this week, losses, checks) and `npm run docs` writes a shift report for each recent shift and a CCP monitoring record for each machine, in the business name, logo and colours from `brand.json`.

## Ten questions to ask today

`npm run production -- insights` answers these from your records:

1. Which machines lost the most time to unplanned stops in the last four weeks, and to what?
2. Which few reasons make up most of the downtime?
3. Which changeovers take longest, and how far above the best time?
4. Which shift runs each machine better?
5. Which products run furthest below their ideal speed?
6. What did rejects cost over four weeks, by reason?
7. How much do the short stops add up to on each machine?
8. Did the actions we closed work?
9. What is one more point of OEE worth on each machine, in good units a week?
10. Where is downtime going unexplained?

## Your first hour: ten things to ask for

1. "What needs a person today?" (`/attention`)
2. "Run the daily meeting." (`/daily-meeting`)
3. "PK-1 day shift: salt 150, 19,800 bags, seal jaw 45 minutes at 8, two jams, 120 leaking seals, metal detector passed." (`/log-shift`)
4. "Those three stops on PK-1 last night were film splices." (`/tag-stops`)
5. "Where does the time go?" (`/pareto`, then `/losses`)
6. "How long do our changeovers take?" (`/changeovers`)
7. "The metal detector on PK-1 failed: what do we hold?" (`/compliance`, then `/checks`)
8. "Open an action for Hemi to replace the PK-2 seal jaw heater by Friday." (`/actions`)
9. "Draft last night's handover." (`/draft-shift-report`)
10. "Add a fill weight to every run on the baggers." (`/customise`)

## Instead of Evocon

Load your machines, products and ideal speeds, then export the Evocon reports to Excel, save them as CSV and import them with a column map you write once. Step by step, including what does not carry over: [docs/replace-evocon.md](docs/replace-evocon.md). Rules checked by `/compliance`, with sources: [docs/compliance.md](docs/compliance.md). The honest trade-offs, including the live floor screen and sensor counting: [docs/why-no-front-end.md](docs/why-no-front-end.md).

## Architecture

```
production-monitoring-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Production Monitoring for Claude Code for your business, migrates your Evocon data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=evocon)
- Read more: [enterprisedna.co/omni/instead-of/evocon](https://enterprisedna.co/omni/instead-of/evocon?utm_source=github&utm_medium=readme&utm_campaign=evocon)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
