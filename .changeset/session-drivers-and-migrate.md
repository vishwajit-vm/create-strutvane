---
"create-strutvane": patch
---

`AUTH_SESSION_DRIVER` accepts exactly what `@strutvane/auth` implements (`database`, `memory`) instead of `database | valkey | jwt`, and PostgreSQL apps no longer need a separate `sv auth:migration` step: `sv migrate` creates the auth tables (a package migration of `@strutvane/auth`).
