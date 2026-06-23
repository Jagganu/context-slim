# context-slim

A small, dependency-free CLI that truncates large command/tool output to a
token budget, plus an optional Claude Code plugin that wires the same
truncation into the `PostToolUse` hook.

## Quick start

Not yet published to npm — install from source:

```bash
git clone https://github.com/Jagganu/context-slim.git
cd context-slim
npm link        # makes the `slim` command available globally
```

Once published, `npm install -g context-slim` will work too.

## CLI

```
slim capture   PostToolUse hook entrypoint (see "Claude Code integration" below)
slim backup    PreCompact hook entrypoint (see "Claude Code integration" below)
slim compact   Compress old conversation turns (reads a JSON array from stdin)
slim pipe      Truncate any command's output (reads raw text from stdin)
slim status    Print a summary of the local capture log, then prune it
slim bench     Run an illustrative token-saving estimate
```

### Pipe mode

The one part of this tool that's fully general-purpose — works with any
command, no Claude Code involved:

```bash
cat huge_file.js | slim pipe
npm test | slim pipe
ls -R | slim          # no subcommand + piped stdin = same as `slim pipe`
```

## Claude Code integration

```
.claude-plugin/plugin.json   # Plugin manifest
hooks/hooks.json             # PostToolUse + PreCompact hook registration
commands/slim.md             # /slim command
```

Clone into your Claude Code plugins directory to enable it.

**What it actually does, precisely:**

- **`PostToolUse` → `slim capture`**: Claude Code sends `{tool_name,
  tool_input, tool_response}` as JSON on stdin after `Bash`, `Read`, `Grep`,
  `Glob`, `WebFetch`, or `WebSearch` calls (see the `matcher` in
  `hooks/hooks.json`). If the result is longer than `SLIM_PREVIEW_MAX`
  (default 600 chars), the hook returns
  `{hookSpecificOutput: {hookEventName: "PostToolUse", updatedToolOutput:
  "<truncated text>"}}`, and Claude Code substitutes that truncated string
  for the tool result in the live conversation.
  - **Requires Claude Code v2.1.121 or later.** On older versions,
    `updatedToolOutput` is only honored for MCP tools, so this hook becomes a
    silent no-op for built-in tools like `Bash` and `Read` — it still logs
    locally, it just won't shrink what Claude sees.
  - Claude Code doesn't publish a fixed schema for `tool_response` per tool,
    so the truncator is schema-agnostic: it prefers an obvious text field
    (`content`, `stdout`, an MCP-style `content` array) if present, and
    falls back to the full JSON otherwise. Nothing is silently skipped just
    because the shape doesn't match a guess.
  - Every captured call (truncated or not) is also logged locally to
    `data/turns.jsonl`, regardless of Claude Code version.

- **`PreCompact` → `slim backup`**: `PreCompact` can only block or allow
  compaction — there is no field for injecting custom replacement content
  into Claude Code's own compaction. This hook does **not** attempt to
  compact the live conversation. It snapshots context-slim's own local
  `data/turns.jsonl` to `data/backups/<timestamp>-<trigger>.jsonl` before
  anything clears it, so your local capture history survives a compaction
  event. That's the full scope of what it does.

- **`/slim` command**: reads back the local capture log and prunes it to the
  most recent entry. This is a bookkeeping tool for *context-slim's own log*
  — it has no effect on Claude Code's actual context window. There is no
  supported mechanism for a plugin to retroactively shrink content Claude
  Code has already sent to the model.

### Manual capture (for testing)

```bash
slim capture \
  --tool-name Read \
  --tool-input '{"file_path":"src/big.js"}' \
  --tool-result '{"content":"lots of code..."}'
```

### Compact mode (standalone)

A generic helper, independent of Claude Code: given a JSON array of
`{role, content}` turns on stdin, replaces everything but the last
`SLIM_VERBATIM_KEEP` turns with a one-line placeholder. Useful if you're
piping your own conversation logs through something and want to budget them
yourself — nothing in this repo currently calls it automatically.

```bash
echo '[...conversation turns...]' | slim compact
```

## Test suite

```
$ npm test
  14 passed, 0 failed, 14 total
```

Covers: pipe truncation, compact summarization, the legacy flag-based
capture path, the real stdin-based capture path Claude Code actually uses
(including truncation output), and the PreCompact backup snapshot.

## Illustrative benchmark

`slim bench` and `slim proof` print **simulated** numbers from hardcoded
example sizes (a hypothetical 500-line file read, a hypothetical 200-line
Bash output, etc.) — they estimate what truncation *would* save on output of
that size, using a ~4-chars/token heuristic. They are not measurements from
a real session, and on Claude Code versions before v2.1.121 the live
`PostToolUse` part of this doesn't apply at all (see above). Treat these as
back-of-envelope sizing, not a benchmark of this tool in production.

```
$ slim bench
  Read file (500 lines)        Before: 3750  After: 38    Saved: 3712
  Bash command (200 lines)     Before: 500   After: 38    Saved: 462
  Grep search (50 matches)     Before: 250   After: 13    Saved: 237
  Compact 10 turns → summary   Before: 2500  After: 8     Saved: 2492
  ─────────────────────────────────────────────────────────────────
  Total:                       23,250 → 338 tokens  (99% reduction)
```

## Env vars

| Variable | Default | Description |
|----------|---------|-------------|
| `SLIM_DATA_DIR` | `./data` | Turn log + backup storage location |
| `SLIM_PREVIEW_MAX` | `600` | Max chars before truncation |
| `SLIM_VERBATIM_KEEP` | `3` | Turns kept verbatim by `slim compact` |

## Files

```
.
├── package.json              # npm package manifest
├── scripts/slim.js           # All logic, zero deps
├── scripts/test.js           # Test suite (14 tests)
├── .claude-plugin/plugin.json
├── hooks/hooks.json
└── commands/slim.md
```

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
