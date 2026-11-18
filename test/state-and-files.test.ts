/**
 * The setup state (`.strutvane/local/setup.json`, or `strutvane.json` for a fresh clone, decision
 * #9), local package copies (`STRUT_LOCAL_PACKAGES`), the file writers, project names, ports and
 * the package root, in-process (the end-to-end suites prove the same through child processes).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { main } from '../src/main.ts'
import { resolveOptions } from '../src/options.ts'
import { packageRoot } from '../src/package-root.ts'
import { isPortFree, NoFreePortError, pickFreePort } from '../src/ports.ts'
import { loadState, MANIFEST_FILE, SetupStateError, statePath } from '../src/setup-state.ts'
import { LOCAL_PACKAGES_FOLDER, packageFolder, renderProject } from '../src/templates/project.ts'
import { validateProjectName } from '../src/validate-name.ts'
import { targetProblem, writeLocalFiles, writeProjectFiles } from '../src/write-files.ts'
import { fakeEnvironment, tempFolder } from './helpers/fakes.ts'
import { localPackages } from './helpers/local-packages.ts'
import { fakePrograms } from './helpers/programs.ts'

/** A finished project made by the real flow with fake programs. */
async function created(name = 'acme') {
  const cwd = tempFolder('cs-state-')
  const world = fakePrograms()
  const { environment } = fakeEnvironment({
    cwd,
    argv: [name, '--yes', '--db', 'sqlite'],
    spawn: world.spawn,
  })
  expect(await main(environment)).toBe(0)
  return { cwd, directory: join(cwd, name) }
}

describe('a fresh clone resumes from strutvane.json (#9)', () => {
  it('without local state: files done, everything else pending, options from the answers', async () => {
    const { directory } = await created()
    rmSync(join(directory, '.strutvane'), { recursive: true, force: true })
    const state = loadState(directory)
    expect(state.resumeWith).toEqual([])
    expect(state.steps.files.status).toBe('done')
    expect(state.steps.install.status).toBe('pending')
    expect(state.options).toMatchObject({ name: 'acme', database: 'sqlite' })
  })

  it('--resume restores .env, generates fresh secrets and finishes', async () => {
    const { cwd, directory } = await created()
    rmSync(join(directory, '.strutvane'), { recursive: true, force: true })
    rmSync(join(directory, '.env'))
    const world = fakePrograms()
    const { environment, output } = fakeEnvironment({
      cwd,
      argv: ['--resume', directory],
      spawn: world.spawn,
    })
    expect(await main(environment)).toBe(0)
    expect(output()).toMatch(/setting up from strutvane.json/)
    expect(output()).toMatch(/Restored local files: \.env/)
    expect(readFileSync(join(directory, '.env'), 'utf8')).toMatch(/^APP_KEY=secret-/m)
    expect(JSON.parse(readFileSync(statePath(directory), 'utf8')).resumeWith).toEqual(
      environment.resumeWith,
    )
  })

  it('a failed restore stops with exit 2 and says why', async () => {
    const { cwd, directory } = await created()
    rmSync(join(directory, '.env'))
    const { environment, output } = fakeEnvironment({
      cwd,
      argv: ['--resume', directory],
      spawn: fakePrograms().spawn,
      writeFile: async () => {
        throw new Error('disk full')
      },
    })
    expect(await main(environment)).toBe(2)
    expect(output()).toMatch(/The local files could not be written: disk full/)
  })

  it('refuses a missing or damaged strutvane.json with a fix', async () => {
    const empty = tempFolder('cs-nothing-')
    expect(() => loadState(empty)).toThrow(SetupStateError)
    expect(() => loadState(empty)).toThrow(/Neither .* nor .*strutvane\.json was found/)
    const { directory } = await created()
    rmSync(join(directory, '.strutvane'), { recursive: true, force: true })
    const manifest = join(directory, MANIFEST_FILE)
    writeFileSync(manifest, '{ nope')
    expect(() => loadState(directory)).toThrow(/not valid JSON\)\. Restore it from git/)
    writeFileSync(manifest, JSON.stringify({ version: 1 }))
    expect(() => loadState(directory)).toThrow(/damaged \(answers\)/)
    writeFileSync(manifest, JSON.stringify({ version: 1, answers: { name: 'Bad Name' } }))
    expect(() => loadState(directory)).toThrow(/lowercase/)
  })

  it('refuses a damaged setup.json field by field; unknown step states run again', async () => {
    const { directory } = await created()
    const path = statePath(directory)
    const good = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    const write = (value: unknown) => writeFileSync(path, JSON.stringify(value))
    write({ ...good, version: 2 })
    expect(() => loadState(directory)).toThrow(/unknown version/)
    write({ ...good, resumeWith: [1] })
    expect(() => loadState(directory)).toThrow(/resumeWith/)
    write({ ...good, options: 'x' })
    expect(() => loadState(directory)).toThrow(/options/)
    write({ ...good, steps: [] })
    expect(() => loadState(directory)).toThrow(/steps/)
    write({
      ...good,
      steps: { files: { status: 'weird' }, git: 'x', install: { status: 'done', note: 'n' } },
    })
    const state = loadState(directory)
    expect(state.steps.files.status).toBe('pending')
    expect(state.steps.git.status).toBe('pending')
    expect(state.steps.install).toEqual({ status: 'done', note: 'n' })
  })

  it('a stored preview and a stored connection are read back', async () => {
    const { directory } = await created()
    const path = statePath(directory)
    const good = JSON.parse(readFileSync(path, 'utf8')) as { options: Record<string, unknown> }
    good.options = {
      ...good.options,
      previewCatalogue: true,
      database: 'mysql',
      docker: false,
      connection: {
        host: 'db.local',
        port: 3307,
        database: 'shop',
        username: 'shop',
        sslMode: 'require',
      },
    }
    writeFileSync(path, JSON.stringify(good))
    expect(loadState(directory).options).toMatchObject({
      previewCatalogue: true,
      connection: { host: 'db.local', port: 3307, database: 'shop', username: 'shop' },
    })
  })
})

