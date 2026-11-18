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

## Progress

- done: vendoring script (`scripts/vendor-skeleton.ts`), vendored copy (`skeleton/`), record
  (`skeleton/vendor.json`: git blob id per file), vendoring check test, `files` ships the template.
- next: render through `renderSkeleton`/`resolveAnswers`; remove the superseded inline templates;
  fix the 7 bugs of INSTALLER.md §5 with a test each; end-to-end generation test; framework
  tarball integration test; changeset, README, RELEASE-READINESS.

## How to verify

```text
npm ci
STRUT_SKELETON_REPO=<skeleton clone> npm run ci   # without it the git ls-tree comparison is skipped
```
