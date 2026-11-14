/**
 * End-to-end: generate real projects for every combination, then prove each one is healthy with
 * the real tools: golden output, TypeScript, Biome (format + lint), its own test suite, and the
 * .env / .env.example / env.schema.ts contract.
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { envKeys, looksSecret } from '@strutvane/devkit'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { buildEnvSpec } from '../src/env-spec.ts'
import { hasWeb, type ProjectOptions } from '../src/options.ts'
import { renderProject } from '../src/render.ts'
import { COMBOS } from './combos.ts'
import {
  AUTH_TYPES,
  biomeCheck,
  generate,
  linkNodeModules,
  removeDir,
  typecheck,
  typecheckAuthConfig,
  typecheckWeb,
  UI_TYPES,
  vitestRun,
} from './helpers.ts'

/** `KEY=value` pairs of an env file, in order. */
function parseEnv(text: string): [string, string][] {
  return text
    .split('\n')
    .filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1)]
    })
}

describe.each(COMBOS)('$id', ({ id, input }) => {
  let options: ProjectOptions
  let root: string
  let dir: string

  beforeAll(async () => {
    ;({ options, root } = await generate(input))
    dir = options.directory
  })
  afterAll(async () => {
    await removeDir(dir)
    await removeDir(root)
  })

  test('matches the golden output', async () => {
    const { files } = renderProject(options)
    const example = await readFile(join(dir, '.env.example'), 'utf8')
    const all = [...files, { path: '.env.example', content: example }].sort((a, b) =>
      a.path < b.path ? -1 : 1,
    )
    const golden = all.map((f) => `===== ${f.path} =====\n${f.content}`).join('\n')
    await expect(golden).toMatchFileSnapshot(`__golden__/${id}.txt`)
  })

  test('.env and .env.example list the same keys, in the same order, matching env.schema.ts', async () => {
    const env = parseEnv(await readFile(join(dir, '.env'), 'utf8'))
    const example = parseEnv(await readFile(join(dir, '.env.example'), 'utf8'))
    expect(env.map(([k]) => k)).toEqual(example.map(([k]) => k))

    const schema = await readFile(join(dir, 'env.schema.ts'), 'utf8')
    const schemaKeys = [...schema.matchAll(/^ {2,4}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1])
    expect(schemaKeys).toEqual(env.map(([k]) => k))
    expect([...envKeys(await readFile(join(dir, '.env'), 'utf8'))].sort()).toEqual(
      [...schemaKeys].sort(),
    )
  })

  test('secrets are generated in .env and never written to .env.example', async () => {
    const env = new Map(parseEnv(await readFile(join(dir, '.env'), 'utf8')))
    const exampleText = await readFile(join(dir, '.env.example'), 'utf8')
    const example = new Map(parseEnv(exampleText))
    const secrets = buildEnvSpec(options)
      .flatMap((s) => s.vars)
      .filter((v) => v.secret === true)
    for (const v of secrets) {
      expect(env.get(v.key), v.key).toMatch(/^test-secret-\d{2}x+$/)
      expect(example.get(v.key), v.key).toBe('')
      expect(exampleText).not.toContain(env.get(v.key))
    }
    // Belt and braces: no secret-looking key has a value in the committed file.
    for (const [key, value] of example) if (looksSecret(key)) expect(value, key).toBe('')
  })

  test('type-checks with the real @strutvane/core and zod', async () => {
    await linkNodeModules(dir)
    const result = await typecheck(dir)
    expect(result.output).toBe('')
    expect(result.code).toBe(0)
  })

  // Local workspace only: config/auth.ts against the real (unpublished) @strutvane/auth types.
  test.skipIf(!existsSync(AUTH_TYPES))(
    'config/auth.ts type-checks against the real defineAuthConfig',
    async () => {
      if (options.auth.length === 0) return
      await linkNodeModules(dir).catch(() => undefined) // already linked by the type-check test
      const result = await typecheckAuthConfig(dir)
      expect(result.output).toBe('')
      expect(result.code).toBe(0)
      // Negative control: the check has teeth (a misspelt key fails to compile).
      const path = join(dir, 'config', 'auth.ts')
      const source = await readFile(path, 'utf8')
      await writeFile(path, source.replace('defineAuthConfig({', 'defineAuthConfig({ rolse: {},'))
      try {
        expect((await typecheckAuthConfig(dir)).code).not.toBe(0)
      } finally {
        await writeFile(path, source)
      }
    },
  )

  // Local workspace only: web/ against the real @strutvane/ui typings (the sibling ../ui/dist,
  // which must contain the app shell: StrutvaneApp, RouteDefinition).
  test.skipIf(!existsSync(UI_TYPES))(
    'web/ type-checks against the real @strutvane/ui API',
    async () => {
      if (!hasWeb(options)) return
      const result = await typecheckWeb(dir)
      expect(result.output).toBe('')
      expect(result.code).toBe(0)
      // Negative control: the check has teeth (a misspelt prop, and the required apiUrl missing).
      const path = join(dir, 'web', 'app.tsx')
      const source = await readFile(path, 'utf8')
      expect(source).toContain('apiUrl={')
      await writeFile(path, source.replace('apiUrl={', 'apiURL={'))
      try {
        expect((await typecheckWeb(dir)).code).not.toBe(0)
      } finally {
        await writeFile(path, source)
      }
    },
  )

  test('passes Biome (format, lint, import order) with its own config', async () => {
    const result = await biomeCheck(dir)
    expect(result.code, result.output).toBe(0)
  })

  test('its own test suite passes', async () => {
    const result = await vitestRun(dir)
    expect(result.code, result.output).toBe(0)
    expect(result.output).toMatch(/passed/)
  })
})
