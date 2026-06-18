# context-slim

Universal CLI tool that reduces AI token usage by truncating large outputs, compacting old conversation turns, and piping any command output through a token budget.

## Quick start

```bash
# Install globally
npm install -g context-slim

# Or run directly
npx context-slim
```

## CLI

```
slim capture  --tool-name <name> --tool-input <json> --tool-result <json>
slim compact   ✂️  Compress old conversation turns (reads JSON from stdin)
slim pipe      ✂️  Truncate any command output (reads raw text from stdin)
slim status    📊  Print turn log summary (also cleans old turns)
```

### Pipe mode

```bash
# Truncate any command output to SLIM_PREVIEW_MAX (default 600) chars
cat huge_file.js | slim pipe
npm test | slim pipe
ls -R | slim
```

If no subcommand is given and stdin is a pipe, pipe mode activates automatically.

### Capture mode

Records tool calls and truncates large Read/Bash/Grep/WebFetch responses:

```bash
slim capture \
  --tool-name Read \
  --tool-input '{"file_path":"src/big.js"}' \
  --tool-result '{"content":"lots of code..."}'
```

### Compact mode

Replaces old conversation turns with a summary:

```bash
echo '[...conversation turns...]' | slim compact
```

Keeps the last `SLIM_VERBATIM_KEEP` (default 3) turns intact.

## Env vars

| Variable | Default | Description |
|----------|---------|-------------|
| `SLIM_DATA_DIR` | `./data` | Turn log storage location |
| `SLIM_PREVIEW_MAX` | `600` | Max chars before truncation |
| `SLIM_VERBATIM_KEEP` | `3` | Conversation turns to keep verbatim |

## Claude Code integration

context-slim started as a Claude Code plugin and the adapter files remain:

```
.claude-plugin/plugin.json   # Plugin manifest
hooks/hooks.json             # Auto-firing hooks
commands/slim.md             # /slim command
```

Install by cloning into your Claude Code plugins directory.

## Files

```
.
├── package.json              # npm package manifest
├── scripts/slim.js           # All logic (~170 lines, zero deps)
├── .claude-plugin/plugin.json
├── hooks/hooks.json
└── commands/slim.md
```

## License

MIT
