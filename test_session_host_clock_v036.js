// PATCH X-LIVE v0.36 -- host-owned fields merge on s.hostUpdatedAt.
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const src = fs.readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
function check(l, c, x) { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } }
const a = src.indexOf('function mergeSession(local, incoming) {');
const b = src.indexOf('function mergeSessionList(', a);
const ctx = {}; vm.createContext(ctx);
vm.runInContext(src.slice(a, b) + '\nthis.merge = mergeSession;', ctx);
require(path.join(__dirname, 'host_clock_cases.js'))(ctx.merge, check);
check('saveSession moves the host clock for hosts only', src.indexOf('if (L.isHost) sess.hostUpdatedAt = sess.updatedAt; // PATCH X-LIVE v0.36') !== -1);
// behaviour of saveSession itself (real code, stubbed kv)
const s0 = src.indexOf('async function saveSession(sess) {');
const s1 = src.indexOf('async function loadActivity()', s0);
async function save(isHost) {
  const cloudRow = [{ id: 'S', updatedAt: 1, hostUpdatedAt: 1, slides: [] }];
  const c = { L: { isHost, sessions: [] }, kvLoad: async () => JSON.parse(JSON.stringify(cloudRow)), kvSave: async () => true, Date };
  vm.createContext(c);
  vm.runInContext(src.slice(a, b) + src.slice(b, src.indexOf('async function loadSessions()', b)) + src.slice(s0, s1) + '\nthis.save = saveSession;', c);
  return c.save({ id: 'S', slides: [], hostUpdatedAt: 1 });
}
(async () => {
  const h = await save(true), p = await save(false);
  check('host save stamps hostUpdatedAt = now', h.hostUpdatedAt > 1 && h.hostUpdatedAt === h.updatedAt);
  check('player save leaves the host clock alone', p.hostUpdatedAt === 1 && p.updatedAt > 1);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
