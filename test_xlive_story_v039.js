// PATCH X-LIVE v0.39 -- Story Mode in the live room.
// Static assertions that the panel is wired in, plus a real vm run of the
// pure campaign-progress functions pulled straight out of index.html.
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
let pass = 0, fail = 0;
function check(l, c, x) {
  if (c) { pass++; console.log('PASS: ' + l); }
  else { fail++; console.log('FAIL: ' + l + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); }
}

check('header note v0.39', src.indexOf('X-LIVE v0.39, Sept 18 2026') > 0);
check('STORY tab is host only', /\['tools', '\S+ TOOLS'\], \['story', '\S+ STORY'\]/.test(src)
  && !/\['shop', '\S+ UPGRADES'\], \['story'/.test(src));
check('render dispatches story -> rStory', /tools: rTools, story: rStory, play: rPlay/.test(src));
check('module is sentinel-wrapped', src.indexOf('PATCH X-LIVE v0.39 -- Story Mode') !==
  src.lastIndexOf('PATCH X-LIVE v0.39 -- Story Mode'));
check('reads the platform key namespace', /pflx_story_/.test(src));
check('one batched PostgREST read, not N round trips',
  /app_data\?key=in\.\(/.test(src) && /encodeURIComponent\('pflx_story_' \+ id\)/.test(src));
check('a beat push rides xlStampPush, not a hand-rolled push',
  /xlStampPush\(s, 'Story Mode: ' \+ q\.title\)/.test(src) &&
  !/s\.push = \{[^}]*Story/.test(src));
check('a beat push saves the session', /xlStoryBeat[\s\S]{0,1600}await saveSession\(s\)/.test(src));
check('a beat push refuses without a running session',
  /xlStoryBeat[\s\S]{0,400}s\.status !== 'active'[\s\S]{0,120}return;/.test(src));
check('beat pad appears in SHOW CONTROL and backstage, both',
  src.split('+ xlStoryPadHtml(s)').length === 3, src.split('+ xlStoryPadHtml(s)').length - 1);
check('story css shipped', /\.xl-story-row\{/.test(src) && /\.xl-story-pad\{/.test(src));
check('panel is responsive', /@media \(max-width:760px\)\{[\s\S]{0,400}\.xl-story-row/.test(src));

// ── run the real pure functions ─────────────────────────────────────────
function slice(a, b) {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error('marker missing: ' + a);
  return src.slice(i, j);
}
const blk = slice('const XL_STORY = {', 'L.story = {');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(blk.replace(/window\.xlStory/g, 'this.window.xlStory')
  + '\nthis.window.XL_STORY = XL_STORY;', ctx);
const { xlStoryPct, xlStoryStage, xlStorySort, XL_STORY } = ctx.window;

check('campaign index extracted', typeof xlStoryPct === 'function' && typeof xlStoryStage === 'function');
check('the index carries all 28 quests', XL_STORY && XL_STORY.total === 28
  && XL_STORY.acts.reduce((a, x) => a + x.q.length, 0) === 28,
  XL_STORY && XL_STORY.total);
if (typeof xlStoryPct === 'function') {
  check('empty state is 0%', xlStoryPct({}) === 0, xlStoryPct({}));
  check('no state at all is 0%, not NaN', xlStoryPct(null) === 0, xlStoryPct(null));
  const two = { done: { 'a0-brief': 1, 'a0-studio': 1 } };
  check('two of 28 quests is 7%', xlStoryPct(two) === 7, xlStoryPct(two));

  const s0 = xlStoryStage({});
  check('a player who has not started shows no act', s0.act === null && s0.done === 0, s0);
  check('and is pointed at the very first quest',
    s0.next && s0.next.id === 'a0-brief', s0.next);

  const s1 = xlStoryStage(two);
  check('after Act Zero the furthest act is Act Zero', s1.act && s1.act.id === 'act0', s1.act && s1.act.id);
  check('next quest is the first of Act One', s1.next && s1.next.id === 'a1-traits', s1.next);
  check('not complete', s1.complete === false);

  // a gap: finished something in Act Two but skipped an Act One quest
  const gap = { done: { 'a0-brief': 1, 'a0-studio': 1, 'a1-traits': 1, 'a2-pick': 1 } };
  const sg = xlStoryStage(gap);
  check('furthest act wins over ordering', sg.act && sg.act.id === 'act2', sg.act && sg.act.id);
  check('next points at the earliest UNFINISHED quest, not the latest',
    sg.next && sg.next.id === 'a1-forge', sg.next && sg.next.id);

  // everything done
  const all = { done: {} };
  (XL_STORY || { acts: [] }).acts.forEach(a => a.q.forEach(q => { all.done[q[0]] = 1; }));
  const sa = xlStoryStage(all);
  check('a finished season reads 100% and complete', sa.pct === 100 && sa.complete === true, sa.pct);

  // sorting
  const rows = [
    { name: 'Zed',  st: { xc: 100 }, stage: xlStoryStage(two) },
    { name: 'Ada',  st: { xc: 900 }, stage: xlStoryStage(two) },
    { name: 'Mo',   st: { xc: 0 },   stage: xlStoryStage(gap) }
  ];
  const sorted = xlStorySort(rows).map(r => r.name);
  check('furthest first, then X-Coin, then name',
    JSON.stringify(sorted) === JSON.stringify(['Mo', 'Ada', 'Zed']), sorted);
  check('sort does not mutate the input', rows[0].name === 'Zed');
  // unknown quest ids must not crash or inflate
  check('an unknown quest id is ignored', xlStoryStage({ done: { 'nope-1': 1 } }).act === null);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
