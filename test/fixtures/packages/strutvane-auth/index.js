// TEST STAND-IN for @strutvane/auth (create-strutvane's tests only): the planned driver-neutral
// createFirstAdmin() the generated admin.seeder.ts calls. The framework stand-in's seeding
// database does the work.
export async function createFirstAdmin(db, admin) {
  await db.createAdminOnce(admin)
}
