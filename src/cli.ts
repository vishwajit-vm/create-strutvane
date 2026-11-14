#!/usr/bin/env node
/**
 * The `create-strutvane` binary. All logic lives in `main.ts` (tested); this file only connects
 * it to the real process.
 *
 * @module
 */
import { readFileSync } from 'node:fs'
import { isCi, main } from './main.ts'

const { npm_config_user_agent: userAgent } = process.env

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string
}

process.exitCode = await main(process.argv.slice(2), {
  cwd: process.cwd(),
  version: pkg.version,
  userAgent,
  interactive: process.stdin.isTTY === true && process.stdout.isTTY === true,
  ci: isCi(process.env),
})
