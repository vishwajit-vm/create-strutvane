const fs = require('node:fs')
const path = require('node:path')
const root = process.argv[2]
const edit = (file, pairs) => {
  const f = path.join(root, file)
  let t = fs.readFileSync(f, 'utf8')
  for (const [a, b] of pairs) {
    if (!t.includes(a)) throw new Error(`${file}: missing ${a.slice(0, 80)}`)
    t = t.replace(a, b)
  }
  fs.writeFileSync(f, t)
}
edit('test/registry.test.ts', [
  [
    `    argv: ['--features', 'search,billing'],
    answer: { features: ['search', 'billing'] },`,
    `    argv: ['--features', 'billing,search'],
    answer: { features: ['billing', 'search'] },`,
  ],
  [
    `    fallback: { 'billing.provider': 'stripe' },`,
    `    // stripe-tax applies to Stripe only, and is asked after the provider (its \`when\`).
    fallback: { 'billing.provider': 'stripe', 'billing.stripe-tax': 'no' },`,
  ],
  [
    `  it.each(ROWS.filter((row) => row.preview === true))(`,
    `  // featureOptions and aiProvider need another answer first (features, ai) that carries the check.
  it.each(
    ROWS.filter((row) => row.preview === true && !['featureOptions', 'aiProvider'].includes(row.id)),
  )(`,
  ],
  [
    `      {
        teams: true,
        sso: true,
        tenantResolver: 'subdomain',`,
    `      {
        previewCatalogue: true,
        teams: true,
        sso: true,
        tenantResolver: 'subdomain',`,
  ],
  [
    `      {
        docker: false,
        dbHost: 'db.local',
        dbPort: 3307,
        ai: true,`,
    `      {
        previewCatalogue: true,
        docker: false,
        dbHost: 'db.local',
        dbPort: 3307,
        ai: true,`,
  ],
  [
    `      {
        auth: 'magic-link',
        uiLanguages: ['en', 'hi'],`,
    `      {
        previewCatalogue: true,
        auth: 'magic-link',
        uiLanguages: ['en', 'hi'],`,
  ],
  [
    `  it('packages come from the answers, the framework first, each once', () => {
    expect(projectPackages(answersOf(resolve()))).toEqual([
      '@strutvane/framework',
      '@strutvane/agent-tools',
      '@strutvane/auth',
      '@strutvane/design-crisp',
      '@strutvane/logs',
      '@strutvane/ui',
    ])
    const many = projectPackages(
      answersOf(
        resolve({
          teams: true,`,
    `  it('packages come from the answers, the framework first, each once', () => {
    // Today only the core train is released: unpublished packages never appear by default (#3).
    expect(projectPackages(answersOf(resolve()))).toEqual([
      '@strutvane/framework',
      '@strutvane/auth',
      '@strutvane/design-crisp',
      '@strutvane/ui',
    ])
    expect(projectPackages(answersOf(resolve({ previewCatalogue: true })))).toEqual([
      '@strutvane/framework',
      '@strutvane/agent-tools',
      '@strutvane/auth',
      '@strutvane/design-crisp',
      '@strutvane/log-viewer',
      '@strutvane/ui',
    ])
    // No sign-in: no auth package at all (decision #107).
    expect(projectPackages(answersOf(resolve({ auth: 'none' })))).not.toContain('@strutvane/auth')
    const many = projectPackages(
      answersOf(
        resolve({
          previewCatalogue: true,
          teams: true,`,
  ],
])
// features: refuse an unreleased pick already at the flags, with the #109 wording.
edit('src/question-registry.ts', [
  [
    `  // Typed ids are checked (with the #109 wording) by resolveOptions; nothing else to settle.
  availabilityProblem: () => undefined,
  settle: (answers) => answers,
}`,
    `  // A listed package that is not released is refused at the flags already (#109); unknown ids
  // are left to resolveOptions, which names them.
  availabilityProblem: (answers) => {
    const offered = offeredFor(answers)
    for (const id of answers.features ?? []) {
      if (offered.some((entry) => entry.id === id)) continue
      const listed = installerCatalogue().entries.find((entry) => entry.id === id)
      const reason = listed === undefined ? undefined : unavailableReason([listed.package], answers)
      if (reason !== undefined) return reason
    }
    return undefined
  },
  settle: (answers) => answers,
}`,
  ],
  [
    `    const value = answers[question.id]
    const shown = Array.isArray(value) ? value.join(',') : String(value)
    const flag = question.flag === undefined ? question.title : \`--\${question.flag.name} \${shown}\``,
    `    const value = answers[question.id]
    const shown =
      typeof value === 'boolean' ? '' : \` \${Array.isArray(value) ? value.join(',') : String(value)}\`
    const flag = question.flag === undefined ? question.title : \`--\${question.flag.name}\${shown}\``,
  ],
])
