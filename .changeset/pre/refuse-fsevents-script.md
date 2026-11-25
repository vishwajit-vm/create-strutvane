---
"create-strutvane": patch
---

Generated apps work on macOS with scripts switched on: their package.json `allowScripts` now refuses `fsevents`' install script (`"fsevents": false`). Vite and Vitest pull in fsevents on macOS, and under the app's `strict-allow-scripts` every rebuild with scripts on (the installer's `npm rebuild` of approved packages, or a developer's) failed with ESTRICTALLOWSCRIPTS. The refusal is name-only, as `npm deny-scripts` writes it, so it keeps covering fsevents when Vite moves to a newer version; fsevents ships its binary prebuilt, so nothing is lost.
