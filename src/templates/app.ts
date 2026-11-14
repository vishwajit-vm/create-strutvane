/**
 * The `app/` folder (your application code, docs/05 §3.1), the `database/` folder and
 * `strutvane.config.ts`. Empty folders get a short README that explains what belongs there, with an
 * example, so the conventions are discoverable without reading the docs first.
 *
 * @module
 */
import { type GeneratedFile, providerLocalName } from '@strutvane/devkit'
import { hasExtra, hasServer, type ProjectOptions } from '../options.ts'
import { svCommand } from '../package-manager.ts'
import { file, LINE_WIDTH, lines } from './util.ts'

/** Provider module specifiers registered in `strutvane.config.ts`, in boot order. */
export function providerSpecifiers(o: ProjectOptions): readonly string[] {
  if (!hasServer(o)) return []
  return [
    '@strutvane/framework/provider',
    ...(hasExtra(o, 'logs') ? ['@strutvane/logs/provider'] : []),
    ...(o.auth.length > 0 ? ['@strutvane/auth/provider'] : []),
    './app/providers/app.provider.ts',
  ]
}

/** `strutvane.config.ts`, in the exact shape devkit's config patcher edits (`sv add` / `sv remove`). */
export function strutvaneConfigFile(o: ProjectOptions): GeneratedFile {
  const specifiers = providerSpecifiers(o)
  const names = specifiers.map(providerLocalName)
  // Sorted the way Biome's organizeImports sorts (packages, then relative paths), so a fresh
  // project passes `lint`.
  const imports = [
    { from: '@strutvane/core', line: "import { defineConfig } from '@strutvane/core'" },
    ...specifiers.map((s, i) => ({ from: s, line: `import ${names[i]} from '${s}'` })),
  ].sort((x, y) => {
    const relX = x.from.startsWith('.')
    const relY = y.from.startsWith('.')
    if (relX !== relY) return relX ? 1 : -1
    return x.from < y.from ? -1 : 1
  })
  const inline = `  providers: [${names.join(', ')}],`
  const expanded = `  providers: [\n${names.map((n) => `    ${n},`).join('\n')}\n  ],`
  return file(
    'strutvane.config.ts',
    lines(
      '/**',
      ' * Which Strutvane packages are active in this app, in boot order.',
      ` * \`${svCommand(o.packageManager, 'add <package>')}\` and \`sv remove\` edit the providers list for you.`,
      ' */',
      '',
      ...imports.map((i) => i.line),
      '',
      'export default defineConfig({',
      `  app: { name: '${o.name}', preset: '${o.preset}' },`,
      inline.length <= LINE_WIDTH ? inline : expanded,
      '})',
    ),
  )
}

/** A README for an initially empty folder. */
function folderReadme(path: string, title: string, body: readonly string[]): GeneratedFile {
  return file(`${path}/README.md`, lines(`# ${title}`, '', ...body))
}

function appFiles(o: ProjectOptions): GeneratedFile[] {
  const sv = (args: string) => svCommand(o.packageManager, args)
  const out: GeneratedFile[] = []

  if (o.auth.length > 0) {
    out.push(
      file(
        'app/models/user.model.ts',
        lines(
          '/**',
          ' * Users. @strutvane/auth owns sign-in, sessions and roles; add your own profile fields here.',
          ' * Changing fields? Run `sv migrate` and a migration is generated for you.',
          ' */',
          "import { defineModel, field } from '@strutvane/framework'",
          '',
          'export default defineModel(',
          "  'User',",
          '  {',
          "    name: field.string().label('Full name').searchable(),",
          '    email: field.email().unique().searchable(),',
          '  },',
          '  {',
          '    timestamps: true,',
          '    softDeletes: true,',
          o.tenancy && '    tenant: true,',
          hasExtra(o, 'audit') && '    audit: true,',
          "    title: 'name',",
          '  },',
          ')',
        ),
      ),
    )
  } else {
    out.push(
      folderReadme('app/models', 'Models', [
        'A model is the single source of truth for one kind of record: its fields and their types.',
        'From it, Strutvane generates the migration, the CRUD API, validation, permissions and UI pages.',
        '',
        `Create one with \`${sv('make:model Invoice number:string:unique amount:decimal(12,2)')}\`, then run \`${sv('migrate')}\`.`,
      ]),
    )
  }

  out.push(
    folderReadme('app/resources', 'Resources', [
      'Optional per-model API and UI behaviour: hooks, custom actions, overridden handlers, columns.',
      '',
      `Create one with \`${sv('make:resource Invoice')}\`. Without a resource file a model still gets its full CRUD API.`,
    ]),
    folderReadme('app/policies', 'Policies', [
      'Who may do what. Rules like "managers may approve invoices up to 10,000" live here.',
      'Rules are deny-by-default and also filter list queries in SQL, so lists and single records always agree.',
      '',
      `Create one with \`${sv('make:policy Invoice')}\`.`,
    ]),
    folderReadme('app/services', 'Services', [
      'Your business logic, as plain TypeScript classes or functions. Keep it out of routes and hooks so it',
      'is easy to test and reuse.',
    ]),
    file(
      'app/http/routes/api.ts',
      lines(
        '/**',
        ' * Custom API routes. Every model already gets its CRUD routes automatically',
        ` * (list them with \`${sv('routes')}\`); add only what doesn't fit CRUD here.`,
        ' */',
        "import { route } from '@strutvane/framework/http'",
        '',
        'export default [',
        "  route.get('/hello', {",
        '    // Routes need a signed-in user unless they set `permission` or `public: true`.',
        '    public: true,',
        `    handler: () => ({ message: 'Hello from ${o.name}' }),`,
        '  }),',
        ']',
      ),
    ),
    folderReadme('app/http/middleware', 'Middleware', [
      'Code that runs around requests (e.g. adding a header). Security headers, CORS, rate limiting and',
      'request logging are already set up by the framework.',
    ]),
    folderReadme('app/http/controllers', 'Controllers', [
      `Full source of an endpoint when you need total control. Get one by ejecting: \`${sv('eject api Invoice')}\`.`,
    ]),
    folderReadme('app/jobs', 'Jobs', [
      'Background work (sending emails, generating reports). Jobs retry with backoff and are idempotent.',
      '',
      `Create one with \`${sv('make:job SendInvoice')}\`.`,
    ]),
    folderReadme('app/events', 'Events', [
      'Business facts other code reacts to, e.g. `invoice.sent`. Delivered reliably through an outbox.',
    ]),
    folderReadme('app/listeners', 'Listeners', [
      `React to events. Create one with \`${sv('make:listener NotifyCustomer')}\`.`,
    ]),
    folderReadme('app/mail', 'Mail', [
      `Email templates. Create one with \`${sv('make:mail InvoiceSent')}\`.`,
    ]),
    folderReadme('app/commands', 'Commands', [
      `Your own CLI commands, available as \`${sv('<name>')}\`. Create one with \`${sv('make:command ImportCustomers')}\`.`,
    ]),
    file(
      'app/providers/app.provider.ts',
      lines(
        '/**',
        " * Your application's own service provider (like Laravel's AppServiceProvider).",
        ' * - register(): bind your services in the container (synchronous).',
        ' * - boot(): start things after every package is registered.',
        ' */',
        "import { defineProvider } from '@strutvane/core'",
        '',
        'export default defineProvider({',
        "  name: 'app',",
        '  register() {',
        '    // app.container.singleton(BillingToken, () => new BillingService())',
        '  },',
        '})',
      ),
    ),
  )
  return out
}

