---
"create-strutvane": patch
---

Generated projects follow the role model `@strutvane/auth` now enforces, and the new proxy settings:

- `config/auth.ts` uses `defineAuthConfig` from `@strutvane/auth` (unknown keys are compile errors). Admin's user-management and audit-reading grants carry `scope: 'global'`; with tenancy an `owner` role (`scope: 'tenant'`, `*`) covers a tenant's creator. The file also sets `trustedOrigins: [env.APP_URL]` and an empty, documented `trustedProxies`.
- `config/app.ts` passes `publicUrl` (from `APP_URL`) and `trustProxy` (new `TRUST_PROXY`, default `0`: no proxy trusted) to the framework.
- The `sv` script runs the project-local `strutvane-cli`, so `sv help` lists the project's commands; the generated README explains it next to the global `strutvane` launcher.
