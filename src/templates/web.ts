/**
 * The `web/` folder (full and ui presets): a small Vite + React shell around `@strutvane/ui`.
 * Pages for every model are generated automatically from the API's manifest; files here are only
 * for what you customise (docs/08, ADR-0014).
 *
 * @module
 */
import type { GeneratedFile } from '@strutvane/devkit'
import { hasServer, hasWeb, type ProjectOptions } from '../options.ts'
import { svCommand } from '../package-manager.ts'
import { file, json, lines } from './util.ts'

/** Every file under `web/` plus `vite.config.ts`. Empty for the api preset. */
export function webFiles(o: ProjectOptions): GeneratedFile[] {
  if (!hasWeb(o)) return []
  const sv = (args: string) => svCommand(o.packageManager, args)
  const external = !hasServer(o)
  return [
    file(
      'vite.config.ts',
      lines(
        '/**',
        external
          ? ' * Vite dev server and build for this UI. API calls go straight to VITE_API_URL.'
          : ' * Vite config for the UI. In development `sv dev` serves the API and the UI on one port.',
        ' */',
        "import react from '@vitejs/plugin-react'",
        "import { defineConfig } from 'vite'",
        '',
        'export default defineConfig({',
        "  root: 'web',",
        "  envDir: '..',",
        '  plugins: [react()],',
        "  build: { outDir: '../dist/web', emptyOutDir: true },",
        '})',
      ),
    ),
    file(
      'web/tsconfig.json',
      json({
        compilerOptions: {
          target: 'ES2024',
          lib: ['ES2024', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'react-jsx',
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
          verbatimModuleSyntax: true,
          allowImportingTsExtensions: true,
          types: ['vite/client'],
          skipLibCheck: true,
          noEmit: true,
        },
        include: ['.'],
      }),
    ),
    file(
      'web/index.html',
      lines(
        '<!doctype html>',
        '<html lang="en">',
        '  <head>',
        '    <meta charset="UTF-8" />',
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        `    <title>${o.name}</title>`,
        '  </head>',
        '  <body>',
        '    <div id="root"></div>',
        '    <script type="module" src="./main.tsx"></script>',
        '  </body>',
        '</html>',
      ),
    ),
    file(
      'web/main.tsx',
      lines(
        "import { StrictMode } from 'react'",
        "import { createRoot } from 'react-dom/client'",
        "import { App } from './app.tsx'",
        "import './theme/tokens.css'",
        '',
        "const root = document.getElementById('root')",
        "if (!root) throw new Error('Missing #root element in web/index.html')",
        '',
        'createRoot(root).render(',
        '  <StrictMode>',
        '    <App />',
        '  </StrictMode>,',
        ')',
      ),
    ),
    file(
      'web/app.tsx',
      lines(
        '/**',
        ' * The app shell. <StrutvaneProvider> loads the API manifest, so every resource gets its list,',
        ' * form and detail pages without code. Override single pages in web/pages/<resource>/.',
        ' */',
        "import { StrutvaneProvider } from '@strutvane/ui/react'",
        "import { routes } from './router.tsx'",
        '',
        !external && `const firstStep = '${sv('make:model Invoice')}'`,
        !external && '',
        'export function App() {',
        '  return (',
        '    <StrutvaneProvider apiUrl={import.meta.env.VITE_API_URL} routes={routes}>',
        '      <main className="sv-shell">',
        '        <h1>{import.meta.env.VITE_APP_NAME}</h1>',
        external
          ? '        <p>Connected to your API. Resources from its manifest appear in the menu.</p>'
          : [
              '        <p>',
              '          Add your first resource: <code>{firstStep}</code>',
              '        </p>',
            ].join('\n'),
        '      </main>',
        '    </StrutvaneProvider>',
        '  )',
        '}',
      ),
    ),
    file(
      'web/router.tsx',
      lines(
        '/**',
        ' * Your own pages. Resource pages (list, create, edit, detail) are routed automatically;',
        ' * add only extra screens here, e.g. { path: "/reports", element: <Reports /> }.',
        ' */',
        "import type { RouteDefinition } from '@strutvane/ui/react'",
        '',
        'export const routes: RouteDefinition[] = []',
      ),
    ),
    file(
      'web/dashboard/README.md',
      lines(
        '# Dashboard',
        '',
        'Widgets for the home dashboard (counts, charts, recent records). Each file exports one widget;',
        'the default dashboard shows a card per resource until you add your own.',
      ),
    ),
    file(
      'web/theme/tokens.css',
      lines(
        '/* Design tokens: change these to re-theme every generated screen. */',
        ':root {',
        '  --sv-color-primary: #1f3a5f;',
        '  --sv-color-accent: #f5a524;',
        '  --sv-radius: 8px;',
        '  --sv-font: system-ui, -apple-system, "Segoe UI", sans-serif;',
        '  color-scheme: light dark;',
        '  font-family: var(--sv-font);',
        '}',
        '',
        '.sv-shell {',
        '  max-width: 72rem;',
        '  margin: 0 auto;',
        '  padding: 2rem 1rem;',
        '}',
      ),
    ),
    file(
      'web/pages/README.md',
      lines(
        '# Page overrides',
        '',
        'Every resource already has list, form and detail pages. To customise one, add a file here:',
        '',
        '- `web/pages/invoices/columns.tsx`: override single list columns',
        '- `web/pages/invoices/form.tsx`: override the form',
        '',
        `For the full source of a page, eject it: \`${sv('eject ui Invoice --page form')}\`.`,
      ),
    ),
    file(
      'web/components/ui/README.md',
      lines(
        '# UI components',
        '',
        'Components copied into your app from the Strutvane UI registry: they are yours to edit.',
        `Add one with \`${sv('ui:add <component>')}\`.`,
      ),
    ),
    file(
      'web/layouts/README.md',
      lines(
        '# Layouts',
        '',
        'Page layouts (sidebar, top bar, auth screens). Override the defaults here.',
      ),
    ),
    ...(external
      ? [
          file(
            'web/ui.resources.ts',
            lines(
              '/**',
              ' * Fine-tune how the UI understands the external API: labels, hidden fields, widgets.',
              " * Resources are inferred from the API's OpenAPI document; anything here overrides that.",
              ' */',
              'export default {',
              "  // invoices: { label: 'Invoices', fields: { internalNotes: { hidden: true } } },",
              '}',
            ),
          ),
        ]
      : []),
  ]
}
