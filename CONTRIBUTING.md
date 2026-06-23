# Contributing

Thanks for considering a contribution.

## Setup

```bash
git clone https://github.com/Jagganu/context-slim.git
cd context-slim
npm test
```

No build step, no dependencies. `scripts/slim.js` is the entire CLI;
`scripts/test.js` is the entire test suite.

## Before opening a PR

- Run `npm test` and make sure all tests pass.
- If you change `truncateToolOutput` / `stringifyResult`, add a test that
  exercises the real stdin-based path (`tool_name`/`tool_input`/
  `tool_response` JSON piped to `slim capture`), not just the legacy
  `--tool-name` flag path — that's the path Claude Code actually uses.
- If you touch `hooks/hooks.json`, double check field names and the JSON
  output shape against the current [Claude Code hooks
  reference](https://code.claude.com/docs/en/hooks). The schema has changed
  before and isn't guaranteed stable across versions.
- Keep `scripts/slim.js` dependency-free if at all possible.

## Reporting issues

Please include your Claude Code version (`claude --version`) if the issue is
about the plugin/hooks side rather than the standalone CLI — `updatedToolOutput`
behavior for built-in tools depends on it.
