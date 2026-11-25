# NEXT.md: create-strutvane `fix/tenant-role-scopes` (2026-11-25)

Compatibility with `@strutvane/auth` 0.2.0-next.2 (auth branch `fix/hardening-2026-11-20`): a role
map entry without a `scope` is a platform role, team roles say `scope: 'tenant'`, a team's
creator holds the reserved `owner` role, `admin` is platform-only.

## Done
- `src/templates/auth-roles.ts` (new): `authRoleMap(options)` builds the role map from the
  starting roles (question 10) and the teams answer (question 11). Every role states its scope.
  Teams off: all starting roles `global`, no `owner`. Teams on: `admin` is the only `global`
  role; `owner` (`['*']`) and the other starting roles are `tenant`. Permissions follow hub
  docs/07 §2.7 (admin `*` + exact user grants; member view/create + own update/delete; viewer
  view). `manager` is not defined in docs/07: here it is view/create/update/delete on any
  non-excluded record (a choice for the lead to confirm). `wildcardExclude` is docs/07 §4.4's
  complete list; `newModelDefaults: 'inherit-role-patterns'`; `defaultRoles: []`.
  `ROLE_PRESETS` moved here from `app-files.ts`.
- `configAuth` writes that map into `config/auth.ts`, with a comment on scopes, `owner` and
  `admin` (teams-on and teams-off variants). `config/permissions.ts` now says the roles live in
  `config/auth.ts`.
- `AUTH_RANGE` is `^0.2.0-next.2` (with next.1 a team's creator would hold `admin`, a platform
  role there, and get no team grants). **This installer can only be released after auth
  0.2.0-next.2 is on npm.**
- Tests: `test/auth-roles.test.ts` (auth's boot rules mirrored, property test over presets x
  teams, the generated file and comments); `generated-files.test.ts` range updated.
- Checked once by hand (not in CI): every generated map (teams x presets x email/magic-link)
  compiles with auth `fix/hardening-2026-11-20` (da3c6f5) `compileRoleMap`, `partitionRoles`,
  `engineConfigFrom` and `defineAuthConfig`; with teams, platform roles = [admin] and tenant
  roles = [owner, ...]; admin gets no grants inside a team and members none outside.
- Changeset: `.changeset/tenant-role-scopes.md` (patch, pre `next`, as the coordinator asked;
  CLAUDE.md says changesets are `minor` before 1.0, so the coordinator may want it changed).

## Next
- **Move the skeleton pin** once skeleton `fix/tenant-role-scopes` is merged: `npm run
  vendor:skeleton -- --ref <merged skeleton commit>` (never hand-edit `skeleton/`). The vendored
  template's `config/auth.ts` is overwritten by `configAuth` in every app, so apps are already
  right with the old pin; the move only keeps the vendored copy (and its auth range
  `^0.2.0-next.2` in `skeleton.json`, which `AUTH_RANGE` overrides anyway) in step.
- Hub docs/07 §4.4 still says a role's default scope is `'any'`; auth next.2 made it `'global'`.

## How to verify
```bash
npm ci
npm run ci        # 3x
```

---

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
5. The first-admin seeder imports `createFirstAdmin` and `FirstAdminError` from `@strutvane/auth`
   (0.2.0-next.1, the floor the installer pins: `AUTH_RANGE`). `first_admin_exists` is skipped
   (seeding re-runs); every other refusal fails the seed; setup's password comes from
   `STRUT_SEED_ADMIN_PASSWORD`, and a generated `oneTimePassword` is printed once. The migrate step
   runs `node strut auth:migration` before `migrate --seed` for apps with sign-in, so auth's
   migrations are app files committed with the first commit. Tested by running the generated
   seeder for real against a stand-in with auth's contract, and end to end (stand-in auth with the
   real migration names, `user_roles`). (Coordinator request 2026-11-19.)

## Progress

- done: vendoring (14722fe): script, `skeleton/` copy, `skeleton/vendor.json`, vendoring check.
- done: rendering from the skeleton (62bbf28); tests updated and new tests (b15070e); then the
  `vitest.config.ts` fix, the framework integration test, README, CLAUDE.md, changeset, readiness.
- Removed inline templates: `templates/strut.js`, `.npmrc`, `.gitignore`, package.json, README,
  bootstrap, routes, health controller and test, `configApp`, `CONFIG_DATABASE`, `CONFIG_CORS`
  (+ `CORS_ORIGINS`), `config/cache.ts`, `config/filesystems.ts`, user model/policy/factory,
  migrations, UI/design/theme files, `SAMPLE_DATA_SEEDER` (the skeleton's `user.seeder.ts` is the
  sample data now: called when sample data = yes).
- Kept (installer-only): `.env` (merged onto the skeleton `.env.example`; `localOnly` keys),
  `strutvane.json`, compose, opt-in Dockerfile / `.dockerignore` / `.devcontainer`, CI, editor
  files, `AGENTS.md`, `deploy/README.md`, answer-only configs (api, mail, security, monitoring,
  permissions, ai), `configAuth` / `tenancyConfig` generators, admin seeder, browser test, and
  the README sections for Docker mode / sign-in / deploy (appended to the skeleton README).
