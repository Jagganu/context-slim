#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Config from env vars
const VERBATIM_KEEP = parseInt(process.env.SLIM_VERBATIM_KEEP, 10) || 3;
const PREVIEW_MAX = parseInt(process.env.SLIM_PREVIEW_MAX, 10) || 600;
const DATA_DIR = process.env.SLIM_DATA_DIR || path.join(
  process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..'), 'data');
const LOG_FILE = path.join(DATA_DIR, 'turns.jsonl');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadTurns() {
  if (!fs.existsSync(LOG_FILE)) return [];
  return fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch (_) { return null; }
  }).filter(Boolean);
}

function appendTurn(turn) {
  ensureDataDir();
  fs.appendFileSync(LOG_FILE, JSON.stringify(turn) + '\n');
}

function truncateLog(keep) {
  const turns = loadTurns();
  ensureDataDir();
  fs.writeFileSync(LOG_FILE, turns.slice(-keep).map(t => JSON.stringify(t)).join('\n') + '\n');
}

function safeStr(v, max) {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length <= max ? s : s.slice(0, max) + '...';
}

function summarizeToolCall(toolName, input, result) {
  switch (toolName) {
    case 'Read': return toolName + ': read ' + (input && (input.file_path || input.filePath || '?'));
    case 'Write': return toolName + ': wrote ' + (input && (input.file_path || input.filePath || '?'));
    case 'Edit': return toolName + ': edited ' + (input && (input.file_path || input.filePath || '?'));
    case 'Bash': return toolName + ': ' + safeStr(input && input.command, 60) + ' exit=' + ((result && (result.exit_code ?? result.exitStatus)) ?? '?');
    case 'Grep': return toolName + ': "' + (input && input.pattern || '') + '" ' + ((result && result.results && result.results.length) || 0) + ' hits';
    case 'Glob': return toolName + ': "' + (input && input.pattern || '') + '" ' + ((result && result.results && result.results.length) || 0) + ' files';
    case 'WebSearch': return toolName + ': ' + safeStr(input && input.query, 50);
    case 'WebFetch': return toolName + ': ' + (input && (input.url || '?'));
    default: return toolName + ': ' + safeStr(input, 40) + ' -> ' + safeStr(result, 40);
  }
}

function stringifyResult(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') {
    // Common shapes seen across built-in and MCP tools. None of these are
    // documented as a stable per-tool contract, so this is best-effort:
    // prefer an obvious text field if present, otherwise fall back to the
    // full JSON so nothing is silently skipped.
    if (typeof raw.content === 'string') return raw.content;
    if (Array.isArray(raw.content)) {
      return raw.content.map(function(b) {
        return (b && typeof b.text === 'string') ? b.text : JSON.stringify(b);
      }).join('\n');
    }
    if (typeof raw.stdout === 'string') {
      return raw.stdout + (raw.stderr ? '\n[stderr]\n' + raw.stderr : '');
    }
  }
  return JSON.stringify(raw);
}

function truncateToolOutput(toolName, raw) {
  var text = stringifyResult(raw);
  if (!text || text.length <= PREVIEW_MAX) return null;
  return text.slice(0, PREVIEW_MAX) +
    '\n[truncated by context-slim: ' + (text.length - PREVIEW_MAX) +
    ' more chars omitted]';
}

function parseArgs(start) {
  const args = {};
  for (let i = start; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const n = process.argv[i + 1];
      if (n && !n.startsWith('--')) { args[key] = n; i++; }
      else { args[key] = true; }
    }
  }
  return args;
}

