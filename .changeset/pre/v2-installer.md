---
"create-strutvane": minor
---

create-strutvane v2: the real `npm create strutvane` installer (hub blueprint 18 §2.1; `@next` until 1.0), ported from the audited spike 13.

- **Laravel's flow on npm:** Recommended or Custom questions (every one has a flag), a review screen, then files, secrets, ports, database, install, migrate and seed, git, and `npm run dev`. Progress is saved after every step; `npm run setup` continues from the first unfinished one, and also sets up a fresh clone from the committed `strutvane.json`. Exit codes: 0 ready, 1 nothing created, 2 setup unfinished, 130 cancelled.
- **Any database, with or without Docker:** your own MySQL, MariaDB or PostgreSQL (XAMPP, WAMP, MAMP, Laragon, Postgres.app, remote), Docker mode like Laravel Sail, or SQLite. Plain-language connection errors, database creation, and PostgreSQL owner and app roles so row-level security applies.
- **Generated apps depend on `@strutvane/framework` `^0.2.0-next.0`** and only the packages their answers bring, never `@strutvane/core`, `contracts`, `cli`, `devkit` or `logs`. They get `engines.node >=24.3` and an `.npmrc` with npm's supply-chain guards (`ignore-scripts`, `strict-allow-scripts`, `min-release-age`, `allow-git=none`).
- **Packages from the catalogue:** question 22 and the questions that bring a package read the hub's format-2 `catalogue.json` (a snapshot ships with the installer) and offer only published, compatible packages; unreleased ones are hidden and their flags refused with their plan. `--preview-catalogue` offers them for testing.
- **The app layout of the v2 decisions:** dot-suffix file names (`user.policy.ts`, `database.seeder.ts` with `strut:seeders` markers), Vitest tests, `DB_CONNECTION=pgsql`, sign-in features in `config/auth.ts` (no `AUTH_*` keys), role presets `admin-member` / `admin-manager-member-viewer`, `node strut list`, the API under `/api`, a built-in `/up` that answers JSON, the `migrations` table, SQLite at `database/database.sqlite`, and `CORS_ORIGINS` checked with errors that name the key.
- **Opt-in container files (ADR-0021):** a production `Dockerfile` (non-root, no secrets, `HEALTHCHECK /up`, JSON logs to stderr) and a dev container.

**Migrating from v1:** v1's presets, pnpm support, `--dry-run`, `sv` and `env.schema.ts` are gone, and there is no automatic upgrade of a v1 project. Create a v2 app with the same answers (the README maps every v1 flag) and move your models, policies and routes across.
