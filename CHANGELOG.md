# create-strutvane

## 0.2.0-next.3

### Patch Changes

- 0b511d5: Generated apps work on macOS with scripts switched on: their package.json `allowScripts` now refuses `fsevents`' install script (`"fsevents": false`). Vite and Vitest pull in fsevents on macOS, and under the app's `strict-allow-scripts` every rebuild with scripts on (the installer's `npm rebuild` of approved packages, or a developer's) failed with ESTRICTALLOWSCRIPTS. The refusal is name-only, as `npm deny-scripts` writes it, so it keeps covering fsevents when Vite moves to a newer version; fsevents ships its binary prebuilt, so nothing is lost.
- f261703: Generated apps get a role map in `config/auth.ts` that matches `@strutvane/auth` 0.2.0-next.2: every role states its `scope`, `admin` stays a platform role (`scope: 'global'`), and with teams on the team creator's reserved `owner` role and the other starting roles are team roles (`scope: 'tenant'`). Without teams every starting role is a platform role and there is no `owner`. The map also lists the records no wildcard may reach (`wildcardExclude`, hub docs/07 §4.4), `newModelDefaults` and an empty `defaultRoles`. Generated apps now depend on `@strutvane/auth` `^0.2.0-next.2`; `config/permissions.ts` only records the starting-roles answer and points to the role map.

## 0.2.0-next.2

### Patch Changes

- 548044a: Apps with sign-in now use `@strutvane/auth` 0.2.0-next.1 (the minimum the installer asks for) for the first admin. Setup runs `node strut auth:migration` before `node strut migrate --seed`, so auth's migrations are the app's own files (committed with the first commit) and its tables exist before seeding. The generated `admin.seeder.ts` imports `createFirstAdmin` and `FirstAdminError` from `@strutvane/auth` directly: seeding again skips an existing first admin (`first_admin_exists`), every other refusal fails the seed with auth's message, setup's one-time password is passed to auth from the environment, and a password auth generates on a manual run is printed once (it is stored nowhere else).
- 7dfd467: Setup no longer crashes when a program exits before reading its input: on Linux, `npm run setup` could die with `write EPIPE` at the git step (`git --version` exits at once). Programs that get no input now start with an empty stdin, and a failed write is logged, not fatal. Docker in "Windows containers" mode (Docker Desktop switched to Windows containers, or Windows Server) is no longer treated as usable: Docker mode is not offered as the default there, and an explicit `--docker` stops with exit 2 and how to switch to Linux containers, instead of failing at `compose up` with "no matching manifest".

## 0.2.0-next.1

### Minor Changes

- e064d13: New apps are rendered from strutvane-skeleton (the app template, like laravel/laravel), vendored at a pinned commit and checked file by file, instead of inline templates. This fixes seven ways the generated app disagreed with framework 0.2: imports from `@strutvane/framework/database` and `/schema`, typed `defineConfig` config files listed in `config/index.ts`, `defineRoutes` with invokable controllers, `npm start` as `node strut start` (the Dockerfile too), factories with a numeric `sequence`, seeders reading `APP_ENV` from `SeedContext.env`, and `CACHE_STORE=file` (there is no database cache store). `.env.example` now comes from the skeleton (production-safe, every key, no secrets, Laravel-style `LOG_*` channels); `.env` gets the local values. `config/cors.ts` and `CORS_ORIGINS` are gone (CORS is off by default). The first-admin seeder calls `@strutvane/auth`'s planned `createFirstAdmin()` and says how to finish when the installed auth does not have it yet. Apps with a UI get a `vitest.config.ts`, so `npm test` finds the tests.

### Patch Changes

- Docker-mode apps now reach their database: the generated `.env` sets `DB_SSLMODE=disable` for the `db` container, which serves no TLS on the private compose network (before, `migrate` failed in every new Docker-mode app). The opt-in production image now starts the framework's `strutvane` command directly as PID 1, so `docker stop` shuts the app down gracefully instead of killing it after the grace period.

## 0.2.0-next.0

### Minor Changes

