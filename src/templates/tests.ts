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
        vars.some((v) => v.key === 'APP_DEBUG') && '',
        vars.some((v) => v.key === 'APP_DEBUG') &&
          "  test('refuses debug mode in production', () => {",
        vars.some((v) => v.key === 'APP_DEBUG') &&
          "    const result = envSchema.safeParse({ ...valid, APP_ENV: 'production', APP_DEBUG: 'true' })",
        vars.some((v) => v.key === 'APP_DEBUG') && '    expect(result.success).toBe(false)',
        vars.some((v) => v.key === 'APP_DEBUG') && '  })',
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