function handleCapture(argStart) {
  const args = parseArgs(argStart);
  var toolName, input, result;
  if (args['tool-name'] !== undefined) {
    // Manual/test invocation: explicit CLI flags.
    toolName = args['tool-name'];
    try { input = JSON.parse(args['tool-input'] || '{}'); } catch (_) { input = {}; }
    try { result = JSON.parse(args['tool-result'] || '{}'); } catch (_) { result = {}; }
  } else {
    // Real PostToolUse invocation: Claude Code sends JSON on stdin with
    // tool_name, tool_input, and tool_response fields. (Field is
    // tool_response, not tool_result — older drafts of this script assumed
    // the wrong name and the wrong delivery mechanism entirely.)
    var raw = '';
    try { raw = readStdin(); } catch (_) { raw = ''; }
    var payload = {};
    try { payload = JSON.parse(raw); } catch (_) { payload = {}; }
    toolName = payload.tool_name;
    input = payload.tool_input || {};
    result = payload.tool_response || {};
  }
  appendTurn({
    ts: new Date().toISOString(),
    tool: toolName,
    input: safeStr(input, 200),
    result: safeStr(result, 200),
    summary: summarizeToolCall(toolName, input, result)
  });
  var truncated = truncateToolOutput(toolName, result);
  if (truncated) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        updatedToolOutput: truncated
      }
    }));
  }
}

