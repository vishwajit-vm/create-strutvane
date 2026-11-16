<div align="center">

# create-strutvane

**Start a new Strutvane app in one command. It asks how you want it set up, then writes the project, generates secrets, picks free ports, starts the database (your own server or Docker), installs, migrates, seeds and makes the first commit.**

[![Status: pre-release](https://img.shields.io/badge/status-pre--release-orange)](https://github.com/vishwajit-vm/strutvane/blob/main/docs/19-production-readiness.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Part of Strutvane](https://img.shields.io/badge/ecosystem-Strutvane-1f3a5f)](https://github.com/vishwajit-vm/strutvane)

</div>

> [!NOTE]
> **v2, not released yet.** This is the v2 installer (Laravel's flow on npm, blueprint 18 §2.1). It is built and tested, but it is not on npm yet, and the apps it creates depend on `@strutvane/framework` `^0.1.0-next.1` and the core-train packages, which are not published yet either. Until they are, the install step stops with "a package version this app needs is not published yet" and `npm run setup` finishes later.

## Quick start

```bash
npm create strutvane@latest my-app
cd my-app
npm run dev
```

It asks **how much you want to decide**: *Recommended* (a few starred questions, sensible defaults for the rest) or *Custom* (every question, grouped). A review screen lists every answer, defaults included, with *Create / Change an answer / Cancel*.

Every question has a flag, so CI (or `--yes`) never needs a prompt:

```bash
npm create strutvane@latest acme -- --stack full --design vivid --sign-in magic-link --teams --db postgres --docker --yes
npx create-strutvane@latest acme --db sqlite --yes          # npx needs no "--"
```

`npm create` needs `--` before flags. Without it, npm swallows some of them; the installer notices the traces npm leaves and prints the exact command to run instead. `--help` lists every flag.

## What it does

1. **Writes the project** (all or nothing: a failure leaves no folder behind), in the Laravel-style layout: `app/http/controllers`, `app/models`, `app/policies`, `bootstrap/app.ts`, `routes/`, `config/`, `database/{migrations,seeders,factories}`, `resources/ui`, `tests/`.
2. **Generates secrets** into `.env` (never `.env.example`): `APP_KEY` is the one root secret; database passwords in Docker mode.
3. **Picks free ports** and moves away from any taken between the check and the start.
4. **Starts the database**: your own MySQL, MariaDB or PostgreSQL server (XAMPP, WAMP, MAMP, Laragon, Postgres.app, a local install, a remote or cloud database), Docker (like Laravel Sail: the app, the database and Mailpit in containers), or SQLite. Docker is never required.
5. **Installs** with npm, with no dependency install scripts.
6. **Migrates and seeds**, creating the first admin with a one-time password shown once.
7. **Makes the first git commit**, after checking that secrets and local data are ignored.
8. Offers to run `npm run dev`.

Progress is saved after every step. If one fails, it explains why in plain words and offers a fix; `npm run setup` continues from the first unfinished step. Exit codes: `0` ready, `1` nothing created, `2` created but setup unfinished, `130` cancelled.

## What the app gets

| File | Why |
|---|---|
| `package.json` | `@strutvane/framework` plus only the packages your answers bring (never `@strutvane/core`, `contracts`, `cli`, `devkit` or `logs`: they were merged into the framework); the database driver pinned exactly; `engines.node >=24.3`; `devEngines` npm `>=11.19`; scripts that all go through `node strut` |
| `.npmrc` | npm's supply-chain guards: `ignore-scripts`, `strict-allow-scripts` (only the `allowScripts` list may run), `min-release-age=1` (except `@strutvane/*`), `allow-git=none`, `engine-strict` |
| `strut.js` | `node strut <command>`, the project CLI. It runs the framework's `strutvane` program, forwards into the app container in Docker mode, and handles `setup`, `services:*`, `db:shell` and the `npm`/`npx`/`node`/`shell` pass-throughs |
| `strutvane.json` | Every answer (never a secret), committed. `npm run setup` sets up a fresh clone from it, and `node strut install:<name>` reads it |
| `.strutvane/local/` | Machine-local state, git-ignored: setup progress, logs, a per-computer Docker override (`env.json`). The rest of `.strutvane/` is generated and committed |
| `config/auth.ts` | The sign-in features you picked (`password`, `emailLink`, `registration`, `emailVerification`, `passwordReset`, `passwordConfirmation`, `twoFactor`, `passkeys`, `apiTokens`, `teams`, `impersonation`). Not env keys |
| `config/cors.ts` | `CORS_ORIGINS` checked at load: empty, a wildcard, a non-origin or http in production each fail with a message that names the key |
| `Dockerfile`, `.dockerignore` | Only with `--deploy docker` (ADR-0021): multi-stage, non-root, no secrets, `HEALTHCHECK` on `/up`, logs as JSON to stderr |
| `.devcontainer/` | Only with `--dev-container` (ADR-0021) |
| `docker/compose.yaml` | Docker mode only, git-ignored (ADR-0006): every port on 127.0.0.1 |

`/up` is built in and answers `{"status":"ok"}`. The API is served under `/api`. Tests use Vitest.

## Packages and the catalogue

Optional packages (question 22, plus the questions that bring a package, such as Redis, S3 storage, social login or SSO) come from the **package catalogue** (blueprint §3.3). The installer reads the hub's `catalogue.json` (format 2) through its own checker, which treats the file as untrusted, and offers only packages that are **published and compatible** with the framework being installed. A question whose packages are not released yet is not asked, and its flag is refused with the release it is planned for.

`--preview-catalogue` is a developer flag that offers the unreleased packages too, for trying them out.

A snapshot of the catalogue ships with the installer (`src/data/catalogue.json`, from the hub's spike 21 seed). The hub-built `catalogue.json` replaces it in a later release.

## Migrating from v1

v1 (`0.1.0-next.0`, pnpm, presets) and v2 have nothing in common but the name: v2 is a new installer for the v2 app layout. Existing v1 projects keep working with the v1 packages; there is no automatic upgrade.

| v1 | v2 |
|---|---|
| `npm create strutvane@next`, pnpm by default | `npm create strutvane@latest`, npm only |
| `--preset full\|api\|ui` | `--stack full\|api` (a UI-only preset is gone: the UI ships with the full app) |
| `--auth email,google` | `--sign-in email\|magic-link\|none`, `--security`, `--social` |
| `--tenancy` | `--teams` (`--tenant switcher\|subdomain`) |
| `--docker=commit` | `--docker` (local stack, git-ignored), `--deploy docker` and `--dev-container` (committed, ADR-0021) |
| `--dry-run` | Gone: the review screen shows every answer before anything is written |
| `sv <command>` (`@strutvane/cli`) | `node strut <command>` (the framework's `strutvane` program) |
| Dependencies on `@strutvane/core`, `contracts`, `cli`, `devkit`, `logs` | Only `@strutvane/framework` and the chosen packages |
| `env.schema.ts` (Zod) | `config/*.ts`, validated by the framework at boot; `config/cors.ts` checks `CORS_ORIGINS` |
| `.strutvane/` git-ignored except `lock.json`, `base/`, `templates/` | `.strutvane/` committed except `.strutvane/local/` |
| `pnpm-workspace.yaml` guards | `.npmrc` guards (npm `>=11.19`) |

To move a v1 project, create a v2 app with the same answers and move your models, policies and routes across by hand.

## Programmatic API

```ts
import { EXIT, main } from 'create-strutvane'

const code = await main(environment) // see InstallerEnvironment: prompter, programs, folder, clock
if (code === EXIT.incomplete) console.log('run npm run setup')
```

## Development

```bash
npm ci
npm run ci          # lint, typecheck, tests with coverage (90/90/85/90), build
node src/cli.ts my-app --db sqlite --yes     # try it from source (Node strips the types)
```

The end-to-end suites run real npm, git and SQLite, and, when Docker is running, real MySQL 8.4, MariaDB 11 and PostgreSQL 18 containers with unique names that are removed afterwards. Because the Strutvane packages are not on npm yet, they use local stand-ins: `STRUT_LOCAL_PACKAGES=<folder>` makes the installer copy package folders (`strutvane-framework`, …) into the app instead of using the registry. It is also how the ecosystem's umbrella workspace tries an unreleased framework.

## Works alone, better together

| Package | Role |
|---------|------|
| [`@strutvane/framework`](https://github.com/vishwajit-vm/strutvane-framework) | The framework: MVC, ORM, migrations, CLI (`strutvane`), security, logging |
| [`@strutvane/auth`](https://github.com/vishwajit-vm/strutvane-auth) | Sign-in, tokens, 2FA, passkeys, teams |
| [`@strutvane/ui`](https://github.com/vishwajit-vm/strutvane-ui) | React admin UI built from your models |
| `@strutvane/design-crisp`, `@strutvane/design-vivid` | The looks of the UI |
| [`create-strutvane`](https://github.com/vishwajit-vm/create-strutvane) | This installer |

## Documentation

- **The flow:** [18 v2 blueprint §2.1–§2.2](https://github.com/vishwajit-vm/strutvane/blob/main/docs/18-v2-blueprint.md)
- **Release gates:** [19 production readiness](https://github.com/vishwajit-vm/strutvane/blob/main/docs/19-production-readiness.md)
- **Decisions:** [executive summary](https://github.com/vishwajit-vm/strutvane/blob/main/docs/00-executive-summary.md), [ADRs](https://github.com/vishwajit-vm/strutvane/tree/main/docs/adr)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Every change ships with tests, docs and a changeset.

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 The Strutvane Authors
