const fs = require('node:fs')
const f = require('node:path').join(process.argv[2], 'src/args.ts')
let t = fs.readFileSync(f, 'utf8')
const a = `  -v, --version              Show the version
`
if (!t.includes(a)) throw new Error('help anchor')
t = t.replace(a, `  -v, --version              Show the version
  --preview-catalogue        Developer flag: also offer packages that are not released yet
                             (without it, a flag for such a package is refused with its plan)
`)
fs.writeFileSync(f, t)
