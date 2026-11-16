/**
 * The whole generated project as a list of files: package.json, `.npmrc`, `strut.js`, env files,
 * the git-ignored Docker compose file, the README, `strutvane.json` and the app sources.
 *
 * Pure function of the options (and, for local package folders, of what those folders hold): no
 * clock and no randomness (secrets come later), so the same answers always produce the same files
 * and tests can compare them directly.
 *
 * @module
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { catalogueRange, installerCatalogue } from '../catalogue.ts'
import {
  answersOf,
  designInfo,
  otherDesign,
  type ProjectOptions,
  SECRET_ANSWERS,
} from '../options.ts'
import { packageRoot } from '../package-root.ts'
import { projectPackages } from '../question-registry.ts'
import {
  ABSORBED_PACKAGES,
  CORE_TRAIN,
  DRIVERS,
  FRAMEWORK_RANGE,
  type PinnedPackage,
  VERSION,
  VITEST,
} from '../version.ts'
import { appFiles, type GeneratedFile } from './app-files.ts'
import { dockerFiles } from './compose.ts'
import { buildEnvSections, renderEnv, type TypedSecrets } from './env.ts'
import { workflowFiles } from './workflow-files.ts'

/** How the files are rendered beyond the answers. */
export interface RenderSettings {
  /**
   * A folder of local package folders (`strutvane-framework`, `strutvane-auth`, …) to use instead
   * of the npm registry: for testing unreleased packages and for the ecosystem's umbrella
   * workspace (`STRUT_LOCAL_PACKAGES`). Copied into the git-ignored `.strutvane/local/packages/`, so
   * Docker mode sees them too. Never the default: a normal app installs from npm.
   */
  readonly localPackages?: string | undefined
}

/** Where local package copies live inside the project (git-ignored, under `.strutvane/local/`). */
export const LOCAL_PACKAGES_FOLDER = '.strutvane/local/packages'

/**
 * Every file of a new project, sorted by path.
 *
 * @example
 * renderProject(options).find((f) => f.path === 'strut.js')
 */
export function renderProject(
  options: ProjectOptions,
  typed: TypedSecrets = {},
  settings: RenderSettings = {},
): GeneratedFile[] {
  const sections = buildEnvSections(options, typed)
  const files: GeneratedFile[] = [
    { path: 'package.json', content: packageJson(options, settings) },
    { path: '.npmrc', content: NPMRC },
    { path: 'strut.js', content: strutJs() },
    { path: '.env', content: renderEnv(sections, { example: false }) },
    { path: '.env.example', content: renderEnv(sections, { example: true }) },
    { path: '.gitignore', content: GITIGNORE },
    { path: 'README.md', content: readme(options) },
    // Every answer (never a secret), so `node strut install:<name>` later knows what was picked,
    // and a fresh clone can be set up from this file alone (decision #9).
    { path: 'strutvane.json', content: strutvaneJson(options) },
    ...(options.agents ? [{ path: 'AGENTS.md', content: agents(options) }] : []),
    ...appFiles(options),
    ...workflowFiles(options),
    ...dockerFiles(options),
    ...(settings.localPackages === undefined
      ? []
      : localPackageFiles(settings.localPackages, packagesFor(options))),
  ]
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

/** The project's `strut.js`, shipped as a plain file in the package's `templates/` folder. */
export function strutJs(): string {
  return readFileSync(join(packageRoot(), 'templates', 'strut.js'), 'utf8')
}

/**
 * The database driver dependency for these options, pinned exactly, or none for SQLite (the
 * framework uses Node's built-in `node:sqlite`).
 *
 * @example
 * driverDependency(options) // { name: 'mysql2', version: '3.24.6' }
 */
export function driverDependency(options: ProjectOptions): PinnedPackage | undefined {
  return options.database === 'sqlite' ? undefined : DRIVERS[options.database]
}

/**
 * The folder name of a package (`@strutvane/design-crisp` → `strutvane-design-crisp`), used for
 * local package copies.
 *
 * Why the strict check: the name becomes a folder. Registry names are fixed and catalogue names
 * are checked when the index is read, but a path must never be built from an unchecked string.
 *
 * @example
 * packageFolder('@strutvane/design-crisp') // 'strutvane-design-crisp'
 */
export function packageFolder(packageName: string): string {
  if (
    !/^(@strutvane\/[a-z0-9][a-z0-9-]{0,49}|strutvane-[a-z0-9][a-z0-9-]{0,49})$/.test(packageName)
  ) {
    throw new Error(`Refusing an unexpected package name: ${packageName}`)
  }
  return packageName.replace(/^@/, '').replace('/', '-')
}

/**
 * Every package the answers bring (read from the question registry's data, never a hard-coded
 * list), the framework first.
 *
 * @example
 * packagesFor(options) // ['@strutvane/framework', '@strutvane/auth', '@strutvane/design-crisp', ...]
 */
export function packagesFor(options: ProjectOptions): string[] {
  return projectPackages(answersOf(options))
}

/**
 * The version range of one Strutvane package: the core train's range for the packages released
 * with this installer, otherwise the newest compatible catalogue version.
 */
function rangeOf(name: string, options: ProjectOptions): string {
  if (CORE_TRAIN.includes(name)) return FRAMEWORK_RANGE
  const entry = installerCatalogue().entries.find((candidate) => candidate.package === name)
  if (entry === undefined) throw new Error(`${name} is not in the package catalogue`)
  return catalogueRange(entry, { preview: options.previewCatalogue })
}

/**
 * The app's dependencies: `@strutvane/framework`, the packages the answers bring, and the
 * database driver. Never an absorbed package (core, contracts, cli, devkit, logs): one of those
 * would install a second kernel (integration finding C1), so meeting one is a bug, not a choice.
 *
 * @example
 * dependencies(options)['@strutvane/framework'] // '^0.1.0-next.1'
 */
export function dependencies(
  options: ProjectOptions,
  settings: RenderSettings = {},
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const name of packagesFor(options)) {
    if (ABSORBED_PACKAGES.includes(name)) {
      throw new Error(`${name} was merged into @strutvane/framework and must never be installed`)
    }
    result[name] =
      settings.localPackages === undefined
        ? rangeOf(name, options)
        : `file:./${LOCAL_PACKAGES_FOLDER}/${packageFolder(name)}`
  }
  const driver = driverDependency(options)
  if (driver !== undefined) result[driver.name] = driver.version
  return result
}

