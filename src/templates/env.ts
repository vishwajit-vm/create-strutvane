/**
 * `env.schema.ts` + `env.ts` for the generated app, built from the same {@link EnvSection}s that
 * produce `.env` and `.env.example`, so the validation always matches the documented keys.
 *
 * @module
 */
import type { GeneratedFile } from '@strutvane/devkit'
import { allEnvVars, type EnvSection, type EnvSpecVar } from '../env-spec.ts'
import { file, lines, quote } from './util.ts'

/** Helper definitions, emitted only when used (unused code fails the app's strict tsconfig). */
const HELPERS = {
  optional: [
    '/** An empty value in .env means "not set". */',
    'const optional = <T extends z.ZodType>(schema: T) =>',
    "  z.preprocess((value) => (value === '' ? undefined : value), schema.optional())",
  ],
  bool: [
    '/** "true" / "false" strings → booleans. Anything else is an error, never silently false. */',
    "const bool = z.enum(['true', 'false']).transform((value) => value === 'true')",
  ],
  list: [
    '/** Comma-separated values → a trimmed list. */',
    'const list = z',
    '  .string()',
    '  .min(1)',
    '  .transform((value) =>',
    '    value',
    "      .split(',')",
    '      .map((item) => item.trim())',
    '      .filter(Boolean),',
    '  )',
  ],
} as const

type Helper = keyof typeof HELPERS

/** Zod expression for one variable, and the helpers it needs. */
export function zodFor(v: EnvSpecVar): {
  readonly expr: string
  readonly helpers: readonly Helper[]
} {
  const helpers: Helper[] = []
  let expr: string
  switch (v.kind) {
    case 'url':
      expr = 'z.url()'
      break
    case 'email':
      expr = 'z.email()'
      break
    case 'port':
      expr = 'z.coerce.number().int().min(1).max(65535)'
      break
    case 'integer':
      expr = 'z.coerce.number().int().min(0)'
      break
    case 'boolean':
      helpers.push('bool')
      expr = 'bool'
      break
    case 'enum':
      expr = `z.enum([${(v.options ?? []).map(quote).join(', ')}])`
      break
    case 'size':
      expr = "z.string().regex(/^\\d+(KB|MB|GB)$/i, 'use a size like 30MB')"
      break
    case 'list':
      helpers.push('list')
      expr = 'list'
      break
    case 'rate':
      expr = "z.string().regex(/^\\d+\\/(s|min|h|day)$/, 'use a rate like 120/min')"
      break
    case 'secret':
      expr = "z.string().min(32, 'must be a long random secret (32+ characters)')"
      break
    default:
      expr = 'z.string().min(1)'
  }
  if (v.optional) {
    helpers.push('optional')
    expr = `optional(${expr})`
  }
  return { expr, helpers }
}

/**
 * Cross-field safety checks for the generated schema, each emitted only when its keys exist:
 * - `APP_DEBUG=true` is refused unless `APP_ENV=local` (debug output exposes error details, and
 *   staging/test servers are reachable too; docs/12 §2 "I");
 * - a `*` in `CORS_ORIGINS` is refused, because `config/cors.ts` allows credentials (cookies) and
 *   a wildcard origin with credentials lets any site act as the signed-in user (docs/12 §10);
 * - in production every CORS origin must be `https://`.
 */
export function envRefinements(keys: ReadonlySet<string>): readonly string[] {
  const checks: string[] = []
  if (keys.has('APP_DEBUG') && keys.has('APP_ENV')) {
    checks.push(
      "    if (env.APP_ENV !== 'local' && env.APP_DEBUG) {",
      '      ctx.addIssue({',
      "        code: 'custom',",
      "        path: ['APP_DEBUG'],",
      "        message: 'APP_DEBUG may only be true when APP_ENV=local (it would expose error details)',",
      '      })',
      '    }',
    )
  }
  if (keys.has('CORS_ORIGINS')) {
    checks.push(
      '    // config/cors.ts allows credentials (cookies), so a wildcard origin is never safe.',
      "    if (env.CORS_ORIGINS.some((origin) => origin.includes('*'))) {",
      '      ctx.addIssue({',
      "        code: 'custom',",
      "        path: ['CORS_ORIGINS'],",
      "        message: 'CORS_ORIGINS cannot contain * while credentials are allowed: list each origin',",
      '      })',
      '    }',
    )
    if (keys.has('APP_ENV')) {
      checks.push(
        "    const insecure = env.CORS_ORIGINS.some((origin) => !origin.startsWith('https://'))",
        "    if (env.APP_ENV === 'production' && insecure) {",
        '      ctx.addIssue({',
        "        code: 'custom',",
        "        path: ['CORS_ORIGINS'],",
        "        message: 'every CORS_ORIGINS entry must start with https:// in production',",
        '      })',
        '    }',
      )
    }
  }
  return checks
}

/** The generated `env.schema.ts`. */
export function envSchemaFile(sections: readonly EnvSection[]): GeneratedFile {
  const checks = envRefinements(new Set(allEnvVars(sections).map((v) => v.key)))
  const refined = checks.length > 0
  // With a refinement the schema is a method chain (`z.object().superRefine()`, one call per
  // line); without one it is a single call. Either way the output is exactly what Biome prints.
  const pad = refined ? '    ' : '  '
  const used = new Set<Helper>()
  const body: string[] = []
  for (const section of sections) {
    body.push(`${pad}// ${section.title}`)
    for (const v of section.vars) {
      const { expr, helpers } = zodFor(v)
      for (const h of helpers) used.add(h)
      body.push(`${pad}${v.key}: ${expr},`)
    }
  }
  const helperOrder: Helper[] = ['optional', 'bool', 'list']
  const helperCode = helperOrder.filter((h) => used.has(h)).flatMap((h) => [...HELPERS[h], ''])

  return file(
    'env.schema.ts',
    lines(
      '/**',
      " * The shape of this app's environment, validated once at startup by `env.ts`.",
      ' *',
      ' * Generated by create-strutvane together with `.env.example`. When you add a variable, add it',
      ' * here AND to `.env.example` (`sv env:check` reports any difference).',
      ' */',
      "import { z } from 'zod'",
      '',
      ...helperCode,
      refined ? 'export const envSchema = z\n  .object({' : 'export const envSchema = z.object({',
      ...body,
      refined ? '  })' : '})',
      refined && ['  .superRefine((env, ctx) => {', ...checks, '  })'].join('\n'),
      '',
      '/** The validated environment type. */',
      'export type Env = z.infer<typeof envSchema>',
    ),
  )
}

/** The generated `env.ts` (validation entry point). */
export function envFile(): GeneratedFile {
  return file(
    'env.ts',
    lines(
      '/**',
      ' * The validated environment, loaded once at startup.',
      ' *',
      ' * A missing or invalid key stops the app with ONE message listing every problem and how to fix',
      ' * it (secret values are never printed). Read config through `config/*.ts`, not `process.env`.',
      ' */',
      "import { defineEnv } from '@strutvane/core'",
      "import { envSchema } from './env.schema.ts'",
      '',
      'export const env = defineEnv(envSchema)',
    ),
  )
}
