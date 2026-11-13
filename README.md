<div align="center">

# create-strutvane

**Start a new Strutvane project in one command: npm create strutvane@latest. Presets for full-stack (API + UI + auth), API-only and UI-only, with configs, .env/.env.example, local Docker services, tests and CI ready.**

[![Status: planning](https://img.shields.io/badge/status-planning-blueviolet)](https://github.com/vishwajit-vm/strutvane/blob/main/docs/14-roadmap.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Part of Strutvane](https://img.shields.io/badge/ecosystem-Strutvane-1f3a5f)](https://github.com/vishwajit-vm/strutvane)

</div>

> [!NOTE]
> **create-strutvane is in the design phase.** The specification is written and implementation has not started. Nothing is published to npm yet, and the package name `create-strutvane` is reserved for this project. Follow [the roadmap](https://github.com/vishwajit-vm/strutvane/blob/main/docs/14-roadmap.md) for progress.

## What it is

create-strutvane is part of **[Strutvane](https://github.com/vishwajit-vm/strutvane)**, a TypeScript framework and package ecosystem for building enterprise B2B applications. You declare models as fields and types, and get migrations, a secured CRUD API, auth/RBAC/tenancy and a complete UI. Every line stays owned, overridable TypeScript.

## Planned capabilities

- Interactive prompts or flags: preset, database, auth methods, multi-tenancy, extras, package manager
- **Presets**: `full` (framework + auth + ui), `api` (framework [+ auth]), `ui` (connect to any OpenAPI API)
- Generates a **complete project**: `app/`, `config/`, `database/`, `web/`, `tests/`, documented `.env.example`, a local `.env` with generated secrets, and a seeded admin
- **Local Docker services** (Postgres/MySQL, Valkey, Mailpit), git-ignored by default
- Biome, TypeScript, Vitest and Playwright configs; GitHub Actions CI; a project README with every command
- Templates are tested on every release: generate → typecheck → lint → test on Windows, macOS and Linux

## A taste of the API (design preview)

```bash
npm create strutvane@latest acme -- --preset full --db postgres --auth email,google --tenancy shared --yes
cd acme && pnpm sv up && pnpm dev
```

## Installation (once released)

```bash
npm create strutvane@latest
```

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
| [`create-strutvane`](https://github.com/vishwajit-vm/create-strutvane) | Project starter |

## Documentation

- **Package specification:** [05-developer-experience.md](https://github.com/vishwajit-vm/strutvane/blob/main/docs/05-developer-experience.md)
- **Ecosystem blueprint:** [strutvane/docs](https://github.com/vishwajit-vm/strutvane/tree/main/docs), starting with the [executive summary](https://github.com/vishwajit-vm/strutvane/blob/main/docs/00-executive-summary.md) and the [developer experience](https://github.com/vishwajit-vm/strutvane/blob/main/docs/05-developer-experience.md)

## Contributing

Ideas and design feedback are welcome while the project is in the design phase. Open an issue or discussion, and see [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 The Strutvane Authors