- b2cdbcc: create-strutvane v2: the real `npm create strutvane` installer (hub blueprint 18 §2.1; `@next` until 1.0), ported from the audited spike 13.
  
  - **Laravel's flow on npm:** Recommended or Custom questions (every one has a flag), a review screen, then files, secrets, ports, database, install, migrate and seed, git, and `npm run dev`. Progress is saved after every step; `npm run setup` continues from the first unfinished one, and also sets up a fresh clone from the committed `strutvane.json`. Exit codes: 0 ready, 1 nothing created, 2 setup unfinished, 130 cancelled.
  - **Any database, with or without Docker:** your own MySQL, MariaDB or PostgreSQL (XAMPP, WAMP, MAMP, Laragon, Postgres.app, remote), Docker mode like Laravel Sail, or SQLite. Plain-language connection errors, database creation, and PostgreSQL owner and app roles so row-level security applies.
  - **Generated apps depend on `@strutvane/framework` `^0.2.0-next.0`** and only the packages their answers bring, never `@strutvane/core`, `contracts`, `cli`, `devkit` or `logs`. They get `engines.node >=24.3` and an `.npmrc` with npm's supply-chain guards (`ignore-scripts`, `strict-allow-scripts`, `min-release-age`, `allow-git=none`).
  - **Packages from the catalogue:** question 22 and the questions that bring a package read the hub's format-2 `catalogue.json` (a snapshot ships with the installer) and offer only published, compatible packages; unreleased ones are hidden and their flags refused with their plan. `--preview-catalogue` offers them for testing.
  - **The app layout of the v2 decisions:** dot-suffix file names (`user.policy.ts`, `database.seeder.ts` with `strut:seeders` markers), Vitest tests, `DB_CONNECTION=pgsql`, sign-in features in `config/auth.ts` (no `AUTH_*` keys), role presets `admin-member` / `admin-manager-member-viewer`, `node strut list`, the API under `/api`, a built-in `/up` that answers JSON, the `migrations` table, SQLite at `database/database.sqlite`, and `CORS_ORIGINS` checked with errors that name the key.
  - **Opt-in container files (ADR-0021):** a production `Dockerfile` (non-root, no secrets, `HEALTHCHECK /up`, JSON logs to stderr) and a dev container.
  
  **Migrating from v1:** v1's presets, pnpm support, `--dry-run`, `sv` and `env.schema.ts` are gone, and there is no automatic upgrade of a v1 project. Create a v2 app with the same answers (the README maps every v1 flag) and move your models, policies and routes across.

## 0.1.0-next.0

### Minor Changes

- First implementation of the Strutvane project starter (Phase 1):
  
  - `npm create strutvane@latest` with three presets (`full`, `api`, `ui`), five databases (PostgreSQL, MySQL, SQLite, Azure PostgreSQL/MySQL with passwordless Entra ID), five sign-in methods, multi-tenancy and extras (queue, cache, mail, audit, OpenTelemetry, logs).
  - Every question has a flag; `--yes` and non-terminal runs never prompt; `--dry-run` shows the file tree and a full diff and writes nothing. Cancelling at any question creates nothing (exit code 130).
  - npm-safe and Windows-safe project names; a non-empty folder is never touched.
  - Files are written through `@strutvane/devkit`'s staged, transactional file system: a failure halfway rolls every file back and removes the folder.
  - `.env` gets generated secrets (the first admin password is shown once); `.env.example` is written by devkit's env editor and never contains a secret. `env.schema.ts` validates the same keys with Zod.
  - Local services in `docker/compose.yaml`, git-ignored by default (ADR-0006); `--docker=commit` to share it. Credentials come from `.env`, ports bind to 127.0.0.1.
  - Generated projects depend on the project-local `@strutvane/cli` (the `strutvane` launcher runs it), and the starter API route is explicitly `public: true` (custom routes need a signed-in user otherwise).
  - Generated projects pass their own `lint`, `typecheck` and `test` from the first minute and include a README, a CLAUDE.md and a GitHub Actions workflow with SHA-pinned actions.
