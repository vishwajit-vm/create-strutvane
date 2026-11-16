const fs = require('node:fs')
const path = require('node:path')
const f = path.join(process.argv[2], 'test/strut-forwarding.test.ts')
let t = fs.readFileSync(f, 'utf8')
const rep = (a, b) => {
  if (!t.includes(a)) throw new Error(`missing ${a.slice(0, 80)}`)
  t = t.replace(a, b)
}
const all = (a, b) => {
  if (!t.includes(a)) throw new Error(`missing ${a.slice(0, 80)}`)
  t = t.split(a).join(b)
}
rep(
  `    expect(strut(['services:down', '--volumes']).calls[0]?.slice(-2)).toEqual(['down', '-v'])
  })`,
  `    expect(strut(['services:down']).calls[0]?.slice(-1)).toEqual(['down'])
  })

  it('services:down --volumes deletes data: refused without a terminal unless --force (#6)', () => {
    const refused = strut(['services:down', '--volumes'])
    expect(refused.code).toBe(1)
    expect(refused.calls).toHaveLength(0)
    expect(refused.output).toContain('Add --force to confirm')
    expect(strut(['services:down', '--volumes', '--force']).calls[0]?.slice(-2)).toEqual([
      'down',
      '-v',
    ])
  })

  it('services:logs and db:shell talk to the containers (db:shell reads the login inside)', () => {
    expect(strut(['services:logs', 'db']).calls[0]?.slice(-3)).toEqual(['logs', '--follow', 'db'])
    // This project is SQLite: there is no database container to open a shell in.
    const sqlite = strut(['db:shell'])
    expect(sqlite.code).toBe(1)
    expect(sqlite.output).toContain('SQLite')
  })

  it('"node strut" alone and "help" both mean list (#13)', () => {
    expect(strut([]).calls[1]?.slice(-3)).toEqual(['node', 'strut', 'list'])
    expect(strut(['help']).calls[1]?.slice(-3)).toEqual(['node', 'strut', 'list'])
  })`,
)
rep(
  `  it('runs setup on the host (it starts the containers itself)', () => {
    const result = strut(['setup'])
    expect(result.calls).toHaveLength(0)
    expect(result.output).toMatch(/No .strutvane\\/setup.json found/)
  })`,
  `  it('setup runs on the host: a fresh clone resumes with the recorded installer version (#9)', () => {
    // No .strutvane/local/setup.json: npm exec runs the create-strutvane that made the project.
    const fakeNpm = join(directory, '..', 'fake-npm', 'npm-cli.js')
    mkdirSync(join(directory, '..', 'fake-npm'), { recursive: true })
    writeFileSync(
      fakeNpm,
      \`require('node:fs').writeFileSync(\${JSON.stringify(\`\${fakeNpm}.args\`)}, JSON.stringify(process.argv.slice(2)))\`,
    )
    const result = strut(['setup'], { npm_execpath: fakeNpm })
    expect(result.calls).toHaveLength(0)
    expect(result.code, result.output).toBe(0)
    expect(JSON.parse(readFileSync(\`\${fakeNpm}.args\`, 'utf8'))).toEqual([
      'exec',
      '--yes',
      \`--package=create-strutvane@\${VERSION}\`,
      '--',
      'create-strutvane',
      '--resume',
      directory,
    ])
  })

  it('setup uses the installer that made this copy while it still exists', () => {
    const script = join(directory, '..', 'fake-installer.cjs')
    writeFileSync(
      script,
      \`require('node:fs').writeFileSync(\${JSON.stringify(\`\${script}.args\`)}, JSON.stringify(process.argv.slice(2)))\`,
    )
    const state = join(directory, '.strutvane', 'local', 'setup.json')
    mkdirSync(join(directory, '.strutvane', 'local'), { recursive: true })
    writeFileSync(state, JSON.stringify({ resumeWith: [process.execPath, script, '--resume'] }))
    try {
      expect(strut(['setup']).code).toBe(0)
      expect(JSON.parse(readFileSync(\`\${script}.args\`, 'utf8'))).toEqual(['--resume', directory])
    } finally {
      rmSync(state)
    }
  })`,
)
all(
  `    const envJson = join(directory, '.strutvane', 'env.json')
    const before = readFileSync(envJson, 'utf8')
    writeFileSync(envJson, JSON.stringify({ mode: 'host' }))`,
  `    // A per-computer override (decision #110) switches this copy to host mode.
    const envJson = join(directory, '.strutvane', 'local', 'env.json')
    mkdirSync(join(directory, '.strutvane', 'local'), { recursive: true })
    writeFileSync(envJson, JSON.stringify({ mode: 'host' }))`,
)
all(`      writeFileSync(envJson, before)`, `      rmSync(envJson)`)
const lastImport = t.lastIndexOf('\nimport ')
const end = t.indexOf('\n', t.indexOf(' from ', lastImport))
t = `${t.slice(0, end + 1)}import { VERSION } from '../src/version.ts'\n${t.slice(end + 1)}`
t = t.replace(
  `import { readFileSync, writeFileSync } from 'node:fs'`,
  `import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'`,
)
fs.writeFileSync(f, t)
