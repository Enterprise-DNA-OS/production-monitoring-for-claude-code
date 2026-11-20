# Production Monitoring for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| Open, list or close an improvement action | `/actions` |
| Add a machine, product, shift, reason or check; park a machine | `/add` |
| What needs a person today | `/attention` |
| How long changeovers take | `/changeovers` |
| Record a check, see what is due or failed, write a corrective action | `/checks` |
| Check the records against the rules in docs/compliance.md | `/compliance` |
| Make this system yours in plain language | `/customise` |
| Run the daily production meeting | `/daily-meeting` |
| Draft the shift handover note | `/draft-shift-report` |
| Save the weekly review as a draft file | `/draft-weekly-review` |
| Export every record to one JSON file | `/export` |
| Bring records in from CSV or an Evocon report | `/import` |
| Ten questions an OEE dashboard does not answer | `/insights` |
| Add a note to a machine | `/log` |
| Record a shift: count, stops, rejects, checks | `/log-shift` |
| The six big losses by machine | `/losses` |
| Everything about one machine | `/machine` |
| Add a read-only HTML view from a plain-language description | `/new-view` |
| OEE by machine against target | `/oee` |
| Where the downtime goes | `/pareto` |
| Show or set ideal cycle times | `/rates` |
| Rejects and what they cost | `/rejects` |
| One shift on every machine | `/shift-report` |
| Give unexplained stops a reason | `/tag-stops` |
| Is OEE getting better, week by week | `/trend` |
| The Monday review | `/weekly-review` |

If an ask fits nothing here, run the CLI directly (`npm run production -- --help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- Every write command takes `--actor=NAME`: use the operator's name.
- OEE, availability, performance and quality are worked out from counts, stops and rejects. Never type one in, and never adjust a count to make a number look better.
- Never give a stop a reason the operator did not give. Unexplained stays unexplained until someone who was there says why.
- Never write that product was held, re-checked, released or destroyed unless the operator says it was. A failed CCP check means the product since the last passing check is held until they say otherwise.
- Planned or unplanned is the operator's call when adding a stop reason; it changes OEE. Ask.
- Changing an ideal cycle time changes past OEE for that product on that machine. Show the before and after and wait for a yes.
- The database is the source of truth. If the answer is not in it, say so.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis, the compliance rules with sources and the guide for moving off Evocon.
- `views.json` and `documents.json` the dashboards (`npm run view`) and the paperwork (`npm run docs`).

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/evocon
