---
"create-strutvane": patch
---

Generated projects use the `@strutvane/ui` app shell and the persistent sign-in of `@strutvane/auth`:

- `web/app.tsx` renders `<StrutvaneApp apiUrl appName routes>`, which provides sign-in, the workspace switcher, a resource menu and list, create, detail and edit pages from the API manifest. Without auth it passes `auth={false}`; the ui preset passes `credentials="include"`. `web/router.tsx` exports `RouteDefinition[]` for your own screens. The `web/` READMEs and `web/theme/tokens.css` now describe and use what the shell provides (routes, `overrides`, `home`, `--sv-*` variables). The ui preset no longer gets `web/ui.resources.ts`: the UI reads the API's Strutvane manifest, and OpenAPI-based screens are not built yet.
- On PostgreSQL with auth and `AUTH_SESSION_DRIVER=database`, Next steps, the README quick start and `database/migrations/README.md` run `sv auth:migration` before `sv migrate`, so the sign-in tables exist before the app boots.
- No `app/models/user.model.ts`. Accounts belong to `@strutvane/auth` and a request knows its user as the actor, so a separate `User` model was a second, unrelated users table. `app/models/README.md` shows a profile model keyed by `userId` instead.

These templates need the next Strutvane train (after 0.1.0-next.0) for `StrutvaneApp` and `sv auth:migration`.
