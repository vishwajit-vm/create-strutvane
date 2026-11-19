---
"create-strutvane": patch
---

Apps with sign-in now use `@strutvane/auth` 0.2.0-next.1 (the minimum the installer asks for) for the first admin. Setup runs `node strut auth:migration` before `node strut migrate --seed`, so auth's migrations are the app's own files (committed with the first commit) and its tables exist before seeding. The generated `admin.seeder.ts` imports `createFirstAdmin` and `FirstAdminError` from `@strutvane/auth` directly: seeding again skips an existing first admin (`first_admin_exists`), every other refusal fails the seed with auth's message, setup's one-time password is passed to auth from the environment, and a password auth generates on a manual run is printed once (it is stored nowhere else).
