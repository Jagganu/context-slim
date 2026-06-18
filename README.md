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

## Proof: empirical token savings

Run `slim proof` — simulates a real 10-call AI coding session and measures tokens at each stage:

```
$ slim proof
  Turn  | Tool/File               | Raw tok | Capture tok | Compact tok
  ------+--------------------------+---------+-------------+------------
  1     | Read src/app.js (600 l) |    2000 |         163 |           8
  2     | Read src/utils.js (900) |    3000 |         163 |           8
  3     | Bash npm test (400 lin) |    1250 |         163 |           8
  4     | Grep TODO search (60 m) |     750 |          30 |           8
  5     | Read Header.jsx (450 l) |    1500 |         163 |           8
  6     | Read styles.css (1100 ) |    3750 |         163 |           8
  7     | Bash node build.js (550 |    1750 |         163 |           8
  8     | Grep export search (40) |     500 |          30 |          30
  9     | Read README.md (300 li) |    1000 |         163 |         163
  10    | Bash git status (250 l) |     750 |         163 |         163
  ------+--------------------------+---------+-------------+------------
  Total |                          |   16250 |        1364 |         412

Stage 1: Capture mode truncates tool output to 600 chars
  16,250 → 1,364 tokens  (92% reduction)
Stage 2: Compact mode replaces old turns with summaries
  1,364 → 412 tokens  (70% from capture, 97% from original)
Total saved: 15,838 tokens per session (97%)

At $0.15/M input tokens: $0.0024 → $0.0001 per session
Over 1000 sessions: $2.38 saved
```

Per-turn breakdown of what capture mode saves on a single large read:

| Tool call | Raw | Slimmed | Saved |
|-----------|-----|---------|-------|
| Read a 900-line file | 3,000 tok | 163 tok | **2,837 tok** |
| Read a 1100-line CSS | 3,750 tok | 163 tok | **3,587 tok** |
| Bash with 400-line output | 1,250 tok | 163 tok | **1,087 tok** |
| Grep with 60 matches | 750 tok | 30 tok | **720 tok** |

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
