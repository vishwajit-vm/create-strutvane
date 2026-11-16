// setup-state: progress in .strutvane/local/ (#10), a fresh clone resumes from strutvane.json (#9),
// and stored answers are checked for availability like flags are.
const fs = require('node:fs')
const path = require('node:path')
const f = path.join(process.argv[2], 'src/setup-state.ts')
let t = fs.readFileSync(f, 'utf8')
const rep = (a, b) => {
  if (!t.includes(a)) throw new Error(`missing ${a.slice(0, 100)}`)
  t = t.replace(a, b)
}
rep(
  ` * Setup progress, saved in \`.strutvane/setup.json\` after every step, so \`npm run setup\` can
 * continue exactly where a failed or skipped step left off.
 *
 * The file is git-ignored machine state: it holds the chosen options (never a secret), each step's
 * status, and how to start the installer again (\`resumeWith\`).`,
  ` * Setup progress, saved in \`.strutvane/local/setup.json\` after every step, so \`npm run setup\` can
 * continue exactly where a failed or skipped step left off.
 *
 * The file is git-ignored machine state (\`.strutvane/local/\`, decision #10): it holds the chosen
 * options (never a secret), each step's status, and how to start the installer again
 * (\`resumeWith\`). It is optional (decision #9): a fresh clone has only the committed
 * \`strutvane.json\`, and setup starts from that.`,
)
rep(
  `import { QUESTIONS } from './question-registry.ts'`,
  `import { QUESTIONS, settleAnswers } from './question-registry.ts'`,
)
rep(
  `/**
 * The path of the state file inside a project.
 *
 * @example
 * statePath('C:/code/my-app') // 'C:/code/my-app/.strutvane/setup.json'
 */
export function statePath(directory: string): string {
  return join(directory, '.strutvane', 'setup.json')
}`,
  `/** Where the state file lives inside a project, as path parts (git-ignored machine state). */
export const STATE_FILE: readonly string[] = Object.freeze(['.strutvane', 'local', 'setup.json'])

/** The committed answers file every project has (decision #9: enough to set up a fresh clone). */
export const MANIFEST_FILE = 'strutvane.json'

/**
 * The path of the state file inside a project.
 *
 * @example
 * statePath('C:/code/my-app') // 'C:/code/my-app/.strutvane/local/setup.json'
 */
export function statePath(directory: string): string {
  return join(directory, ...STATE_FILE)
}`,
)
rep(
  `export function loadState(directory: string): SetupState {
  const path = statePath(directory)
  if (!existsSync(path)) {
    throw new SetupStateError(
      \`\${path} was not found, so there is no setup to resume here. Run this inside a project made by create-strutvane.\`,
    )
  }`,
  `export function loadState(directory: string): SetupState {
  const path = statePath(directory)
  if (!existsSync(path)) return stateFromManifest(directory)`,
)
rep(
  `/** Check the parsed JSON field by field; never trust its shape. */`,
  `/**
 * A fresh clone (decision #9): no progress file, only the committed \`strutvane.json\`. The project
 * files are there (git brought them), so "files" is done and every other step runs; the steps
 * themselves notice what already exists (an existing first commit, set secrets, ...).
 */
function stateFromManifest(directory: string): SetupState {
  const path = join(directory, MANIFEST_FILE)
  if (!existsSync(path)) {
    throw new SetupStateError(
      \`Neither \${statePath(directory)} nor \${path} was found, so there is no setup to resume here. Run this inside a project made by create-strutvane.\`,
    )
  }
  const damaged = (what: string) =>
    new SetupStateError(\`\${path} is damaged (\${what}). Restore it from git, then run: npm run setup\`)
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw damaged('not valid JSON')
  }
  if (!isRecord(raw) || raw['version'] !== 1 || !isRecord(raw['answers'])) throw damaged('answers')
  let resolved: ProjectOptions
  try {
    resolved = resolveOptions(answersFrom(raw['answers']), dirname(directory))
  } catch (error) {
    throw damaged(error instanceof Error ? error.message : 'answers')
  }
  const { directory: _directory, ...stored } = resolved
  const steps = Object.fromEntries(
    STEP_IDS.map((id) => [id, id === 'files' ? { status: 'done' } : { status: 'pending' }]),
  ) as Record<StepId, StepRecord>
  return { version: 1, resumeWith: [], options: stored, steps }
}

/** Check the parsed JSON field by field; never trust its shape. */`,
)
rep(
  `  let answers: Answers = {}
  for (const question of QUESTIONS) {
    const stored = flat[question.id]
    // Older setup.json files lack newer questions: those simply take their defaults.
    if (stored === undefined || stored === null) continue
    const ignored: string[] = []
    answers = { ...answers, ...question.read(stored, ignored) }
  }
  return answers
}`,
  `  let answers: Answers = flat['previewCatalogue'] === true ? { previewCatalogue: true } : {}
  for (const question of QUESTIONS) {
    const stored = flat[question.id]
    // Older files lack newer questions: those simply take their defaults.
    if (stored === undefined || stored === null) continue
    const ignored: string[] = []
    answers = { ...answers, ...question.read(stored, ignored) }
  }
  // A package that is no longer offered (or a hand edit) falls back to an available choice.
  return settleAnswers(answers)
}`,
)
fs.writeFileSync(f, t)
