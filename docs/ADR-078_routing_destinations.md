# ADR-078: Routing destinations for artifact tags

* **Status:** PROPOSED (DRAFT)
* **Owner:** Ewa Tchórzewska (ev-silence-owner)
* **Date:** 2026-11-10
* **Decision record:** OD-023 (Owner decision, 2026-11-10)
* **Amends / extends:** `policy/dispatch.v1.yaml`, `docs/HARD_IMPORT_POLICY.md` (ADR-047)

## 1. Context

The private classifier taxonomy routed `PUBLIC_MIT`, `RESEARCH_RAW` and `SECRET_INFRA` to the `silence-ecosystem` organization, while `policy/dispatch.v1.yaml` routed them elsewhere and forbade `silence-ecosystem-as-default` without any recorded decision behind that rule. `silence-ecosystem` is the highest-protection zone (core / enterprise / trade secret). Automatic delivery of agent artifacts into it, without receiver-side validation and an Owner signature, is a trust-boundary and IP-boundary risk (ADR-046, ADR-047).

## 2. Decision

`silence-ecosystem` MUST NOT be a routing destination (target org or repository) for the tags `PUBLIC_MIT`, `RESEARCH_RAW` and `SECRET_INFRA`.

Canonical mapping in `policy/dispatch.v1.yaml`:

| Tag | Destination org | Destination repo |
|---|---|---|
| `PUBLIC_MIT` | `SILENCE-OBJECTS` | `PRIVATE_SINK` |
| `RESEARCH_RAW` | `ev-silence-owner` | `PRIVATE_SINK` (private Owner research repository) |
| `SECRET_INFRA` | `ev-silence-owner` | `PRIVATE_SINK` (private Owner infra repository) |

`PRIVATE_SINK` is an alias; the concrete private repository names are held by the Owner outside this public repository.

`silence-ecosystem` accepts artifacts only after receiver-side validation and an Owner signature.

## 3. Consequences

* The `forbid: silence-ecosystem-as-default` rule in `policy/dispatch.v1.yaml` gets a normative basis (ADR-078).
* The private classifier taxonomy must stay in sync with `policy/dispatch.v1.yaml`, which is the single source of truth for routing.
* The two private `ev-silence-owner` target repositories (aliased as `PRIVATE_SINK`) will be created by the Owner. Until they exist, `RESEARCH_RAW` and `SECRET_INFRA` packets are held at the receiving layer and are not dispatched; nothing is exposed publicly or imported in the meantime.
