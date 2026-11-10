# dispatch-manifest

Public policy-as-code for [silence-agents-org](https://github.com/silence-agents-org).

Agents write to a private inflow repo. Classification and quarantine happen in private repos of this org. This repository is the only public routing table and the single source of truth for routing ([policy/dispatch.v1.yaml](policy/dispatch.v1.yaml)).

Private destinations are written as the alias `PRIVATE_SINK`; the concrete mapping is held by the owner outside this public repo.

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
| SILENCE-OBJECTS | product objects · Cargo.lock SSoT (`PRIVATE_SINK`) |
| ev-silence-owner | owner public citation (`PRIVATE_SINK`) |

## Policy notes

- ADR-047 is the HARD_IMPORT policy (see [docs/HARD_IMPORT_POLICY.md](docs/HARD_IMPORT_POLICY.md)). It does not govern tag routing.
- The `forbid: silence-ecosystem-as-default` rule in `policy/dispatch.v1.yaml` is currently unattributed: no ADR or decision record backs it yet.

Disclaimer: *Non-clinical behavioral protocol. No diagnosis. No therapy.*

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
