---
"create-strutvane": patch
---

Setup no longer crashes when a program exits before reading its input: on Linux, `npm run setup` could die with `write EPIPE` at the git step (`git --version` exits at once). Programs that get no input now start with an empty stdin, and a failed write is logged, not fatal. Docker in "Windows containers" mode (Docker Desktop switched to Windows containers, or Windows Server) is no longer treated as usable: Docker mode is not offered as the default there, and an explicit `--docker` stops with exit 2 and how to switch to Linux containers, instead of failing at `compose up` with "no matching manifest".
