// Registry entries: roles (#27), agents as an optional package (#3), the strict profile (#11),
// question 35's wording (#12), and the helpers that apply availability to whole answer sets.
const fs = require('node:fs')
const path = require('node:path')
const f = path.join(process.argv[2], 'src/question-registry.ts')
let t = fs.readFileSync(f, 'utf8')
const rep = (a, b) => {
  if (!t.includes(a)) throw new Error(`missing ${a.slice(0, 100)}`)
  t = t.replace(a, b)
}
rep(
  `    help: 'basic: admin + member; extended: + manager, viewer',
    message: 'Starting roles?',
    choices: [
      { value: 'basic', label: 'Admin + member', short: 'admin, member' },
      {
        value: 'extended',`,
  `    help: 'admin-member, or admin-manager-member-viewer',
    message: 'Starting roles?',
    choices: [
      { value: 'admin-member', label: 'Admin + member', short: 'admin, member' },
      {
        value: 'admin-manager-member-viewer',`,
)
rep(
  `    message: 'Set up AI coding assistants? (AGENTS.md, skills, local docs MCP)',
    packages: ['@strutvane/agent-tools'],`,
  `    message: 'Set up AI coding assistants? (AGENTS.md, skills, local docs MCP)',
    // AGENTS.md is the installer's own file; the skills and local docs come with the package.
    optionalPackages: ['@strutvane/agent-tools'],`,
)
rep(
  `    help: 'standard, or strict (admin 2FA, 8 h sessions, CSP)',`,
  `    help: 'standard, or strict (admin 2FA, 8 h sessions, CSP, HSTS preload)',`,
)
rep(
  `        label: 'Strict: admin 2FA, breached-password check, 8 h sessions, CSP',`,
  `        label: 'Strict: admin 2FA, breached passwords, 8 h sessions, CSP, HSTS preload',`,
)
rep(
  `    help: 'later, node (VPS, Railway, Render) or kubernetes',`,
  `    help: 'later, node (VPS, Railway, Render) or docker (Kubernetes, Fly, Cloud Run, ECS)',`,
)
rep(
  `    help: 'Recommended: 7 questions; custom: every question',`,
  `    help: 'Recommended: the starred questions; custom: every question',`,
)
rep(
  `/** Is this catalogue id offered right now? (Re-exported for the args check.) */
export const isOfferedFeature = (id: string): boolean => findOffered(id) !== undefined`,
  `/**
 * Why answers given as flags (or stored in strutvane.json) cannot be used: each names a package
 * that is not published yet (decision #109). Empty when everything is available.
 *
 * @example
 * availabilityProblems({ cache: 'redis' })
 * // ["--cache-store redis: @strutvane/redis isn't available yet (planned for 0.3). ..."]
 */
export function availabilityProblems(answers: Answers): string[] {
  return QUESTIONS.flatMap((question) => {
    const problem = question.availabilityProblem(answers)
    if (problem === undefined) return []
    const value = answers[question.id]
    const shown = Array.isArray(value) ? value.join(',') : String(value)
    const flag = question.flag === undefined ? question.title : \`--\${question.flag.name} \${shown}\`
    return [\`\${flag}: \${problem}\`]
  })
}

/**
 * The answers with every default that needs an unreleased package moved to an available choice
 * (a hidden question keeps its default only when that default can be installed). Run before
 * {@link resolveOptions}, so the options never name a package the app cannot install.
 *
 * @example
 * settleAnswers({ teams: true }).activityLog // false while @strutvane/activity-log is unreleased
 */
export function settleAnswers(answers: Answers): Answers {
  let settled = answers
  for (const question of QUESTIONS) {
    if (question.when(settled)) settled = question.settle(settled)
  }
  return settled
}

/** Is this catalogue id offered right now? */
export const isOfferedFeature = (id: string, answers: Answers = {}): boolean =>
  findOffered(id, installerCatalogue(), { preview: answers.previewCatalogue === true }) !== undefined`,
)
fs.writeFileSync(f, t)
