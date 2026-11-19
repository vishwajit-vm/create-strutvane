/**
 * The whole generated project as a list of files.
 *
 * The app itself comes from the vendored strutvane-skeleton (`skeleton/`, rendered by
 * `skeleton/app.ts` with the skeleton's own renderer): package.json, `.npmrc`, `.gitignore`,
 * `strut.js`, `.env.example`, the README, bootstrap, routes, controllers, the typed config files,
 * the users migration, model, policy, factory and seeders, the UI entry and the tests. On top of
 * that the installer adds what only it knows (skeleton INSTALLER.md §2–§4):
 *
 * - `.env` (local values; secrets are filled in later by the secrets step) and the keys of its own
 *   features in both env files;
 * - the packages the answers bring, and local package copies (`STRUT_LOCAL_PACKAGES`);
 * - `strutvane.json`, `AGENTS.md`, the answer-only configs and the first-admin seeder;
 * - the git-ignored Docker compose file and the opt-in production Dockerfile / dev container;
 * - CI, editor and deploy files.
 *
 * Pure function of the options (and, for local package folders, of what those folders hold): no
 * clock and no randomness, so the same answers always produce the same files.
 *
 * @module
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { catalogueRange, installerCatalogue } from '../catalogue.ts'
import { answersOf, type ProjectOptions, SECRET_ANSWERS } from '../options.ts'
import { projectPackages } from '../question-registry.ts'
import { renderSkeletonApp } from '../skeleton/app.ts'
import {
  ABSORBED_PACKAGES,
  AUTH_RANGE,
  CORE_TRAIN,
  DRIVERS,
  FRAMEWORK_RANGE,
  type PinnedPackage,
  REFUSED_INSTALL_SCRIPTS,
  VERSION,
} from '../version.ts'
import {
  configAuth,
  databaseSeeder,
  type GeneratedFile,
  installerAppFiles,
  tenancyConfig,
  uiConfig,
} from './app-files.ts'
import { dockerFiles } from './compose.ts'
import { buildEnvSections, type EnvFiles, renderEnvFiles, type TypedSecrets } from './env.ts'
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
  const skeleton = renderSkeletonApp(options, { configAuth, tenancyConfig })
  const example = skeleton.find((file) => file.path === '.env.example')
  const manifest = skeleton.find((file) => file.path === 'package.json')
  if (example === undefined || manifest === undefined)
    throw new Error(
      'The vendored skeleton has no .env.example or package.json (npm run vendor:skeleton).',
    )
  const env = renderEnvFiles(example.content, buildEnvSections(options, typed))
  const deps = appDependencies(manifest.content, options, settings)
  const files: GeneratedFile[] = [
    ...skeleton.map((file) => finishSkeletonFile(file, options, env, deps)),
    { path: '.env', content: env.env },
    // Every answer (never a secret), so `node strut install:<name>` later knows what was picked,
    // and a fresh clone can be set up from this file alone (decision #9).
    { path: 'strutvane.json', content: strutvaneJson(options) },
    ...(options.agents ? [{ path: 'AGENTS.md', content: agents(options) }] : []),
    ...installerAppFiles(options),
    ...workflowFiles(options),
    ...dockerFiles(options),
    ...(settings.localPackages === undefined
      ? []
      : localPackageFiles(
          settings.localPackages,
          Object.keys(deps).filter((name) => name.startsWith('@strutvane/')),
        )),
  ]
  const seen = new Set<string>()
  for (const file of files) {
    // Two writers for one path would mean an answer silently lost: stop instead.
    if (seen.has(file.path)) throw new Error(`${file.path} would be written twice`)
    seen.add(file.path)
  }
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * The installer's changes to one skeleton file: the env example with the installer's keys, the
 * dependencies the answers bring, the README sections of installer-only features, the UI
 * answers, the seeder list and `strut.js`'s executable bit. Every other file is the skeleton's.
 */
