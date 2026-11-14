---
"create-strutvane": patch
---

Safer defaults in generated projects:

- `config/auth.ts` follows the default role map of the auth spec (§4.4): `member` updates and deletes only its own records (`own: true`), plus `newModelDefaults`, an explicit `defaultRoles` list and a `wildcardExclude` list so identity, authorization, tenancy and audit records are only granted by exact name.
- Public sign-up is off by default (`AUTH_ALLOW_REGISTRATION=false`).
- `.env.example` defaults to `APP_DEBUG=false` and `API_DOCS=false`. The generated `env.schema.ts` accepts `APP_DEBUG=true` only with `APP_ENV=local`, rejects `*` in `CORS_ORIGINS` and requires `https://` origins in production.
- The first admin password is printed only in an interactive terminal session (not with `--yes`, piped output or on CI); otherwise the CLI points to `.env`.
- `.gitignore` commits the upgrade state in `.strutvane/` (`lock.json`, `base/`, `templates/`) and ignores generated files and `.strutvane/staging/`; the generated docs and `.strutvane/README.md` describe the same rule.
