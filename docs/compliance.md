# Compliance rules checked by `/compliance`

These are the rules this system checks your records against. Each has its source, what a breach looks like in the data, and the check that finds it. Sources were read on 20 November 2026. Rules change: confirm each one against its source before you rely on it, and when one changes, update this file and the check in `scripts/lib/production.mjs` (`COMPLIANCE_SQL`) together.

Nothing here is legal advice. It records the rules the plant has told the system to enforce. The checks themselves (which machine needs which check, how often) are set in `check_types` and `machine_checks` to match your own risk assessment and food safety plan.

| Rule | Source | Breach in the data | Check |
|---|---|---|---|
| `SHIFT_CHECK_MISSING` | New Zealand: Health and Safety at Work Act 2015, section 36(3)(b), the duty to ensure, so far as is reasonably practicable, the provision and maintenance of safe plant ([legislation.govt.nz](https://www.legislation.govt.nz/act/public/2015/0070/latest/)). Australia: the model Work Health and Safety Regulations, Part 5.1 (plant). A recorded pre-start check is how a plant shows it. For CCP checks: Codex Alimentarius, General Principles of Food Hygiene CXC 1-1969 (revised 2022), HACCP principle 4, "Establish a system to monitor control of CCPs", and principle 7, documentation and record keeping ([FAO Codex](https://www.fao.org/fao-who-codexalimentarius/codex-texts/codes-of-practice/en/)). | A run in the last 14 days on a machine that has a `shift` check set, with no record of that check against the run. | `compliance` rule `SHIFT_CHECK_MISSING` |
| `FAILED_NO_CORRECTIVE_ACTION` | Codex CXC 1-1969, HACCP principle 5, "Establish the corrective actions to be taken when monitoring indicates a deviation from a critical limit at a CCP has occurred", and principle 7 (records). For plant checks, the same section 36 duty: a failed guard or interlock test is a fault to fix before the machine runs. | A check recorded as `fail` in the last 28 days with no corrective action written against it. | `compliance` rule `FAILED_NO_CORRECTIVE_ACTION`; `/attention` shows `check failed` |
| `HOLD_SINCE_LAST_GOOD_CHECK` | Codex CXC 1-1969, HACCP principle 5: the corrective action deals with the product made while the CCP was out of control. In practice that is everything since the last passing check. | A failed check whose code starts with `CCP`, and no corrective action that says the product was held, re-checked, released or destroyed. The finding gives the units made since the last passing check. | `compliance` rule `HOLD_SINCE_LAST_GOOD_CHECK` |
| `PERIODIC_CHECK_OVERDUE` | Health and Safety at Work Act 2015, section 36(3)(b), and your own maintenance schedule for guards, interlocks and emergency stops. | A `daily` or `weekly` check on an active machine whose last record is older than its interval, or that has never been done. | `compliance` rule `PERIODIC_CHECK_OVERDUE`; `/attention` shows `check overdue` |

## How OEE is worked out

OEE is not a rule, but auditors and customers ask how the number is made, so here it is.

- **Planned time** is the shift less planned stops (stop reasons with `kind = planned`: breaks, planned maintenance, no orders).
- **Availability** is run time over planned time. Run time is planned time less unplanned stops and stops with no reason yet.
- **Performance** is the ideal time for the count (count times the product's ideal cycle time on that machine) over run time.
- **Quality** is good units over the count. Good is the count less every reject recorded.
- **OEE** is availability times performance times quality, which equals good units at ideal speed over planned time.

Over a week or a month the minutes are summed first and the ratios worked out once, so a short run does not weigh the same as a full shift.