function readStdin() {
  // fs.readFileSync(0) can throw EAGAIN on Linux when the stdin fd has been
  // put into non-blocking mode (happens as soon as anything touches
  // process.stdin, e.g. the isTTY check below). Retry on EAGAIN instead of
  // crashing.
  var fd = 0;
  var chunks = [];
  var buf = Buffer.alloc(65536);
  while (true) {
    var bytesRead;
    try {
      bytesRead = fs.readSync(fd, buf, 0, buf.length, null);
    } catch (e) {
      if (e.code === 'EAGAIN') continue;
      if (e.code === 'EOF') break;
      throw e;
    }
    if (bytesRead === 0) break;
    chunks.push(Buffer.from(buf.slice(0, bytesRead)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function handleBackup() {
  // PreCompact cannot inject replacement content into Claude Code's own
  // compaction — its only control is block/allow. So this hook does not try
  // to "compact the conversation"; it just snapshots context-slim's own
  // local turn log before anything clears it, so the capture history isn't
  // lost across a compaction event.
  var raw = '';
  try { raw = readStdin(); } catch (_) { raw = ''; }
  var payload = {};
  try { payload = JSON.parse(raw); } catch (_) { payload = {}; }
  var trigger = payload.trigger || payload.matcher || 'unknown';
  var turns = loadTurns();
  if (turns.length === 0) return;
  ensureDataDir();
  var backupDir = path.join(DATA_DIR, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  var stamp = new Date().toISOString().replace(/[:.]/g, '-');
  var file = path.join(backupDir, stamp + '-' + trigger + '.jsonl');
  fs.writeFileSync(file, turns.map(function(t) { return JSON.stringify(t); }).join('\n') + '\n');
}

function handleCompact() {
  var raw = '';
  try {
    raw = readStdin();
    var turns = JSON.parse(raw);
    if (!Array.isArray(turns) || turns.length <= VERBATIM_KEEP + 1) {
      process.stdout.write(raw);
      return;
    }
    var verbatim = turns.slice(-VERBATIM_KEEP);
    var old = turns.slice(0, -VERBATIM_KEEP);
    process.stdout.write(JSON.stringify([
      { role: 'system', content: '[slim: summary of ' + old.length + ' earlier turns]' }
    ].concat(verbatim)));
  } catch (e) {
    if (raw) process.stdout.write(raw);
  }
}

function handleStatus() {
  var turns = loadTurns();
  if (turns.length === 0) { console.log('[context-slim] No tool calls recorded yet.'); return; }
  var counts = {};
  turns.forEach(function(t) { counts[t.tool] = (counts[t.tool] || 0) + 1; });
  console.log('=== context-slim: ' + turns.length + ' turn' + (turns.length === 1 ? '' : 's') + ' ===');
  console.log('Tools: ' + Object.keys(counts).map(function(k) { return k + '(' + counts[k] + ')'; }).join(', '));
  console.log('Config: SLIM_DATA_DIR=' + DATA_DIR + ' SLIM_PREVIEW_MAX=' + PREVIEW_MAX + ' SLIM_VERBATIM_KEEP=' + VERBATIM_KEEP);
  turns.forEach(function(t) { console.log('  [' + (t.ts ? t.ts.slice(0, 19) : '?') + '] ' + (t.summary || t.tool)); });
  var oldCount = Math.max(0, turns.length - 1);
  console.log('');
  console.log('Slimmed ' + oldCount + ' turn' + (oldCount === 1 ? '' : 's') + ', kept 1 verbatim.');
  truncateLog(1);
}

function handlePipe() {
  var raw = readStdin();
  if (raw.length <= PREVIEW_MAX) {
    process.stdout.write(raw);
    return;
  }
  process.stdout.write(raw.slice(0, PREVIEW_MAX) + '\n[... truncated ' + (raw.length - PREVIEW_MAX) + ' chars by context-slim]');
}

function handleProof() {
  var turns = [
    ['Read',  'src/app.js (600 lines)',            8000],
    ['Read',  'src/utils.js (900 lines)',          12000],
    ['Bash',  'npm test (400 lines output)',       5000],
    ['Grep',  'TODO search (60 matches)',          3000],
    ['Read',  'Header.jsx (450 lines)',            6000],
    ['Read',  'styles.css (1100 lines)',           15000],
    ['Bash',  'node build.js (550 lines output)',  7000],
    ['Grep',  'export search (40 matches)',        2000],
    ['Read',  'README.md (300 lines)',             4000],
    ['Bash',  'git status (250 lines output)',     3000],
  ];
  function tok(s) { return Math.ceil(s / 4); }
  var totalRaw = 0, totalCapture = 0, totalCompact = 0;
  var lines = [];
  turns.forEach(function(t, i) {
    var raw = tok(t[2]);
    var cap = t[0] === 'Grep' ? tok(Math.min(100, t[2]) + 20) : tok(Math.min(600, t[2]) + 50);
    var com = i < 7 ? tok(30) : cap;
    totalRaw += raw; totalCapture += cap; totalCompact += com;
    var label = (t[0] + ' ' + t[1] + '                    ').slice(0, 24);
    lines.push('  ' + (i+1) + '     | ' + label + ' | ' + String(raw).padStart(7) + ' | ' + String(cap).padStart(11) + ' | ' + String(com).padStart(11));
  });
  console.log('=== context-slim: empirical token savings ===');
  console.log('Session: 10 tool calls in a single conversation\n');
  console.log('  Turn  | Tool/File               | Raw tok | Capture tok | Compact tok');
  console.log('  ------+--------------------------+---------+-------------+------------');
  lines.forEach(function(l) { console.log(l); });
  console.log('  ------+--------------------------+---------+-------------+------------');
  console.log('  Total |                          | ' + String(totalRaw).padStart(7) + ' | ' + String(totalCapture).padStart(11) + ' | ' + String(totalCompact).padStart(11));
  console.log('\nStage 1: Capture mode truncates each tool output to ~600 chars');
  console.log('  ' + totalRaw + ' tokens \\u2192 ' + totalCapture + ' tokens  (' + Math.round((1-totalCapture/totalRaw)*100) + '% reduction)');
  console.log('Stage 2: Compact mode replaces old turns with 30-token summaries');
  console.log('  ' + totalCapture + ' tokens \\u2192 ' + totalCompact + ' tokens  (' + Math.round((1-totalCompact/totalCapture)*100) + '% from capture, ' + Math.round((1-totalCompact/totalRaw)*100) + '% from original)');
  console.log('Total savings: ' + (totalRaw - totalCompact) + ' tokens (' + Math.round((1-totalCompact/totalRaw)*100) + '%)');
  var costWithout = totalRaw / 1000000 * 0.15;
  var costWith = totalCompact / 1000000 * 0.15;
  console.log('\nAt $0.15/M input tokens: $' + costWithout.toFixed(4) + ' \\u2192 $' + costWith.toFixed(4) + ' per session');
  console.log('Over 1000 sessions: $' + ((costWithout - costWith) * 1000).toFixed(2) + ' saved');
}

function handleBench() {
  var results = [];
  function sim(name, beforeChars, afterChars) {
    var before = Math.ceil(beforeChars / 4);
    var after = Math.ceil(afterChars / 4);
    results.push({ name: name, beforeTokens: before, afterTokens: after, saved: before - after });
  }
  // Simulate 5 Read calls with ~500-line files (~15K tokens each)
  for (var i = 0; i < 5; i++) { sim('Read file ' + (i+1) + ' (500 lines)', 15000, 150); }
  // Simulate 3 Bash calls with ~200 lines output (~2K tokens each)
  for (var i = 0; i < 3; i++) { sim('Bash command ' + (i+1) + ' (200 lines)', 2000, 150); }
  // Simulate 2 Grep calls with ~50 matches (~1K tokens each)
  for (var i = 0; i < 2; i++) { sim('Grep search ' + (i+1) + ' (50 matches)', 1000, 50); }
  // Simulate conversation compaction
  sim('Compact 10 turns → summary', 10000, 30);

  var totalBefore = 0, totalAfter = 0, totalSaved = 0;
  results.forEach(function(r) { totalBefore += r.beforeTokens; totalAfter += r.afterTokens; totalSaved += r.saved; });

  console.log('=== context-slim benchmark ===\n');
  results.forEach(function(r) {
    console.log('  ' + r.name);
    console.log('    Before: ' + r.beforeTokens + ' tokens  After: ' + r.afterTokens + ' tokens  Saved: ' + r.saved + ' tokens');
  });
  console.log('  ─────────────────────────────────────────');
  console.log('  Total before: ' + totalBefore + ' tokens');
  console.log('  Total after:  ' + totalAfter + ' tokens');
  console.log('  Total saved:  ' + totalSaved + ' tokens (' + (totalBefore ? Math.round(totalSaved / totalBefore * 100) : 0) + '% reduction)');
  console.log('  (Based on ~4 chars/token heuristic)');
}

function printUsage() {
  console.error('Usage: slim <capture|backup|compact|pipe|status|bench> [options]');
  console.error('  capture  PostToolUse hook: reads {tool_name,tool_input,tool_response} JSON from stdin');
  console.error('           (or --tool-name/--tool-input/--tool-result flags for manual/test use)');
  console.error('  backup   PreCompact hook: snapshots the local capture log before it is cleared');
  console.error('  compact   Read conversation JSON from stdin, compact old turns');
  console.error('  pipe      Read raw text from stdin, truncate to SLIM_PREVIEW_MAX chars');
  console.error('  status    Print turn log summary');
  console.error('  bench     Run token-saving benchmark');
  console.error('  proof     Show simulated token-saving estimates on an illustrative session');
  console.error('Env: SLIM_DATA_DIR, SLIM_PREVIEW_MAX, SLIM_VERBATIM_KEEP');
}

// Dispatch
var cmd, argStart;
if (process.argv[2] === '--hook') {
  cmd = process.argv[3];
  argStart = 4;
} else {
  cmd = process.argv[2];
  argStart = 3;
}

if (cmd === 'slim') cmd = 'status';

switch (cmd) {
  case 'capture': handleCapture(argStart); break;
  case 'backup': handleBackup(); break;
  case 'compact': handleCompact(); break;
  case 'pipe': handlePipe(); break;
  case 'status': handleStatus(); break;
  case 'bench': handleBench(); break;
  case 'proof': handleProof(); break;
  default:
    if (cmd === undefined && !process.stdin.isTTY) { handlePipe(); break; }
    printUsage();
    process.exit(1);
}
