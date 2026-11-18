# NEXT.md: create-strutvane `v2/installer`

Branch progress for the switch from inline templates to the vendored strutvane-skeleton
(skeleton repo `INSTALLER.md` is the spec). Status words: done, half-done, next.

## Decisions (decided 2026-11-18, coordinator recommendation)

1. The skeleton owns the `users` table; `@strutvane/auth` ships its own tables as normal migrations.
2. The installer vendors the skeleton at build time: a committed copy in `skeleton/`, pinned to one
   ref, refreshed only by `npm run vendor:skeleton`, checked by `test/vendored-skeleton.test.ts`.
3. The app lives under the skeleton's `template/`, with lowercase folders.
4. `.env.example` stays production-safe (`APP_ENV=production`, `APP_DEBUG=false`, no secrets); the
   installer writes the local values into `.env` only.

## Pinned skeleton

- Pinned to commit `ea317419597007d1a23189320a56e4958605142f` (`v2/skeleton`, pushed). No tag yet.
- **Switch to the tag** once strutvane-skeleton tags `v0.2.0-next.0` (core train):
  `npm run vendor:skeleton -- --repo <skeleton clone> --ref v0.2.0-next.0`, then run the gate and
  commit `skeleton/`. The test accepts a full commit id or a release tag as the ref.

## Progress (WIP stop 2026-11-18, coordinator STOP at 84% usage)

- done (commit 14722fe): vendoring script (`scripts/vendor-skeleton.ts`), vendored copy
  (`skeleton/`), record (`skeleton/vendor.json`: git blob id per file), vendoring check test
  (9 passed locally with `STRUT_SKELETON_REPO`), `files` ships the template, Biome skips `skeleton/`.
- done in the WIP commit (sources type-check; tests NOT updated yet, so the suite is red):
  - `src/skeleton/app.ts`: `skeletonAnswers` (option -> answer mapping), `renderSkeletonApp`
    (`resolveAnswers` + `renderSkeleton`, cached template reads with `_gitignore`/`_npmrc` mapping,
    `answers`-mode files via `configAuth`/`tenancyConfig`, unknown generator fails closed).
  - `src/templates/project.ts`: renders from the skeleton; merges installer deps into the
    skeleton package.json (local `file:` for every `@strutvane/*`); README gets Docker / sign-in /
    deploy sections appended; duplicate paths throw; `strut.js` marked executable.
  - `src/templates/app-files.ts`: only installer files remain (answer configs api/mail/security/
    monitoring/permissions/ai, `configAuth`, `tenancyConfig`, admin seeder, browser test,
    `databaseSeeder` marker edit, `uiConfig` line edits). Removed: BOOTSTRAP, routes, health
    controller/test, configApp, CONFIG_DATABASE, CONFIG_CORS, config/cache.ts, config/filesystems.ts,
    user model/policy/factory, migrations, uiFiles/designFiles/themeCss, SAMPLE_DATA_SEEDER
    (superseded by the skeleton's user.seeder.ts, called when sample data = yes).
  - `src/templates/env.ts`: `renderEnvFiles` merges onto the skeleton `.env.example` (in place;
    missing keys appended under headings; `localOnly` APP_ENV/APP_DEBUG/LOG_LEVEL only in .env);
    CORS_ORIGINS dropped; `cacheStore()` always `file` (bug 7).
  - `src/write-files.ts`: executable files get 0o755. `templates/strut.js` deleted (skeleton's).
  - Dockerfile: runs `node strut start` from the sources + dist/ (no build/server.js).
  - Fixture framework: exports `/database`, `/schema`; `app.js` (Application with withConfig/
    withProviders, defineConfig, config, defineRoutes, Route, ServiceProvider, handle(Request));
    seed context env = APP_ENV; factories insert; `start` command; build no longer writes build/.
- 7 bugs: fixed in code (1 imports, 2 defineConfig, 3 defineRoutes, 4 start, 5 sequence number,
  6 seeder env, 7 cache store); the per-bug tests are NOT written yet.
- next, in order:
  1. Update tests: generated-files, env-and-templates (start script, CORS, header), design
     (config/ui.ts now skeleton + uiConfig), availability (config/cors.ts test goes), state-and-files
     (templates/strut.js -> skeleton), strut-forwarding, e2e (must_change_password gone; production
     build test -> copy sources and run `node strut.js start`), docker.e2e (image: no build/; user
     count with sample users). Fix `test/env-and-templates.test.ts` lint warning is pre-existing.
  2. One test per bug (INSTALLER.md §5) + `databaseSeeder`/`uiConfig`/`renderEnvFiles` units +
     executable bit test (POSIX only).
  3. New e2e generation test: 3 answer sets (recommended mysql docker; api sqlite no auth; custom
     postgres own server + vivid + deploy docker): file tree, no `{{`, no Docker files unless opted
     in, `.env` git-ignored, `.env.example` complete (every key config/*.ts reads) with no secrets.
  4. Framework tarball integration test (npm pack from a framework worktree, SQLite API app,
     `node strut migrate`); skip with reason if the compat ^0.1 bug blocks it.
  5. Open cross-repo item: `firstAdmin` does not exist in auth v2 (it has `openIdentityAdmin` in
     `@strutvane/auth/admin`, which refuses non-PostgreSQL/in-memory); the admin seeder still calls
     `firstAdmin`. Needs an auth decision before release.
  6. Questions: the cache "database" label should say file cache; no CSRF/maintenance questions
     exist in the installer (nothing to wire).
  7. Changeset (pre next), README, CLAUDE.md code map (templates/strut.js row), RELEASE-READINESS.
  8. Gate 3x.

## How to verify

```text
npm ci
STRUT_SKELETON_REPO=<skeleton clone> npm run ci   # without it the git ls-tree comparison is skipped
```
