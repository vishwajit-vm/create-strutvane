const fs = require('node:fs')
const path = require('node:path')
const f = path.join(process.argv[2], 'test/design.test.ts')
let t = fs.readFileSync(f, 'utf8')
const rep = (a, b) => {
  if (!t.includes(a)) throw new Error(`missing ${a.slice(0, 80)}`)
  t = t.replace(a, b)
}
rep(`    '%s: package.json dependency, lockfile link, stub, config/ui.ts, theme.css and README',`, `    '%s: package.json dependency (the core-train range), config/ui.ts, theme.css and README',`)
rep(
  `      // Pinned like @strutvane/framework: a local stub link that the shipped lockfile matches.
      const manifest = JSON.parse(file(project, 'package.json')) as {
        dependencies: Record<string, string>
      }
      expect(manifest.dependencies[packageName]).toBe(\`file:stubs/strutvane-design-\${design}\`)
      expect(
        Object.keys(manifest.dependencies).filter((name) => name.startsWith('@strutvane/design-')),
      ).toEqual([packageName])
      const lock = JSON.parse(file(project, 'package-lock.json')) as {
        packages: Record<string, Record<string, unknown>>
      }
      expect(lock.packages['']?.['dependencies']).toEqual(manifest.dependencies)
      expect(lock.packages[\`node_modules/\${packageName}\`]).toEqual({
        resolved: \`stubs/strutvane-design-\${design}\`,
        link: true,
      })
      expect(
        JSON.parse(file(project, \`stubs/strutvane-design-\${design}/package.json\`)),
      ).toMatchObject({ name: packageName })
`,
  `      // Released with the framework (the core train), so it uses the framework's range.
      const manifest = JSON.parse(file(project, 'package.json')) as {
        dependencies: Record<string, string>
      }
      expect(manifest.dependencies[packageName]).toBe(FRAMEWORK_RANGE)
      expect(
        Object.keys(manifest.dependencies).filter((name) => name.startsWith('@strutvane/design-')),
      ).toEqual([packageName])
`,
)
rep(`    expect(paths.some((p) => p.startsWith('stubs/strutvane-design-'))).toBe(false)\n`, '')
rep(
  `    expect(manifest.dependencies['@strutvane/design-crisp']).toBe(
      'file:stubs/strutvane-design-crisp',
    )`,
  `    expect(manifest.dependencies['@strutvane/design-crisp']).toBe(FRAMEWORK_RANGE)`,
)
t = t.replace(/^(import [^\n]*\n)(?!import)/m, (m) => m)
const lastImport = t.lastIndexOf('\nimport ')
const end = t.indexOf('\n', t.indexOf(' from ', lastImport))
t = `${t.slice(0, end + 1)}import { FRAMEWORK_RANGE } from '../src/version.ts'\n${t.slice(end + 1)}`
fs.writeFileSync(f, t)