- The 7 bugs of INSTALLER.md §5 are fixed and each has a class-wide test
  (`test/skeleton-render.test.ts`, "INSTALLER.md §5" block); the real e2e also proves 4 and 5.
- Also fixed: `git` step refused to commit `storage/**/.gitignore` (the skeleton's folder keepers);
  the Dockerfile now runs `node strut start` from the sources (+ `dist/`).

## Follow-ups for other repos (found here, not fixed here)

- **skeleton**: (a) a full-stack app's `npm test` finds no tests because Vitest reads
  `vite.config.ts` (root `resources/ui`); the installer writes a `vitest.config.ts` for now; move it
  into the skeleton. (b) `app/policies/user.policy.ts` default-exports a class; the real framework's
  `node strut registry:build` refuses it ("must be a call to definePolicy(...)"). (c) `config/ui.ts`
  does not take appearance / languages / pwa / liveUpdates; the installer edits those lines
  (`uiConfig`); make it an `answers` file or add placeholders. (d) Docker-mode, mail, first-admin
  and AI keys are still appended by the installer (INSTALLER.md §3).
- **framework**: `strutvane.compat ^0.1.0-next.0` makes its own CLI drop its commands
  ("does not provide node strut migrate"; `doctor`: "requires Strutvane ^0.1.0-next.0"). Being
  fixed on `fix/release-0.2`. The integration test skips on exactly this.
  Verified 2026-11-18 against a tarball packed from `fix/release-0.2` at 2492d9f (compat ^0.2):
  the generated SQLite API app installs it and `node strut migrate` creates `users` and
  `migrations` (test passed). Again on 2026-11-18 against `fix/release-0.2` at f658430 (all 5
  framework blockers fixed): passed. Against `main` 6dfc239 it skips (compat ^0.1). Both releases
  still refuse the skeleton `user.policy.ts` in `node strut registry:build` (skeleton follow-up b).
- **auth**: done in 0.2.0-next.1 (`createFirstAdmin`, `FirstAdminError`, `auth:migration`); the
  installer uses it (see item 5).
- **skeleton**: its `package.json` should carry `"allowScripts": { "fsevents": false }` itself
  (macOS: Vite/Vitest pull in fsevents, and strict-allow-scripts fails every rebuild with scripts
  on). Until then the installer adds it (`REFUSED_INSTALL_SCRIPTS`, `appAllowScripts`; the
  skeleton's own entries win). Found on macOS CI, 2026-11-19.
- **tooling**: the synced `check-package.mjs` (R5) refuses test folders/files in a tarball, which
  also hits template payload; the installer stores the app's tests as `_tests/…/*._test.ts` (like
  `_gitignore`). An allowlist for template folders in tooling would make that unnecessary.
- **installer (later)**: the cache question still says "Database (no extra service)"; it maps to
  `CACHE_STORE=file`. Relabel when the question wording is next touched. There are no CSRF or
  maintenance questions to wire.

## Pinned skeleton

Pinned to commit `ea317419597007d1a23189320a56e4958605142f` (`v2/skeleton`, pushed). No tag yet.

Once strutvane-skeleton tags `v0.2.0-next.0`:
`npm run vendor:skeleton -- --repo <skeleton clone> --ref v0.2.0-next.0`, run the gate with
`STRUT_SKELETON_REPO=<clone>`, commit `skeleton/`. (A skeleton fix for the follow-ups above means
a new pin anyway.)

## Gate status (fix/macos, 2026-11-20)

- Branch `fix/macos` (from main cc34ddb): the two macOS CI failures of release run 44578775297.
  1. Generated apps refuse fsevents' install script (`"fsevents": false`, name-only;
     `REFUSED_INSTALL_SCRIPTS` + `appAllowScripts`). Proven with real npm 11.19 and the real
     fsevents 2.3.3 resolved for darwin (`test/install-scripts.e2e.test.ts`, runs on every OS).
  2. The forwarding tests compare real paths (/var vs /private/var), plus a symlinked-folder test.
- Windows gate (code at 8dcea2b), 7 runs on a heavily shared machine: 3 green (run 3, and after a
  plain `npm ci` B1 and B3: 531 passed / 3 skipped each), 4 failed for environmental reasons,
  none in the changed code:
  - run 1: "Port 3001 is in use" (another process took the dev port between setup and
    `node strut dev`);
  - run 2: network outage (ENOTFOUND, registry timeouts everywhere);
  - B2: a throw-away MariaDB container exited before it was ready (own-server e2e; other
    sessions had many database containers running);
  - B4: the e2e first run's `npm install` exceeded its 240 s timeout (B4 took 30 minutes in all).
  Not yet 3 consecutive green runs: re-run the gate 3x when the machine is quieter.
- Linux container (node:24, full suite): 522 passed / 12 skipped (Docker suites skip there).
- macOS itself is only checked by GitHub CI after a push.

## How to verify

```text
npm ci
STRUT_SKELETON_REPO=<skeleton clone> npm run ci
# optional, real framework:
STRUT_FRAMEWORK_TARBALL=<framework .tgz from npm pack> npx vitest run test/framework-integration.test.ts
```
