// X-Live v0.37.1 -- LiveKit Cloud hookup
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
function check(l, c) { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l); } }
function between(a, b) { const i = src.indexOf(a); if (i < 0) throw new Error('missing ' + a); const j = src.indexOf(b, i); return src.slice(i, j + b.length); }
const code = between('// PATCH X-LIVE v0.37.1\nconst XL_LK_DEFAULT', 'window.xlUseLkDefault = xlUseLkDefault;\n');
// only the pieces we need, not the whole block
const lk = between('// PATCH X-LIVE v0.37.1\nconst XL_LK_DEFAULT', "  return t;\n}\n");
function sandbox(cfg, resp) {
  const calls = [];
  const sb = { window: {}, SUPABASE_URL: 'https://hyxiagexyptzvetqjmnj.supabase.co', SB_HEADERS: { apikey: 'anon', Authorization: 'Bearer anon' },
    L: { cfg: cfg },
    fetch: async (u, o) => { calls.push({ u, o }); return { ok: resp.status < 300, status: resp.status, json: async () => resp.body }; } };
  const f = new Function('sb', 'with (sb) {\nfunction xlLiveKitCfg() { const c = L.cfg && L.cfg.livekit; return (c && c.url && c.tokenUrl) ? c : null; }\n' + lk + '\nsb.xlLkToken = xlLkToken; sb.xlLkIsSupabase = xlLkIsSupabase; sb.XL_LK_DEFAULT = XL_LK_DEFAULT;\n}');
  f(sb); sb.calls = calls; return sb;
}
(async () => {
  const def = sandbox({}, { status: 200, body: {} }).XL_LK_DEFAULT;
  check('default URL is the PFLX Theater LiveKit Cloud project', def.url === 'wss://pflx-theater-igofuujw.livekit.cloud');
  check('default token endpoint is this project\'s livekit-token function', def.tokenUrl === 'https://hyxiagexyptzvetqjmnj.supabase.co/functions/v1/livekit-token');
  let s = sandbox({ livekit: def }, { status: 200, body: { token: 'T1', url: def.url } });
  const t = await s.xlLkToken('xlive-share-s1', 'admin-0', true);
  check('returns the token', t === 'T1');
  check('sends anon headers to the Supabase function', s.calls[0].o && s.calls[0].o.headers && s.calls[0].o.headers.apikey === 'anon' && /^Bearer /.test(s.calls[0].o.headers.Authorization));
  check('GET query carries room, identity and publish=1', /\?room=xlive-share-s1&identity=admin-0&publish=1$/.test(s.calls[0].u));
  s = sandbox({ livekit: { url: 'wss://x', tokenUrl: 'https://tokens.example.com/lk' } }, { status: 200, body: { accessToken: 'T2' } });
  const t2 = await s.xlLkToken('xlive-share-s1', 'p1', false);
  check('a third-party endpoint gets NO Supabase key', s.calls[0].o === undefined && t2 === 'T2');
  check('viewer request uses publish=0', /publish=0$/.test(s.calls[0].u));
  s = sandbox({ livekit: def }, { status: 403, body: { error: 'only a host can share to this room' } });
  let msg = ''; try { await s.xlLkToken('xlive-share-s1', 'p1', true); } catch (e) { msg = e.message; }
  check('server error text is surfaced', msg === 'only a host can share to this room');
  s = sandbox({ livekit: def }, { status: 503, body: null });
  msg = ''; try { await s.xlLkToken('xlive-share-s1', 'p1', false); } catch (e) { msg = e.message; }
  check('status fallback when the body is not JSON', msg === 'token endpoint 503');
  s = sandbox({ livekit: def }, { status: 200, body: {} });
  msg = ''; try { await s.xlLkToken('xlive-share-s1', 'p1', false); } catch (e) { msg = e.message; }
  check('empty token is an error, not undefined', msg === 'token endpoint returned no token');
  check('isSupabase rejects look-alike hosts', !s.xlLkIsSupabase('https://evil.com/?https://x.supabase.co/functions/') && !s.xlLkIsSupabase('https://x.supabase.co.evil.com/functions/v1/a'));
  check('isSupabase accepts another supabase project function', s.xlLkIsSupabase('https://abc123.supabase.co/functions/v1/livekit-token'));
  // failed start restores state
  const start = between('async function xlShareStart() {', 'window.xlShareStart = xlShareStart;');
  check('failed start restores screenShare + push', /catch \(e\) \{[^\n]*s\.screenShare = prevShare; s\.push = prevPush;/.test(start));
  check('Setup has the one-tap PFLX Theater button', src.indexOf('onclick="xlUseLkDefault()"') !== -1 && code.indexOf('function xlUseLkDefault()') !== -1);
  check('header names v0.37.1', src.indexOf('X-LIVE v0.37.1, Sept 16 2026') !== -1);
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
