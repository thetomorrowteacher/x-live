// PATCH X-LIVE v0.80 -- Campaign Mode lives in X-Live. Static checks against
// the shipped file. Run: node test_v080_campaign_mode.js index.html
'use strict';
const src = require('fs').readFileSync(process.argv[2] || 'index.html', 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; if (!c) console.log('FAIL:', m); };
const count = s => src.split(s).length - 1;
ok(count('<script id="xl-cm-engine">') === 1, 'engine embedded once');
['xl-cm-data', 'xl-cm-clients', 'xl-cm-issues'].forEach(k => ok(count('<script id="' + k + '">') === 1, k + ' embedded once'));
ok(src.indexOf('<script id="xl-cm-engine">') < src.indexOf('<script id="xl-smf-bridge">'), 'engine loads before the bridge');
ok(/PFLX_STORY_ART = window.PFLX_STORY_ART \|\| "https:\/\/prototypeflx\.com\/public\/story-art\/"/.test(src), 'art, audio and video come from the Console host');
ok(src.includes('window.PFLX_STORY_HOST = {'), 'X-Live passes a host to the engine');
ok(!/window\.pflxStoryGo = function \(target\)/.test(src), 'the flythrough no longer defines pflxStoryGo');
ok(!/window\.pflxStoryState = function \(\) \{\n    var st = myStory/.test(src), 'the flythrough no longer defines pflxStoryState');
ok(src.includes("if (s === 'story' && !L.isHost && typeof window.xlStoryOpen === 'function') { window.xlStoryOpen(); return; }"), "players' CAMPAIGN tab opens the campaign");
ok(src.includes("root.id = 'xl-cm'") && !src.includes('window.SMFly.mount(root'), 'xlStoryOpen mounts Campaign Mode, not the flythrough');
ok(src.includes("type: 'pflx_award_proposed', playerId: id, source: 'story'"), 'quest rewards go to the Console as award proposals');
ok(src.includes('Promise.resolve(xlStoryLoad([id])).then(mount, mount)'), 'the saved record is read before the campaign mounts');
console.log(pass + ' passed, ' + fail + ' failed');
