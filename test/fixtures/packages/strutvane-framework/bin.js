#!/usr/bin/env node
// TEST STAND-IN for the framework's `strutvane` program: strut.js runs it with the project as cwd.
import { run } from './cli.js'

process.exitCode = await run(process.argv.slice(2), { root: process.cwd() })
