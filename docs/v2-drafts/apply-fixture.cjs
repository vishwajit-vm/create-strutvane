// The test stand-in for @strutvane/framework follows the generated app's shapes: Application
// .configure(), defineSeeder with call(), defineFactory, Model(), the `migrations` table, `list`.
const fs = require('node:fs')
const path = require('node:path')
const dir = path.join(process.argv[2], 'test/fixtures/packages/strutvane-framework')
const edit = (file, pairs) => {
  const f = path.join(dir, file)
  let t = fs.readFileSync(f, 'utf8')
  for (const [a, b] of pairs) {
    if (!t.includes(a)) throw new Error(`${file}: missing ${a.slice(0, 80)}`)
    t = t.split(a).join(b)
  }
  fs.writeFileSync(f, t)
}
edit('index.js', [
  [
    `// SPIKE STUB of @strutvane/framework (spike 13). Just enough for the installer's end-to-end test:
// migrations with a tiny Laravel-style schema builder (spike 10 owns the real one), seeders, and an
// application object for \`node strut dev\`. The real package replaces this folder.`,
    `// TEST STAND-IN for @strutvane/framework (create-strutvane's end-to-end tests only; never
// published). Just enough of the framework's documented shapes for a generated app to migrate,
// seed and serve: migrations with a tiny Laravel-style schema builder, defineSeeder/defineFactory,
// Model(), and Application.configure() for \`node strut dev\`. The real package replaces it.`,
  ],
  [
    `/** Declare a seeder: \`export default seeder(async (db) => { await db.insertOrIgnore(...) })\`. */
export function seeder(run) {
  return { run }
}`,
    `/** Declare a seeder: \`export default defineSeeder({ after?, async run({ db, env, call }) {} })\`. */
export function defineSeeder(definition) {
  return definition
}

/** Declare a factory: \`export default defineFactory(User, ({ faker, sequence }) => ({ ... }))\`. */
export function defineFactory(model, define) {
  return { model, define }
}

/** A model class for a table: \`class User extends Model('users', { fillable }) {}\`. */
export function Model(table, options = {}) {
  return class {
    static table = table
    static options = options
  }
}`,
  ],
  [
    `/** The app object \`bootstrap/app.ts\` exports; \`node strut dev\` serves it. */
export function createApplication({ routes }) {`,
    `/** Laravel 11's fluent bootstrap: Application.configure({ basePath }).withRouting(...).create(). */
export const Application = {
  configure() {
    let routing = {}
    const builder = {
      withRouting(settings) {
        routing = settings
        return builder
      },
      withMiddleware() {
        return builder
      },
      withExceptions() {
        return builder
      },
      create() {
        return createApplication({ routes: routing, health: routing.health })
      },
    }
    return builder
  },
}

/** The app object \`bootstrap/app.ts\` exports; \`node strut dev\` serves it. */
function createApplication({ routes, health }) {`,
  ],
  [`  if (routes.api) routes.api(routerFor('/api/v1'))`, `  if (routes.api) routes.api(routerFor('/api'))
  // The built-in health route (decision #45): JSON for GET, and HEAD answers too.
  if (health) table.set(\`GET \${health}\`, () => ({ status: 'ok' }))`],
])
let index = fs.readFileSync(path.join(dir, 'index.js'), 'utf8')
index = index.replace(
  /async handle\(method, path\) \{\n\s+const handler = table\.get\(`\$\{method\} \$\{path\}`\)/,
  'async handle(method, path) {\n      const handler = table.get(`${method === \'HEAD\' ? \'GET\' : method} ${path}`)',
)
fs.writeFileSync(path.join(dir, 'index.js'), index)
edit('cli.js', [
  [
    `// SPIKE STUB of the \`node strut\` command registry (spike 12 owns the real one).`,
    `// TEST STAND-IN for the framework's \`node strut\` command registry (create-strutvane's tests only).`,
  ],
  [`strut_migrations`, `migrations`],
  [
    `/** Run database/seeders/database-seeder.ts with tiny, idempotent helpers. */`,
    `/** Run database/seeders/database.seeder.ts, whose call([...]) runs the listed seeders. */`,
  ],
  [`join(root, 'database', 'seeders', 'database-seeder.ts')`, `join(root, 'database', 'seeders', 'database.seeder.ts')`],
  [
    `  await seeder.run({
    env,
    insertOrIgnore:`,
    `  const handle = {
    ...db,
    insertOrIgnore:`,
  ],
  [
    `      if (!given)
        process.stdout.write(
          \`  One-time password (shown once, change it at first sign-in): \${password}\\n\`,
        )
    },
  })
  process.stdout.write('Database seeded\\n')`,
    `      if (!given)
        process.stdout.write(
          \`  One-time password (shown once, change it at first sign-in): \${password}\\n\`,
        )
    },
  }
  const context = {
    db: handle,
    env,
    call: async (list) => {
      for (const definition of list) await definition.run(context)
    },
  }
  await seeder.run(context)
  process.stdout.write('Database seeded\\n')`,
  ],
  [`  const [command = 'help', ...rest] = argv`, `  const [given = 'list', ...rest] = argv
  const command = given === 'help' ? 'list' : given`],
  [`      case 'help':
        process.stdout.write(HELP)`, `      case 'list':
        process.stdout.write(HELP)`],
])
fs.writeFileSync(
  path.join(dir, 'bin.js'),
  `#!/usr/bin/env node
// TEST STAND-IN for the framework's \`strutvane\` program: strut.js runs it with the project as cwd.
import { run } from './cli.js'

process.exitCode = await run(process.argv.slice(2), { root: process.cwd() })
`,
)
fs.writeFileSync(
  path.join(dir, 'package.json'),
  `${JSON.stringify(
    {
      name: '@strutvane/framework',
      version: '0.1.0-next.1',
      private: true,
      type: 'module',
      bin: { strutvane: './bin.js' },
      exports: { '.': './index.js', './cli': './cli.js' },
    },
    null,
    2,
  )}\n`,
)
const auth = path.join(dir, '..', 'strutvane-auth')
fs.mkdirSync(auth, { recursive: true })
fs.writeFileSync(
  path.join(auth, 'package.json'),
  `${JSON.stringify({ name: '@strutvane/auth', version: '0.1.0-next.1', private: true, type: 'module', exports: { '.': './index.js' } }, null, 2)}\n`,
)
fs.writeFileSync(
  path.join(auth, 'index.js'),
  `// TEST STAND-IN for @strutvane/auth (create-strutvane's tests only): the first-admin seeding
// helper the generated admin.seeder.ts calls. The framework stand-in's seeding database does the work.
export function firstAdmin(db) {
  return { createOnce: (admin) => db.createAdminOnce(admin) }
}
`,
)
