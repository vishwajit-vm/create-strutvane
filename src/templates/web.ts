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
    appShell(o),
    customPages(),
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

/**
 * `web/app.tsx`: the app shell, written against the API `@strutvane/ui` 0.1.0-next.0 publishes.
 *
 * `@strutvane/ui` has no app shell or router yet: `<StrutvaneProvider>` needs a ready `api`
 * (`createHttpClient`) and an already fetched `manifest` (`fetchManifest`), and `<ResourceList>` /
 * `<ResourceForm>` render one resource each. So the shell loads the manifest, shows a menu of
 * resources (plus the pages in `router.tsx`) and switches between a list and a form.
 *
 * `fetchManifest` resolves the absolute manifest path (`/.well-known/strutvane.json`) against its
 * `baseUrl`, which must therefore be absolute: `VITE_API_URL` is `/api/v1` (same origin) in the
 * full preset, so it is resolved against `window.location.origin` first. The ui preset talks to
 * another origin, so it sends cookies with `credentials: 'include'`.
 */
function appShell(o: ProjectOptions): GeneratedFile {
  const external = !hasServer(o)
  return file(
    'web/app.tsx',
    lines(
      '/**',
      ' * The app shell: loads the API manifest and renders every resource with @strutvane/ui, a list',
      ' * (filters, sorting, paging) and a create / edit form, with no code per model. Override single',
      ' * widgets or cells with <StrutvaneProvider overrides={…}>; add your own screens in router.tsx.',
      ' */',
      "import { createHttpClient, fetchManifest } from '@strutvane/ui'",
      "import { ResourceForm, ResourceList, StrutvaneProvider } from '@strutvane/ui/react'",
      "import { QueryClient } from '@tanstack/react-query'",
      "import { useEffect, useState } from 'react'",
      "import { pages } from './router.tsx'",
      '',
      'type Manifest = Awaited<ReturnType<typeof fetchManifest>>',
      "type Resource = Manifest['resources'][number]",
      '',
      '/** What the main area shows. */',
      'type View =',
      "  | { readonly kind: 'list'; readonly resource: Resource }",
      "  | { readonly kind: 'form'; readonly resource: Resource; readonly recordId?: string }",
      "  | { readonly kind: 'page'; readonly index: number }",
      '',
      external
        ? '/** The API runs on another origin (absolute VITE_API_URL); cookies are sent to it. */'
        : '/** VITE_API_URL is relative (`/api/v1`, served with the UI): make it absolute. */',
      'const apiUrl = new URL(import.meta.env.VITE_API_URL, window.location.origin).href',
      external
        ? "const api = createHttpClient({ baseUrl: apiUrl, credentials: 'include' })"
        : 'const api = createHttpClient({ baseUrl: apiUrl })',
      'const queryClient = new QueryClient()',
      '',
      'export function App() {',
      '  const [manifest, setManifest] = useState<Manifest>()',
      '  const [error, setError] = useState<string>()',
      '',
      '  useEffect(() => {',
      '    const controller = new AbortController()',
      external
        ? "    fetchManifest({ baseUrl: apiUrl, signal: controller.signal, credentials: 'include' }).then("
        : '    fetchManifest({ baseUrl: apiUrl, signal: controller.signal }).then(',
      '      setManifest,',
      '      (cause: unknown) => {',
      '        if (!controller.signal.aborted)',
      '          setError(cause instanceof Error ? cause.message : String(cause))',
      '      },',
      '    )',
      '    return () => controller.abort()',
      '  }, [])',
      '',
      '  return (',
      '    <main className="sv-shell">',
      '      <h1>{import.meta.env.VITE_APP_NAME}</h1>',
      '      {error !== undefined ? (',
      '        <p role="alert">Could not load the API manifest: {error}</p>',
      '      ) : manifest === undefined ? (',
      '        <p>Loading…</p>',
      '      ) : (',
      '        <StrutvaneProvider api={api} manifest={manifest} queryClient={queryClient}>',
      '          <Workspace resources={manifest.resources} />',
      '        </StrutvaneProvider>',
      '      )}',
      '    </main>',
      '  )',
      '}',
      '',
      'function Workspace({ resources }: { readonly resources: readonly Resource[] }) {',
      '  const first = resources[0]',
      "  const [view, setView] = useState<View | undefined>(first && { kind: 'list', resource: first })",
      '',
      '  return (',
      '    <>',
      '      <nav aria-label="Menu">',
      '        {resources.map((resource) => (',
      '          <button',
      '            key={resource.name}',
      '            type="button"',
      "            onClick={() => setView({ kind: 'list', resource })}",
      '          >',
      '            {resource.pluralLabel}',
      '          </button>',
      '        ))}',
      '        {pages.map((page, index) => (',
      '          <button key={page.title} type="button" onClick={() => setView({ kind: \'page\', index })}>',
      '            {page.title}',
      '          </button>',
      '        ))}',
      '      </nav>',
      '      {view === undefined ? (',
      external
        ? '        <p>The API manifest lists no resources yet.</p>'
        : [
            '        <p>',
            `          Add your first resource: <code>${svCommand(o.packageManager, 'make:model Invoice')}</code>`,
            '        </p>',
          ].join('\n'),
      "      ) : view.kind === 'page' ? (",
      '        pages[view.index]?.element',
      "      ) : view.kind === 'form' ? (",
      '        <ResourceForm',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: JSX source text, not a JS template
      "          key={`${view.resource.name}:${view.recordId ?? 'new'}`}",
      '          resource={view.resource}',
      '          {...(view.recordId === undefined ? {} : { recordId: view.recordId })}',
      "          onSaved={() => setView({ kind: 'list', resource: view.resource })}",
      "          onCancel={() => setView({ kind: 'list', resource: view.resource })}",
      '        />',
      '      ) : (',
      '        <ResourceList',
      '          key={view.resource.name}',
      '          resource={view.resource}',
      "          onCreate={() => setView({ kind: 'form', resource: view.resource })}",
      '          onEdit={(record) =>',
      "            setView({ kind: 'form', resource: view.resource, recordId: record.id })",
      '          }',
      '        />',
      '      )}',
      '    </>',
      '  )',
      '}',
    ),
  )
}

/**
 * `web/router.tsx`: the app's own screens, shown in the menu next to the resources. A plain list,
 * because `@strutvane/ui` 0.1.0-next.0 has no router or route type (`RouteDefinition` does not
 * exist); swap it for a router once you need URLs.
 */
function customPages(): GeneratedFile {
  return file(
    'web/router.tsx',
    lines(
      '/**',
      ' * Your own screens, shown in the menu next to the resources, e.g.',
      " * { title: 'Reports', element: <Reports /> }. Resource lists and forms need no entry here.",
      ' */',
      "import type { ReactNode } from 'react'",
      '',
      'export interface CustomPage {',
      '  readonly title: string',
      '  readonly element: ReactNode',
      '}',
      '',
      'export const pages: readonly CustomPage[] = []',
    ),
  )
}
