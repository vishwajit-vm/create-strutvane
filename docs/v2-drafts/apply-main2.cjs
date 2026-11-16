const fs = require('node:fs')
const path = require('node:path')
const root = process.argv[2]
const edit = (file, pairs) => {
  const f = path.join(root, file)
  let t = fs.readFileSync(f, 'utf8')
  for (const [a, b] of pairs) {
    if (!t.includes(a)) throw new Error(`${file}: missing ${a.slice(0, 80)}`)
    t = t.replace(a, b)
  }
  fs.writeFileSync(f, t)
}
edit('src/write-files.ts', [
  [
    `/** Put the folder back the way it was`,
    `/**
 * Write a few files into an existing project (a fresh clone's missing \`.env\`, say). Never
 * overwrites: a file that appeared in the meantime makes the write fail instead.
 *
 * @example
 * await writeLocalFiles('C:/code/my-app', [{ path: '.env', content }])
 */
export async function writeLocalFiles(
  directory: string,
  files: readonly GeneratedFile[],
  write: FileWriter = diskWriter,
): Promise<void> {
  for (const file of files) await write(join(directory, file.path), file.content)
}

/** Put the folder back the way it was`,
  ],
])
edit('src/main.ts', [
  [
    `import { type FileWriter, targetProblem, writeProjectFiles } from './write-files.ts'`,
    `import {
  type FileWriter,
  targetProblem,
  writeLocalFiles,
  writeProjectFiles,
} from './write-files.ts'`,
  ],
  [`import { resolve } from 'node:path'`, `import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'`],
  [
    `  const options = projectOptions(state, directory)
  reporter.intro(\`Strutvane \${VERSION}: setting up \${options.name}\`)
  reporter.info(\`Progress from \${statePath(directory)}; finished steps are not run again.\`)
  state = recheckSecrets(state, directory, options, reporter)`,
    `  const options = projectOptions(state, directory)
  reporter.intro(\`Strutvane \${VERSION}: setting up \${options.name}\`)
  if (state.resumeWith.length === 0) {
    // A fresh clone: only strutvane.json (decision #9). This installer resumes from now on.
    reporter.info('No setup progress on this computer: setting up from strutvane.json.')
    state = { ...state, resumeWith: environment.resumeWith }
  } else {
    reporter.info(\`Progress from \${statePath(directory)}; finished steps are not run again.\`)
  }
  if (!(await restoreLocalFiles(options, environment, reporter))) return EXIT.incomplete
  state = recheckSecrets(state, directory, options, reporter)`,
  ],
])
