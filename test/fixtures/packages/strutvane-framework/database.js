// TEST STAND-IN for @strutvane/framework/database (create-strutvane's tests only): Model(),
// defineSeeder() and defineFactory() in the shapes the strutvane-skeleton app uses. Factories
// insert through the database the running `node strut db:seed` opened (useSeedingDatabase).

/** Where the seeding database lives: one per process, shared by every copy of this module. */
const SEEDING = Symbol.for('strutvane.stand-in.seeding-database')

/** Called by the stand-in's db:seed with a handle that has insertOrIgnore(table, row). */
export function useSeedingDatabase(db) {
  globalThis[SEEDING] = db
}

/** A model class for a table: `class User extends Model('users', { fillable, hidden }) {}`. */
export function Model(table, options = {}) {
  return class {
    static table = table
    static options = options
  }
}

/** Declare a seeder: `export default defineSeeder({ after?, async run({ db, env, call }) {} })`. */
export function defineSeeder(definition) {
  return definition
}

/** A tiny fake-data generator (the real one has many more). */
export const faker = {
  name: () => `Test Person ${Math.floor(Math.random() * 1000)}`,
}

let sequence = 0

/** `defineFactory(User, ({ faker, sequence }) => ({ ... }))`, then `.count(5).create()`. */
export function defineFactory(model, define) {
  const create = async (count) => {
    const db = globalThis[SEEDING]
    if (db === undefined) throw new Error('Factories create rows only while seeding (stand-in).')
    for (let index = 0; index < count; index += 1) {
      sequence += 1
      await db.insertOrIgnore(model.table, define({ faker, sequence }))
    }
  }
  return { model, count: (count) => ({ create: () => create(count) }), create: () => create(1) }
}
