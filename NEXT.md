# NEXT: create-strutvane v2 (paused 2026-11-16, usage limit)

Branch `v2/installer`. Not pushed, not merged. Remove this file when the work is finished.

## Done (committed)

- Tooling sync (npm CI, R1/R5 checks, .npmrc, RELEASE-READINESS.md); retired workspace-packages.mjs removed.
- Prototype (spike 13) ported verbatim, repo moved to npm (package-lock.json, devEngines npm >= 11.19, engines >= 24.3).
- Real packages: apps depend on `@strutvane/framework` `^0.1.0-next.1` + chosen packages, never core/contracts/cli/devkit/logs; .npmrc guards (ignore-scripts, strict-allow-scripts, min-release-age, allow-git=none).
- Format-2 catalogue adapter + snapshot (`src/data/catalogue.json`), availability gating (#3, #108, #109), `--preview-catalogue`.
- Consistency decisions applied (pgsql, dot-suffix names, Vitest, strutvane.json + .strutvane/local, config/auth.ts features, role presets, `node strut list`, /api, LOG_* in Dockerfile, /up JSON, migrations table, database/database.sqlite, CORS_ORIGINS check, fresh clone from strutvane.json).
- Production `templates/strut.js`; e2e stand-ins in `test/fixtures/packages` + `STRUT_LOCAL_PACKAGES`.

## In this WIP commit (written, partly verified)

- e2e, Docker e2e and own-server e2e moved to the new layout: e2e 10/10 green; Docker + own-server 10 passed, 1 placeholder skipped; no containers left.
- New tests: test/install-step, test/availability (incl. CORS run for real), test/state-and-files (all green alone).

## Next

1. Apply `scratchpad/installer-draft/apply-unreleased.cjs` idea: `--help` shows released choices and lists unreleased flags apart (not applied yet; optional).
2. Run `npm run ci`: last full run had 441 tests green but branch coverage 83.98% (< 85). The new test files above should lift it; add tests for reporter.ts, database.ts, secrets.ts, recovery.ts branches if still short.
3. Replace README.md and CLAUDE.md with the v2 versions (drafts were in the scratchpad: installer-draft/README.md, CLAUDE.md), add the major changeset (draft: installer-draft/v2-installer.md), fill RELEASE-READINESS.md R1/R5 rows.
4. `.changeset/pre.json` is non-standard (no initialVersions/changesets); fix it, then `npx changeset version` (coordinator asked) and check CHANGELOG; report the final version.
5. Gate 3 runs in a row; publint --strict and attw (esm-only) were clean on a packed tarball; check-package OK (12 files, no fixtures).
6. Report: B8 = no framework dependency (only @clack/prompts). Framework 0.1.0-next.1 still lacks: `db:prepare --json`, `migrate --seed` output protocol + exit 3 + STRUT_SEED_ADMIN_PASSWORD, `list`, `user:password`, `token:create`, `design:use`, `docker:prod`, `install:<name>`, `user:create`; `Application.configure().withRouting({health})`, `Model()` shape, `defineSeeder` with `call`, `@strutvane/auth` `firstAdmin()`, `build/server.js`, `DB_CONNECTION` pgsql/mariadb, node:sqlite and mysql2 drivers.
