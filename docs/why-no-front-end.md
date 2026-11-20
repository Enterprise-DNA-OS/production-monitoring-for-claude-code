# Why there is no front end

Evocon is a database with a subscription and a sensor box. Underneath it are ordinary tables: machines, shifts, products and their ideal speeds, runs, stops with reasons, rejects with reasons. What you pay for per machine each month is the layer on top that lets people who do not write SQL get at those tables. Screens, filters, dashboards, report builders.

That layer used to be the whole product, because talking to a database was hard. It is not hard any more. Open this folder in Claude Code, describe what you want, and it writes the query, runs it and explains the answer. Ask a question the dashboard never had a chart for, such as "did the changeover action we closed last month work?", and you still get an answer.

## What you gain

- **Better answers.** A dashboard shows what the vendor decided to chart. Here you ask your own question, in your own words, against your own data.
- **No fee per machine.** Add a machine and the bill does not move.
- **Your data in your Postgres.** Plain tables. Back them up, query them from Power BI or anything else, leave any time.
- **Your rules.** Your stop reasons, your shifts, your checks and your food safety plan, changed with `/customise` the day they change.

## What you give up

- **A live screen on the floor.** Evocon shows each operator a tablet with the machine's state second by second, and asks them to pick a reason when it stops. Here the crew reports the shift, or a supervisor tags the stops afterwards with `/tag-stops`. If you want a live screen at the machine, that is a front end Enterprise DNA builds into your version.
- **Automatic counts.** Evocon's device reads a sensor and counts every cycle. This version takes the count as a number per shift, typed in, imported from a CSV, or read from your PLC or historian by a small job Enterprise DNA sets up. The sensors you already own still work; something has to carry their numbers into the database.
- **A vendor help desk.** This is open source. Enterprise DNA supports the installed version for plants that want someone to call.

## Who this fits

Plants that want the numbers and the discipline around them (shift reports, the downtime Pareto, the daily meeting, checks that stand up at audit) more than a live screen, and plants with 10 or more machines where a fee per machine adds up. If your crews run the line from the screen all day, keep the screen and move the reporting here.

Installed and run for you: https://enterprisedna.co/omni/instead-of/evocon