function databaseFiles(o: ProjectOptions): GeneratedFile[] {
  const sv = (args: string) => svCommand(o.packageManager, args)
  return [
    folderReadme('database/migrations', 'Migrations', [
      `Generated by \`${sv('migrate')}\` from your models: plain SQL, reviewed and committed.`,
      '',
      '- Never edit a migration that has already been applied: create a new one instead.',
      '- Renames are always asked, never guessed. Destructive changes need confirmation.',
    ]),
    databaseSeeder(o),
    folderReadme('database/factories', 'Factories', [
      `Fake-data builders for tests and seeders. \`${sv('make:model Invoice')}\` generates one per model:`,
      '',
      '```ts',
      "import { defineFactory } from '@strutvane/framework/testing'",
      "import Invoice from '../../app/models/invoice.model.ts'",
      '',
      'export default defineFactory(Invoice, ({ fake, related }) => ({',
      '  number: fake.words(2),',
      "  customer: related('Customer'),",
      '}))',
      '```',
      '',
      "- `related('Customer')` reuses an existing Customer when there is one and creates one otherwise.",
      '- In a seeder: `await create(InvoiceFactory, 20)`. In a test: `await InvoiceFactory.createMany(t, 3)`.',
      `- \`${sv('make:model')}\` registers each model's seeder in \`database/seeders/database.seeder.ts\`,` +
        ' parents before children, so related records exist before the records that point to them.',
    ]),
  ]
}

/**
 * `database/seeders/database.seeder.ts`: the only file `sv db:seed` runs (without `--class`).
 *
 * The exact shape matters: `sv make:model` in `@strutvane/cli` edits this file, inserting
 * `await call(…)` lines after the comment line and adding `call` to the callback's parameters, in
 * dependency order (a model's parents first); when the file is missing, it recreates it with this
 * content. `test/templates.test.ts` pins the content; change it only together with the CLI.
 */
export function databaseSeeder(o: ProjectOptions): GeneratedFile {
  return file(
    'database/seeders/database.seeder.ts',
    lines(
      '/**',
      ` * Seeds the database (\`${svCommand(o.packageManager, 'db:seed')}\`). \`sv make:model\` registers each new model's seeder here,`,
      ' * after the seeders of the models it belongs to.',
      o.auth.length > 0 &&
        ' * The first admin user comes from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in .env.',
      ' */',
      "import { defineSeeder } from '@strutvane/framework/database'",
      '',
      "export default defineSeeder('DatabaseSeeder', async () => {",
      '  // `sv make:model` adds `await call(…)` lines here, parents before children.',
      '})',
    ),
  )
}

/** `app/`, `database/` (server presets only) and `storage/` placeholders. */
export function appAndDatabaseFiles(o: ProjectOptions): GeneratedFile[] {
  if (!hasServer(o)) return []
  return [
    ...appFiles(o),
    ...databaseFiles(o),
    // Runtime folders (git-ignored, see .gitignore). Created now so logs and uploads work on first run.
    file('storage/logs/.gitkeep', ''),
    file('storage/app/.gitkeep', ''),
  ]
}
