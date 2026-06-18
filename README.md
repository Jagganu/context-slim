# context-slim

A Claude Code plugin that reduces AI token usage by truncating large tool outputs and compacting old conversation turns.

## How it saves tokens

| Mechanism | When | Impact |
|-----------|------|--------|
| **Output truncation** | After every Read/Bash/Grep/WebFetch call | Large files (15K+ tokens) → ~50 tokens |
| **Conversation compaction** | Before context window compaction | Old turns condensed to `[slim: ...]` one-liners |
| **Emergency trim** | `/slim` command | Keeps only 1 turn verbatim |

## Install

```bash
# Clone into your Claude Code plugins directory
git clone https://github.com/YOUR_USER/context-slim.git
```

Or copy the `context-slim/` folder into your Claude Code plugins path.

## Files

```
context-slim/
├── .claude-plugin/plugin.json   # Plugin manifest
├── hooks/hooks.json             # Auto-firing hooks
├── commands/slim.md             # /slim command
└── scripts/slim.js              # All logic (150 lines, zero deps)
```

## Usage

No setup needed. Hooks fire automatically:
- **PostToolUse** — truncates large outputs, records tool calls to `data/turns.jsonl`
- **PreCompact** — compresses old conversation turns into summaries

Manual: type `/slim` in Claude Code for emergency context trim.

## License

MIT
