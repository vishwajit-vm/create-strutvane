# create-strutvane

## 0.1.0-next.0

### Minor Changes

- First implementation of the Strutvane project starter (Phase 1):
  
  - `npm create strutvane@latest` with three presets (`full`, `api`, `ui`), five databases (PostgreSQL, MySQL, SQLite, Azure PostgreSQL/MySQL with passwordless Entra ID), five sign-in methods, multi-tenancy and extras (queue, cache, mail, audit, OpenTelemetry, logs).
  - Every question has a flag; `--yes` and non-terminal runs never prompt; `--dry-run` shows the file tree and a full diff and writes nothing. Cancelling at any question creates nothing (exit code 130).
  - npm-safe and Windows-safe project names; a non-empty folder is never touched.
  - Files are written through `@strutvane/devkit`'s staged, transactional file system: a failure halfway rolls every file back and removes the folder.
  - `.env` gets generated secrets (the first admin password is shown once); `.env.example` is written by devkit's env editor and never contains a secret. `env.schema.ts` validates the same keys with Zod.
  - Local services in `docker/compose.yaml`, git-ignored by default (ADR-0006); `--docker=commit` to share it. Credentials come from `.env`, ports bind to 127.0.0.1.
  - Generated projects pass their own `lint`, `typecheck` and `test` from the first minute and include a README, a CLAUDE.md and a GitHub Actions workflow with SHA-pinned actions.
