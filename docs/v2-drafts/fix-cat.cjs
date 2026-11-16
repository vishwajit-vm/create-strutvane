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
edit('src/catalogue.ts', [
  [
    ` * First-party \`@strutvane/<name>\` or community \`strutvane-<name>\` (blueprint §3.3). The strict
 * shape matters: the name becomes a folder and a package.json key, so \`..\`, slashes, capitals or
 * a foreign scope must never get through.
 */
const PACKAGE = /^(@strutvane\/[a-z0-9]+(-[a-z0-9]+)*|strutvane-[a-z0-9]+(-[a-z0-9]+)*)$/`,
    ` * First-party \`@strutvane/<name>\`, community \`strutvane-<name>\`, or the two reserved unscoped
 * names \`strutvane\` and \`create-strutvane\` (blueprint §3.3, the hub's manifest rule). The strict
 * shape matters: the name becomes a folder and a package.json key, so \`..\`, slashes, capitals or
 * a foreign scope must never get through.
 */
const PACKAGE =
  /^(@strutvane\/[a-z0-9]+(-[a-z0-9]+)*|strutvane-[a-z0-9]+(-[a-z0-9]+)*|strutvane|create-strutvane)$/`,
  ],
  [
    `  return catalogue.entries.filter(
    (entry) => entry.kind === 'package' && pickable.has(entry.category) && usable(entry, settings),
  )`,
    `  // The core train (framework, auth, ui, designs) comes with the fixed questions, never as an extra.
  return catalogue.entries.filter(
    (entry) =>
      entry.kind === 'package' &&
      pickable.has(entry.category) &&
      !CORE_TRAIN.includes(entry.package) &&
      usable(entry, settings),
  )`,
  ],
  [
    ` * The entries question 22 may offer: packages (not designs) of pickable categories that are
 * published and compatible (see {@link OfferSettings}). Order is kept from the index.`,
    ` * The entries question 22 may offer: packages (not designs, not the core train) of pickable
 * categories that are published and compatible (see {@link OfferSettings}). Index order is kept.`,
  ],
])
edit('test/catalogue.test.ts', [
  [
    `    expect(skipped).toHaveLength(2)
    expect(skipped.join('\n')).toMatch(/invoicing[\s\S]*not supported[\s\S]*translations/)`,
    `    expect(skipped).toHaveLength(2)
    expect(skipped.join('\n')).toMatch(/invoicing[\s\S]*not supported[\s\S]*translations/)
    // The reserved unscoped names are packages like any other.
    expect(catalogue.entries.map((e) => e.package)).toContain('create-strutvane')`,
  ],
  [
    `      features: ['billing', 'social-login'],
      featuresSearch: false,`,
    `      features: ['billing'],
      featuresSearch: true,
      featuresMore: ['social-login'],`,
  ],
  [
    `    expect(asked).toEqual([
      'features',
      'featuresSearch',
      'billing.provider',`,
    `    expect(asked).toEqual([
      'features',
      'featuresSearch',
      'featuresMore',
      'billing.provider',`,
  ],
  [
    `    const released = { ...answers, previewCatalogue: false }
    expect(resolveOptions(released, '/code', catalogue).features).toEqual(['kanban'])`,
    `    expect(resolveOptions(answers, '/code', catalogue).features).toEqual(['kanban'])`,
  ],
])
