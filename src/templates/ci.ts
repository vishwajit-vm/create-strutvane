/**
 * The generated GitHub Actions workflow: lint, typecheck and tests on every push and pull request.
 *
 * - Actions are pinned to commit SHAs (supply-chain safety); the tag is in the comment.
 * - Permissions are read-only and the checkout keeps no credentials.
 * - No secrets are needed: the tests validate `env.schema.ts` directly, never a real `.env`.
 *
 * @module
 */
import type { GeneratedFile } from '@strutvane/devkit'
import type { ProjectOptions } from '../options.ts'
import { ciInstallCommand, runScript } from '../package-manager.ts'
import { ACTIONS } from '../versions.ts'
import { file, lines } from './util.ts'

function setupSteps(o: ProjectOptions): string[] {
  const node = [
    `      - uses: ${ACTIONS.setupNode}`,
    '        with:',
    '          node-version: 24',
    ...(o.packageManager === 'bun' ? [] : [`          cache: ${o.packageManager}`]),
  ]
  switch (o.packageManager) {
    case 'pnpm':
      return [`      - uses: ${ACTIONS.setupPnpm}`, ...node]
    case 'bun':
      return [...node, `      - uses: ${ACTIONS.setupBun}`]
    case 'yarn':
      return [...node, '      - run: corepack enable']
    default:
      return node
  }
}

/** `.github/workflows/ci.yml`. */
export function ciFiles(o: ProjectOptions): GeneratedFile[] {
  const run = (s: string) => runScript(o.packageManager, s)
  return [
    file(
      '.github/workflows/ci.yml',
      lines(
        'name: CI',
        '',
        'on:',
        '  push:',
        '    branches: [main]',
        '  pull_request:',
        '',
        'permissions:',
        '  contents: read',
        '',
        'concurrency:',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression, not JS
        '  group: ci-${{ github.ref }}',
        '  cancel-in-progress: true',
        '',
        'jobs:',
        '  check:',
        '    runs-on: ubuntu-latest',
        '    timeout-minutes: 15',
        '    steps:',
        `      - uses: ${ACTIONS.checkout}`,
        '        with:',
        '          persist-credentials: false',
        ...setupSteps(o),
        `      - run: ${ciInstallCommand(o.packageManager)}`,
        `      - run: ${run('lint')}`,
        `      - run: ${run('typecheck')}`,
        `      - run: ${run('test')}`,
      ),
    ),
  ]
}
