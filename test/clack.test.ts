/**
 * The thin `@clack/prompts` adapters (prompter and UI), with clack mocked: answers pass through,
 * clack's cancel symbol becomes our CANCEL, and validation reaches clack.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'

const clackCancel = Symbol('clack-cancel')
const mock = vi.hoisted(() => ({
  text: vi.fn(),
  select: vi.fn(),
  multiselect: vi.fn(),
  confirm: vi.fn(),
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}))

vi.mock('@clack/prompts', () => ({
  ...mock,
  isCancel: (value: unknown) => value === clackCancel,
}))

const { clackPrompter, CANCEL } = await import('../src/prompts.ts')
const { clackUi } = await import('../src/main.ts')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('clackPrompter', () => {
  test('text passes validation through and returns the answer', async () => {
    mock.text.mockResolvedValue('acme')
    const validate = vi.fn((v: string) => (v === '' ? 'required' : undefined))
    expect(await clackPrompter.text({ message: 'Name', placeholder: 'acme', validate })).toBe(
      'acme',
    )
    const call = mock.text.mock.calls[0]?.[0] as { validate: (v: string | undefined) => unknown }
    const passed = call.validate
    expect(passed(undefined)).toBe('required')
    expect(passed('x')).toBeUndefined()
  })

  test('select and multiselect map options (hints only when present)', async () => {
    mock.select.mockResolvedValue('api')
    mock.multiselect.mockResolvedValue(['email'])
    const options = [
      { value: 'api', label: 'API', hint: 'REST' },
      { value: 'ui', label: 'UI' },
    ] as const
    expect(await clackPrompter.select({ message: 'Preset', options, initialValue: 'api' })).toBe(
      'api',
    )
    expect(
      await clackPrompter.multiselect({ message: 'Auth', options, initialValues: ['api'] }),
    ).toEqual(['email'])
    expect(mock.select.mock.calls[0]?.[0]).toMatchObject({
      options: [
        { value: 'api', label: 'API', hint: 'REST' },
        { value: 'ui', label: 'UI' },
      ],
    })
    expect(mock.multiselect.mock.calls[0]?.[0]).toMatchObject({
      required: false,
      initialValues: ['api'],
    })
  })

  test('confirm returns the answer', async () => {
    mock.confirm.mockResolvedValue(true)
    expect(await clackPrompter.confirm({ message: 'Git?', initialValue: true })).toBe(true)
  })

  test("clack's cancel becomes CANCEL for every question type", async () => {
    for (const fn of [mock.text, mock.select, mock.multiselect, mock.confirm])
      fn.mockResolvedValue(clackCancel)
    expect(
      await clackPrompter.text({ message: 'm', placeholder: 'p', validate: () => undefined }),
    ).toBe(CANCEL)
    expect(
      await clackPrompter.select({
        message: 'm',
        options: [{ value: 'a', label: 'A' }],
        initialValue: 'a',
      }),
    ).toBe(CANCEL)
    expect(
      await clackPrompter.multiselect({
        message: 'm',
        options: [{ value: 'a', label: 'A' }],
        initialValues: [],
      }),
    ).toBe(CANCEL)
    expect(await clackPrompter.confirm({ message: 'm', initialValue: false })).toBe(CANCEL)
  })
})

describe('clackUi', () => {
  test('routes every message to clack, and print to stdout', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    clackUi.intro('i')
    clackUi.info('a')
    clackUi.warn('b')
    clackUi.error('c')
    clackUi.success('d')
    clackUi.note('body', 'title')
    clackUi.outro('o')
    clackUi.print('plain')
    expect(mock.intro).toHaveBeenCalledWith('i')
    expect(mock.log.info).toHaveBeenCalledWith('a')
    expect(mock.log.warn).toHaveBeenCalledWith('b')
    expect(mock.log.error).toHaveBeenCalledWith('c')
    expect(mock.log.success).toHaveBeenCalledWith('d')
    expect(mock.note).toHaveBeenCalledWith('body', 'title')
    expect(mock.outro).toHaveBeenCalledWith('o')
    expect(write).toHaveBeenCalledWith('plain\n')
  })
})
