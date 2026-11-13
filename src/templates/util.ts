/**
 * Tiny, dependency-free helpers for writing templates as plain TypeScript functions.
 * No template engine and no `eval`: a template is a function from options to a string.
 *
 * @module
 */
import type { GeneratedFile } from '@strutvane/devkit'

/** Join lines with `\n` and end with exactly one newline. `false`/`undefined` lines are skipped. */
export function lines(...parts: readonly (string | false | undefined | null)[]): string {
  const kept = parts.filter((p): p is string => typeof p === 'string')
  return `${kept.join('\n').replace(/\n+$/, '')}\n`
}

/** Line width the generated Biome config enforces (generated files must already be formatted). */
export const LINE_WIDTH = 100

/**
 * Pretty JSON with a trailing newline, formatted exactly as Biome formats it: objects expanded one
 * key per line, arrays of primitives on one line when they fit in {@link LINE_WIDTH}.
 */
export function json(value: unknown): string {
  const print = (v: unknown, depth: number, used: number): string => {
    const pad = '  '.repeat(depth + 1)
    const close = '  '.repeat(depth)
    if (Array.isArray(v)) {
      if (v.length === 0) return '[]'
      const primitive = v.every((item) => item === null || typeof item !== 'object')
      const inline = `[${v.map((item) => JSON.stringify(item)).join(', ')}]`
      // +1 for the comma that may follow.
      if (primitive && used + inline.length + 1 <= LINE_WIDTH) return inline
      const items = v.map((item) => pad + print(item, depth + 1, pad.length))
      return `[\n${items.join(',\n')}\n${close}]`
    }
    if (v !== null && typeof v === 'object') {
      const entries = Object.entries(v)
      if (entries.length === 0) return '{}'
      const body = entries.map(([k, item]) => {
        const key = `${pad}${JSON.stringify(k)}: `
        return key + print(item, depth + 1, key.length)
      })
      return `{\n${body.join(',\n')}\n${close}}`
    }
    return JSON.stringify(v)
  }
  return `${print(value, 0, 0)}\n`
}

/** Shorthand for a generated file. */
export function file(path: string, content: string): GeneratedFile {
  return { path, content }
}

/** Sort an object's keys alphabetically (package.json dependency maps). */
export function sortKeys(record: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/** A JS string literal with single quotes (safe for any text: uses JSON escaping rules). */
export function quote(value: string): string {
  return `'${JSON.stringify(value).slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'")}'`
}
