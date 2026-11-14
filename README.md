<div align="center">

# create-strutvane

**Start a new Strutvane project in one command. Full-stack, API-only or UI-only, with typed config, `.env` + `.env.example`, local Docker services, tests and CI. It passes `lint`, `typecheck` and `test` from the first minute.**

[![Status: pre-release](https://img.shields.io/badge/status-pre--release-orange)](https://github.com/vishwajit-vm/strutvane/blob/main/docs/14-roadmap.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Part of Strutvane](https://img.shields.io/badge/ecosystem-Strutvane-1f3a5f)](https://github.com/vishwajit-vm/strutvane)

</div>

> [!NOTE]
> **Implemented, not released yet.** Version `0.1.0-next.0` is built and tested (Phase 1), but it is not on npm yet. The projects it generates depend on Strutvane packages that are still being built.

## Quick start

```bash
npm create strutvane@next
```

> Strutvane is pre-1.0, so releases are published under the npm `next` dist-tag (`@latest` is a name placeholder without a binary). From 1.0 the command is `npm create strutvane@latest`. With pnpm: `pnpm create strutvane@next`. `create-strutvane --help` always prints the command for its own release channel.

It asks a few questions (what you're building, database, sign-in methods, extras) and writes the project. Every question also has a flag, so you can run it without any prompts:

```bash
npm create strutvane@next acme -- --preset full --db postgres --auth email,google --tenancy --yes
cd acme
pnpm install
pnpm services:up     # local Postgres in Docker
pnpm sv auth:migration   # sign-in tables (PostgreSQL with auth)
pnpm sv migrate
pnpm sv db:seed
pnpm dev
```

## Presets

| Preset | What you get |
|---|---|
| `full` (default) | REST API, database, auth and a generated React UI |
| `api` | REST API, database and background work (no `web/`, no Playwright) |
| `ui` | A UI for an **existing** Strutvane API: screens come from its manifest (no `app/`, no database). Building screens from any OpenAPI document is planned in `@strutvane/ui` |

## What gets generated

The layout follows the [developer experience spec, §3](https://github.com/vishwajit-vm/strutvane/blob/main/docs/05-developer-experience.md). Only what your choices need is created.

```
acme/
├─ app/                 models, policies, services, routes, jobs, providers (README in every folder)
├─ config/              typed settings that read the validated environment
├─ database/            migrations (generated), seeders/database.seeder.ts, factories
├─ web/                 Vite + React; app.tsx renders <StrutvaneApp> (full, ui)
├─ tests/               unit (a real env test), feature, e2e        (e2e: full, ui)
├─ storage/             logs and uploads                            (git-ignored)
├─ docker/compose.yaml  local services only                         (git-ignored by default)
├─ .strutvane/          generated state (git-ignored); upgrade state lock.json, base/, templates/ (committed)
├─ env.ts, env.schema.ts   every environment variable, validated with Zod at startup
├─ .env                 your local values and generated secrets     (git-ignored)
├─ .env.example         every key, documented, no secrets           (committed)
├─ strutvane.config.ts  which Strutvane packages are active
├─ package.json  tsconfig.json  biome.json  vitest.config.ts  playwright.config.ts
├─ pnpm-workspace.yaml  pnpm settings                               (pnpm only)
├─ .gitignore  .gitattributes  .editorconfig  .github/workflows/ci.yml
└─ README.md  CLAUDE.md
```

**Secrets.** `APP_KEY`, `AUTH_SECRET`, `DB_PASSWORD` and `SEED_ADMIN_PASSWORD` are generated (32 random bytes each) straight into `.env`. Only the first admin password is printed, once, and only in an interactive terminal session: with `--yes`, piped output or on a CI server (`CI` / `TF_BUILD` set) it is not printed, and the CLI points you to `SEED_ADMIN_PASSWORD` in `.env` instead. `.env.example` never contains a secret value.

**Secure defaults.** `.env.example` (committed, the starting point for other environments) has `APP_DEBUG=false` and `API_DOCS=false`; your local `.env` turns both on. The generated `env.schema.ts` refuses to boot with `APP_DEBUG=true` unless `APP_ENV=local`, with a `*` in `CORS_ORIGINS` (the API allows credentials), and with non-`https://` CORS origins in production. Public sign-up is off (`AUTH_ALLOW_REGISTRATION=false`). `config/auth.ts` (typed by `defineAuthConfig` from `@strutvane/auth`) gets the default roles from the [auth spec §2.7 and §4.4](https://github.com/vishwajit-vm/strutvane/blob/main/docs/07-package-auth.md): `admin`, `member` (updates and deletes only its own records: `own: true`, matched on `ownerId`), `viewer`, and with tenancy `owner` for a tenant's creator (`scope: 'tenant'`). Admin's user-management grants are `scope: 'global'` (platform administrators only, never a tenant's own admin), and identity, authorization, tenancy and audit records are never matched by wildcards. `@strutvane/auth` enforces the role map together with `app/policies/*.policy.ts` (deny-by-default; a policy `deny` always wins). Reverse proxies are not trusted unless you set `TRUST_PROXY` (only behind a proxy you control), and `config/auth.ts` lists `trustedOrigins` and an empty `trustedProxies`.

**`pnpm sv`** runs the project's own CLI (`strutvane-cli` from `@strutvane/cli` in devDependencies), so `pnpm sv help` lists the project's commands, including those of installed packages. A global `strutvane` launcher runs the same CLI for every command except `help`.

**pnpm projects** get a `pnpm-workspace.yaml` (verified with pnpm 12.18.0). pnpm 12 stops `pnpm install` with `ERR_PNPM_IGNORED_BUILDS` when a dependency has a build script nobody approved, so the file approves exactly one: `allowBuilds: { esbuild: true }` (esbuild, used by Vite and the migration tooling, sets up its platform binary in a build step). It also lists `@strutvane/*` and `strutvane` in `minimumReleaseAgeExclude`: Strutvane pre-releases are staged and approved with 2FA ([ADR-0018](https://github.com/vishwajit-vm/strutvane/blob/main/docs/adr/0018-staged-npm-publishing.md)), and every third-party package keeps pnpm's "too new" protection. npm, Yarn and Bun need no equivalent: npm 11 and Yarn run build scripts, npm 12 only warns and esbuild still works through its platform package, and Bun trusts esbuild by default. The "Next steps" note and the generated README show the Corepack fallback, `corepack pnpm@12.18.0 <command>`, for machines without pnpm on the PATH.

**The UI** is `<StrutvaneApp>` from `@strutvane/ui`: sign-in, a workspace switcher, a menu of every resource the user may see, and list, create, detail and edit pages, all from the API manifest. `web/router.tsx` adds your own screens (`RouteDefinition[]`), `web/theme/tokens.css` restyles it through `--sv-*` variables, and `overrides` in `web/app.tsx` replaces single widgets, cells or messages. Without auth the shell gets `auth={false}`; the ui preset sends cookies to the other origin (`credentials="include"`). This needs the `@strutvane/ui` release after 0.1.0-next.0 (the pin in `src/versions.ts` is bumped before release).

**Users** are not an app model: accounts, sessions, roles and memberships belong to `@strutvane/auth`, and a request knows its user as the actor. `app/models/README.md` shows a profile model keyed by `userId` for your own user fields. On PostgreSQL with auth (and the default `AUTH_SESSION_DRIVER=database`), auth keeps them in the app's database through Better Auth: the project depends on `better-auth`, and `sv auth:migration` writes the migration for those tables before the first `sv migrate` (Next steps, the README and `database/migrations/README.md` say so). Other databases keep sign-in in memory for now.

**Docker is local-only** ([ADR-0006](https://github.com/vishwajit-vm/strutvane/blob/main/docs/adr/0006-docker-local-only.md)). `docker/compose.yaml` runs Postgres or MySQL, Valkey and Mailpit as your choices need. It reads credentials from `.env` and binds every port to `127.0.0.1`. It is git-ignored unless you pass `--docker=commit`.

## Options

| Flag | Values | Default |
|---|---|---|
| `[folder]` | where to create the project; its name becomes the package name | asked |
| `--name <name>` | package name, if it should differ from the folder | folder name |
| `--preset <name>` | `full`, `api`, `ui` | `full` |
| `--db`, `--database <name>` | `postgres`, `mysql`, `sqlite`, `azure-postgres`, `azure-mysql` | `postgres` |
| `--auth <list>` / `--no-auth` | comma-separated: `email`, `magic-link`, `google`, `microsoft`, `github`, or `none` | `email` |
| `--tenancy` / `--no-tenancy` | multi-tenancy, shared database (needs auth) | off |
| `--extras <list>` / `--no-extras` | `queue`, `cache`, `mail`, `audit` (needs auth), `otel`, `logs`, or `none` | `logs` |
| `--docker[=mode]` / `--no-docker` | `local` (git-ignored), `commit`, `off` | `local` when there is something to run |
| `--pm <name>` | `pnpm`, `npm`, `yarn`, `bun` | the one you ran it with |
| `--no-git` | skip `git init` and the first commit | git on |
| `--install` | install dependencies afterwards | off |
| `-y`, `--yes` | accept defaults for everything not given; never prompt | |
| `--dry-run` | print the file tree and a full diff; write nothing | |

When stdin is not a terminal (CI, pipes), nothing is asked; it behaves like `--yes`.

## Safety guarantees

- **Never overwrites.** The target folder must be missing or empty, and this is checked before any question is asked.
- **All or nothing.** Files are written through [`@strutvane/devkit`](https://github.com/vishwajit-vm/strutvane-devkit)'s staged, transactional file system. If writing fails halfway, every file is rolled back and the folder is removed (or emptied again, if it existed).
- **Cancel-safe.** Ctrl+C at any question exits with code `130` and nothing is created.
- **Every problem at once.** Invalid flags are reported together, before any question (for example `--preset ui --db mysql` explains that a UI-only project has no database).
- **Names that work everywhere.** Project names must be valid npm names and safe folder names on Windows (`con`, `nul` and friends are refused).
- **Post steps never destroy work.** A failed `git commit` (no git identity) or `--install` becomes a warning that tells you which command to run.

## Programmatic API

```ts
import { createProject, resolveOptions } from 'create-strutvane'

const { options, warnings } = resolveOptions(
  { name: 'acme', preset: 'api', database: 'sqlite' },
  { cwd: process.cwd() },
)
const result = await createProject(options, { dryRun: true })
console.log(result.tree)
```

`renderProject(options)` returns every file without touching the disk; `main(argv, deps)` is the whole CLI with an injectable UI, prompter and command runner.

## Development

```bash
corepack pnpm@12.18.0 install
corepack pnpm@12.18.0 run ci     # lint → typecheck → tests + coverage → build
```

The end-to-end tests generate real projects for seven option combinations and check each one with the real tools:

- golden files (`test/__golden__/*.txt`; update with `vitest run -u` and review the diff)
- `tsc` against the real `@strutvane/core` and Zod
- Biome with the project's own config
- the project's own Vitest suite
- `git check-ignore` on the generated `.gitignore`
- in the local workspace layout, `config/auth.ts` against the real `@strutvane/auth` types and `web/` against the real `@strutvane/ui` typings (the published 0.1.0-next.0 API)

`test/bin.test.ts` builds the CLI with the repo's own tsdown config into a temporary folder and checks that every `bin` target exists, starts with a `#!` shebang and runs, so the check does not depend on `dist/` or on the order of the `ci` steps.

Packages that aren't published yet (framework, auth, logs) are replaced by type stubs that cover only the surface the templates use. Dependency versions for generated projects live in [`src/versions.ts`](src/versions.ts).

## Works alone, better together

| Package | Role |
|---------|------|
| [`@strutvane/framework`](https://github.com/vishwajit-vm/strutvane-framework) | Backend & database core |
| [`@strutvane/auth`](https://github.com/vishwajit-vm/strutvane-auth) | Authentication, authorization, tenancy, audit |
| [`@strutvane/ui`](https://github.com/vishwajit-vm/strutvane-ui) | Metadata-driven frontend |
| [`@strutvane/core`](https://github.com/vishwajit-vm/strutvane-core) | Kernel: container, providers, config, context |
| [`@strutvane/contracts`](https://github.com/vishwajit-vm/strutvane-contracts) | Shared types and wire protocols |
| [`strutvane` / `@strutvane/cli`](https://github.com/vishwajit-vm/strutvane-cli) | Unified CLI |
| [`@strutvane/devkit`](https://github.com/vishwajit-vm/strutvane-devkit) | SDK for installers, generators and plugins |
| [`@strutvane/logs`](https://github.com/vishwajit-vm/strutvane-logs) | Zero-config logging + built-in log viewer (default) |
| [`create-strutvane`](https://github.com/vishwajit-vm/create-strutvane) | Project starter |

## Documentation

- **Package specification:** [05-developer-experience.md](https://github.com/vishwajit-vm/strutvane/blob/main/docs/05-developer-experience.md)
- **Ecosystem blueprint:** [strutvane/docs](https://github.com/vishwajit-vm/strutvane/tree/main/docs), starting with the [executive summary](https://github.com/vishwajit-vm/strutvane/blob/main/docs/00-executive-summary.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Every change ships with tests, docs and a changeset.

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 The Strutvane Authors
