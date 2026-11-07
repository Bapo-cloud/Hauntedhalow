/* Season Chaos online leaderboard.
   A tiny web server (runs for free on Render). It keeps the best score of every player and stores the list as a JSON file
   in the game's GitHub repository (branch DATA_BRANCH), so nothing is lost when the free server sleeps or restarts.
   No accounts: every save file in the game has a secret player key. Only a hash of that key is ever stored or shown.

   GET  /top        -> {players:[{id, name, score, skin, t}]}   the best 100
   POST /score      <- {key, name, score, skin}                 keeps the higher score
   Environment: GITHUB_TOKEN (contents read/write on the repo), GITHUB_REPO, DATA_BRANCH, DATA_PATH, ALLOWED_ORIGINS, PORT */
'use strict';
const http = require('http');
const crypto = require('crypto');

const REPO = process.env.GITHUB_REPO || 'Bapo-cloud/Hauntedhalow';
const BRANCH = process.env.DATA_BRANCH || 'leaderboard';
const FILE = process.env.DATA_PATH || 'leaderboard.json';
const TOKEN = process.env.GITHUB_TOKEN || '';
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://bapo-cloud.github.io,http://localhost:8123').split(',').map(s => s.trim());
const MAX_SCORE = 9999999, KEEP = 2000, TOP = 100, SAVE_DELAY = 15000;

/* ---- name check: the same rules as in the game (word lists stored scrambled with ROT13) ---- */
const rot13 = s => s.replace(/[a-z]/g, c => String.fromCharCode((c.charCodeAt(0) - 84) % 26 + 97));
const loose = (w, whole) => new RegExp((whole ? '^' : '') + w.split('').map(ch => ch + '+').join('') + (whole ? '$' : ''));   // "abc" also catches "aabbcc"
const BAD_SUB = rot13('shpx fuvg ovgpu phag avtt sntt juber fyhg chffl nffubyr onfgneq ergneq zbyrfg crqbcuvy cnrqbcuvy anmv uvgyre cbea cravf intvan qvyqb oybjwbo unaqwbo betnfz znfgheo rebgvp uragnv baylsnaf obbo fhvpvq phzfubg wrexbss jnax gjng genaal unxraxerhm fjnfgvxn tnfxnzzre hagrezrafpu whqrafnh xxx fpurvf nefpuybpu sbgmr uherafbua jvpuf svpx fpuynzcr fpujhpugry fcnfg oruvaqreg artre xnanxr mvtrhare iretrjnyg zvfftroheg gvggra zhfpuv fvrturvy chgnva fnybcr pbaaneq zvreqn craqrwb bebfch fvxgve').split(' ').map(w => loose(w));
const BAD_WORD = rot13('nff nefr nahf nany qvpx pbpx gvg gvgf frk frkl ahqr anxrq encr encvfg qlxr xlf phz snc zvys chgn nefpu uher ahggr xnpxr cvffr cvffre fpujnam zbatb cvzzry ohzfra afsj').split(' ').map(w => loose(w, true));
const LEET_MAP = {'0':'o','3':'e','4':'a','5':'s','7':'t','8':'b','9':'g','@':'a','$':'s','!':'i','|':'i','+':'t'};
const leet = (str, one) => str.replace(/[01345789@$!|+]/g, c => c === '1' ? one : LEET_MAP[c]);
const SAFE_WORDS = /shiitake|scunthorpe|penistone/g;             // harmless words that happen to contain a blocked letter run
const NAME_BAD = 'That name is not allowed. Please pick a friendly one.';
function nameCheck(raw){                                   // returns null when the name is fine, otherwise a message
  const text = String(raw || '');
  const split = text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');      // BigAss -> Big Ass
  const base = split.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\u00DF/g, 'ss');
  for (const v of [base, leet(base, 'i'), leet(base, 'l')]){                                             // 5h1t, sh!t, f.u.c.k, f u c k ...
    const compact = v.replace(/[^a-z]/g, '').replace(SAFE_WORDS, '');
    if (BAD_SUB.some(r => r.test(compact)) || BAD_WORD.some(r => r.test(compact))) return NAME_BAD;
    for (const tok of v.split(/[^a-z]+/)) if (tok && BAD_WORD.some(r => r.test(tok))) return NAME_BAD;
  }
  if (/(https?|www)|\.(com|net|org|de|at|ch|ru|io|xyz|tk|me|tv)(\b|$)/.test(base)) return NAME_BAD;     // web addresses
  if (/\d{6,}/.test(text.replace(/[ ._\-]/g, ''))) return NAME_BAD;                                      // phone numbers
  return null;
}

/* ---- the list ---- */
let players = {};                    // id -> {name, score, skin, t}
let sha = '', loaded = false, dirty = false, saving = false, saveTimer = null;

const gh = (path, opt = {}) => fetch('https://api.github.com/repos/' + REPO + path, Object.assign({}, opt, {
  headers: Object.assign({'Accept': 'application/vnd.github+json', 'User-Agent': 'season-chaos-leaderboard', 'X-GitHub-Api-Version': '2022-11-28'},
    TOKEN ? {'Authorization': 'Bearer ' + TOKEN} : {}, opt.headers || {})
}));