/**
 * The files of each local package folder, copied under {@link LOCAL_PACKAGES_FOLDER}. A missing
 * folder stops the run before anything is written (fail closed: never a half-local project).
 */
function localPackageFiles(source: string, names: readonly string[]): GeneratedFile[] {
  return names.flatMap((name) => {
    const folder = join(source, packageFolder(name))
    let entries: string[]
    try {
      entries = readdirSync(folder, { recursive: true, encoding: 'utf8' })
    } catch {
      throw new Error(`STRUT_LOCAL_PACKAGES has no ${packageFolder(name)} folder for ${name}`)
    }
    return entries
      .filter((entry) => !entry.split(/[\\/]/).includes('node_modules'))
      .flatMap((entry) => {
        let content: string
        try {
          content = readFileSync(join(folder, entry), 'utf8')
        } catch {
          return [] // a folder
        }
        const inside = relative(folder, join(folder, entry)).split('\\').join('/')
        return [{ path: `${LOCAL_PACKAGES_FOLDER}/${packageFolder(name)}/${inside}`, content }]
      })
  })
}

/**
 * `strutvane.json`: the installer's answers, committed with the app. `node strut install:<name>`
 * and `node strut add` read it to know what was picked, `strut.js` reads the Docker choice from it
 * (decision #110), and `npm run setup` sets up a fresh clone from it (decision #9). Built from the
 * resolved options, which never hold a secret; the typed passwords are removed again anyway, so
 * a future option can never leak one here by accident.
 */
