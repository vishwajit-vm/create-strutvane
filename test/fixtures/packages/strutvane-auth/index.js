// TEST STAND-IN for @strutvane/auth (create-strutvane's tests only): the first-admin seeding
// helper the generated admin.seeder.ts calls. The framework stand-in's seeding database does the work.
export function firstAdmin(db) {
  return { createOnce: (admin) => db.createAdminOnce(admin) }
}
