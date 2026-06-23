---
name: slim
description: Show a summary of tool calls context-slim has recorded locally, and prune that local log. Does not shrink Claude Code's own conversation context.
---

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/slim.js" status` via Bash
2. Read its stdout — a summary of tool calls context-slim has captured in its own local log (`data/turns.jsonl`), one line per call
3. Tell the user how many turns were logged and that the local log was pruned to the most recent entry

Note: this only affects context-slim's own bookkeeping file on disk. Claude Code's own conversation history and context window are unaffected — there is no supported way for a plugin to rewrite already-sent context.