async function load(){
  const r = await gh('/contents/' + FILE + '?ref=' + BRANCH);
  if (r.status === 404){ players = {}; sha = ''; loaded = true; return; }
  if (!r.ok) throw new Error('load ' + r.status);
  const j = await r.json();
  sha = j.sha;
  const data = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8'));
  players = clean(data.players);
  loaded = true;
}
function clean(raw){
  const out = {};
  if (raw && typeof raw === 'object') for (const [id, p] of Object.entries(raw)){
    if (!/^[a-f0-9]{16}$/.test(id) || !p) continue;
    const score = Math.floor(Number(p.score));
    if (!(score > 0 && score <= MAX_SCORE) || typeof p.name !== 'string') continue;
    out[id] = {name:p.name.slice(0, 10), score, skin:cleanSkin(p.skin), t:Number(p.t) || 0};
  }
  return out;
}
function cleanSkin(s){
  const out = {};
  if (s && typeof s === 'object') for (const k of ['hat', 'face', 'back', 'neck', 'color']) if (typeof s[k] === 'string' && /^[a-z0-9_-]{0,20}$/i.test(s[k])) out[k] = s[k];
  return out;
}
function sorted(){ return Object.entries(players).map(([id, p]) => Object.assign({id}, p)).sort((a, b) => b.score - a.score || a.t - b.t); }

function scheduleSave(){ dirty = true; if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = null; save().catch(e => console.error('save failed:', e.message)); }, SAVE_DELAY); }
async function save(){
  if (!dirty || saving) return;
  if (!TOKEN){ console.error('GITHUB_TOKEN is missing: scores stay in memory only'); return; }
  saving = true; dirty = false;
  try {
    const keep = sorted().slice(0, KEEP), obj = {};
    for (const p of keep){ obj[p.id] = {name:p.name, score:p.score, skin:p.skin, t:p.t}; }
    const body = {message:'Bestenliste aktualisiert', branch:BRANCH, content:Buffer.from(JSON.stringify({v:1, players:obj}, null, 1)).toString('base64')};
    if (sha) body.sha = sha;
    const r = await gh('/contents/' + FILE, {method:'PUT', body:JSON.stringify(body), headers:{'Content-Type':'application/json'}});
    if (r.status === 409 || r.status === 422){                 // the file changed meanwhile: merge with it and try again
      const mine = players; await load();
      for (const [id, p] of Object.entries(mine)) if (!players[id] || players[id].score < p.score) players[id] = p;
      dirty = true; scheduleSave(); return;
    }
    if (!r.ok) throw new Error('save ' + r.status + ' ' + (await r.text()).slice(0, 200));
    sha = (await r.json()).content.sha;
  } catch(e){ dirty = true; throw e; }
  finally { saving = false; }
}

/* ---- web ---- */
const hits = new Map();             // ip -> [count, windowStart]: max 40 requests per minute
function limited(ip){
  const now = Date.now(), h = hits.get(ip);
  if (!h || now - h[1] > 60000){ hits.set(ip, [1, now]); return false; }
  return ++h[0] > 40;
}
setInterval(() => { const now = Date.now(); for (const [ip, h] of hits) if (now - h[1] > 60000) hits.delete(ip); }, 60000).unref();

function send(res, code, obj, origin){
  const h = {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'Vary':'Origin'};
  if (origin && ORIGINS.includes(origin)){ h['Access-Control-Allow-Origin'] = origin; h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'; h['Access-Control-Allow-Headers'] = 'Content-Type'; h['Access-Control-Max-Age'] = '86400'; }
  res.writeHead(code, h); res.end(obj == null ? '' : JSON.stringify(obj));
}
const top = () => ({players:sorted().slice(0, TOP)});

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '', url = new URL(req.url, 'http://x');
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (req.method === 'OPTIONS') return send(res, 204, null, origin);
  if (limited(ip)) return send(res, 429, {error:'Too many requests'}, origin);
  try {
    if (!loaded) await load();
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, {ok:true, players:Object.keys(players).length, saving:!!TOKEN}, origin);
    if (req.method === 'GET' && url.pathname === '/top') return send(res, 200, top(), origin);
    if (req.method === 'POST' && url.pathname === '/score'){
      let raw = '';
      for await (const c of req){ raw += c; if (raw.length > 4000) return send(res, 413, {error:'Too big'}, origin); }
      let b; try { b = JSON.parse(raw); } catch(e){ return send(res, 400, {error:'Bad JSON'}, origin); }
      const key = String(b.key || ''), name = String(b.name || '').trim().replace(/\s+/g, ' '), score = Math.floor(Number(b.score));
      if (!/^[a-f0-9]{32,64}$/.test(key)) return send(res, 400, {error:'Bad key'}, origin);
      if (!/^[A-Z0-9 ]{1,10}$/.test(name) || nameCheck(name)) return send(res, 400, {error:'Bad name'}, origin);
      if (!(score > 0 && score <= MAX_SCORE)) return send(res, 400, {error:'Bad score'}, origin);
      const id = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16), p = players[id], skin = cleanSkin(b.skin);
      if (!p || score > p.score){ players[id] = {name, score, skin, t:Date.now()}; scheduleSave(); }
      else if (p.name !== name || JSON.stringify(p.skin) !== JSON.stringify(skin)){ p.name = name; p.skin = skin; scheduleSave(); }
      return send(res, 200, Object.assign({id}, top()), origin);
    }
    return send(res, 404, {error:'Not found'}, origin);
  } catch(e){
    console.error(e);
    return send(res, 503, {error:'Try again later'}, origin);
  }
});
server.listen(Number(process.env.PORT) || 10000, () => console.log('leaderboard ready'));

async function shutdown(){                                     // Render stops the server: write what is not saved yet
  if (saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
  try { await save(); } catch(e){ console.error('final save failed:', e.message); }
  process.exit(0);
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
