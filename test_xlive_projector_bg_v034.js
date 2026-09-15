// PATCH X-LIVE v0.34: Ennis -- "use the same background" (Host Dashboard's
// HUD background) on the Projector. Checks the real CSS in index.html.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
function check(l, c) { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l); } }
const m = src.match(/#proj \{[^}]*\}/);
check('#proj rule exists', !!m);
check('#proj is transparent (shows the shared HUD background)', m && /background:transparent/.test(m[0]) && !/radial-gradient/.test(m[0]));
check('#proj still sits above the dashboard (z-index 200, fixed, inset 0)', m && /position:fixed/.test(m[0]) && /inset:0/.test(m[0]) && /z-index:200/.test(m[0]));
check('#hudbg layer still present in <body> once', src.split('<div id="hudbg">').length === 2);
check('#hudbg stays below #proj (z-index 0)', /#hudbg \{[^}]*z-index:0/.test(src));
check('dashboard + tray hidden while projector is on', src.indexOf('body:has(#proj.on) #app, body:has(#proj.on) #tray { visibility:hidden; }') !== -1);
check('body keeps the host-dashboard gradient', /body \{ background:radial-gradient\(ellipse at 50% -20%, #101b3f 0%, #060a18 65%\)/.test(src));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
