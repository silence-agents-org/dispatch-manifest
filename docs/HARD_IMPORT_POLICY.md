# HARD_IMPORT Policy

ADR-047 forbids cross-organization HARD_IMPORT in `silence-agents-org`. Source-code imports, package-manifest dependencies, workspace mappings, CI references, and container definitions must not create direct code-coupling to external GitHub organizations.

## Summary

- `HARD_IMPORT` is forbidden.
- `RUNTIME_REFERENCE` is the only approved machine-readable bridge.
- `INFO_REFERENCE` is allowed only for documentation and audit context.
- Validation is enforced receiver-side in CI and locally in pre-commit.

## Definitions

### HARD_IMPORT

Any direct source or package dependency such as `import`, `require`, `use`, `@org/package`, GitHub dependency URLs, workspace mappings, or manifest entries that bind this repository to another organization.

### RUNTIME_REFERENCE

A signed entry in `HARD_IMPORT.manifest.yml` that documents a runtime-only bridge, owner approval, expiry, and file restrictions.

### INFO_REFERENCE

A non-executable documentation reference that does not affect build-time or runtime behavior.

## Automatic kill list

The validator triggers `WORLDHALT` (`exit 99`) when any of the following is detected:

- external `@<org>/*` or GitHub dependency reference in scanned files
- expired entry present in `HARD_IMPORT.manifest.yml`
- expired entry used in code or manifests
- missing or mismatched manifest signature
- missing `RUNTIME_REFERENCE` approval for a discovered external dependency

## Approval workflow

1. Request a runtime bridge with purpose, owner, and expiry.
2. Review the request against ADR-047.
3. Add a signed `authorized_runtime_references` entry.
4. Merge only after CI and receiver-side validation pass.

## Expiry management

Every approved runtime reference must carry an expiry date. Expired entries are blocking by policy and require renewal or removal before merge.

## Emergency procedures

- Remove or revoke compromised entries from `HARD_IMPORT.manifest.yml`.
- Recompute the manifest signature.
- Re-run validation.
- Roll back any change that depends on the revoked bridge.

## Audit trail

Keep manifest changes in Git history with reviewer attribution in the manifest entry. Validation artifacts (`depcruise-report.json`, `validation-report.json`) provide machine-readable evidence in CI.

## CI/CD integration

- `.github/workflows/hard-import-validation.yml` runs four blocking gates.
- `.husky/pre-commit` runs staged validation locally.
- `npm run validate:all` executes the full stack on demand.

## FAQ

### What happens when a legacy dependency is found?

The repository fails validation until the dependency is removed or converted into an approved `RUNTIME_REFERENCE`.

### How is WORLDHALT triggered?

`WORLDHALT` is the validator's exit code `99`. CI treats that code as a blocking failure.

### Can this approve other repositories automatically?

No. This repository is the control-plane template. Each sibling repository must adopt the same artifacts in its own PR.
