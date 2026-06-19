---
name: slim
---

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/slim.js" --hook slim` via Bash
2. Read its stdout carefully — it contains a compressed timeline of all past tool calls and the last verbatim turn
3. Acknowledge to the user how many turns were compressed and that the log was pruned
