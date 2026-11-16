/**
 * The two reporters: plain lines (CI, pipes) and the terminal one (clack's look, its own spinner
 * that leaves Ctrl+C to the foreground process group).
 */
import { describe, expect, it } from 'vitest'
import { clackReporter, formatDuration, plainReporter } from '../src/reporter.ts'

describe('durations', () => {
  it.each([
    [12.4, '12ms'],
    [1500, '1.5s'],
    [125_000, '2m 5s'],
  ])('%d ms → %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text)
  })
})

describe('plain reporter', () => {
  it('writes one line per event, with the step duration', () => {
    let out = ''
    let clock = 0
    const reporter = plainReporter(
      (text) => {
        out += text
      },
      () => clock,
    )
    reporter.intro('Title')
    const step = reporter.step('Installing')
    clock = 2500
    step.done('Installed')
    reporter.step('Git').skipped('git was not found')
    reporter.step('Migrate').failed('Migrations failed')
    reporter.info('note')
    reporter.warn('careful')
    reporter.error('broken')
    reporter.box('Ready', ['App  http://localhost:3000'])
    reporter.outro('Done')
    expect(out).toContain('… Installing')
    expect(out).toContain('✔ Installed  2.5s')
    expect(out).toContain('○ git was not found')
    expect(out).toContain('✖ Migrations failed')
    expect(out).toMatch(/│ note\n▲ careful\n✖ broken/)
    expect(out).toMatch(/── Ready ─+\n {3}App {2}http:\/\/localhost:3000\n─{64}/)
    expect(out).toContain('\nDone\n')
  })
})

describe('terminal reporter', () => {
  it('draws its spinner on the given output and clears it when a step ends', () => {
    let drawn = ''
    const sink = {
      write: (text: string) => {
        drawn += text
        return true
      },
    }
    const exits: number[] = []
    const before = process.listenerCount('SIGINT')
    const reporter = clackReporter(
      () => 0,
      (code) => exits.push(code),
      sink,
    )
    reporter.intro('Title')
    reporter.step('Installing').done('Installed')
    reporter.step('Git').skipped('no git')
    reporter.step('Migrate').failed('failed')
    reporter.info('info')
    reporter.warn('warn')
    reporter.error('error')
    reporter.box('Ready', ['line'])
    reporter.outro('Done')
    expect(drawn).toContain('Installing')
    expect(drawn).toContain('\r\u001b[2K')
    expect(exits).toEqual([])
    // Every step removed its signal handlers again.
    expect(process.listenerCount('SIGINT')).toBe(before)
  })

  it('Ctrl+C during a step stops with exit code 130 and says how to continue', () => {
    const exits: number[] = []
    const reporter = clackReporter(
      () => 0,
      (code) => exits.push(code),
      { write: () => true },
    )
    const before = process.listeners('SIGINT')
    reporter.step('Installing')
    // Call the handler the step added (emitting a real SIGINT would also reach the test runner).
    const added = process.listeners('SIGINT').filter((listener) => !before.includes(listener))
    expect(added).toHaveLength(1)
    for (const listener of added) (listener as () => void)()
    expect(exits).toEqual([130])
    expect(process.listeners('SIGINT')).toEqual(before)
  })
})
