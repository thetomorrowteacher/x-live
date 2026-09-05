// Extracts every inline <script> block (no src=) from an HTML file and
// node --check's each one. House discipline: run this on preview.html
// before AND after every patch.
// Usage: node scripts/syntax_gate.js preview.html
const fs = require('fs');
const os = require('os');
const path_mod = require('path');
const path = process.argv[2];
if (!path) { console.error('usage: node scripts/syntax_gate.js <file.html>'); process.exit(1); }
const src = fs.readFileSync(path, 'utf-8');

const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, i = 0, failed = 0;
const cp = require('child_process');
const tmpDir = fs.mkdtempSync(path_mod.join(os.tmpdir(), 'pflx-syntax-gate-'));
while ((m = re.exec(src))) {
  i++;
  const body = m[1];
  const tmp = path_mod.join(tmpDir, 'block' + i + '.js');
  fs.writeFileSync(tmp, body);
  const res = cp.spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf-8' });
  if (res.status !== 0) {
    failed++;
    console.log('BLOCK ' + i + ': FAIL');
    console.log(res.stderr);
  } else {
    console.log('BLOCK ' + i + ': OK (' + body.length + ' chars)');
  }
}
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
console.log('\n' + i + ' blocks checked, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