function finishSkeletonFile(
  file: GeneratedFile,
  options: ProjectOptions,
  env: EnvFiles,
  deps: Readonly<Record<string, string>>,
): GeneratedFile {
  switch (file.path) {
    case '.env.example':
      return { path: file.path, content: env.example }
    case 'package.json':
      return { path: file.path, content: packageJson(file.content, deps) }
    case 'README.md':
      return { path: file.path, content: readme(file.content, options) }
    case 'config/ui.ts':
      return { path: file.path, content: uiConfig(file.content, options) }
    case 'database/seeders/database.seeder.ts':
      return { path: file.path, content: databaseSeeder(file.content, options) }
    case 'strut.js':
      return { ...file, executable: true }
    default:
      return file
  }
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
  if (name === '@strutvane/auth') return AUTH_RANGE
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
 * dependencies(options)['@strutvane/framework'] // '^0.2.0-next.0'
 */
export function dependencies(options: ProjectOptions): Record<string, string> {
  const result: Record<string, string> = {}
  for (const name of packagesFor(options)) {
    if (ABSORBED_PACKAGES.includes(name)) {
      throw new Error(`${name} was merged into @strutvane/framework and must never be installed`)
    }
    result[name] = rangeOf(name, options)
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
 * The app's dependencies: the skeleton's (the UI stack, the driver, the core train for the
 * answers) plus every package the answers bring ({@link dependencies}, which wins on a clash).
 * With local package folders every `@strutvane/*` dependency points at its copy, so nothing
 * Strutvane comes from the registry. Never an absorbed package (fail closed).
 */
function appDependencies(
  manifest: string,
  options: ProjectOptions,
  settings: RenderSettings,
): Record<string, string> {
  const parsed = JSON.parse(manifest) as { dependencies?: Record<string, string> }
  const merged: Record<string, string> = { ...parsed.dependencies, ...dependencies(options) }
  for (const name of Object.keys(merged)) {
    if (ABSORBED_PACKAGES.includes(name))
      throw new Error(`${name} was merged into @strutvane/framework and must never be installed`)
    if (settings.localPackages !== undefined && name.startsWith('@strutvane/'))
      merged[name] = `file:./${LOCAL_PACKAGES_FOLDER}/${packageFolder(name)}`
  }
  return Object.fromEntries(Object.entries(merged).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/**
 * The skeleton's package.json (scripts, engines, devEngines, devDependencies) with the
 * dependencies replaced by {@link appDependencies}. `start` stays the skeleton's
 * `node strut start` (INSTALLER.md §5, bug 4: the framework never writes build/server.js).
 * `allowScripts` gets the refusals every app needs ({@link REFUSED_INSTALL_SCRIPTS}); an entry the
 * skeleton already has for the same key wins, so the template stays in charge of its own policy.
 */
function packageJson(manifest: string, deps: Readonly<Record<string, string>>): string {
  const parsed = JSON.parse(manifest) as Record<string, unknown>
  const allowScripts = appAllowScripts(parsed['allowScripts'])
  return `${JSON.stringify({ ...parsed, dependencies: deps, allowScripts }, null, 2)}\n`
}

/**
 * A generated app's `allowScripts`: {@link REFUSED_INSTALL_SCRIPTS}, then the skeleton's own
 * entries (which win for the same key). Anything that is not an object of booleans is dropped:
 * npm would reject it, and an install must not fail on a template typo.
 *
 * @example
 * appAllowScripts({}) // { fsevents: false }
 * appAllowScripts({ 'esbuild@0.25.0': true }) // { fsevents: false, 'esbuild@0.25.0': true }
 */
export function appAllowScripts(own: unknown): Record<string, boolean> {
  const entries =
    typeof own === 'object' && own !== null && !Array.isArray(own)
      ? Object.entries(own).filter(
          (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
        )
      : []
  return { ...REFUSED_INSTALL_SCRIPTS, ...Object.fromEntries(entries) }
}

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
- Settings: \`config/*.ts\` use \`defineConfig((env) => ...)\` and are listed in \`config/index.ts\`; values come from \`.env\` (never commit it). \`.env.example\` lists every key without secrets.
- Imports: models, factories and seeders from \`@strutvane/framework/database\`; migrations only from \`@strutvane/framework/schema\`.
- Logging: channels from \`LOG_CHANNEL\`, \`LOG_STACK\` and \`LOG_LEVEL\` in \`.env\` (\`config/logging.ts\`), files in \`storage/logs\`. Never log with \`console.*\`, never log secrets.
- ${options.docker ? 'Docker mode: every `node strut` command runs inside the app container (`node strut services:up` / `services:down`).' : 'Runs on this computer (no Docker).'} Database: ${options.database}.
- ${tests}
`
}

/**
 * The skeleton's README plus the sections of installer-only features: Docker mode, sign-in (the
 * first admin) and the deploy / container files. Appended, so the skeleton's text stays as the
 * skeleton repo wrote it.
 */
function readme(skeleton: string, options: ProjectOptions): string {
  const docker = options.docker
    ? [
        '',
        '## Docker mode',
        '',
        'Everything runs in containers (like Laravel Sail): the app on node:24, the database and Mailpit',
        '(inbox: http://localhost:8025). `node strut <command>` on your computer runs the command inside the',
        'app container, so the commands above work the same: `npm run dev`, `migrate` and every other',
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
      ].join('\n')
    : ''
  const base = skeleton.endsWith('\n') ? skeleton : `${skeleton}\n`
  const dockerPart = docker === '' ? '' : `${docker}\n`
  return `${base}${dockerPart}${signInSection(options)}${deploySection(options)}`
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