function strutvaneJson(options: ProjectOptions): string {
  const { directory: _directory, ...rest } = options
  const answers: Record<string, unknown> = { ...answersOf(rest) }
  for (const key of SECRET_ANSWERS) delete answers[key]
  const manifest = {
    version: 1,
    createdWith: `create-strutvane ${VERSION}`,
    framework: FRAMEWORK_RANGE,
    answers,
    packages: packagesFor(options),
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/**
 * The npm guards every generated app gets (integration finding L5; the same guards the Strutvane
 * repos use). npm >= 11.19 understands them; `devEngines` in package.json makes an older npm stop
 * instead of silently ignoring them.
 */
export const NPMRC = `# npm supply-chain guards (written by create-strutvane; npm >= 11.19). Keep them.
#
# Dependency install scripts never run on install. A package that really needs one is listed in
# package.json "allowScripts" ("name@version": true) and \`npm run setup\` rebuilds just those.
ignore-scripts=true
# If scripts are ever switched on, only the allowScripts list may run; anything else fails.
strict-allow-scripts=true
# Third-party versions must be at least a day old: most malicious releases are caught and pulled
# within hours. Strutvane's own releases are staged and approved with 2FA, so they are exempt.
min-release-age=1
min-release-age-exclude[]=@strutvane/*
# No dependencies straight from git (they skip the registry's integrity checks).
allow-git=none
# The Node version in package.json "engines" is enforced.
engine-strict=true
`

/** package.json with the scripts from the design: everything goes through `node strut`. */
function packageJson(options: ProjectOptions, settings: RenderSettings): string {
  const scripts: Record<string, string> = {
    dev: 'node strut dev',
    build: 'node strut build',
    start: 'node build/server.js',
  }
  if (options.testing !== 'none') scripts['test'] = 'vitest run'
  // strut.js runs setup itself (no dependencies needed), so a fresh clone works too.
  scripts['setup'] = 'node strut setup'
  scripts['strut'] = 'node strut'
  const devDependencies: Record<string, string> =
    options.testing === 'none' ? {} : { [VITEST.name]: VITEST.version }
  const manifest = {
    name: options.name,
    version: '0.1.0',
    private: true,
    type: 'module',
    engines: { node: '>=24.3' },
    // npm older than 11.19 ignores the .npmrc guards without a word: stop it instead.
    devEngines: { packageManager: { name: 'npm', version: '>=11.19.0', onFail: 'error' } },
    scripts,
    dependencies: dependencies(options, settings),
    devDependencies,
    // The only dependencies whose install scripts may run ("name@version": true); setup rebuilds
    // them after the script-free install. Empty: nothing the app needs has one.
    allowScripts: {},
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/**
 * The generated `.gitignore`. The setup's git step checks with `git check-ignore` that the
 * secret and local-data paths are really ignored before the first commit (security review F-17).
 */
const GITIGNORE = `node_modules/
build/

# Secrets and machine-local settings (every .env file except the example)
.env*
!.env.example

# Local Sail-style Docker services (ADR-0006: git-ignored). A production Dockerfile or a
# .devcontainer/ is different: committed when you choose it (ADR-0021).
docker/

# Local data (SQLite -wal/-shm/-journal files hold data too)
database/*.sqlite*
storage/

# Machine-local Strutvane state: setup progress, logs, per-computer overrides. The rest of
# .strutvane/ (generated types, resources, the API client) is committed, so a fresh clone
# type-checks (decision #10).
.strutvane/local/
`

/** AGENTS.md: the short playbook AI coding agents read first. */
function agents(options: ProjectOptions): string {
  const tests =
    options.testing === 'none'
      ? 'There is no test runner yet: add Vitest (`npm install -D vitest`) before relying on tests.'
      : 'Tests use Vitest (`tests/`). Before you finish: `npm test`.'
  return `# AGENTS.md

This is a Strutvane app (TypeScript, MVC, npm only). Read this before changing code.

- Run project commands with \`node strut <command>\` (\`node strut list\` shows them all). Never use pnpm or yarn.
- Columns live in migrations (\`database/migrations\`). Add a column with a new migration, then \`node strut migrate\`.
- Controllers: \`app/http/controllers\`. Models: \`app/models\`. Policies: \`app/policies\` (\`user.policy.ts\`; deny by default).
- Factories and seeders: \`database/factories\` (\`user.factory.ts\`) and \`database/seeders\`; \`database.seeder.ts\` lists them between the \`strut:seeders\` markers.
- Routes: \`routes/web.ts\` (pages) and \`routes/api.ts\` (served under /api). Health check: \`GET /up\`.
- Settings come from \`.env\` (never commit it). \`.env.example\` lists every key without secrets.
- ${options.docker ? 'Docker mode: every `node strut` command runs inside the app container (`node strut services:up` / `services:down`).' : 'Runs on this computer (no Docker).'} Database: ${options.database}.
- ${tests}
`
}

/** The README: the three commands a user needs, first. */
function readme(options: ProjectOptions): string {
  const docker = options.docker
    ? [
        '',
        '## Docker mode',
        '',
        'Everything runs in containers (like Laravel Sail): the app on node:24, the database and Mailpit',
        '(inbox: http://localhost:8025). `node strut <command>` on your computer runs the command inside the',
        'app container, so the three commands above work the same: `npm run dev`, `migrate` and every other',
        'command run in the container. Your computer only needs Node to run the small `strut.js` forwarder.',
        '',
        '```text',
        'node strut shell            a shell inside the app container (bash, or sh when there is none)',
        'node strut npm install x    npm inside the container (also: node strut npx ..., node strut node ...)',
        'node strut services:down    stop the containers (your data stays); services:up starts them',
        "node strut services:logs    follow the containers' logs; db:shell opens the database shell",
        '```',
        '',
        'Arguments are passed as they are (no shell in between) and the exit code comes back to you.',
        '`docker/compose.yaml` is local only and git-ignored (ADR-0006). `services:down --volumes` deletes',
        'the database, so it asks first. On Windows, keep the project inside WSL2 for fast file watching.',
        '',
      ].join('\n')
    : ''
  return `# ${options.name}

A Strutvane app.

## The three commands you need

\`\`\`text
npm run dev        start the app on http://localhost:3000 (port from .env)
node strut list    every project command (make:model, migrate, db:seed, ...)
npm run setup      after git clone, or to finish a setup that stopped
\`\`\`
${docker}
## Where things are

- \`app/\`: controllers (\`app/http/controllers\`), models, policies
- \`routes/web.ts\`, \`routes/api.ts\`: routes (the API is served under \`/api\`; \`GET /up\` is the health check)
- \`database/\`: migrations, seeders, factories
- \`config/\`: settings (values come from \`.env\`)
${options.ui !== undefined ? '- `resources/ui/`: the React UI\n' : ''}- \`strutvane.json\`: what you picked in the installer (read by \`node strut install:<name>\` and \`npm run setup\`)
${signInSection(options)}${designSection(options)}${deploySection(options)}`
}

/** How sign-in works in this app, in one or two sentences. */
function signInSection(options: ProjectOptions): string {
  const admin = options.adminEmail ?? ''
  const text =
    options.auth === 'none'
      ? 'There is no sign-in. The API is still closed by default: every request needs an API token\n(`node strut token:create`); a route opts out only explicitly.'
      : options.auth === 'magic-link'
        ? `People sign in with a single-use link sent by email (valid 15 minutes). First admin: ${admin}.`
        : `People sign in with email and password. First admin: ${admin}\n(\`node strut user:password <email>\` sets a new one-time password).`
  const features =
    options.auth === 'none'
      ? ''
      : '\nThe sign-in features you picked are switched on in `config/auth.ts`.\n'
  return `\n## Sign-in\n\n${text}\n${features}`
}

/** Where the deploy recipe and the opt-in container files are. */
function deploySection(options: ProjectOptions): string {
  const lines: string[] = []
  if (options.deploy !== 'later')
    lines.push('- `deploy/README.md`: how to deploy; the app answers `GET /up` for health checks.')
  if (options.deploy === 'docker') {
    lines.push(
      '- `Dockerfile` + `.dockerignore`: the production image (non-root, no secrets inside; ADR-0021). Regenerate: `node strut docker:prod`.',
    )
  }
  if (options.devContainer)
    lines.push(
      '- `.devcontainer/`: open the project in Codespaces or VS Code Dev Containers (ADR-0021).',
    )
  return lines.length === 0 ? '' : `\n## Deploy and containers\n\n${lines.join('\n')}\n`
}

/** The README's "Design" section: which design is installed, how to restyle it, how to switch. */
function designSection(options: ProjectOptions): string {
  if (options.design === undefined) return ''
  const other = otherDesign(options.design)
  const switchLine =
    other === undefined
      ? ''
      : `\nTo switch design later: \`node strut design:use ${other}\` (it swaps the package and updates\n\`config/ui.ts\`; your \`resources/ui/theme.css\` stays as it is).\n`
  return `
## Design

The React UI uses the **${options.design}** design (\`${designInfo(options.design).packageName}\`, set in
\`config/ui.ts\`). Your own brand colour, font and corner radius go in \`resources/ui/theme.css\`.
${switchLine}`
}
