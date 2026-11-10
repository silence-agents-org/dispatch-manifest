# ADR-048: Routing destinations for artifact tags

* **Status:** PROPOSED (DRAFT)
* **Owner:** Ewa Tchórzewska (ev-silence-owner)
* **Date:** 2026-11-10
* **Amends / extends:** `policy/dispatch.v1.yaml`, `docs/HARD_IMPORT_POLICY.md` (ADR-047)

> Numbering note: the number ADR-048 is already used elsewhere in the SILENCE ADR registry. Renumber per the ADR numbering/deduplication decision (OD-019) before this ADR is accepted.

## 1. Context

The private classifier taxonomy routed `PUBLIC_MIT`, `RESEARCH_RAW` and `SECRET_INFRA` to the `silence-ecosystem` organization, while `policy/dispatch.v1.yaml` routed them elsewhere and forbade `silence-ecosystem-as-default` without any recorded decision behind that rule. `silence-ecosystem` is the highest-protection zone (core / enterprise / trade secret). Automatic delivery of agent artifacts into it, without receiver-side validation and an Owner signature, is a trust-boundary and IP-boundary risk (ADR-046, ADR-047).

## 2. Decision

`silence-ecosystem` MUST NOT be a routing destination (target org or repository) for the tags `PUBLIC_MIT`, `RESEARCH_RAW` and `SECRET_INFRA`.

Canonical mapping in `policy/dispatch.v1.yaml`:

| Tag | Destination org | Destination repo |
|---|---|---|
| `PUBLIC_MIT` | `SILENCE-OBJECTS` | `PRIVATE_SINK` |
| `RESEARCH_RAW` | `ev-silence-owner` | `PRIVATE_SINK` (private owner research repo; target repo to be created by Ewa) |
| `SECRET_INFRA` | `ev-silence-owner` | `PRIVATE_SINK` (private infra repo; target repo to be created by Ewa) |

`PRIVATE_SINK` is an alias; the concrete private repository names are held by the Owner outside this public repository.

`silence-ecosystem` accepts artifacts only after receiver-side validation and an Owner signature.

## 3. Consequences

* The `forbid: silence-ecosystem-as-default` rule in `policy/dispatch.v1.yaml` gets a normative basis (this ADR).
* The private classifier taxonomy must stay in sync with `policy/dispatch.v1.yaml`, which is the single source of truth for routing.
* Until the two `ev-silence-owner` target repositories exist, `RESEARCH_RAW` and `SECRET_INFRA` have no live receiver and must not be dispatched.
