# context-slim

Universal CLI tool that reduces AI token usage — truncates large outputs, compacts old conversation turns, pipes any command through a token budget.

## Quick start

```bash
npm install -g context-slim
npx context-slim
```

## CLI

```
slim capture  --tool-name <name> --tool-input <json> --tool-result <json>
slim compact   ✂️  Compress old conversation turns (reads JSON from stdin)
slim pipe      ✂️  Truncate any command output (reads raw text from stdin)
slim status    📊  Print turn log summary (also cleans old turns)
slim bench     📈  Run token-saving benchmark
```

### Pipe mode

```bash
cat huge_file.js | slim pipe
npm test | slim pipe
ls -R | slim          # auto-detects piped stdin
```

### Capture mode

Records tool calls and truncates large Read/Bash/Grep/WebFetch responses:

```bash
slim capture \
  --tool-name Read \
  --tool-input '{"file_path":"src/big.js"}' \
  --tool-result '{"content":"lots of code..."}'
```

### Compact mode

Replaces old conversation turns with a summary. Keeps last 3 verbatim.

```bash
echo '[...conversation turns...]' | slim compact
```

## Benchmark

```
$ slim bench
  Read file (500 lines)        Before: 3750  After: 38    Saved: 3712
  Bash command (200 lines)     Before: 500   After: 38    Saved: 462
  Grep search (50 matches)     Before: 250   After: 13    Saved: 237
  Compact 10 turns → summary   Before: 2500  After: 8     Saved: 2492
  ─────────────────────────────────────────────────────────────────
  Total:                       23,250 → 338 tokens  (99% reduction)
```

## Test suite

```
$ node scripts/test.js
  11 passed, 0 failed, 11 total

  ✓ status on empty log          ✓ compact passthrough (2 turns)
  ✓ unknown subcommand usage     ✓ compact invalid JSON passthrough
  ✓ pipe passthrough (short)     ✓ capture logs a turn
  ✓ pipe truncation (long)       ✓ --hook backward compat
  ✓ compact 6 turns to 4         ✓ auto-pipe from stdin
                                 ✓ bench runs without error
```

## Env vars

| Variable | Default | Description |
|----------|---------|-------------|
| `SLIM_DATA_DIR` | `./data` | Turn log storage location |
| `SLIM_PREVIEW_MAX` | `600` | Max chars before truncation |
| `SLIM_VERBATIM_KEEP` | `3` | Conversation turns to keep verbatim |

## Claude Code integration

Adapter files for Claude Code plugin remain:

```
.claude-plugin/plugin.json   # Plugin manifest
hooks/hooks.json             # Auto-firing hooks (PostToolUse, PreCompact)
commands/slim.md             # /slim command
```

Clone into your Claude Code plugins directory.

## Files

```
.
├── package.json              # npm package manifest
├── scripts/slim.js           # All logic (~200 lines, zero deps)
├── scripts/test.js           # Test suite (11 tests)
├── .claude-plugin/plugin.json
├── hooks/hooks.json
└── commands/slim.md
```

## License

MIT
