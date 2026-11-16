// Splice the new question-22 block into the registry and wire the availability helpers.
const fs = require('node:fs')
const path = require('node:path')
const root = process.argv[2]
const f = path.join(root, 'src/question-registry.ts')
let t = fs.readFileSync(f, 'utf8')
const s = t.indexOf('// ── Question 22')
const e = t.indexOf('// ── The registry ──')
if (s < 0 || e < 0) throw new Error('markers not found')
t = t.slice(0, s) + fs.readFileSync(path.join(__dirname, 'q22.ts'), 'utf8') + t.slice(e)
const rep = (a, b) => {
  if (!t.includes(a)) throw new Error(`missing ${a.slice(0, 100)}`)
  t = t.replace(a, b)
}
rep(
  `import {
  type Catalogue,
  type CatalogueEntry,
  findOffered,
  installerCatalogue,
  offeredEntries,
  popularGroups,
} from './catalogue.ts'`,
  `import {
  type Catalogue,
  type CatalogueEntry,
  type FollowUpQuestion,
  findOffered,
  followUpApplies,
  followUpProblem,
  installerCatalogue,
  offeredEntries,
  packageAvailability,
  popularGroups,
  resolveFollowUps,
} from './catalogue.ts'`,
)
rep(
  `    read: () => ({}),
    flagWords: () => [],
    packages: () => [],
    tidy: (answers) => answers,
  }
}`,
  `    read: () => ({}),
    flagWords: () => [],
    packages: () => [],
    tidy: (answers) => answers,
    visible: spec.when,
    availabilityProblem: () => undefined,
    settle: (answers) => answers,
  }
}`,
)
fs.writeFileSync(f, t)
