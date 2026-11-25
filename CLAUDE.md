# CLAUDE.md: create-strutvane (`create-strutvane`)

Project memory for Claude Code in this repository. Keep this file short, accurate and current.

## Ecosystem memory (shared by every Strutvane repo)

The file below is synced from strutvane-tooling and is identical in every repo. It covers how the whole ecosystem fits together: repo map, decisions, connection rules, standards, workflow and current status. Read it before changing anything.

@.claude/ECOSYSTEM.md

## What this repo is

The v2 installer: `npm create strutvane@next my-app` (`@latest` from 1.0) (hub blueprint `docs/18-v2-blueprint.md` §2.1–§2.2, Laravel's flow on npm). Questions (or flags) → review → files → secrets → ports → database → install → migrate + seed → git → `npm run dev`. It is the hub's spike 13 ported to production, with the consistency decisions of `spikes/CONSISTENCY-2026-11-15.md` applied.

## Status

- **v2, `0.2.0-next.N`, lockstep with the core train (decision #128).** Changesets is in pre mode (`next`); changesets are `minor` before 1.0. Printed commands use `releaseTag()` (`@next` for a pre-release). The release gates are hub `docs/19-production-readiness.md` (R1–R9); evidence goes in `RELEASE-READINESS.md`.
- Generated apps depend on `@strutvane/framework` `^0.2.0-next.0` (and the core train at the same range, except `@strutvane/auth`, whose floor is `AUTH_RANGE`, `^0.2.0-next.2`). Until those are on npm, real installs stop at the install step; the end-to-end tests use local stand-ins (`STRUT_LOCAL_PACKAGES`, `test/fixtures/packages`).
- npm only (`npm ci`, `npm run ci`); no pnpm.

## Code map (`src/`, one concept per file)

| File | Role |
|---|---|
| `question-registry.ts` | ONE array of every question (id, group, flag, default, `when`, packages, ★). Engine, flags, help, review, resume, package list and availability all loop over it |
| `options.ts` | Defaults and the rules about which answers go together → frozen `ProjectOptions` |
| `catalogue.ts` (+ `catalogue/`) | Internal adapter for the hub's format-2 `catalogue.json` (untrusted input), "published and compatible", `--preview-catalogue`, follow-up questions |
| `version.ts` | Every version written into apps: framework range, core train, absorbed packages (never generated), drivers, Vitest |
| `questions.ts` | Asks what is missing (visible questions only), review screen, "Change an answer" |
| `args.ts`, `swallowed-flags.ts` | Flags (from the registry), and npm's swallowed-flag detection |
| `main.ts`, `cli.ts` | The flow, `--resume` (also a fresh clone from `strutvane.json`); `cli.ts` only wires the process |
| `setup-state.ts` | `.strutvane/local/setup.json`, or `strutvane.json` for a fresh clone |
| `steps/*` | files, secrets, ports, database (Docker or your own server), install, migrate, git; recovery choices |
| `skeleton/app.ts`, `skeleton/vendor-record.ts` | The app is rendered from the vendored strutvane-skeleton (`skeleton/` at the repo root, pinned in `skeleton/vendor.json`, refreshed only by `npm run vendor:skeleton`) with the skeleton's own `renderSkeleton`/`resolveAnswers` |
| `templates/*` | What the installer adds on top (pure functions): `project.ts` (assembly, deps), `app-files.ts` (answer-only configs, `config/auth.ts`/`tenancy.ts` generators, admin seeder), `auth-roles.ts` (the role map in `config/auth.ts`: explicit scopes, `admin` platform-only, team roles and `owner` `scope: 'tenant'` with teams), `env.ts` (merge onto the skeleton's `.env.example`), `compose.ts`, `workflow-files.ts` |

## Key behaviours to keep (tests enforce them)

- Generated apps never name `@strutvane/core`, `contracts`, `cli`, `devkit` or `logs` (property test + a fail-closed guard in `templates/project.ts`).
- A question that brings a package is visible only when the package is published and compatible; its flag is refused with the plan otherwise (decisions #3, #109). The core train is always available.
- Secrets never reach a flag, `strutvane.json`, `setup.json`, `.env.example`, the review or the log.
- File names: models plain, everything else dot-suffixed (`user.policy.ts`, `database.seeder.ts` with `strut:seeders` markers). Vitest tests. `DB_CONNECTION=pgsql`. `/up` JSON. `migrations` table. SQLite at `database/database.sqlite`.
- The end-to-end suites use throw-away, uniquely named containers and remove them; never touch other stacks.

## Commands

- `npm run ci`: lint → typecheck → tests + coverage (90/90/85/90) → build
- `node src/cli.ts my-app --db sqlite --yes`: try it from source

## Conventions

- TypeScript strict, ESM only, Node 24.3+. No `any`, no non-null assertions.
- Runtime dependencies: `@clack/prompts` only (decision B8: no framework dependency; the installer runs before any app exists and must stay small).
- Windows, macOS and Linux are first-class: programs run without a shell (`node npm-cli.js`), PATH lookups use absolute entries only.
