#!/usr/bin/env node
var exec = require('child_process').execSync;
var path = require('path');
var fs = require('fs');

var ROOT = path.resolve(__dirname, '..');
var SLIM = 'node ' + path.join(ROOT, 'scripts', 'slim.js');
var LOG = path.join(ROOT, 'data', 'turns.jsonl');
var passed = 0, failed = 0;

function test(name, cmd, expect, opts) {
  try {
    if (fs.existsSync(LOG)) fs.unlinkSync(LOG);
    var out;
    try { out = exec(cmd, Object.assign({ cwd: ROOT, encoding: 'utf8' }, opts || {})); }
    catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
    var match = typeof expect === 'function' ? expect(out) : out.includes(expect);
    if (match) { passed++; console.log('  PASS  ' + name); }
    else { failed++; console.log('  FAIL  ' + name); console.log('    expected: ' + (typeof expect === 'string' ? JSON.stringify(expect) : 'truthy') + '\n    got: ' + JSON.stringify(out.slice(0, 300))); }
  } catch (e) {
    failed++; console.log('  FAIL  ' + name + ' (error: ' + e.message + ')');
  }
}

console.log('=== context-slim test suite ===\n');

test('status on empty log', SLIM + ' status', '[context-slim] No tool calls recorded yet.');
test('unknown subcommand shows usage', SLIM + ' blah', 'Usage: slim');
test('pipe passthrough (short text)', 'node -e "process.stdout.write(\'hello world\')" | ' + SLIM + ' pipe', 'hello world');
test('pipe truncation (long text)', 'node -e "process.stdout.write(\'A\'.repeat(1000))" | ' + SLIM + ' pipe', '[... truncated');
test('compact 6 turns to 4', 'node -e "process.stdout.write(JSON.stringify([{role:\'user\',content:\'a\'},{role:\'assistant\',content:\'b\'},{role:\'user\',content:\'c\'},{role:\'assistant\',content:\'d\'},{role:\'user\',content:\'e\'},{role:\'assistant\',content:\'f\'}]))" | ' + SLIM + ' compact', '[slim: summary of 3 earlier turns]');
test('compact passthrough (2 turns)', 'node -e "process.stdout.write(JSON.stringify([{role:\'user\',content:\'a\'},{role:\'assistant\',content:\'b\'}]))" | ' + SLIM + ' compact', function(o) { return !o.includes('slim:'); });
test('compact invalid json passthrough', 'echo "not json" | ' + SLIM + ' compact', 'not json');
test('capture logs a turn', SLIM + ' capture --tool-name Read --tool-input "{}" --tool-result "{}"', function() { return fs.existsSync(LOG); });
test('capture via stdin (real hook path)', 'node -e "process.stdout.write(JSON.stringify({tool_name:\'Bash\',tool_input:{command:\'ls\'},tool_response:{stdout:\'short\'}}))" | ' + SLIM + ' capture', function() { return fs.existsSync(LOG) && fs.readFileSync(LOG,'utf8').includes('Bash'); });
test('capture via stdin truncates large output', 'node -e "process.stdout.write(JSON.stringify({tool_name:\'Bash\',tool_input:{},tool_response:{stdout:\'A\'.repeat(2000)}}))" | ' + SLIM + ' capture', 'hookSpecificOutput');
test('backup snapshots the log before compaction', SLIM + ' capture --tool-name Read --tool-input "{}" --tool-result "{}" && node -e "process.stdout.write(JSON.stringify({trigger:\'manual\'}))" | ' + SLIM + ' backup', function() { return fs.existsSync(path.join(ROOT, 'data', 'backups')); });
test('--hook backward compat', SLIM + ' --hook status', '[context-slim]');
test('auto-pipe when stdin piped', 'node -e "process.stdout.write(\'auto\')" | ' + SLIM, 'auto');
test('bench runs without error', SLIM + ' bench', '=== context-slim benchmark ===');

console.log('\n---');
console.log(passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
process.exit(failed ? 1 : 0);
