const fs = require('node:fs')
const path = require('node:path')
const f = path.join(process.argv[2], 'test/registry.test.ts')
let t = fs.readFileSync(f, 'utf8')
const rep = (a, b, all = false) => {
  if (!t.includes(a)) throw new Error(`missing ${a.slice(0, 80)}`)
  t = all ? t.split(a).join(b) : t.replace(a, b)
}
rep(
  `  /** Extra answers the flag needs to be valid (an AI provider needs AI on). */
  readonly needs?: Answers`,
  `  /** Extra answers the flag needs to be valid (an AI provider needs AI on). */
  readonly needs?: Answers
  /**
   * The answer brings a package that is not published yet: the row runs with
   * \`--preview-catalogue\` (without it the flag is refused, decision #109; tested below).
   */
  readonly preview?: boolean`,
)
const previewIds = [
  'social',
  'sso',
  'apiAccess',
  'cache',
  'storage',
  'features',
  'featureOptions',
  'activityLog',
  'aiProvider',
  'mcpServer',
  'liveUpdates',
  'monitoring',
]
rep("{ id: 'ai', argv: ['--ai'],", "{ id: 'ai', preview: true, argv: ['--ai'],")
for (const id of previewIds) rep(`    id: '${id}',\n`, `    id: '${id}',\n    preview: true,\n`)
rep(
  `    argv: ['--roles', 'extended'],
    answer: { roles: 'admin-manager-member-viewer' },
    read: (o) => o.roles,
    fallback: 'basic',`,
  `    argv: ['--roles', 'admin-manager-member-viewer'],
    answer: { roles: 'admin-manager-member-viewer' },
    read: (o) => o.roles,
    fallback: 'admin-member',`,
)
rep(
  `  it.each(ROWS)('$id: the flag sets the answer and the option', (row) => {
    expect(parseCommandLine(['acme', ...row.argv]).answers).toEqual({ name: 'acme', ...row.answer })
    const options = resolve({ ...row.needs, ...row.answer })
    const [value] = Object.values(row.answer)
    expect(row.read(options)).toEqual(value)
  })

  it.each(ROWS)('$id: default', (row) => {
    // Rows whose question only applies after another answer are checked with that answer.
    expect(row.read(resolve(row.needs))).toEqual(row.fallback)
  })`,
  `  it.each(ROWS)('$id: the flag sets the answer and the option', (row) => {
    const preview: Answers = row.preview === true ? { previewCatalogue: true } : {}
    const argv = row.preview === true ? [...row.argv, '--preview-catalogue'] : row.argv
    expect(parseCommandLine(['acme', ...argv]).answers).toEqual({
      name: 'acme',
      ...row.answer,
      ...preview,
    })
    const options = resolve({ ...row.needs, ...row.answer, ...preview })
    const [value] = Object.values(row.answer)
    expect(row.read(options)).toEqual(value)
  })

  it.each(ROWS.filter((row) => row.preview === true))(
    '$id: without --preview-catalogue the flag is refused with the package plan (#109)',
    (row) => {
      expect(() => parseCommandLine(['acme', ...row.argv])).toThrow(/isn't available yet/)
    },
  )

  it.each(ROWS)('$id: default', (row) => {
    // Rows whose question only applies after another answer are checked with that answer.
    const preview: Answers = row.preview === true ? { previewCatalogue: true } : {}
    expect(row.read(resolve({ ...row.needs, ...preview }))).toEqual(row.fallback)
  })`,
)
fs.writeFileSync(f, t)
