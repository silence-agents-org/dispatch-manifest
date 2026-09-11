# dispatch-manifest

Public policy-as-code for [silence-agents-org](https://github.com/silence-agents-org).

Agents write to private `inbox-raw`. Classification happens in `signal-triage`. Invalid records go to `quarantine`. This repository is the only public routing table.

Import is one-way: public never imports private (RULE-DOM-001).

## Layers

| Layer | Job | Leaves device? |
|---|---|---|
| RAW | agent capture | no |
| STRUCTURE | schema + lineage + hash + signer + purpose tag | hashed only |
| PRODUCT | Insight Pack / EE | never public |
| PUBLISH | docs, llms.txt, MIT modules | yes, tagged PUBLIC_MIT |

## Destination orgs (handles that exist)

| Handle | Role |
|---|---|
| silence-agents-org | inflow only |
| silence-ecosystem | core / research / EE / docs |
| SILENCE-OBJECTS | product objects · `silence-engine` Cargo.lock SSoT |
| ev-silence-owner | owner public citation (`silence-research-open`) |

Not confirmed as GitHub orgs: `silence-public`, `silence-research` as standalone org names — those are repo names inside silence-ecosystem today.

Disclaimer: *Non-clinical behavioral protocol. No diagnosis. No therapy.*
