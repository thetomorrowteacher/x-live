// Unit tests for the Host/Player view toggle (pflxApplyRoleChange).
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

function extractFunction(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) throw new Error('not found: ' + marker);
  const braceStart = src.indexOf('{', start);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('PASS: ' + label); }
  else { fail++; console.log('FAIL: ' + label); }
}

function makeSandbox() {
  const sandbox = {};
  const body =
    extractFunction(src, 'function pflxApplyRoleChange(') + '\n' +
    'sandbox.pflxApplyRoleChange = pflxApplyRoleChange;\n';
  new Function('sandbox', 'with (sandbox) {\n' + body + '\n}')(sandbox);
  return sandbox;
}

(function () {
  const sb = makeSandbox();
  const f = sb.pflxApplyRoleChange;

  check('real host, role=player -> false (switch to player view)', f(true, 'player') === false);
  check('real host, role=host -> true (switch back to host view)', f(true, 'host') === true);
  check('real host, unknown role -> null (ignore, no crash)', f(true, 'something-else') === null);
  check('real host, role=undefined -> null', f(true, undefined) === null);

  check('NOT a real host, role=host -> null (fails closed, never grants host view)', f(false, 'host') === null);
  check('NOT a real host, role=player -> null (already player, nothing to do)', f(false, 'player') === null);
  check('NOT a real host, unknown role -> null', f(false, 'anything') === null);

  // Extra hardening: falsy-but-not-exactly-false realIsHost values (0, '', null,
  // undefined) must all be treated as "not a real host" -- same as false.
  check('realIsHost=0 -> null', f(0, 'host') === null);
  check('realIsHost=null -> null', f(null, 'host') === null);
  check('realIsHost=undefined -> null', f(undefined, 'host') === null);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