describe('local packages (STRUT_LOCAL_PACKAGES)', () => {
  const options = resolveOptions({ name: 'acme', database: 'sqlite' }, '/code')

  it('copies each package folder under .strutvane/local/packages and points package.json there', () => {
    const project = renderProject(options, {}, { localPackages: localPackages() })
    const manifest = JSON.parse(project.find((f) => f.path === 'package.json')?.content ?? '{}')
    expect(manifest.dependencies['@strutvane/framework']).toBe(
      `file:./${LOCAL_PACKAGES_FOLDER}/strutvane-framework`,
    )
    const copied = project.map((f) => f.path).filter((p) => p.startsWith(LOCAL_PACKAGES_FOLDER))
    expect(copied).toContain(`${LOCAL_PACKAGES_FOLDER}/strutvane-framework/package.json`)
    expect(copied).toContain(`${LOCAL_PACKAGES_FOLDER}/strutvane-auth/index.js`)
    expect(copied.some((p) => p.includes('node_modules'))).toBe(false)
  })

  it('skips node_modules inside a package folder, and refuses a missing package folder', () => {
    const folder = localPackages()
    mkdirSync(join(folder, 'strutvane-ui', 'node_modules', 'x'), { recursive: true })
    writeFileSync(join(folder, 'strutvane-ui', 'node_modules', 'x', 'index.js'), '')
    const paths = renderProject(options, {}, { localPackages: folder }).map((f) => f.path)
    expect(paths.some((p) => p.includes('node_modules'))).toBe(false)
    rmSync(join(folder, 'strutvane-design-crisp'), { recursive: true })
    expect(() => renderProject(options, {}, { localPackages: folder })).toThrow(
      /STRUT_LOCAL_PACKAGES has no strutvane-design-crisp folder/,
    )
  })

  it('the installer reads STRUT_LOCAL_PACKAGES from the environment', async () => {
    const cwd = tempFolder('cs-local-')
    const { environment } = fakeEnvironment({
      cwd,
      argv: ['acme', '--yes', '--db', 'sqlite'],
      env: { STRUT_LOCAL_PACKAGES: localPackages() },
      spawn: fakePrograms().spawn,
    })
    expect(await main(environment)).toBe(0)
    const manifest = JSON.parse(readFileSync(join(cwd, 'acme', 'package.json'), 'utf8'))
    expect(manifest.dependencies['@strutvane/ui']).toMatch(/^file:\.\/\.strutvane\/local\//)
  })

  it('builds folder names only from Strutvane package names', () => {
    expect(packageFolder('@strutvane/design-crisp')).toBe('strutvane-design-crisp')
    expect(packageFolder('strutvane-kanban')).toBe('strutvane-kanban')
    for (const bad of ['../etc', '@other/x', '@strutvane/../x', 'lodash']) {
      expect(() => packageFolder(bad), bad).toThrow(/Refusing an unexpected package name/)
    }
  })
})

describe('writing files', () => {
  it('a target that is a file, or a folder with files, is refused', () => {
    const root = tempFolder('cs-target-')
    writeFileSync(join(root, 'file'), 'x')
    expect(targetProblem(join(root, 'file'))).toMatch(/is a file/)
    mkdirSync(join(root, 'busy'))
    writeFileSync(join(root, 'busy', 'x'), 'x')
    expect(targetProblem(join(root, 'busy'))).toMatch(/not empty/)
    mkdirSync(join(root, 'empty'))
    expect(targetProblem(join(root, 'empty'))).toBeUndefined()
  })

  it('an empty existing folder is emptied again when a write fails halfway', async () => {
    const root = tempFolder('cs-rollback-')
    const target = join(root, 'empty')
    mkdirSync(target)
    let count = 0
    await expect(
      writeProjectFiles(
        target,
        [
          { path: 'a.txt', content: 'a' },
          { path: 'b.txt', content: 'b' },
        ],
        async (path, content) => {
          count += 1
          if (count === 2) throw new Error('disk full')
          writeFileSync(path, content)
        },
      ),
    ).rejects.toThrow(/disk full/)
    expect(targetProblem(target)).toBeUndefined() // still there, and empty again
  })

  it('writeLocalFiles never overwrites a file that exists', async () => {
    const root = tempFolder('cs-local-files-')
    await writeLocalFiles(root, [{ path: 'docker/compose.yaml', content: 'x' }])
    expect(readFileSync(join(root, 'docker', 'compose.yaml'), 'utf8')).toBe('x')
    await expect(
      writeLocalFiles(root, [{ path: 'docker/compose.yaml', content: 'y' }]),
    ).rejects.toThrow()
  })
})

describe('project names, ports and the package root', () => {
  it.each([
    ['', /required/],
    ['a'.repeat(215), /214 characters/],
    ['My App', /lowercase/],
    ['.hidden', /cannot start with "." or "_"/],
    ['-dash', /cannot start with "-"/],
    ['a/b', /cannot contain "\/"/],
    ['café', /only contain letters/],
    ['app.', /cannot end with "."/],
    ['node_modules', /not allowed by npm/],
    ['con', /reserved name on Windows/],
  ])('"%s" is refused', (name, problem) => {
    expect(validateProjectName(name).join(' ')).toMatch(problem)
  })

  it('finds a free port by really listening, and says when none is free', async () => {
    const server = createServer()
    await new Promise<void>((resolve) => server.listen({ host: '127.0.0.1', port: 0 }, resolve))
    const address = server.address()
    const taken = typeof address === 'object' && address !== null ? address.port : 0
    try {
      expect(await isPortFree(taken)).toBe(false)
      expect(await pickFreePort(taken, isPortFree, 5)).not.toBe(taken)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
    await expect(pickFreePort(40_000, async () => false, 3)).rejects.toBeInstanceOf(NoFreePortError)
  })

  it('the package root is this repo (the vendored skeleton lives there)', () => {
    expect(JSON.parse(readFileSync(join(packageRoot(), 'package.json'), 'utf8')).name).toBe(
      'create-strutvane',
    )
    expect(readFileSync(join(packageRoot(), 'skeleton', 'template', 'strut.js'), 'utf8')).toMatch(
      /node strut <command>/,
    )
  })
})
