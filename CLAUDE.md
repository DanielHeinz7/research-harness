# Ground rules for Claude Code sessions

These rules hold in every Claude Code session in this repository. They matter most in cloud
sessions (`claude --cloud`, claude.ai/code, routines): those load this file from the clone, but
not the instructions the person running the session keeps in `~/.claude/CLAUDE.md`.

- Nothing is sent in the name of the person running the session unless they asked for that
  specific message. This covers email, chat messages, posts, issue and pull request comments,
  and releases. Email is written as a draft; the person sends it.
- Credentials never appear on a command line, in a script, in a file in this repository, or in a
  commit. A transcript keeps whatever was typed, so a key that shows up there has to be replaced.
  If a task needs a credential the session does not have, stop and say so.
- Do not create routines (`/schedule`) that use the Slack or Gmail connector. Routines get the
  account's connectors by default and act without asking.
