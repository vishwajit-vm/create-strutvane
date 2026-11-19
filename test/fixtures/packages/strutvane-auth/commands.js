// TEST STAND-IN for @strutvane/auth's CLI commands (package.json `strutvane.commands`), in the
// framework CLI's command shape. Only `auth:migration`, the one the installer runs.
import { join } from 'node:path'
import { copyAuthMigrations } from './index.js'

const commands = [
  {
    name: 'auth:migration',
    description: 'Copy the auth migrations into database/migrations (then run node strut migrate)',
    async run(ctx) {
      const { root } = ctx.requireProject()
      const { copied, present } = copyAuthMigrations(join(root, 'database', 'migrations'))
      for (const file of copied) ctx.out.success(`Copied database/migrations/${file}`)
      if (present.length > 0)
        ctx.out.info(`Already there (left as they are): ${present.join(', ')}`)
      return { exitCode: 0 }
    },
  },
]

export default commands
