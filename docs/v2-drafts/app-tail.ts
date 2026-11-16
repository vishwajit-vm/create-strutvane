const HEALTH_TEST = `// A first feature test (Vitest): the health controller answers "ok". Run: npm test
import { describe, expect, it } from 'vitest'
import { HealthController } from '../../app/http/controllers/health.controller.ts'

describe('GET /api/health', () => {
  it('answers ok', () => {
    expect(HealthController.show()).toEqual({ status: 'ok' })
  })
})
`

const BROWSER_TEST = `// Browser test (Playwright). Browsers download on the first: npm run test:e2e
export const homePage = '/'
`
