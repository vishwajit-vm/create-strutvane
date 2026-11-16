// Production Dockerfile (#7 logging, no stubs), .dockerignore (#111), /up answers JSON (#45),
// and "no sign-in" brings no auth package (#107).
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
    `        label: 'No sign-in (the API then requires API tokens)',
        packages: ['@strutvane/auth'],`,
    `        // No sign-in means no auth package (decision #107); the API stays closed with tokens.
        label: 'No sign-in (the API then requires API tokens)',`,
  ],
])
edit('src/templates/workflow-files.ts', [
  [
    'The app answers \\`GET /up\\` with "up" for health checks.`',
    'The app answers \\`GET /up\\` with \\`{"status":"ok"}\\` for health checks.`',
  ],
  [
    `COPY package.json package-lock.json .npmrc ./
# Spike only: the local stand-ins for the @strutvane packages (the release installs from npm).
COPY stubs/ ./stubs/
RUN npm ci --ignore-scripts`,
    `COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts`,
  ],
  [
    `COPY package.json package-lock.json .npmrc ./
COPY stubs/ ./stubs/
RUN npm ci --omit=dev --ignore-scripts`,
    `COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --ignore-scripts`,
  ],
  [
    `ENV NODE_ENV=production
`,
    `ENV NODE_ENV=production
# Logs go to stderr as JSON lines, where container platforms collect them (ADR-0022, decision #7).
ENV LOG_CHANNEL=stderr
ENV LOG_FORMAT=json
`,
  ],
  [`COPY --from=deps /app/stubs ./stubs
`, ''],
  [
    `.strutvane/
`,
    `.strutvane/local/
`,
  ],
])
