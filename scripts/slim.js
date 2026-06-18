#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const VERBATIM_KEEP = 3;
const PREVIEW_MAX = 600;
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const DATA_DIR = path.join(PLUGIN_ROOT, 'data');
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

function truncateToolOutput(toolName, raw) {
  if (!raw) return null;
  switch (toolName) {
    case 'Read':
      if (raw.content && raw.content.length > PREVIEW_MAX)
        return { toolName: 'Read', updatedToolOutput: Object.assign({}, raw, { content: raw.content.slice(0, PREVIEW_MAX) + '\n[truncated by context-slim]' }) };
      break;
    case 'Bash':
      if (raw.stdout && raw.stdout.length > PREVIEW_MAX)
        return { toolName: 'Bash', updatedToolOutput: Object.assign({}, raw, { stdout: raw.stdout.slice(0, PREVIEW_MAX) + '\n[truncated by context-slim]' }) };
      break;
    case 'Grep':
      if (raw.results && raw.results.length > 5)
        return { toolName: 'Grep', updatedToolOutput: Object.assign({}, raw, { results: raw.results.slice(0, 5), truncated: true }) };
      break;
    case 'WebFetch':
      if (raw.data && raw.data.length > PREVIEW_MAX)
        return { toolName: 'WebFetch', updatedToolOutput: Object.assign({}, raw, { data: raw.data.slice(0, PREVIEW_MAX) + '\n[truncated]' }) };
      break;
  }
  return null;
}

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
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

function handleCapture() {
  const args = parseArgs();
  const toolName = args['tool-name'];
  var input = null, result = null;
  try { input = JSON.parse(args['tool-input'] || '{}'); } catch (_) {}
  try { result = JSON.parse(args['tool-result'] || '{}'); } catch (_) {}
  appendTurn({
    ts: new Date().toISOString(),
    tool: toolName,
    input: safeStr(input, 200),
    result: safeStr(result, 200),
    summary: summarizeToolCall(toolName, input, result)
  });
  var mod = truncateToolOutput(toolName, result);
  if (mod) process.stdout.write(JSON.stringify(mod));
}

function readStdin() {
  return fs.readFileSync(0, 'utf8');
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

function handleSlim() {
  var turns = loadTurns();
  if (turns.length === 0) { console.log('[context-slim] No tool calls recorded yet.'); return; }
  var counts = {};
  turns.forEach(function(t) { counts[t.tool] = (counts[t.tool] || 0) + 1; });
  console.log('=== context-slim: ' + turns.length + ' turns ===');
  console.log('Tools: ' + Object.keys(counts).map(function(k) { return k + '(' + counts[k] + ')'; }).join(', '));
  turns.forEach(function(t) { console.log('  [' + (t.ts ? t.ts.slice(0, 19) : '?') + '] ' + (t.summary || t.tool)); });
  var oldCount = Math.max(0, turns.length - 1);
  console.log('');
  console.log('Slimmed ' + oldCount + ' turns, kept 1 verbatim.');
  truncateLog(1);
}

var hook = parseArgs()['hook'] || process.argv[2];
switch (hook) {
  case 'capture': handleCapture(); break;
  case 'compact': handleCompact(); break;
  case 'slim': handleSlim(); break;
  default: console.error('context-slim: unknown hook ' + hook); process.exit(1);
}
