// main.ts: settle unavailable defaults, local packages, state and logs in .strutvane/local/, and a
// fresh-clone resume that restores the git-ignored local files.
const fs = require('node:fs')
const path = require('node:path')
const f = path.join(process.argv[2], 'src/main.ts')
let t = fs.readFileSync(f, 'utf8')
const rep = (a, b) => {
  if (!t.includes(a)) throw new Error(`missing ${a.slice(0, 80)}`)
  t = t.replace(a, b)
}
rep(
  `import { EMPTY_LOCAL_PASSWORD_WARNING, QUESTIONS } from './question-registry.ts'`,
  `import { EMPTY_LOCAL_PASSWORD_WARNING, QUESTIONS, settleAnswers } from './question-registry.ts'`,
)
rep(
  `import { renderProject } from './templates/project.ts'`,
  `import { type RenderSettings, renderProject } from './templates/project.ts'`,
)
rep(
  `  answers = connectionProblem
  let options: ProjectOptions
  try {
    options = resolveOptions(answers, environment.cwd)`,
  `  // Defaults that need a package that is not released yet move to an available choice (#3).
  answers = settleAnswers(connectionProblem)
  let options: ProjectOptions
  try {
    options = resolveOptions(answers, environment.cwd)`,
)
rep(
  `    resolveOptions({ ...answers, name: answers.name ?? 'placeholder' }, environment.cwd)`,
  `    resolveOptions(
      settleAnswers({ ...answers, name: answers.name ?? 'placeholder' }),
      environment.cwd,
    )`,
)
rep(
  `      ...renderProject(options, typed),
      // The state file is part of the same transaction: no project ever exists without it.
      { path: '.strutvane/setup.json', content: \`\${JSON.stringify(state, null, 2)}\\n\` },`,
  `      ...renderProject(options, typed, renderSettings(environment)),
      // The state file is part of the same transaction: no project ever exists without it.
      { path: STATE_FILE.join('/'), content: \`\${JSON.stringify(state, null, 2)}\\n\` },`,
)
rep(
  `  const logFile = resolve(directory, '.strutvane', 'logs', \`setup-\${stamp}.log\`)`,
  `  const logFile = resolve(directory, '.strutvane', 'local', 'logs', \`setup-\${stamp}.log\`)`,
)
rep(
  `/** Run the setup steps with this environment's programs, ports and clock. */`,
  `/**
 * \`STRUT_LOCAL_PACKAGES\`: a folder of local package folders used instead of the npm registry
 * (testing unreleased packages, the ecosystem's umbrella workspace). Unset for everyone else.
 */
function renderSettings(environment: InstallerEnvironment): RenderSettings {
  const local = environment.env['STRUT_LOCAL_PACKAGES']
  return local === undefined || local === '' ? {} : { localPackages: resolve(environment.cwd, local) }
}

/**
 * A fresh clone (or a deleted local file) lacks the git-ignored files setup needs: \`.env\` and,
 * in Docker mode, \`docker/\`. Write the missing ones from the options; never overwrite one that
 * exists (it may hold your own values).
 */
async function restoreLocalFiles(
  options: ProjectOptions,
  environment: InstallerEnvironment,
  reporter: Reporter,
): Promise<boolean> {
  const missing = renderProject(options).filter(
    (file) =>
      (file.path === '.env' || file.path.startsWith('docker/')) &&
      !existsSync(join(options.directory, file.path)),
  )
  if (missing.length === 0) return true
  try {
    await writeLocalFiles(options.directory, missing, environment.writeFile)
  } catch (error) {
    reporter.error(
      \`The local files could not be written: \${error instanceof Error ? error.message : String(error)}\`,
    )
    return false
  }
  reporter.info(\`Restored local files: \${missing.map((file) => file.path).join(', ')}\`)
  return true
}

/** Run the setup steps with this environment's programs, ports and clock. */`,
)
fs.writeFileSync(f, t)
