# CLAUDE.md: create-strutvane (`create-strutvane`)

Project memory for Claude Code in this repository. Keep this file short, accurate and current.

## Ecosystem memory (shared by every Strutvane repo)

The file below is synced from strutvane-tooling and is identical in every repo. It covers how the whole ecosystem fits together: repo map, decisions, connection rules, standards, workflow and current status. Read it before changing anything.

@.claude/ECOSYSTEM.md

## What this repo is

Start a new Strutvane project in one command: npm create strutvane@latest. Presets for full-stack (API + UI + auth), API-only and UI-only, with configs, .env/.env.example, local Docker services, tests and CI ready.

It is one repo of the **Strutvane** polyrepo ecosystem (one GitHub repo per package; see ADR-0002). The hub with the full blueprint is https://github.com/vishwajit-vm/strutvane. Locally it is the umbrella folder two levels up: `../../docs/`.

## Status

- **Phase 1: implemented, version `0.1.0-next.0`, not released.** Changesets is in pre mode (`next`).
- `@strutvane/contracts`, `core` and `devkit` are not published yet, so `pnpm-workspace.yaml` has **temporary** `link:../…` overrides. Remove them once those `0.1.0-next.0` versions are on npm (ADR-0016; `check-deps` flags them until then).
- The source of truth for decisions is `../../docs/00-executive-summary.md` (D1–D24). If anything here conflicts with it, that file wins.
- The package spec is `../../docs/05-developer-experience.md` §2–3 (online: https://github.com/vishwajit-vm/strutvane/blob/main/docs/05-developer-experience.md).

## Code map (`src/`, one concept per file)

| File | Role |
|---|---|
| `options.ts` | Every rule about which choices go together → one frozen `ProjectOptions`. Collects every problem. |
| `validate-name.ts` | npm- and Windows-safe project names. |
| `args.ts` | Hand-written flag parser (optional-value flags like `--docker[=mode]`). Parses only; `options.ts` validates. |
| `prompts.ts` | `Prompter` interface + clack adapter; asks only what flags didn't give. Cancel → `CancelledError`. |
| `env-spec.ts` | ONE description of the app's env vars, which drives `.env`, `.env.example`, `env.schema.ts` and the README table. |
| `templates/*.ts` | Plain functions options → files (no template engine, no eval). `util.ts` has `lines`, a Biome-compatible `json`. |
| `render.ts` | Assembles every template; pure; refuses duplicate paths. |
| `generate.ts` | Writes through devkit's staged fs + env editor; target check, rollback/cleanup, dry run, show-once secrets. |
| `post.ts` | `git init` + first commit, optional install; injectable `CommandRunner`; never throws. |
| `main.ts` / `cli.ts` | The CLI flow (exit codes 0/1/130) behind an injectable `Ui`; `cli.ts` only wires the process. |
| `versions.ts` | Every version written into generated projects (exact pins, SHA-pinned actions). |

## Key behaviours to keep (tests enforce them)

- Generated projects pass `tsc`, `biome check` (their own config) and their own Vitest suite, for every combo in `test/combos.ts`. Templates must emit **already-Biome-formatted** code: if you change one, run the e2e test.
- Golden files: `test/__golden__/*.txt`. Update with `corepack pnpm@12.18.0 exec vitest run -u` and review the diff like code.
- `.env.example` never holds a secret; `.env`, `.env.example` and `env.schema.ts` list the same keys in the same order.
- Only `SEED_ADMIN_PASSWORD` is printed (once). Other secrets stay in `.env`.
- `docker/` is git-ignored unless `--docker=commit` (checked with `git check-ignore`).
- Nothing is written before every question is answered; a non-empty target is never touched.
- Unpublished packages (framework, auth, logs) and browser tooling are stubbed in `test/helpers.ts` (`STUBS`) for the type-check. Keep the stubs to exactly what templates use.

## Boundaries (non-negotiable)

- Allowed dependencies: A minimal runtime (prompts and templating). It renders templates and then runs the selected package installers through `@strutvane/devkit`.
- Cooperation with other Strutvane packages happens **only through `@strutvane/contracts`**, resolved at runtime via the core container.
- Public API changes need a changeset, docs and tests. Contract changes need an RFC.

## Commands

- `corepack pnpm@12.18.0 run ci`: lint → typecheck → tests + coverage (90/90/85/90) → build
- `node src/cli.ts my-app --dry-run`: try the CLI from source (Node strips types)

## Conventions

- TypeScript strict, ESM only, Node 24+ (Node 26 LTS is the target). No decorators or reflection.
- Validation uses Standard Schema with Zod 4 as the default. Errors are RFC 9457 problem+json.
- Tooling: pnpm, tsdown (build), Biome (lint/format), Vitest (tests), Playwright (UI e2e), Testcontainers (DB).
- Code generation and AST work pin the TypeScript 6 compiler API (`@typescript/typescript6`), because TypeScript 7 has no compiler API.
- Releases: Changesets, npm trusted publishing (OIDC) with provenance. Core packages share a major release train.
- **Docker is local-only and never committed** (ADR-0006). Never commit `.env`; keep `.env.example` complete and documented.
- Windows, macOS and Linux are all first-class. Use no bash-only scripts.

## Definition of done (for any change)

Code, tests, docs and a changeset ship together. Security implications are noted. The CLI help or reference is updated if commands changed.

## Where things are

- `.claude/skills/`: task playbooks for this package (invoke by name)
- `.claude/agents/`: specialised reviewer subagents
- `.claude/commands/`: slash commands (`/spec`, `/pre-pr`)
