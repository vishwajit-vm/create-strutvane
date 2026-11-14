---
"create-strutvane": patch
---

`database/seeders/database.seeder.ts` uses the string form, `defineSeeder('DatabaseSeeder', async () => { … })`, the same shape `sv make:model` writes and edits. `sv make:model` registers each model's seeder in this file, parents before children. The previous object form referred to a `call` that was not in scope.

The `database/factories/README.md` shows the real factory API: `defineFactory(Model, ({ fake, related }) => ({ … }))`, used from a seeder with `await create(InvoiceFactory, 20)`. `related('Customer')` reuses an existing record when there is one and creates one otherwise.
