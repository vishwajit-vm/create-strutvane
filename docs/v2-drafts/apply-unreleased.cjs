// --help: flag usages show the released choices; the flags that wait for a package are listed
// apart, with their plan (decisions #3, #108, #109).
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
edit('src/question-registry.ts', [
  [
    `  settle(answers: Answers): Answers
}`,
    `  settle(answers: Answers): Answers
  /**
   * The flag forms that need a package that is not released yet (\`--cache-store redis\`), for
   * \`--help\`. Omitted by questions that bring no package.
   */
  unreleased?(answers: Answers): readonly string[]
}`,
  ],
  [
    `          usage: \`--\${spec.flag} \${choices()
            .map((c) => c.value)
            .join('|')}\`,`,
    `          // The released choices; the others are listed apart in --help (unreleased()).
          usage: \`--\${spec.flag} \${available({})
            .map((c) => c.value)
            .join('|')}\`,`,
  ],
  [
    `    settle: (answers) => {
      if (allAvailable(effective(answers).packages, answers)) return answers
      const first = available(answers)[0]
      return first === undefined ? answers : put(answers, id, first.value)
    },
  }
}`,
    `    settle: (answers) => {
      if (allAvailable(effective(answers).packages, answers)) return answers
      const first = available(answers)[0]
      return first === undefined ? answers : put(answers, id, first.value)
    },
    unreleased: (answers) =>
      choices()
        .filter((choice) => !allAvailable(choice.packages, answers))
        .map((choice) => \`--\${spec.flag} \${choice.value}\`),
  }
}`,
  ],
  [
    `    settle: (answers) =>
      effective(answers) && !yesAvailable(answers) ? put(answers, id, false) : answers,
  }
}`,
    `    settle: (answers) =>
      effective(answers) && !yesAvailable(answers) ? put(answers, id, false) : answers,
    unreleased: (answers) => (yesAvailable(answers) ? [] : [\`--\${spec.flag}\`]),
  }
}`,
  ],
  [
    `    settle: (answers) => {
      const kept = effective(answers).filter((value) => allAvailable(packagesOf(value), answers))
      return kept.length === effective(answers).length ? answers : put(answers, id, kept)
    },
  }
}`,
    `    settle: (answers) => {
      const kept = effective(answers).filter((value) => allAvailable(packagesOf(value), answers))
      return kept.length === effective(answers).length ? answers : put(answers, id, kept)
    },
    unreleased: (answers) =>
      spec.choices
        .filter((choice) => !allAvailable(choice.packages, answers))
        .map((choice) => \`--\${spec.flag} \${choice.value}\`),
  }
}`,
  ],
  [
    `  // A listed package that is not released is refused at the flags already (#109); unknown ids`,
    `  unreleased: (answers) => (offeredFor(answers).length === 0 ? ['--features <id>'] : []),
  // A listed package that is not released is refused at the flags already (#109); unknown ids`,
  ],
])
edit('src/args.ts', [
  [
    `  const secrets = QUESTIONS.filter((q) => q.secretEnv !== undefined)`,
    `  // Flags whose packages are not released yet (decisions #3, #109), straight from the registry.
  const waiting = QUESTIONS.flatMap((q) => q.unreleased?.({}) ?? [])
  const unreleased =
    waiting.length === 0
      ? ''
      : \`Not released yet (refused with their plan; try them with --preview-catalogue):\\n\${wrap(waiting.join(', '))}\\n\\n\`
  const secrets = QUESTIONS.filter((q) => q.secretEnv !== undefined)`,
  ],
  [
    `\${groups.join('\\n')}
Secrets are never flags`,
    `\${groups.join('\\n')}
\${unreleased}Secrets are never flags`,
  ],
  [
    `/** One \`--help\` line: the flag, what it does, and its default (long flags wrap). */`,
    `/** Wrap a comma list at 96 columns, indented by two spaces. */
function wrap(text: string): string {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line !== '' && line.length + word.length + 1 > 94) {
      lines.push(\`  \${line}\`)
      line = word
    } else {
      line = line === '' ? word : \`\${line} \${word}\`
    }
  }
  if (line !== '') lines.push(\`  \${line}\`)
  return lines.join('\\n')
}

/** One \`--help\` line: the flag, what it does, and its default (long flags wrap). */`,
  ],
])
