/**
 * The generated `tests/` folder: a real, passing env test from day one, plus Playwright smoke
 * tests for apps with a UI. Feature tests are generated per model by `sv make:model`.
 *
 * @module
 */
import type { GeneratedFile } from '@strutvane/devkit'
import { allEnvVars, type EnvSection } from '../env-spec.ts'
import { hasWeb, type ProjectOptions } from '../options.ts'
import { svCommand } from '../package-manager.ts'
import { file, lines } from './util.ts'

/** A valid value for each key, used by the generated env test (secrets get a long dummy). */
function sampleValue(v: { readonly kind: string; readonly value?: string | undefined }): string {
  if (v.kind === 'secret') return 'not-a-real-secret-'.padEnd(48, 'x')
  return v.value ?? ''
}

/** Tests for each cross-field refusal in `env.schema.ts` (see `envRefinements`). */
function refusalTests(keys: ReadonlySet<string>): string[] {
  const out: string[] = []
  if (keys.has('APP_DEBUG') && keys.has('APP_ENV')) {
    out.push(
      '',
      "  test.each(['test', 'staging', 'production'])('refuses debug mode when APP_ENV=%s', (APP_ENV) => {",
      "    expect(envSchema.safeParse({ ...valid, APP_ENV, APP_DEBUG: 'true' }).success).toBe(false)",
      '  })',
    )
  }
  if (keys.has('CORS_ORIGINS')) {
    out.push(
      '',
      "  test.each(['*', 'https://*.example.com'])('refuses the CORS origin %s', (CORS_ORIGINS) => {",
      '    expect(envSchema.safeParse({ ...valid, CORS_ORIGINS }).success).toBe(false)',
      '  })',
    )
  }
  if (keys.has('CORS_ORIGINS') && keys.has('APP_ENV')) {
    const prod = keys.has('APP_DEBUG')
      ? "{ ...valid, APP_ENV: 'production', APP_DEBUG: 'false' }"
      : "{ ...valid, APP_ENV: 'production' }"
    out.push(
      '',
      "  test('requires https:// CORS origins in production', () => {",
      `    const production = ${prod}`,
      "    const plain = { ...production, CORS_ORIGINS: 'http://app.example.com' }",
      "    const secure = { ...production, CORS_ORIGINS: 'https://app.example.com' }",
      '    expect(envSchema.safeParse(plain).success).toBe(false)',
      '    expect(envSchema.safeParse(secure).success).toBe(true)',
      '  })',
    )
  }
  return out
}

/** Every file under `tests/`. */
export function testFiles(o: ProjectOptions, env: readonly EnvSection[]): GeneratedFile[] {
  const vars = allEnvVars(env)
  const firstRequired = vars.find((v) => !v.optional && v.kind !== 'boolean')
  const sample = vars.map((v) => `  ${v.key}: '${sampleValue(v).replace(/'/g, "\\'")}',`)
  const out: GeneratedFile[] = [
    file(
      'tests/unit/env.test.ts',
      lines(
        '/**',
        ' * Guards the environment contract: a complete .env is accepted and a broken one is refused.',
        ' * Keep it passing when you add variables (add them to `valid` below).',
        ' */',
        "import { describe, expect, test } from 'vitest'",
        "import { envSchema } from '../../env.schema.ts'",
        '',
        'const valid = {',
        ...sample,
        '}',
        '',
        "describe('environment', () => {",
        "  test('accepts a complete environment', () => {",
        '    expect(envSchema.safeParse(valid).success).toBe(true)',
        '  })',
        '',
        firstRequired !== undefined && `  test('refuses a missing required key', () => {`,
        firstRequired !== undefined &&
          `    const { ${firstRequired.key}: _removed, ...incomplete } = valid`,
        firstRequired !== undefined &&
          '    expect(envSchema.safeParse(incomplete).success).toBe(false)',
        firstRequired !== undefined && '  })',
        ...refusalTests(new Set(vars.map((v) => v.key))),
        '})',
      ),
    ),
    file(
      'tests/feature/README.md',
      lines(
        '# Feature tests',
        '',
        `\`${svCommand(o.packageManager, 'make:model')}\` generates a feature test per model: CRUD, validation, permissions`,
        '(allowed and denied), tenant isolation and soft deletes. Add your own tests next to them.',
      ),
    ),
  ]
  if (hasWeb(o)) {
    out.push(
      file(
        'tests/e2e/smoke.spec.ts',
        lines(
          "import { expect, test } from '@playwright/test'",
          '',
          "test('the app loads', async ({ page }) => {",
          "  await page.goto('/')",
          `  await expect(page).toHaveTitle('${o.name}')`,
          '})',
        ),
      ),
    )
  }
  return out
}
