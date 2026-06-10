// ── CONFIG ───────────────────────────────────────────────────────────────────
const RACE_DATE      = new Date(2026, 10, 15);
const PLAN_START     = new Date(2026, 6, 13);
const PRETRAIN_START = new Date(2026, 5, 1);
const TOTAL_WEEKS    = 18;

// ── SUPABASE ─────────────────────────────────────────────────────────────────
const SB_URL = 'https://uqvkrbeuxhddqgrhztwo.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxdmtyYmV1eGhkZHFncmh6dHdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1ODA5ODAsImV4cCI6MjA5NTE1Njk4MH0.yKbOuf-W96oEYeKniNzm9gxgSlenYh-rhglenOYSdkQ';
const SB_HEADERS = { 'Content-Type':'application/json', 'apikey':SB_KEY, 'Authorization':'Bearer '+SB_KEY };

async function fetchRuns() {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/runs?order=logged_at.asc`, { headers: SB_HEADERS });
    runsCache = await res.json();
    if (!Array.isArray(runsCache)) runsCache = [];
  } catch { runsCache = []; }
}
async function saveRun(mode, week, dayIdx, kmActual, mood, notes, conditions) {
  try {
    await fetch(`${SB_URL}/rest/v1/runs`, {
      method: 'POST',
      headers: { ...SB_HEADERS, 'Prefer':'return=minimal' },
      body: JSON.stringify({ mode, week, day_idx: dayIdx, km_actual: kmActual||null, mood: mood||null, notes: notes||null, conditions: conditions||null })
    });
    await fetchRuns();
  } catch(e) { console.warn('save failed', e); }
}
async function deleteRun(mode, week, dayIdx) {
  try {
    await fetch(`${SB_URL}/rest/v1/runs?mode=eq.${mode}&week=eq.${week}&day_idx=eq.${dayIdx}`, { method:'DELETE', headers: SB_HEADERS });
    await fetchRuns();
  } catch(e) {}
}
async function saveExtraRun(kmActual, mood, notes, conditions) {
  try {
    await fetch(`${SB_URL}/rest/v1/runs`, {
      method: 'POST',
      headers: { ...SB_HEADERS, 'Prefer':'return=minimal' },
      body: JSON.stringify({ mode:'extra', week:0, day_idx:-1, km_actual: kmActual||null, mood: mood||null, notes: notes||null, conditions: conditions||null })
    });
    await fetchRuns();
  } catch(e) {}
}

// ── LOCATIONS ────────────────────────────────────────────────────────────────
const LOCATIONS = [
  { name:'Toronto',   country:'Canada',      lat:43.70, lon:-79.42, tz:'America%2FToronto', emoji:'🍁', home:true  },
  { name:'Crato',     country:'Portugal',    lat:39.28, lon:-7.65,  tz:'Europe%2FLisbon',   emoji:'🔥', home:false },
  { name:'Lisbon',    country:'Portugal',    lat:38.72, lon:-9.14,  tz:'Europe%2FLisbon',   emoji:'💻', home:false },
  { name:'Berlin',    country:'Germany',     lat:52.52, lon:13.41,  tz:'Europe%2FBerlin',   emoji:'🏠', home:false },
  { name:'The Alps',  country:'Switzerland', lat:46.50, lon:8.00,   tz:'Europe%2FZurich',   emoji:'🏔️',home:false },
  { name:'Spain',     country:'Spain',       lat:40.42, lon:-3.70,  tz:'Europe%2FMadrid',   emoji:'🦀', home:false },
  { name:'Taipei',    country:'Taiwan',      lat:25.03, lon:121.56, tz:'Asia%2FTaipei',     emoji:'🍜', home:true  },
  { name:'Tianzhong', country:'Taiwan',      lat:23.93, lon:120.40, tz:'Asia%2FTaipei',     emoji:'🌾', home:true  },
  { name:'Singapore', country:'Singapore',   lat:1.35,  lon:103.82, tz:'Asia%2FSingapore',  emoji:'🚢', home:false },
  { name:'Tokyo',     country:'Japan',       lat:35.68, lon:139.69, tz:'Asia%2FTokyo',      emoji:'🌸', home:false },
];
let currentLocIdx = parseInt(localStorage.getItem('kobe_loc_idx') || '0');
let runsCache = [];

function isHomeLocation() { return LOCATIONS[currentLocIdx].home; }

function switchLocation(idx) {
  currentLocIdx = idx;
  localStorage.setItem('kobe_loc_idx', idx);
  weatherCache = null;
  closeLocPicker();
  updateHeader();
  renderWeatherWidget();
  renderToday();
}

// ── WEATHER ───────────────────────────────────────────────────────────────────
let weatherCache = null;

async function fetchUV() {
  const loc = LOCATIONS[currentLocIdx];
  const today_str = new Date().toISOString().split('T')[0];
  const cacheKey = `uv_${loc.name}_${today_str}`;
  try {
    const stored = JSON.parse(localStorage.getItem(cacheKey));
    if (stored && stored.hourly) { weatherCache = stored; return stored; }
  } catch {}
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&hourly=uv_index,temperature_2m&timezone=${loc.tz}&forecast_days=1`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    const data = await res.json();
    weatherCache = data;
    localStorage.setItem(cacheKey, JSON.stringify(data));
    return data;
  } catch { return null; }
}

function uvClass(uv) {
  if (uv <= 2) return 'uv-low';
  if (uv <= 5) return 'uv-moderate';
  if (uv <= 7) return 'uv-high';
  if (uv <= 10) return 'uv-very-high';
  return 'uv-extreme';
}
function uvLabel(uv) {
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very High';
  return 'Extreme';
}
function getBestRunWindows(hours, uvVals, tempVals) {
  const slots = hours.map((h,i) => ({ h, uv: uvVals[i]||0, temp: tempVals?tempVals[i]:20 }));
  const morning = slots.filter(x => x.h >= 5 && x.h <= 10);
  const evening = slots.filter(x => x.h >= 17 && x.h <= 21);
  const best = arr => arr.length ? arr.reduce((a,b) => a.uv < b.uv ? a : b) : null;
  return { morning: best(morning), evening: best(evening) };
}

async function renderWeatherWidget() {
  const w = document.getElementById('weather-widget-body');
  if (!w) return;
  const loc = LOCATIONS[currentLocIdx];
  w.innerHTML = `<div style="font-size:13px;color:var(--brown-mid)">Loading ${loc.emoji} ${loc.name}...</div>`;
  const data = await fetchUV();
  if (!data || !data.hourly) {
    w.innerHTML = `<div style="font-size:13px;color:var(--brown-mid)">Weather unavailable. <button onclick="renderWeatherWidget()" style="font-family:'Press Start 2P';font-size:6px;padding:5px 8px;border:1px solid var(--border);background:var(--terra);color:#fff;cursor:pointer;border-radius:3px">RETRY</button></div>`;
    return;
  }
  const hours = data.hourly.time.map(t => parseInt(t.split('T')[1]));
  const uvVals = data.hourly.uv_index;
  const tempVals = data.hourly.temperature_2m;
  const now = new Date().getHours();
  const currentUV = uvVals[now] || 0;
  const currentTemp = tempVals ? tempVals[now] : null;
  const { morning, evening } = getBestRunWindows(hours, uvVals, tempVals);

  // update header weather pill
  const hw = document.getElementById('hdr-weather');
  if (hw) hw.textContent = `${loc.emoji} ${currentTemp !== null ? Math.round(currentTemp)+'°C · ' : ''}UV ${currentUV.toFixed(1)}`;

  const sparkHours = [6,8,10,12,14,16,18,20];
  const sparks = sparkHours.map(h => {
    const uv = uvVals[h] || 0;
    const isNow = Math.abs(h - now) < 2;
    return `<div class="uv-sparkline-item">
      ${isNow ? '<div class="uv-now-marker">▼</div>' : ''}
      <span class="uv-chip ${uvClass(uv)}" style="padding:3px 6px;font-size:6px">${uv.toFixed(1)}</span>
      <span style="font-size:9px;color:var(--brown-light)">${h}:00</span>
    </div>`;
  }).join('');

  const fmt = s => s ? `<strong>${s.h}:00</strong> — UV ${s.uv.toFixed(1)} (${uvLabel(s.uv)})${s.temp !== undefined ? ', '+Math.round(s.temp)+'°C' : ''}` : 'no low-UV window';
  w.innerHTML = `
    <div style="font-family:'Press Start 2P';font-size:6px;color:var(--brown-light);margin-bottom:8px">NOW · ${loc.emoji} ${loc.name.toUpperCase()}</div>
    <span class="uv-chip ${uvClass(currentUV)}" style="font-size:9px">UV ${currentUV.toFixed(1)} — ${uvLabel(currentUV)}${currentTemp !== null ? ' · '+Math.round(currentTemp)+'°C' : ''}</span>
    <div class="uv-sparkline-row" style="margin-top:10px">${sparks}</div>
    <div class="run-window-box">
      <div class="run-window-title">⚡ BEST TIME TO RUN</div>
      <div class="run-window-text">🌅 Morning: ${fmt(morning)}<br>🌇 Evening: ${fmt(evening)}</div>
    </div>
    ${currentUV >= 8 ? '<div style="background:var(--terra-pale);border:1px solid var(--terra);border-radius:6px;padding:8px 10px;margin-top:8px;font-size:12px;color:var(--brown)">⚠️ UV '+currentUV.toFixed(1)+' right now — high risk. Wear SPF 50 or wait for evening window.</div>' : ''}`;

  renderMealTimeline();
}

// ── SCHEDULE ──────────────────────────────────────────────────────────────────
const PRETRAIN = [
  [{type:'rest'},{type:'easy',km:3},{type:'rest'},{type:'easy',km:3},{type:'rest'},{type:'cross',min:20},{type:'easy',km:4}],
  [{type:'rest'},{type:'easy',km:3},{type:'rest'},{type:'easy',km:3},{type:'rest'},{type:'cross',min:25},{type:'easy',km:4.8}],
  [{type:'rest'},{type:'easy',km:4},{type:'rest'},{type:'easy',km:4},{type:'rest'},{type:'cross',min:25},{type:'easy',km:5}],
  [{type:'rest'},{type:'easy',km:4},{type:'rest'},{type:'easy',km:4},{type:'rest'},{type:'cross',min:30},{type:'easy',km:6}],
  [{type:'rest'},{type:'easy',km:4.8},{type:'rest'},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:30},{type:'easy',km:6.4}],
  [{type:'rest'},{type:'easy',km:4.8},{type:'rest'},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:30},{type:'easy',km:8}],
];
const PT_TOTAL = PRETRAIN.length;

const SCHEDULE = [
  [{type:'rest'},{type:'easy',km:4.8},{type:'easy',km:4.8},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:30},{type:'long',km:9.7}],
  [{type:'rest'},{type:'easy',km:4.8},{type:'easy',km:4.8},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:30},{type:'long',km:11.3}],
  [{type:'rest'},{type:'easy',km:4.8},{type:'easy',km:6.4},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:40},{type:'long',km:8.1}],
  [{type:'rest'},{type:'easy',km:4.8},{type:'easy',km:6.4},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:40},{type:'long',km:14.5}],
  [{type:'rest'},{type:'easy',km:4.8},{type:'easy',km:8.1},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:40},{type:'long',km:16.1}],
  [{type:'rest'},{type:'easy',km:4.8},{type:'easy',km:8.1},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:40},{type:'long',km:11.3}],
  [{type:'rest'},{type:'easy',km:4.8},{type:'medium',km:9.7},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:50},{type:'long',km:19.3}],
  [{type:'rest'},{type:'easy',km:4.8},{type:'medium',km:9.7},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:50},{type:'race',km:21.1,label:'Half Marathon'}],
  [{type:'rest'},{type:'easy',km:4.8},{type:'medium',km:11.3},{type:'easy',km:6.4},{type:'rest'},{type:'cross',min:60},{type:'long',km:16.1}],
  [{type:'rest'},{type:'easy',km:4.8},{type:'medium',km:11.3},{type:'easy',km:6.4},{type:'rest'},{type:'cross',min:60},{type:'long',km:24.1}],
  [{type:'rest'},{type:'easy',km:6.4},{type:'medium',km:12.9},{type:'easy',km:6.4},{type:'rest'},{type:'cross',min:60},{type:'long',km:25.7}],
  [{type:'rest'},{type:'easy',km:6.4},{type:'medium',km:12.9},{type:'easy',km:8.1},{type:'rest'},{type:'cross',min:60},{type:'long',km:19.3}],
  [{type:'rest'},{type:'easy',km:6.4},{type:'medium',km:14.5},{type:'easy',km:8.1},{type:'rest'},{type:'cross',min:60},{type:'long',km:29.0}],
  [{type:'rest'},{type:'easy',km:8.1},{type:'medium',km:14.5},{type:'easy',km:8.1},{type:'rest'},{type:'cross',min:60},{type:'long',km:22.5}],
  [{type:'rest'},{type:'easy',km:8.1},{type:'medium',km:16.1},{type:'easy',km:8.1},{type:'rest'},{type:'cross',min:60},{type:'long',km:32.2,label:'THE 20-MILER'}],
  [{type:'rest'},{type:'easy',km:8.1},{type:'medium',km:12.9},{type:'easy',km:6.4},{type:'rest'},{type:'cross',min:60},{type:'long',km:19.3}],
  [{type:'rest'},{type:'easy',km:6.4},{type:'medium',km:9.7},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:60},{type:'long',km:12.9}],
  [{type:'rest'},{type:'easy',km:4.8},{type:'easy',km:6.4},{type:'easy',km:3.2},{type:'rest'},{type:'rest'},{type:'race',km:42.195,label:'KOBE MARATHON 🌸'}],
];

const DAY_NAMES   = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const PHASE_MAP = [
  {weeks:[1,2,3],   animal:'🐢', name:'W1–3',   phase:'STARTING'},
  {weeks:[4,5,6],   animal:'🐔', name:'W4–6',   phase:'BUILDING'},
  {weeks:[7,8,9],   animal:'🐰', name:'W7–9',   phase:'RAMPING'},
  {weeks:[10,11,12],animal:'🦊', name:'W10–12', phase:'PEAK'},
  {weeks:[13,14,15],animal:'🐎', name:'W13–15', phase:'PEAK+'},
  {weeks:[16,17,18],animal:'🌸', name:'W16–18', phase:'TAPER'},
  {weeks:[19],      animal:'🏁', name:'RACE',   phase:'15 NOV'},
];

// ── DATE HELPERS ──────────────────────────────────────────────────────────────
function today() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function currentPeriod() {
  const t = today();
  if (t < PRETRAIN_START) return { mode:'pre', week:0 };
  if (t < PLAN_START) {
    const diff = Math.floor((t - PRETRAIN_START) / 86400000);
    return { mode:'pre', week: Math.min(Math.floor(diff/7)+1, PT_TOTAL) };
  }
  const diff = Math.floor((t - PLAN_START) / 86400000);
  const w = Math.floor(diff/7)+1;
  if (w > TOTAL_WEEKS) return { mode:'done', week: TOTAL_WEEKS };
  return { mode:'plan', week: w };
}
function daysToRace() { return Math.ceil((RACE_DATE - today()) / 86400000); }
function daysToplan() { return Math.ceil((PLAN_START - today()) / 86400000); }
function todayDayIdx() { return (today().getDay() + 6) % 7; } // 0=Mon..6=Sun
function weekStartDate(w) { const d = new Date(PLAN_START); d.setDate(d.getDate()+(w-1)*7); return d; }
function preWeekStartDate(pw) { const d = new Date(PRETRAIN_START); d.setDate(d.getDate()+(pw-1)*7); return d; }
function formatDateRange(w) {
  const s = weekStartDate(w), e = new Date(s); e.setDate(e.getDate()+6);
  const o = {day:'numeric',month:'short'};
  return s.toLocaleDateString('en-GB',o)+'–'+e.toLocaleDateString('en-GB',{...o,year:'numeric'});
}
function formatDateRangePre(pw) {
  const s = preWeekStartDate(pw), e = new Date(s); e.setDate(e.getDate()+6);
  const o = {day:'numeric',month:'short'};
  return s.toLocaleDateString('en-GB',o)+'–'+e.toLocaleDateString('en-GB',{...o,year:'numeric'});
}
function getPhase(w) { return PHASE_MAP.find(p => p.weeks.includes(w)) || PHASE_MAP[PHASE_MAP.length-1]; }

// ── LOCALSTORAGE ──────────────────────────────────────────────────────────────
function storageKey(mode,w) { return `${mode}_week_${w}_checks`; }
function loadChecks(mode,w) { try { return JSON.parse(localStorage.getItem(storageKey(mode,w)))||{}; } catch { return {}; } }
function saveChecks(mode,w,checks) { localStorage.setItem(storageKey(mode,w), JSON.stringify(checks)); }

function totalKmLogged() {
  let total = 0;
  runsCache.forEach(r => {
    if (r.km_actual) { total += parseFloat(r.km_actual); return; }
    if (r.mode === 'extra') return;
    const sch = r.mode === 'pre' ? PRETRAIN : SCHEDULE;
    total += sch[r.week-1]?.[r.day_idx]?.km || 0;
  });
  return Math.round(total*10)/10;
}
function kmThisWeek() {
  const p = currentPeriod();
  const mode = p.mode === 'pre' ? 'pre' : 'plan';
  const week = p.mode === 'pre' ? p.week : p.week;
  let total = 0;
  runsCache.filter(r => r.mode === mode && r.week === week).forEach(r => {
    if (r.km_actual) { total += parseFloat(r.km_actual); return; }
    const sch = r.mode === 'pre' ? PRETRAIN : SCHEDULE;
    total += sch[r.week-1]?.[r.day_idx]?.km || 0;
  });
  const weekAgo = new Date(Date.now()-7*86400000);
  runsCache.filter(r => r.mode==='extra' && r.km_actual && r.logged_at && new Date(r.logged_at)>=weekAgo)
           .forEach(r => { total += parseFloat(r.km_actual); });
  return Math.round(total*10)/10;
}
function isRunLogged(mode,week,dayIdx) { return runsCache.some(r => r.mode===mode && r.week===week && r.day_idx===dayIdx); }
function getRunLog(mode,week,dayIdx) { return runsCache.find(r => r.mode===mode && r.week===week && r.day_idx===dayIdx); }
function runsThisWeekCount() {
  const p = currentPeriod();
  if (p.mode === 'pre') return runsCache.filter(r => r.mode==='pre' && r.week===p.week && r.day_idx>=0).length;
  return runsCache.filter(r => r.mode==='plan' && r.week===p.week && r.day_idx>=0).length;
}

// ── PERIOD CONSTANTS ──────────────────────────────────────────────────────────
const PERIOD      = currentPeriod();
const CURR        = PERIOD.mode === 'plan' ? PERIOD.week : 0;
const PRE_WEEK    = PERIOD.mode === 'pre'  ? PERIOD.week : 0;
const PRE_TRAINING = PERIOD.mode === 'pre';
const PLAN_DONE   = PERIOD.mode === 'done';

// ── STRETCH GUIDES ────────────────────────────────────────────────────────────
const STRETCH_GUIDES = {
  heels: {
    title: 'HEEL & ARCH STRETCH',
    steps: ['Sit on a chair, cross one foot over your opposite knee.','Loop a towel around the ball of your foot and gently pull toes toward you.','You should feel a stretch along the arch and into the heel.','Hold 30 sec. Repeat 3× each foot.','Also: stand on a step, heels hanging off edge. Rise on both feet, lower slowly on one over 3 counts. 15 reps each side.'],
    hold: '30 sec · 3× each foot',
    feels: 'Pull along the arch and underside of the heel.',
    stop: 'Sharp stabbing pain in the heel — rest and ice instead.',
    query: 'plantar fasciitis arch stretch for runners how to'
  },
  calves: {
    title: 'CALF STRETCH',
    steps: ['Stand facing a wall, both hands flat on the surface.','Step one foot back, keeping that heel flat on the floor.','Lean forward gently until you feel the pull along the back of your lower leg.','Keep the back knee straight for the gastrocnemius, then slightly bent for the soleus (deeper muscle).','Hold 30 sec each side. Do both variations.'],
    hold: '30 sec · 3× each side',
    feels: 'Pull along the back of the lower leg, from mid-calf down toward the heel.',
    stop: 'Pain in the Achilles tendon (the cord above the heel) — stop and rest.',
    query: 'calf stretch for runners how to technique'
  },
  knees: {
    title: 'IT BAND & QUAD STRETCH',
    steps: ['For the quad: stand on one leg (hold a wall for balance), pull the other foot toward your glute — grip the ankle, not the foot.','Hold 30 sec each side.','For IT band tightness: lie on your back, cross one leg over the other and gently press the knee toward the floor. Hold 45 sec.','Foam roll the outer quad — NOT the IT band directly — in slow passes.'],
    hold: '30–45 sec · each side',
    feels: 'Stretch along the front of the thigh (quad) or outer hip (IT band).',
    stop: 'Sharp outer knee pain — reduce mileage, ice for 15 min.',
    query: 'IT band quad stretch for runners knee pain how to'
  },
  shins: {
    title: 'SHIN STRETCH',
    steps: ['Kneel on a soft surface, tops of feet flat on the floor.','Sit back gently onto your heels until you feel a stretch along the shins.','Hold 20–30 sec. Release and repeat 3×.','Also: while seated, write the alphabet with your big toe — loosens the ankle and reduces shin stress.'],
    hold: '20–30 sec · 3×',
    feels: 'Mild stretch along the front of the lower leg.',
    stop: 'Any sharp pain along the shinbone — rest, ice, and reduce mileage.',
    query: 'shin splints stretch prevention for runners how to'
  },
  hips: {
    title: 'HIP FLEXOR STRETCH',
    steps: ['Kneel on one knee on a soft surface (kneeling lunge position).','Keep your torso upright and shift your weight forward slowly.','You should feel a stretch at the front of the hip of the kneeling leg.','For deeper: raise the arm on the kneeling side and lean slightly away.','Hold 45 sec each side.'],
    hold: '45 sec · 3× each side',
    feels: 'Pull at the front of the hip, sometimes into the upper thigh.',
    stop: 'Low back pain — check your posture, keep the core engaged.',
    query: 'hip flexor stretch for runners how to desk workers'
  }
};

// ── GROCERY LIST ──────────────────────────────────────────────────────────────
const GROCERY_LIST = [
  { category:'🥬 PRODUCE', items:['Fresh ginger root','Baby bok choy (1 bag)','Green onions / scallions','Sweet potatoes (2–3 medium)'] },
  { category:'🐟 PROTEIN', items:['Chicken breasts (1.5–2 lbs)','Extra-firm tofu (2 blocks)','White fish fillets — any fresh local white fish','Eggs (half dozen)'] },
  { category:'🌾 GRAINS', items:['Brown rice (or white rice if unavailable)','Low-sodium chicken or veg stock'] },
  { category:'🫙 PANTRY (buy once)', items:['Soy sauce','Sesame oil','Sesame seeds','Black or white pepper','Cooking wine or lemon juice'] }
];

// ── RECIPE ROTATION (4 weekly menus × 5 recipes) ─────────────────────────────
const RECIPE_MENUS = {
  A: [
    { id:'ginger-chicken', name:'Ginger Sesame Chicken Bowl', icon:'🍗', label:'SUNDAY BATCH · 5 MIN HANDS-ON', why:'Classic Taiwanese pantry flavours. Soy + ginger is alkaline — calms reflux. Slow-release rice keeps insulin steady.', steps:['Bake chicken breast with soy sauce, sesame oil, ginger 25 min at 200°C','Steam bok choy in rice cooker tray while rice cooks','Portion into 5 containers with rice + veg + sesame seeds'] },
    { id:'bok-choy-fish', name:'Bok Choy & Fish in Broth', icon:'🐟', label:'WEDNESDAY · 10 MIN', why:'White fish digests in 30 min — shortest wait before a run of any protein. Broth keeps it light and reflux-safe.', steps:['Boil 2 cups stock with ginger slices','Add fish fillet + bok choy','Simmer 7 min, season with soy sauce + sesame oil'] },
    { id:'sweet-potato-egg', name:'Sweet Potato + Egg', icon:'🍠', label:'WEEKNIGHT · 5 MIN', why:'Sweet potato is naturally alkaline — best food for acid reflux. Lower GI than rice.', steps:['Microwave prepped sweet potato 90 sec','Fry or poach 2 eggs alongside','Top with soy sauce + sesame oil + pepper'] },
    { id:'quick-congee', name:'Quick Congee (粥)', icon:'🍚', label:'TIRED NIGHT · 12 MIN', why:'Liquid base digests fastest — eat at 7pm, run at 7:30pm comfortably. Uses Sunday batch rice.', steps:['Add leftover rice + 2 cups stock to pot','Simmer 10 min, stir to break down','Top with shredded batch chicken, green onion, white pepper'] },
    { id:'steamed-egg', name:'Taiwanese Steamed Egg (蒸蛋)', icon:'🥚', label:'LIGHT NIGHT · 12 MIN HANDS-OFF', why:'2 min to mix, 10 min unattended. Pure protein, silky texture. Classic Taiwanese weeknight.', steps:['Beat 3 eggs + 1.5 cups warm stock + 1 tsp soy sauce','Cover bowl, steam on LOW 10–12 min','Drizzle sesame oil + green onion to finish'] }
  ],
  B: [
    { id:'miso-cod', name:'Miso-Glazed Fish + Rice', icon:'🐟', label:'SUNDAY BATCH · 8 MIN', why:'Miso is probiotic — supports gut health and reduces reflux over time. Any white fish works.', steps:['Mix 1 tbsp miso + 1 tsp soy sauce + tiny sesame oil','Brush over fish fillets, bake 200°C for 12 min','Serve over batch rice with steamed bok choy'] },
    { id:'tofu-bowl', name:'Soy-Ginger Tofu Bowl', icon:'🧊', label:'SUNDAY BATCH · 5 MIN HANDS-ON', why:'Tofu is alkaline — actively calms acid reflux. Bakes alongside chicken so zero extra time.', steps:['Cube extra-firm tofu, toss with soy sauce + sesame oil + grated ginger','Spread on tray, bake 200°C 25 min alongside chicken','Portion with rice + bok choy'] },
    { id:'scallion-noodles', name:'Scallion Chicken Noodles', icon:'🍜', label:'WEEKNIGHT · 10 MIN', why:'Rice noodles digest fast — great for late-evening meals before a run. Green onion is a Taiwanese staple that adds flavour without acid.', steps:['Boil rice noodles 4 min, drain','Toss with soy sauce, sesame oil, white pepper','Top with shredded batch chicken + green onion + sesame seeds'] },
    { id:'soba-sesame', name:'Soba + Sesame Sauce', icon:'🌿', label:'WEEKNIGHT · 10 MIN', why:'Soba (buckwheat) has a lower GI than regular noodles and digests cleanly. Cold or warm — works either way.', steps:['Boil soba noodles 4 min, rinse under cold water','Sauce: 1 tbsp soy sauce + 1 tsp sesame oil + pinch sugar','Toss noodles, top with any batch protein + sesame seeds'] },
    { id:'egg-drop-soup', name:'Egg Drop Soup', icon:'🥣', label:'LIGHTEST OPTION · 8 MIN', why:'The fastest, lightest meal for high-training days. Virtually zero digestion time — safe to eat 30 min before a run.', steps:['Bring 2 cups stock to boil with ginger','Beat 2 eggs, drizzle slowly while stirring to form ribbons','Season with white pepper + sesame oil + green onion'] }
  ],
  C: [
    { id:'steamed-chicken-rice', name:'Steamed Chicken + Rice', icon:'🍗', label:'SUNDAY BATCH · 3 MIN HANDS-ON', why:'Hainanese-style — the purest form of lean fuel. Nothing to trigger reflux, everything to fuel running.', steps:['Rub chicken breast with salt, ginger, sesame oil','Steam over rice cooker water tray 25 min while rice cooks','Slice, portion into containers with rice + any veg'] },
    { id:'tofu-mushroom-soup', name:'Tofu Mushroom Soup', icon:'🧊', label:'WEEKNIGHT · 12 MIN', why:'Silken tofu in warm broth is the most reflux-safe meal in this rotation. Mushrooms add umami without acid.', steps:['Simmer 2 cups stock with any mushrooms (dried OK) 8 min','Add cubed silken tofu, heat 2 min — do not boil hard','Season with soy sauce, white pepper, sesame oil, green onion'] },
    { id:'rice-noodle-soup', name:'Rice Noodle Soup', icon:'🍜', label:'WEEKNIGHT · 10 MIN', why:'Taiwanese comfort food at its fastest. Rice noodles digest in under 20 min — safe for evening runs.', steps:['Boil rice noodles 3 min in stock (not water — adds flavour)','Add any batch chicken or tofu in the last minute','Top with green onion, white pepper, drizzle sesame oil'] },
    { id:'silken-tofu-ginger', name:'Silken Tofu in Ginger Broth', icon:'🫙', label:'REST DAY LIGHT MEAL · 5 MIN', why:'Ultra-gentle on the stomach. Best on rest days or when reflux has been present.', steps:['Bring 1.5 cups stock to simmer with ginger slices','Add block of silken tofu, warm through 2 min','Drizzle soy sauce + sesame oil, top with green onion'] },
    { id:'taiwanese-braised-tofu', name:'Taiwanese Braised Tofu', icon:'🧊', label:'WEEKEND · 10 MIN', why:'Lu wei (滷) flavour — soy sauce + five spice is deeply Taiwanese. Make a batch for the week.', steps:['Brown tofu cubes in minimal oil 3 min each side','Add soy sauce + splash cooking wine + star anise if available','Simmer with a little stock 5 min until sauce thickens'] }
  ],
  D: [
    { id:'congee-soft-egg', name:'Congee + Soft-Boiled Egg', icon:'🍚', label:'SUNDAY BATCH · 20 MIN HANDS-OFF', why:'Full batch congee made Sunday — reheat all week in 2 min. Egg adds protein without any cooking.', steps:['Cook 1 cup rice + 6 cups stock on low 20 min (or rice cooker porridge mode)','Soft-boil eggs: 7 min boiling water, ice bath immediately','Serve congee with half an egg, ginger, white pepper, sesame oil'] },
    { id:'da-lu-mian', name:'Da Lu Mian (打滷麵)', icon:'🍜', label:'WEEKEND · 15 MIN', why:'Northern Taiwanese braised sauce noodle — cornstarch-thickened sauce is gentle on the stomach.', steps:['Sauté any veg + protein in a little oil 3 min','Add 1.5 cups stock + 1 tbsp soy sauce + 1 tsp sesame oil','Mix 1 tbsp cornstarch in cold water, stir in to thicken','Boil noodles separately, pour sauce over top'] },
    { id:'oyster-bok-choy', name:'Bok Choy in Oyster Sauce + Rice', icon:'🥬', label:'FASTEST WEEKNIGHT · 8 MIN', why:'The fastest hot vegetable side. Oyster sauce is lower acid than most condiments and stir-fry takes 3 min.', steps:['Heat wok or pan very hot, add 1 tsp oil','Add bok choy halves, toss 2 min until wilted','Drizzle 1 tbsp oyster sauce + tiny sesame oil, serve over batch rice'] },
    { id:'sweet-potato-congee', name:'Sweet Potato Congee', icon:'🍠', label:'RECOVERY DAY · 20 MIN HANDS-OFF', why:'Extra alkaline and extra soothing. Best on days after hard runs when the stomach is sensitive.', steps:['Add diced sweet potato + rice + 5 cups stock to a pot','Simmer 20 min until rice breaks down and sweet potato is soft','Season with ginger, white pepper, green onion'] },
    { id:'egg-rice-bowl', name:'Soy Egg Rice Bowl', icon:'🥚', label:'5-MINUTE WEEKNIGHT', why:'The fastest complete meal. Soy-marinated egg over rice with sesame oil is a Taiwanese staple that takes under 5 min if eggs are pre-made.', steps:['Soft-boil eggs in advance (7 min), marinate in soy sauce + water overnight','Microwave batch rice 2 min','Top with halved marinated egg, sesame oil, green onion, sesame seeds'] }
  ],
  travel: [
    { id:'pasta-tuna', name:'Pasta + Tuna', icon:'🍝', label:'ANYWHERE · 10 MIN', why:'Pasta is the most reliable slow-release carb in European supermarkets. Tuna in spring water is lean and fast-digesting.', steps:['Boil pasta 8–10 min (any shape)','Drain, top with tinned tuna in spring water (not oil)','Drizzle olive oil, black pepper, squeeze of lemon'] },
    { id:'eggs-toast', name:'Eggs + Toast', icon:'🍳', label:'HOTEL KITCHEN · 8 MIN', why:'Eggs digest quickly. Wholegrain toast is low GI. No butter — use olive oil to avoid reflux trigger.', steps:['Scramble or poach 2–3 eggs','Toast wholegrain bread — no butter','Drizzle olive oil, black pepper. Optional: handful of spinach'] },
    { id:'rice-packet-chicken', name:'Microwave Rice + Rotisserie Chicken', icon:'🍗', label:'EASIEST OPTION · 5 MIN', why:'Every European supermarket has microwave rice packets and deli counter rotisserie chicken. Same macros as your batch bowl at home.', steps:['Microwave rice packet per packet instructions','Pull breast meat off rotisserie chicken at deli counter','Drizzle soy sauce (from your bag) + black pepper'] },
    { id:'yoghurt-oats', name:'Greek Yoghurt + Oats', icon:'🥣', label:'NO KITCHEN · 3 MIN', why:'Works in a hotel room with no equipment. Best for morning long run days. Dairy needs 60 min to settle before running.', steps:['Soak oats in cold water 5 min (or microwave 2 min)','Top with plain Greek yoghurt','Add banana or berries — eat 60 min before your run'] },
    { id:'grain-bowl', name:'Supermarket Grain Bowl + Poached Egg', icon:'🌾', label:'LUNCH RUN · 10 MIN', why:'Pre-made grain bowls (farro, quinoa, barley) are in every European supermarket deli. Add an egg for protein without cooking.', steps:['Buy pre-made grain salad bowl from supermarket deli','Poach one egg: simmering water + splash of vinegar, 3 min','Place egg on top, drizzle olive oil, season with pepper'] }
  ]
};

function getActiveMenu() {
  const p = currentPeriod();
  const weekNum = p.mode === 'plan' ? p.week : (p.mode === 'pre' ? 0 : 18);
  return ['A','B','C','D'][weekNum % 4];
}

function getTodayRecipe() {
  const menu = RECIPE_MENUS[isHomeLocation() ? getActiveMenu() : 'travel'];
  const dayIdx = todayDayIdx();
  return menu[dayIdx % menu.length];
}

// ── TIPS DATA ─────────────────────────────────────────────────────────────────
const WEEKLY_TIPS = {
  1:[
    {icon:'🦶',tag:'STRETCHING',title:'CALF STRETCH — START HERE',stretch:'calves',body:'After every run: stand facing a wall, back leg straight, heel flat. Lean in until you feel the pull along your calf. Hold 30 sec each side. Calves absorb the most impact — make this non-negotiable from day one.'},
    {icon:'🦶',tag:'INJURY PREVENTION',title:'ECCENTRIC HEEL DROPS',stretch:'heels',body:'Stand on a step, heels hanging off. Rise on two feet, lower slowly on one over 3 counts. 3 sets of 15 each side, daily. Your single best protection against Achilles tendonitis — start now.'},
    {icon:'💧',tag:'NUTRITION',title:'HYDRATION BASICS',body:'Drink 500ml water 2 hours before every run. During runs over 60 min, take 150–200ml every 20 min. Thirst is already dehydration — don\'t wait for it.'}
  ],
  2:[
    {icon:'🍑',tag:'STRETCHING',title:'GLUTE STRETCH — FIGURE FOUR',body:'Lie on your back. Cross one ankle over the opposite knee and gently pull the uncrossed leg toward you. Hold 45 sec each side. Tight glutes shift load to your knees on downhills.'},
    {icon:'😴',tag:'RECOVERY',title:'SLEEP IS TRAINING',body:'8+ hours after long runs. Growth hormone releases during deep sleep — that\'s when your muscles actually rebuild. Monday rest only works if you actually sleep.'},
    {icon:'🥚',tag:'NUTRITION',title:'POST-RUN RECOVERY WINDOW',body:'Within 30 min of finishing: eat 3:1 carbs to protein — rice + egg, banana + Greek yoghurt. This window is when glycogen replenishment is fastest. Missing it adds a full day to recovery.'}
  ],
  3:[
    {icon:'🌀',tag:'STRETCHING',title:'FOAM ROLL YOUR CALVES',stretch:'calves',body:'5 min before and after every run. Roll slowly from ankle to knee, pause 20–30 sec on tight spots. Your calves absorb 3× bodyweight each stride.'},
    {icon:'📏',tag:'INJURY PREVENTION',title:'TRUST THE STEPBACK WEEK',body:'This week\'s long run drops — don\'t override it. Stepback weeks let bones and tendons adapt to the load. Running extra doesn\'t help; it delays the adaptation.'},
    {icon:'🫙',tag:'NUTRITION',title:'LONG RUN BREAKFAST',body:'2 hours before Sunday runs: oats, banana, a little peanut butter. Test this until it settles perfectly. This routine should be identical on 15 November.'}
  ],
  4:[
    {icon:'🧘',tag:'STRETCHING',title:'HIP FLEXOR STRETCH',stretch:'hips',body:'Kneel on one knee, shift weight forward until you feel a pull at the front of your hip. Hold 30–45 sec each side after every run. Tight hip flexors cause lower back pain on long runs.'},
    {icon:'👟',tag:'GEAR CHECK',title:'SHOE MILEAGE CHECK',body:'Running shoes should be replaced every 600–800km. Worn cushioning is a top cause of knee and shin injuries. Check yours now.'},
    {icon:'🍌',tag:'NUTRITION',title:'START PRACTISING GELS',body:'Begin testing gels on Sunday — take one at 60 min. Your gut needs training just like your legs. Try 2–3 brands. Never use a gel on race day you haven\'t tested in training.'}
  ],
  5:[
    {icon:'🦢',tag:'STRETCHING',title:'PIGEON POSE',body:'From downward dog, bring one knee forward toward your wrist. Lower hips toward the floor. Hold 60–90 sec per side. Best done after Sunday long runs while hips are warm.'},
    {icon:'🦵',tag:'INJURY PREVENTION',title:'CLAMSHELLS FOR YOUR KNEES',stretch:'knees',body:'Lie on your side, knees bent, feet together. Lift top knee like a clamshell — 15 reps, 3 sets each side. Targets the gluteus medius, which stops knees collapsing inward when tired.'},
    {icon:'🧂',tag:'NUTRITION',title:'ELECTROLYTES — START NOW',body:'For runs over 90 min, plain water isn\'t enough. Add electrolyte tabs or a sports drink. Low sodium causes cramping in the final 10km — more common than dehydration.'}
  ],
  6:[
    {icon:'🌀',tag:'STRETCHING',title:'FOAM ROLL FULL ROUTINE',stretch:'calves',body:'Pre-run 5 min: calves, quads, glutes. Post-run 10 min: same plus hamstrings. Roll slowly, pause on tender spots 20–30 sec.'},
    {icon:'⚠️',tag:'INJURY PREVENTION',title:'STEPBACK — RESPECT IT',body:'Long run drops this week. Your bones and tendons are calcifying under the load. Extra km now add injury risk right before your most important training weeks.'},
    {icon:'🧊',tag:'RECOVERY',title:'ICE YOUR LEGS',body:'After long runs over 20km: cold water on your legs in the shower for 5 minutes. Reduces inflammation and shortens recovery. A full ice bath works slightly better — but you\'ll actually do the shower.'}
  ],
  7:[{icon:'🦵',tag:'STRETCHING',title:'IT BAND — WHAT NOT TO DO',stretch:'knees',body:'Don\'t stretch the IT band directly. Foam roll the glute and quad around it. If you feel outer knee tightness, back off mileage 2 days and roll aggressively.'},{icon:'🦴',tag:'INJURY PREVENTION',title:'SHIN SPLINTS — EARLY WARNING',stretch:'shins',body:'Pain along the inner shinbone that worsens on impact: stop immediately, ice 3× daily. Coming back too early turns 2 days off into 2 weeks.'},{icon:'💧',tag:'NUTRITION',title:'AID STATION WALK STRATEGY',body:'Walk 30–60 sec at every simulated aid stop on Sunday, drink 150–200ml. Practice the Kobe aid station strategy now.'}],
  8:[{icon:'🧘',tag:'STRETCHING',title:'PIGEON POSE POST HALF',body:'After Sunday\'s half marathon: spend 90 sec each side in pigeon pose immediately. Your hips held the same position for 2+ hours.'},{icon:'🍌',tag:'RACE PREP',title:'HALF MARATHON GEAR TEST',body:'Sunday is your dress rehearsal — wear race socks, shorts, shoes, and watch. Note anything that chafed or didn\'t sit well. You have 10 weeks to fix it.'},{icon:'🧊',tag:'RECOVERY',title:'COLD RINSE AFTER SUNDAY',body:'After the half marathon: cold water on legs 5 min, eat within 30 min, elevate legs 20 min.'}],
  9:[{icon:'🦢',tag:'STRETCHING',title:'HIP OPENER — NON-NEGOTIABLE',stretch:'hips',body:'Pigeon pose is mandatory as long runs exceed 20km. Hold 90 sec per side while still warm. If you do only one stretch, do this one.'},{icon:'📏',tag:'INJURY PREVENTION',title:'STEPBACK — LET IT HAPPEN',body:'Long run drops from last week\'s half. Adding extra km now to "keep momentum" is exactly how overuse injuries start.'},{icon:'🧂',tag:'NUTRITION',title:'ELECTROLYTES — MANDATORY',body:'You\'re running over 90 min every Sunday. Every long run from now: electrolytes from the start. Make it as automatic as lacing up.'}],
  10:[{icon:'🌀',tag:'STRETCHING',title:'FULL FOAM ROLL PROTOCOL',stretch:'calves',body:'10 min post every long run: calves, quads, hamstrings, glutes. Pause 30 sec on anything tender. Maintenance on a machine you\'re running hard every week.'},{icon:'🫚',tag:'INJURY PREVENTION',title:'IRON CHECK WEEK',body:'Week 10: get a blood test. High mileage depletes iron especially in female runners. Signs: unusual fatigue, breathing harder than expected.'},{icon:'🍝',tag:'NUTRITION',title:'CARB LOADING REHEARSAL',body:'In the 48 hrs before Sunday\'s long run, shift to 70% carbs. Rice, oats, pasta, bread. Practice for race week — find what your gut handles well.'}],
  11:[{icon:'🦵',tag:'STRETCHING',title:'QUAD STRETCH — PEAK WEEKS',body:'Stand on one leg, pull your other foot toward your glute. Hold the ankle — not the foot. Hold 30 sec each side after every run.'},{icon:'⚠️',tag:'INJURY PREVENTION',title:'EASY PACE IS NOT OPTIONAL',body:'At 25km+ long runs, running 30–90 sec/km slower than race pace is critical. If you\'re breathing too hard to speak a full sentence, slow down.'},{icon:'🧊',tag:'RECOVERY',title:'ICE BATH AFTER 25KM+',body:'After runs over 25km: 10–15 min in cold water (12–15°C). Reduces inflammation and shortens recovery by a full day.'}],
  12:[{icon:'🌀',tag:'STRETCHING',title:'STEPBACK WEEK — STRETCH FOCUS',body:'Lower mileage this week means more time for stretching. Spend 20 min: calves, hip flexors, glutes, pigeon pose, IT band foam roll.'},{icon:'📏',tag:'INJURY PREVENTION',title:'TRUST THE STEPBACK',body:'Long run drops this week. Extra km now add injury risk right before your most important 3 weeks.'},{icon:'🎽',tag:'RACE PREP',title:'RACE KIT — START TESTING',body:'Wear your intended race socks and shorts on this week\'s long run. Check for hot spots. You have 6 weeks to fix anything.'}],
  13:[{icon:'🦢',tag:'STRETCHING',title:'HIPS DAILY — PEAK BLOCK',stretch:'hips',body:'Pigeon pose every single day this week — not just after runs. Morning routine: 5 min pigeon each side before breakfast.'},{icon:'⚠️',tag:'RACE PREP',title:'KOBE OHASHI BRIDGE PREP',body:'Steep incline at 35km over Kobe Ohashi Bridge. Prepare quads with reverse lunges and step-downs after runs.'},{icon:'💧',tag:'NUTRITION',title:'AID STATION STRATEGY',body:'Walk every simulated aid station on Sunday\'s long run — 30–60 sec, 150ml fluid. Practice until it\'s automatic.'}],
  14:[{icon:'🧘',tag:'STRETCHING',title:'RECOVERY WEEK — FULL STRETCH',body:'Stepback week: 20 min full routine. Calves, hip flexors, figure-four glute, pigeon, quad, hamstring. Consider a sports massage this week.'},{icon:'🎽',tag:'RACE PREP',title:'RACE KIT FINAL REHEARSAL',body:'Wear your complete race outfit on this week\'s long run — exact shoes, socks, shorts, top, watch, race belt.'},{icon:'🍝',tag:'NUTRITION',title:'PRACTICE RACE MORNING',body:'2 hours before Sunday\'s run: eat your planned race breakfast. Note how you felt at km 10, 15, 20.'}],
  15:[{icon:'🦵',tag:'STRETCHING',title:'THE 20-MILER RECOVERY STRETCH',body:'After today\'s 32km: spend 15 min in full stretch immediately. Pigeon pose 90 sec each side. Foam roll quads. Do not skip this.'},{icon:'🧊',tag:'INJURY PREVENTION',title:'ICE BATH — DO IT TODAY',body:'After the 20-miler: cold shower on legs 10 min, eat within 30 min, legs elevated 20 min. Most important recovery day of your training cycle.'},{icon:'🎽',tag:'RACE PREP',title:'EVERYTHING CONFIRMED',body:'You just ran your longest training run. Everything you wore, ate, and did today is locked in for race day.'}],
  16:[{icon:'🌀',tag:'STRETCHING',title:'TAPER — STRETCH MORE',body:'Less running means more stretching time. Full 20 min routine daily. Staying loose means arriving at the start line in the best possible condition.'},{icon:'📅',tag:'INJURY PREVENTION',title:'TAPER MADNESS IS REAL',body:'You feel sluggish and convinced you\'re losing fitness. You\'re not. Your body is storing glycogen and repairing tissue. Ignore the urge to run more.'},{icon:'🍝',tag:'RACE PREP',title:'START CARB LOADING',body:'This week shift toward 65–70% carbs at meals. Rice, pasta, oats, bread, fruit. Fill glycogen stores — don\'t overeat.'}],
  17:[{icon:'🧘',tag:'STRETCHING',title:'GENTLE DAILY STRETCH ONLY',body:'No deep stretching or foam rolling this week — just gentle movement. 10 min morning routine: leg swings, ankle circles, hip rotations.'},{icon:'📅',tag:'RACE PREP',title:'WRITE DOWN RACE MORNING',body:'Plan it precisely: wake time, breakfast, transport, arrival, warm-up. Walk the course mentally from gun to finish. Know where Ohashi Bridge is.'},{icon:'☕',tag:'NUTRITION',title:'CAFFEINE STRATEGY',body:'200mg caffeine 45 min before gun improves endurance 2–4%. One strong coffee — only if you\'ve tested this in training.'}],
  18:[{icon:'🌀',tag:'STRETCHING',title:'RACE WEEK — STAY LOOSE',body:'Short daily walks, gentle leg swings, light calf stretches. No foam rolling the day before the race. Your job: arrive feeling fresh.'},{icon:'🧠',tag:'RACE PREP',title:'THE MENTAL WALL AT KM 30',body:'Around km 30–35 your glycogen depletes and your brain sends STOP signals. This is expected. Break the race into sections: just get to the next aid station. 🌸'},{icon:'🌅',tag:'RACE PREP',title:'RACE MORNING CHECKLIST',body:'Wake 3 hrs before gun. Eat practiced breakfast. Arrive 60 min early. 10 min easy walking warm-up. First 10km should feel embarrassingly easy. Walk every aid station. Smile at Ohashi Bridge. Finish.'}]
};

const PRETRAIN_TIPS = {
  1:[
    {icon:'🐣',tag:'GETTING STARTED',title:'WHY PRE-TRAINING MATTERS',body:'The Hal Higdon plan assumes you can already run 5km comfortably 3× a week. These 6 weeks get you there safely. Build the base first.'},
    {icon:'🍳',tag:'FOOD & FUEL',title:'EAT BEFORE YOU RUN — ALWAYS',body:'Even for short runs, eat a small snack 60–90 min before. A banana, toast with peanut butter, or a small bowl of oats. Feed the machine.'},
    {icon:'🌅',tag:'ROUTINE',title:'PICK YOUR RUN DAYS NOW',body:'Decide which 3 days per week you\'ll run and put them in your calendar. Tuesday, Thursday, Sunday matches the plan structure you\'ll follow for 6 months.'}
  ],
  2:[
    {icon:'🦶',tag:'INJURY PREVENTION',title:'ECCENTRIC HEEL DROPS — START NOW',stretch:'heels',body:'Stand on a step, heels hanging off. Rise on two feet, lower slowly on one over 3 counts. 3 sets of 15 each side, daily. Your best protection against Achilles tendonitis.'},
    {icon:'🥣',tag:'FOOD & FUEL',title:'YOUR PRE-RUN BREAKFAST',body:'For Sunday runs: oats with banana and peanut butter, 90 min before you leave. This is the breakfast you\'ll eat on race morning in November. Start testing now.'},
    {icon:'😴',tag:'ROUTINE',title:'PROTECT YOUR SLEEP',body:'Set a consistent bedtime — even on non-run days. Sleep is when your body rebuilds from training. Good sleep is the cheapest performance tool you have.'}
  ],
  3:[
    {icon:'🌀',tag:'STRETCHING',title:'5 MIN AFTER EVERY RUN',stretch:'calves',body:'Just five minutes: calf stretch on a wall, hip flexor lunge, figure-four glute. Every single time while muscles are still warm. This habit will protect you all the way to race day.'},
    {icon:'🥗',tag:'FOOD & FUEL',title:'EAT MORE THAN YOU THINK',body:'New runners often underfuel without realising. Don\'t restrict food during training — especially carbs. Rice, oats, bread, pasta, fruit are your best friends.'},
    {icon:'📱',tag:'ROUTINE',title:'TRACK YOUR RUNS — START NOW',body:'Log every run: date, distance, how you felt. This data becomes motivating as training gets harder. Seeing Week 1 PT runs alongside Week 15 long runs tells a story worth reading.'}
  ],
  4:[
    {icon:'🧘',tag:'STRETCHING',title:'HIP FLEXORS — YOUR WEAKEST LINK',stretch:'hips',body:'Most desk workers have chronically tight hip flexors. Kneel on one knee, shift weight forward until you feel the pull at the front of your hip. Hold 30–45 sec each side after every run.'},
    {icon:'🍌',tag:'FOOD & FUEL',title:'CARBS ARE NOT THE ENEMY',body:'Marathon training runs on carbohydrates. Your muscles store them as glycogen — the primary fuel for runs over 30 minutes. Rice, oats, sweet potato, banana: eat them without guilt.'},
    {icon:'🌙',tag:'ROUTINE',title:'EVENING RUNS — WHAT TO EAT',body:'If you run after work, have a light carb-based snack 60–90 min before. Don\'t run on a full dinner (wait 2 hrs) and don\'t run on empty — you\'ll hate every minute.'}
  ],
  5:[
    {icon:'🦢',tag:'STRETCHING',title:'PIGEON POSE — ADD THIS NOW',body:'From downward dog, bring one knee forward toward your wrist, lower your hips. Hold 60 sec per side. Adding this 7 weeks before the plan starts means it\'s already a habit when long runs begin.'},
    {icon:'🫙',tag:'FOOD & FUEL',title:'POST-RUN RECOVERY WINDOW',body:'Within 30 min of finishing: 3:1 carb-to-protein. Banana + Greek yoghurt. Rice + egg. Chocolate milk. This window is when your muscles absorb nutrients fastest.'},
    {icon:'💆',tag:'ROUTINE',title:'BUILD A REST DAY RITUAL',body:'Monday is rest day in the plan. Use it for something that actively recovers you: a slow walk, a bath, foam rolling, or just doing nothing physical.'}
  ],
  6:[
    {icon:'🌀',tag:'STRETCHING',title:'FULL PRE-RUN WARM-UP',body:'Before every run from now: 5 min of leg swings, hip circles, ankle rotations, and a slow 3-minute walk to ease in. Cold muscles are injury-prone muscles.'},
    {icon:'🍽️',tag:'FOOD & FUEL',title:'RACE WEEK NUTRITION — PREVIEW',body:'In the 3 days before Sunday\'s long run, eat slightly more carbs than usual. This is your first mini carb-load rehearsal. Notice how you feel on Sunday — you\'ll feel the difference.'},
    {icon:'📅',tag:'ROUTINE',title:'YOU\'RE READY FOR THE PLAN',body:'Next week the official Hal Higdon plan begins. Your legs know what running feels like. Your gut knows what to eat. Your calendar knows which days are run days. Go get it. 🐢'}
  ]
};

// ── BADGES ────────────────────────────────────────────────────────────────────
const BADGES = [
  {emoji:'👟', name:'FIRST RUN',    desc:'Completed your first training run',        unlock:()=> totalKmLogged() > 0},
  {emoji:'🔥', name:'DOUBLE UP',   desc:'Ran 2× the prescribed distance in a run',  unlock:()=> runsCache.some(r => { const sch = r.mode==='pre'?PRETRAIN:SCHEDULE; const plan = sch[r.week-1]?.[r.day_idx]?.km; return plan && r.km_actual && parseFloat(r.km_actual) >= plan*2; })},
  {emoji:'📅', name:'FULL WEEK',   desc:'Completed all runs in a training week',     unlock:()=> { for (let w=1;w<=Math.max(CURR,PRE_WEEK);w++) { const sch=PRE_TRAINING?PRETRAIN:SCHEDULE; const days=sch[w-1]||[]; const runDays=days.filter(d=>d.type!=='rest'&&d.type!=='cross').length; const logged=runsCache.filter(r=>r.mode===(PRE_TRAINING?'pre':'plan')&&r.week===w&&r.day_idx>=0).length; if(runDays>0&&logged>=runDays) return true; } return false; }},
  {emoji:'⚡', name:'100KM CLUB',  desc:'Logged 100km in training',                 unlock:()=> totalKmLogged() >= 100},
  {emoji:'🌙', name:'NIGHT OWL',   desc:'3 evening runs logged (after 7:30pm)',      unlock:()=> runsCache.filter(r => r.notes && r.notes.includes('evening')).length >= 3},
  {emoji:'🌍', name:'GLOBE RUNNER',desc:'Logged a run outside Toronto or Taiwan',    unlock:()=> runsCache.some(r => r.notes && r.notes.includes('abroad'))},
  {emoji:'🌓', name:'21KM DONE',   desc:'Completed the half marathon long run',      unlock:()=> CURR >= 8 || runsCache.some(r=>r.km_actual && parseFloat(r.km_actual)>=21)},
  {emoji:'🗻', name:'THE 20-MILER',desc:'Completed the 32km peak run in Week 15',   unlock:()=> CURR >= 15},
  {emoji:'🌸', name:'TAPER MODE',  desc:'Entered Week 16. You\'ve done the work.',  unlock:()=> CURR >= 16},
  {emoji:'🏁', name:'KOBE BOUND',  desc:'Completed all 18 plan weeks',              unlock:()=> CURR >= 18},
];

// ── HEADER ────────────────────────────────────────────────────────────────────
function updateHeader() {
  const loc = LOCATIONS[currentLocIdx];
  const pill = document.getElementById('hdr-location-pill');
  if (pill) pill.textContent = `📍 ${loc.name.toUpperCase()} ▾`;
  const h = new Date().getHours();
  const greet = h < 12 ? 'GOOD MORNING' : h < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
  const greetEl = document.getElementById('hdr-greet');
  if (greetEl) greetEl.textContent = greet;
  const p = currentPeriod();
  const phaseEl = document.getElementById('hdr-phase');
  if (phaseEl) {
    if (p.mode === 'pre') phaseEl.textContent = `Pre-Training Wk ${p.week} · ${daysToRace()} days to Kobe`;
    else if (p.mode === 'plan') phaseEl.textContent = `Plan Wk ${p.week} · ${daysToRace()} days to Kobe`;
    else phaseEl.textContent = `Race day ${daysToRace() > 0 ? 'in '+daysToRace()+' days' : 'TODAY'}! 🌸`;
  }
  const marquee = `♥ DEBBIE RUNS KOBE ♥ 42.195KM ♥ 15 NOV 2026 ♥ ${loc.emoji} ${loc.name.toUpperCase()} ♥ ${daysToRace()} DAYS TO GO ♥`;
  const m = document.getElementById('marquee-text');
  if (m) m.textContent = marquee;
}

// ── LOCATION PICKER ───────────────────────────────────────────────────────────
function openLocPicker() {
  const list = document.getElementById('loc-list');
  list.innerHTML = LOCATIONS.map((l,i) => `
    <div class="loc-item ${i===currentLocIdx?'active':''}" onclick="switchLocation(${i})">
      <span class="loc-flag">${l.emoji}</span>
      <span>${l.name}<span style="font-size:11px;color:var(--brown-light);font-weight:400"> · ${l.country}</span></span>
      ${i===currentLocIdx ? '<span class="loc-check">✓</span>' : ''}
    </div>`).join('');
  const ov = document.getElementById('loc-overlay');
  ov.style.display = 'flex';
}
function closeLocPicker() {
  document.getElementById('loc-overlay').style.display = 'none';
}

// ── PANEL NAVIGATION ──────────────────────────────────────────────────────────
function switchPanel(name) {
  ['today','plan','miles','tips','meals'].forEach(p => {
    document.getElementById('panel-'+p).classList.toggle('active', p===name);
    const ni = document.getElementById('nav-'+p);
    if (ni) {
      ni.classList.toggle('active', p===name);
      const dot = ni.querySelector('.nav-dot');
      if (dot) dot.style.display = p===name ? 'block' : 'none';
    }
  });
  // lazy-render on first visit
  if (name === 'miles') renderMiles();
  if (name === 'tips') renderTips();
  if (name === 'meals') { renderMealTimeline(); renderTonightRecipe(); }
}

// ── TODAY PANEL ───────────────────────────────────────────────────────────────
function renderToday() {
  const p = currentPeriod();
  const dayIdx = todayDayIdx();
  const schedule = p.mode === 'pre' ? PRETRAIN[Math.max(0,p.week-1)] : (p.mode === 'plan' ? SCHEDULE[p.week-1] : null);
  const day = schedule ? schedule[dayIdx] : null;

  // hero
  const heroArea = document.getElementById('today-hero-area');
  if (day && day.type !== 'rest') {
    const isLong = day.type === 'long' || day.type === 'race';
    const mode = p.mode === 'pre' ? 'pre' : 'plan';
    const week = p.mode === 'pre' ? p.week : p.week;
    const logged = isRunLogged(mode, week, dayIdx);
    heroArea.innerHTML = `
      <div class="card hero-card ${isLong?'long':''}">
        <div class="card-body">
          <div class="card-label">${logged ? '✓ DONE TODAY' : (day.type==='easy'?'🏃 EASY RUN TODAY':day.type==='long'?'★ LONG RUN':day.type==='race'?'🌸 RACE DAY':day.type==='medium'?'🏃 MEDIUM RUN':'🏃 RUN TODAY')}</div>
          <div class="hero-km">${day.km||'—'}<span>km</span></div>
          <div class="hero-meta">${dayDetail(day, week)}</div>
          <hr class="card-divider">
          <div class="hero-window" id="hero-window-slot">
            <div class="chip chip-mint" id="hero-window-time">—</div>
            <div class="hero-window-text" id="hero-window-text">Calculating best window...</div>
          </div>
        </div>
      </div>`;
    updateHeroWindow();
  } else if (day && day.type === 'rest') {
    heroArea.innerHTML = `
      <div class="card hero-card rest-card">
        <div class="card-body">
          <div class="card-label">😴 REST DAY</div>
          <div class="rest-msg">No run scheduled.<br>Recovery is training.</div>
          <hr class="card-divider">
          <div class="hero-window">
            <div class="chip chip-mint">NEXT RUN</div>
            <div class="hero-window-text">${getNextRunText(schedule, dayIdx)}</div>
          </div>
        </div>
      </div>`;
  } else {
    heroArea.innerHTML = `
      <div class="card hero-card">
        <div class="card-body">
          <div class="card-label">🌸 KOBE MARATHON TRACKER</div>
          <div class="rest-msg" style="color:var(--terra-dark)">${daysToRace()} days to Kobe</div>
          <div style="font-size:12px;color:var(--brown-light);margin-top:8px">Pre-training begins 1 Jun 2026</div>
        </div>
      </div>`;
  }

  // fitness signal
  const sigArea = document.getElementById('today-signal-area');
  const signal = getFitnessSignal();
  sigArea.innerHTML = signal ? `<div class="signal-card"><div class="signal-label">💡 FITNESS SIGNAL</div><div class="signal-text">${signal}</div></div>` : '';

  // grocery / travel
  const grocArea = document.getElementById('today-grocery-area');
  const dow = today().getDay(); // 0=Sun, 6=Sat
  if (!isHomeLocation()) {
    grocArea.innerHTML = `<div class="grocery-banner travel"><div class="grocery-banner-icon">✈️</div><div><div class="grocery-banner-label">TRAVEL MODE</div><div class="grocery-banner-text">Grocery reminders paused. See Meals → Recipes → ✈️ Travelling for easy local options.</div></div></div>`;
  } else if (dow === 6) {
    grocArea.innerHTML = `<div class="grocery-banner home"><div class="grocery-banner-icon">🛒</div><div><div class="grocery-banner-label">SHOP TODAY</div><div class="grocery-banner-text"><strong>Saturday = grocery day.</strong> Stock up for the week — chicken, rice, bok choy, ginger, tofu.</div></div></div>`;
  } else if (dow === 0) {
    grocArea.innerHTML = `<div class="grocery-banner home"><div class="grocery-banner-icon">🍳</div><div><div class="grocery-banner-label">BATCH COOK TODAY</div><div class="grocery-banner-text"><strong>Sunday = prep day.</strong> 15 min hands-on — rice cooker + oven in parallel. Sets you up all week.</div></div></div>`;
  } else {
    grocArea.innerHTML = '';
  }

  // stat tiles
  document.getElementById('stat-week').textContent = p.mode === 'pre' ? `PT${p.week}` : (p.mode === 'plan' ? p.week : '18');
  document.getElementById('stat-km-week').textContent = kmThisWeek();
  document.getElementById('stat-days').textContent = Math.max(0, daysToRace());

  // CTA
  const ctaArea = document.getElementById('today-cta-area');
  if (day && day.type !== 'rest' && day.type !== 'cross') {
    const mode = p.mode === 'pre' ? 'pre' : 'plan';
    const week = p.mode === 'pre' ? p.week : p.week;
    const logged = isRunLogged(mode, week, dayIdx);
    ctaArea.innerHTML = logged
      ? `<div style="text-align:center;font-family:'Press Start 2P',monospace;font-size:7px;color:var(--green);padding:8px">✓ RUN LOGGED TODAY</div>`
      : `<button class="btn-primary" onclick="openTodayRunModal()">✦ LOG TODAY'S RUN</button>`;
  } else {
    ctaArea.innerHTML = `<button class="btn-secondary" onclick="openExtraModal()">+ LOG A BONUS RUN</button>`;
  }

  // soreness warning on tips panel
  renderSorenessWarning();
}

function getNextRunText(schedule, todayIdx) {
  if (!schedule) return 'Tomorrow';
  for (let i = todayIdx+1; i < schedule.length; i++) {
    if (schedule[i].type !== 'rest') return `${DAY_NAMES[i]} · ${schedule[i].type==='easy'?'Easy':schedule[i].type==='long'?'Long':schedule[i].type==='cross'?'Cross':'Run'}${schedule[i].km?' · '+schedule[i].km+'km':''}`;
  }
  return 'Next week';
}

function updateHeroWindow() {
  const timeEl = document.getElementById('hero-window-time');
  const textEl = document.getElementById('hero-window-text');
  if (!timeEl || !textEl) return;
  if (!weatherCache || !weatherCache.hourly) {
    timeEl.textContent = '—';
    textEl.textContent = 'Loading weather...';
    return;
  }
  const hours = weatherCache.hourly.time.map(t => parseInt(t.split('T')[1]));
  const { morning, evening } = getBestRunWindows(hours, weatherCache.hourly.uv_index, weatherCache.hourly.temperature_2m);
  const slot = evening || morning;
  if (slot) {
    timeEl.textContent = `${slot.h}:00`;
    textEl.textContent = `UV ${slot.uv.toFixed(1)} · best window ${slot.h < 12 ? 'this morning' : 'tonight'}`;
  }
}

function getFitnessSignal() {
  if (!runsCache.length) return null;
  const recent = runsCache.filter(r => r.km_actual && r.mode !== 'extra').slice(-4);
  if (!recent.length) return null;
  let overCount = 0;
  recent.forEach(r => {
    const sch = r.mode === 'pre' ? PRETRAIN : SCHEDULE;
    const plan = sch[r.week-1]?.[r.day_idx]?.km;
    if (plan && parseFloat(r.km_actual) > plan * 1.5) overCount++;
  });
  if (overCount >= 2) {
    const last = recent[recent.length-1];
    const sch = last.mode === 'pre' ? PRETRAIN : SCHEDULE;
    const plan = sch[last.week-1]?.[last.day_idx]?.km;
    return `<strong>Last run: ${last.km_actual}km vs ${plan}km plan.</strong> Feeling strong? Easy runs could stretch a bit today — but keep long runs at prescribed distance.`;
  }
  return null;
}

function dayDetail(d, w) {
  if (d.type === 'rest') return 'Full rest. Let your body repair.';
  if (d.type === 'cross') return `Cycling, swimming, or pilates — low impact (${d.min} min).`;
  if (d.type === 'easy') return `Easy conversational pace. Zone 2. If you can't speak a full sentence, slow down.`;
  if (d.type === 'medium') return `Comfortable effort midweek run.`;
  if (d.type === 'long') return d.km >= 29 ? `Your biggest training run yet. Go slow — time on feet.` : `Long run. Run 30–90 sec/km slower than race pace.`;
  if (d.type === 'race') return d.km > 40 ? `RACE DAY. Start easy. Walk aid stations. Trust the taper. 🌸` : `Half marathon test. Test gear, nutrition, pacing.`;
  return '';
}

function dayLabel(d) {
  if (d.type === 'rest')   return {text:'REST',   cls:'badge-rest'};
  if (d.type === 'cross')  return {text:'CROSS',  cls:'badge-cross'};
  if (d.type === 'easy')   return {text:'EASY',   cls:'badge-run'};
  if (d.type === 'medium') return {text:'RUN',    cls:'badge-run'};
  if (d.type === 'long')   return {text:'LONG ★', cls:'badge-long'};
  if (d.type === 'race')   return {text:'RACE 🌸',cls:'badge-race'};
  return {text:'—', cls:'badge-rest'};
}
function dayName(d) {
  if (d.type === 'rest')   return 'Rest';
  if (d.type === 'cross')  return `Cross Training (${d.min} min)`;
  if (d.type === 'easy')   return `Easy Run — ${d.km}km`;
  if (d.type === 'medium') return `Medium Run — ${d.km}km`;
  if (d.type === 'long')   return (d.label ? d.label+' — ' : 'Long Run — ')+d.km+'km';
  if (d.type === 'race')   return (d.label||'Race')+(d.km?' — '+d.km+'km':'');
  return '—';
}

// ── PLAN PANEL ────────────────────────────────────────────────────────────────
function renderPlan() {
  const p = currentPeriod();
  // Progress bar
  const pct = p.mode === 'done' ? 100 : p.mode === 'plan' ? Math.round((p.week/TOTAL_WEEKS)*100) : Math.round((p.week/PT_TOTAL)*100);
  document.getElementById('prog-pct').textContent = pct+'%';
  document.getElementById('capsule-fill').style.width = pct+'%';
  document.getElementById('prog-label').textContent = p.mode==='pre' ? `PRE-TRAINING WK ${p.week} OF ${PT_TOTAL}` : `WEEK ${p.week} OF ${TOTAL_WEEKS}`;
  document.getElementById('capsule-label').textContent = p.mode==='pre' ? `PT${p.week}/${PT_TOTAL}` : `W${p.week}/${TOTAL_WEEKS}`;

  const chips = document.getElementById('week-chips');
  chips.innerHTML = '';
  if (p.mode === 'pre') {
    for (let i=1;i<=PT_TOTAL;i++) { const c=document.createElement('span'); c.className='week-chip '+(i<p.week?'done':i===p.week?'current':'upcoming'); c.textContent='PT'+i; chips.appendChild(c); }
  } else {
    for (let i=1;i<=TOTAL_WEEKS;i++) { const c=document.createElement('span'); c.className='week-chip '+(i<p.week?'done':i===p.week?'current':'upcoming'); c.textContent='W'+i; chips.appendChild(c); }
  }

  // Checklist
  const mode = p.mode === 'pre' ? 'pre' : 'plan';
  const week = p.mode === 'pre' ? p.week : p.week;
  const schedule = p.mode === 'pre' ? PRETRAIN[Math.max(0,week-1)] : (p.mode === 'plan' ? SCHEDULE[week-1] : SCHEDULE[17]);
  const checks = loadChecks(mode, week);

  document.getElementById('checklist-title').textContent = p.mode==='pre' ? `PRE-TRAINING WK ${week}` : `WEEK ${week}`;
  document.getElementById('week-title').textContent = p.mode==='pre' ? formatDateRangePre(week) : formatDateRange(week);
  document.getElementById('week-subtitle').textContent = p.mode==='pre' ? 'Base building — easy runs only' : `Hal Higdon Novice 1 · ${getPhase(week).phase}`;

  let doneCount=0, checkable=0;
  const list = document.getElementById('checklist');
  list.innerHTML = '';
  schedule.forEach((d,i) => {
    const isRest = d.type==='rest';
    const isDone = !!checks[i];
    if (!isRest) { checkable++; if (isDone) doneCount++; }
    const item = document.createElement('div');
    item.className = 'check-item'+(isDone?' done':'')+(isRest?' rest-day':'');
    if (!isRest) item.onclick = () => toggleCheck(i, mode, week);
    const lbl = dayLabel(d);
    const runLog = isDone ? getRunLog(mode, week, i) : null;
    const kmLine = runLog?.km_actual ? `<div style="font-family:'Press Start 2P',monospace;font-size:6px;color:var(--green);margin-top:3px">✓ ${runLog.km_actual}km ${runLog.mood||''}</div>` : '';
    item.innerHTML = `
      <div class="check-box">${isDone?'✓':isRest?'—':''}</div>
      <div class="check-content">
        <div class="check-day">${DAY_NAMES[i]}</div>
        <div class="check-name">${dayName(d)}</div>
        <div class="check-detail">${dayDetail(d, week)}</div>
        ${kmLine}
      </div>
      <span class="check-badge ${lbl.cls}">${lbl.text}</span>`;
    list.appendChild(item);
  });

  document.getElementById('done-pill').textContent = `${doneCount}/${checkable}`;

  // nudge
  const nudge = document.getElementById('long-run-nudge');
  const longIdx = schedule.findIndex(d => d.type==='long'||d.type==='race');
  const dow = today().getDay();
  if (longIdx !== -1 && !checks[longIdx] && (dow >= 4 || dow === 0)) {
    const d = schedule[longIdx];
    nudge.style.display = 'block';
    nudge.innerHTML = `<div style="font-family:'Press Start 2P',monospace;font-size:6px;margin-bottom:5px">⚠️ ${dow===0?'LONG RUN DAY IS TODAY':'LONG RUN THIS WEEKEND'}</div><div style="font-size:12px;color:var(--brown-mid)">${d.km}km — block your ${dow===0?'today':'weekend'} now.</div>`;
  } else {
    nudge.style.display = 'none';
  }

  // streak row
  const streak = document.getElementById('streak-row');
  const phase = p.mode==='plan' ? getPhase(week) : {animal:'🐢', phase:'PRE-TRAINING'};
  streak.innerHTML = `
    <div class="streak-pill"><span style="font-size:14px">${phase.animal}</span> ${phase.phase}</div>
    <div class="streak-pill">🎽 ${totalKmLogged()} KM TOTAL</div>
    <div class="streak-pill">🏃 ${kmThisWeek()} KM THIS WEEK</div>
    <div class="streak-pill">📅 ${Math.max(0,daysToRace())} DAYS LEFT</div>`;

  renderCalendar();
}

function toggleCheck(dayIdx, mode, week) {
  const checks = loadChecks(mode, week);
  if (checks[dayIdx]) {
    checks[dayIdx] = false;
    saveChecks(mode, week, checks);
    deleteRun(mode, week, dayIdx).then(() => { renderPlan(); renderToday(); renderMiles(); });
    return;
  }
  checks[dayIdx] = true;
  saveChecks(mode, week, checks);
  renderPlan();
  const sch = mode==='pre' ? PRETRAIN : SCHEDULE;
  const day = sch[week-1]?.[dayIdx];
  if (day && day.type !== 'rest' && day.type !== 'cross') {
    openModal(dayIdx, mode, week, day);
  } else {
    saveRun(mode, week, dayIdx, null, null, null, null).then(() => { renderToday(); renderMiles(); });
  }
}

// ── CALENDAR ─────────────────────────────────────────────────────────────────
let calYear, calMonth;
(function(){ const t=today(); calYear=t.getFullYear(); calMonth=t.getMonth(); })();

function buildCalendarData() {
  const map = {};
  for (let pw=1;pw<=PT_TOTAL;pw++) {
    const ws = preWeekStartDate(pw);
    PRETRAIN[pw-1].forEach((d,i) => { const dt=new Date(ws); dt.setDate(dt.getDate()+i); map[`${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`]=d; });
  }
  for (let w=1;w<=TOTAL_WEEKS;w++) {
    const ws = weekStartDate(w);
    SCHEDULE[w-1].forEach((d,i) => { const dt=new Date(ws); dt.setDate(dt.getDate()+i); map[`${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`]=d; });
  }
  return map;
}
const CAL_MAP = buildCalendarData();

function renderCalendar() {
  document.getElementById('cal-month-label').textContent = MONTH_NAMES[calMonth].toUpperCase()+' '+calYear;
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => { const h=document.createElement('div'); h.className='cal-day-header'; h.textContent=d; grid.appendChild(h); });
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMon = new Date(calYear, calMonth+1, 0).getDate();
  const t = today();
  for (let i=0;i<firstDay;i++) { const c=document.createElement('div'); c.className='cal-cell other'; grid.appendChild(c); }
  for (let d=1;d<=daysInMon;d++) {
    const isToday = d===t.getDate()&&calMonth===t.getMonth()&&calYear===t.getFullYear();
    const cell = document.createElement('div');
    cell.className = 'cal-cell'+(isToday?' today':'');
    const key = `${calYear}-${calMonth}-${d}`;
    const entry = CAL_MAP[key];
    let html = `<span class="day-num">${d}</span>`;
    if (entry) {
      const dotType = entry.type==='medium'?'easy':entry.type;
      const dotLabel = entry.km?entry.km+'km':entry.min?entry.min+'m':entry.type;
      html += `<span class="run-dot ${dotType}">${dotLabel}</span>`;
    }
    cell.innerHTML = html;
    grid.appendChild(cell);
  }
}
function changeMonth(delta) { calMonth+=delta; if(calMonth>11){calMonth=0;calYear++;} if(calMonth<0){calMonth=11;calYear--;} renderCalendar(); }

// ── MILES (BADGES) ────────────────────────────────────────────────────────────
function renderMiles() {
  document.getElementById('stat-km-total').textContent = totalKmLogged();
  const unlocked = BADGES.filter(b => b.unlock());
  const locked   = BADGES.filter(b => !b.unlock());

  const makeCard = (b, isUnlocked) => `
    <div class="badge-card ${isUnlocked?'unlocked':'locked'}">
      <div class="badge-emoji">${b.emoji}</div>
      <div class="badge-name">${b.name}</div>
      <div class="badge-desc">${b.desc}</div>
      <div class="badge-status ${isUnlocked?'done':'locked'}">${isUnlocked?'✓ DONE':'LOCKED'}</div>
    </div>`;

  document.getElementById('badges-unlocked').innerHTML = unlocked.length
    ? unlocked.map(b => makeCard(b,true)).join('')
    : '<div style="font-size:12px;color:var(--brown-light);padding:10px">Start running to unlock badges!</div>';
  document.getElementById('badges-locked').innerHTML = locked.map(b => makeCard(b,false)).join('');
}

// ── TIPS PANEL ────────────────────────────────────────────────────────────────
let currentTipIdx = 0;

function renderSorenessWarning() {
  const area = document.getElementById('soreness-warning-area');
  if (!area) return;
  const soreLocs = getRecentSorenessLocs();
  if (!soreLocs.length) { area.innerHTML = ''; return; }
  const loc = soreLocs[0];
  const guide = STRETCH_GUIDES[loc];
  area.innerHTML = `
    <div class="soreness-warning">
      <div class="soreness-warning-label">⚠️ SORENESS LOGGED: ${loc.toUpperCase()}</div>
      <div class="soreness-warning-text">You've logged ${loc} soreness recently. <button onclick="openStretch('${loc}')" style="font-family:'Press Start 2P',monospace;font-size:5px;padding:4px 8px;border:1px solid var(--yellow-border);border-radius:3px;background:var(--yellow-pale);color:var(--yellow);cursor:pointer">▶ SEE STRETCH</button></div>
    </div>`;
}

function getRecentSorenessLocs() {
  const locs = {};
  runsCache.slice(-5).forEach(r => {
    if (!r.conditions) return;
    let conds;
    try { conds = typeof r.conditions === 'string' ? JSON.parse(r.conditions) : r.conditions; } catch { return; }
    if (conds.soreness) conds.soreness.forEach(l => { locs[l] = (locs[l]||0)+1; });
  });
  return Object.entries(locs).sort((a,b)=>b[1]-a[1]).map(e=>e[0]);
}

function getPersonalizedTips() {
  const soreLocs = getRecentSorenessLocs();
  const stomachRough = runsCache.slice(-5).filter(r => {
    if (!r.conditions) return false;
    try { const c = typeof r.conditions==='string'?JSON.parse(r.conditions):r.conditions; return c.stomach==='rough'; } catch { return false; }
  }).length;
  const tired = runsCache.slice(-5).filter(r => {
    if (!r.conditions) return false;
    try { const c = typeof r.conditions==='string'?JSON.parse(r.conditions):r.conditions; return c.bodyFeel==='tired'; } catch { return false; }
  }).length;

  const pinned = [];
  if (soreLocs.includes('heels')) pinned.push({icon:'🦶',tag:'YOUR HEELS',title:'HEEL SORENESS DETECTED',stretch:'heels',body:'You\'ve logged heel soreness recently. Stretch your arch + do eccentric heel drops daily. Avoid barefoot on hard floors. If this persists 3+ days, consider a rest day.'});
  if (soreLocs.includes('calves')) pinned.push({icon:'🦵',tag:'YOUR CALVES',title:'CALF TIGHTNESS DETECTED',stretch:'calves',body:'Calf soreness logged recently. Prioritise calf stretches + foam rolling after every run. Check whether you\'ve been running uphill or on harder surfaces than usual.'});
  if (soreLocs.includes('knees')) pinned.push({icon:'🦴',tag:'YOUR KNEES',title:'KNEE SORENESS DETECTED',stretch:'knees',body:'Knee soreness logged recently. Do clamshells for your glute medius + IT band foam roll. If outer knee, reduce mileage 2 days.'});
  if (soreLocs.includes('shins')) pinned.push({icon:'🦴',tag:'YOUR SHINS',title:'SHIN SORENESS DETECTED',stretch:'shins',body:'Shin soreness logged recently — early shin splints warning. Reduce pace, ice after runs. Do NOT push through sharp pain along the shinbone.'});
  if (soreLocs.includes('hips')) pinned.push({icon:'🏃',tag:'YOUR HIPS',title:'HIP TIGHTNESS DETECTED',stretch:'hips',body:'Hip soreness logged recently. Pigeon pose daily — not just after runs. Common with desk sitting + running. 5 min each side every morning.'});
  if (stomachRough >= 2) pinned.push({icon:'🫙',tag:'YOUR STOMACH',title:'STOMACH ISSUES RECURRING',body:'Stomach roughness logged 2+ times recently. Try eating earlier before runs (90 min instead of 60) and reduce soy sauce portions on run days. Alkaline foods (sweet potato, tofu) before runs.'});
  if (soreLocs.includes('heels') && soreLocs.includes('calves')) pinned.push({icon:'👟',tag:'GEAR CHECK',title:'CHECK YOUR SHOES',body:'Heel + calf soreness together often means cushioning is worn down. Running shoes should be replaced every 600–800km. Check yours now.'});
  if (tired >= 3) pinned.push({icon:'😴',tag:'YOUR RECOVERY',title:'FATIGUE PATTERN DETECTED',body:'You\'ve logged tired/sore conditions frequently recently. Consider adding 30 min extra sleep and ensuring you eat within 30 min of every run.'});

  return pinned;
}

function showTip(idx) {
  currentTipIdx = idx;
  renderTips(idx);
}

function renderTips(forcedIdx) {
  const p = currentPeriod();
  const w = p.mode==='pre' ? (p.week||1) : Math.max(1, Math.min(p.week||1, TOTAL_WEEKS));
  const bank = p.mode==='pre' ? PRETRAIN_TIPS : WEEKLY_TIPS;
  const baseTips = bank[w] || bank[1];
  const personalized = getPersonalizedTips();
  const allTips = [...personalized, ...baseTips];

  const idx = forcedIdx !== undefined ? forcedIdx : currentTipIdx;
  const safeIdx = Math.min(idx, allTips.length-1);
  const tip = allTips[safeIdx];

  // dots
  const dotsEl = document.getElementById('tip-dots');
  dotsEl.innerHTML = allTips.map((_,i) => `<div class="tip-dot${i===safeIdx?' active':''}" onclick="showTip(${i})"></div>`).join('');

  const container = document.getElementById('tip-of-week');
  const watchBtn = tip.stretch ? `<br><a class="tip-watch-btn" href="https://www.youtube.com/results?search_query=${encodeURIComponent(STRETCH_GUIDES[tip.stretch]?.query||tip.title+' how to')}" target="_blank" rel="noopener">▶ WATCH HOW</a>` : '';
  container.innerHTML = `
    <div class="tip-card">
      <div class="tip-icon">${tip.icon}</div>
      <div class="tip-content">
        <div class="tip-week-label">${p.mode==='pre'?'PRE-TRAINING':'WEEK'} ${w} · TIP ${safeIdx+1} OF ${allTips.length}</div>
        <div class="tip-title">${tip.title}</div>
        <div class="tip-body">${tip.body}${watchBtn}</div>
        <span class="tip-tag">${tip.tag}</span>
        ${tip.stretch ? `<br><button onclick="openStretch('${tip.stretch}')" class="btn-secondary" style="margin-top:8px;font-size:6px;padding:8px">📋 FULL STRETCH GUIDE</button>` : ''}
      </div>
    </div>`;
}

// ── STRETCH BOTTOM SHEET ──────────────────────────────────────────────────────
function openStretch(loc) {
  const g = STRETCH_GUIDES[loc];
  if (!g) return;
  document.getElementById('stretch-title').textContent = g.title;
  document.getElementById('stretch-body').innerHTML = `
    <ol style="padding-left:18px;font-size:13px;color:var(--brown);line-height:2.2">
      ${g.steps.map(s=>`<li>${s}</li>`).join('')}
    </ol>
    <div style="margin-top:14px;background:var(--mint-pale);border:1px solid var(--mint);border-radius:6px;padding:10px 12px">
      <div style="font-family:'Press Start 2P',monospace;font-size:5px;color:var(--mint-dark);margin-bottom:5px">HOLD · REPS</div>
      <div style="font-size:13px;color:var(--brown)">${g.hold}</div>
    </div>
    <div style="margin-top:8px;background:var(--green-pale);border:1px solid var(--green-border);border-radius:6px;padding:10px 12px">
      <div style="font-family:'Press Start 2P',monospace;font-size:5px;color:var(--green);margin-bottom:5px">✓ SHOULD FEEL LIKE</div>
      <div style="font-size:13px;color:var(--brown)">${g.feels}</div>
    </div>
    <div style="margin-top:8px;background:var(--terra-pale);border:1px solid var(--terra);border-radius:6px;padding:10px 12px">
      <div style="font-family:'Press Start 2P',monospace;font-size:5px;color:var(--terra-dark);margin-bottom:5px">✗ STOP IF</div>
      <div style="font-size:13px;color:var(--brown)">${g.stop}</div>
    </div>
    <a class="tip-watch-btn" href="https://www.youtube.com/results?search_query=${encodeURIComponent(g.query)}" target="_blank" rel="noopener" style="margin-top:12px;display:inline-flex">▶ WATCH HOW TO DO THIS</a>
  `;
  document.getElementById('stretch-overlay').style.display = 'flex';
}
function closeStretch() { document.getElementById('stretch-overlay').style.display = 'none'; }

// ── MEALS PANEL ───────────────────────────────────────────────────────────────
function showMealPanel(name) {
  ['tonight','recipes','schedule','groceries'].forEach(n => {
    const p = document.getElementById('meal-panel-'+n);
    if (p) p.className = 'meal-panel'+(n===name?' visible':'');
  });
  document.querySelectorAll('#meal-nav .meal-tab').forEach(t =>
    t.classList.toggle('active', t.getAttribute('onclick').includes(`'${name}'`))
  );
  if (name === 'groceries') renderGroceries();
  if (name === 'recipes') renderRecipeNav();
  if (name === 'tonight') renderTonightRecipe();
}

function renderMealTimeline() {
  let runHour = 19;
  if (weatherCache && weatherCache.hourly) {
    const hours = weatherCache.hourly.time.map(t => parseInt(t.split('T')[1]));
    const { evening } = getBestRunWindows(hours, weatherCache.hourly.uv_index, weatherCache.hourly.temperature_2m);
    if (evening) runHour = evening.h;
  }
  const fmt = h => { const ap=h>=12?'PM':'AM'; const d=h>12?h-12:(h===0?12:h); return `${d}:00 ${ap}`; };
  const arriveHour = Math.max(6, runHour-1);
  const eatDone = `${arriveHour}:45 ${arriveHour>=12?'PM':'AM'}`;
  const el = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  el('meal-arrive-chip', fmt(arriveHour));
  el('meal-finish-chip', eatDone);
  el('meal-run-chip', fmt(runHour));
  el('meal-done-chip', `${runHour}:25 ${runHour>=12?'PM':'AM'}`);
  el('meal-run-text', `Start run — best UV window tonight is ${fmt(runHour)}.`);
}

function renderTonightRecipe() {
  const area = document.getElementById('tonight-recipe-preview');
  if (!area) return;
  const recipe = getTodayRecipe();
  area.innerHTML = buildRecipeCard(recipe, true);
}

function renderRecipeNav() {
  const area = document.getElementById('recipe-area');
  if (!area) return;
  showRecipe('rotation');
}

function showRecipe(name) {
  document.querySelectorAll('#recipe-nav .meal-tab').forEach(t =>
    t.classList.toggle('active', t.getAttribute('onclick').includes(`'${name}'`))
  );
  const area = document.getElementById('recipe-area');
  if (name === 'rotation') {
    const menu = isHomeLocation() ? getActiveMenu() : 'travel';
    const recipes = RECIPE_MENUS[menu];
    area.innerHTML = `
      <div style="background:var(--terra-pale);border:1px solid var(--terra);border-radius:6px;padding:8px 12px;margin-bottom:12px">
        <div style="font-family:'Press Start 2P',monospace;font-size:5px;color:var(--terra-dark);margin-bottom:4px">${isHomeLocation()?'MENU '+menu+' — THIS WEEK\'S ROTATION':'✈️ TRAVEL MENU'}</div>
        <div style="font-size:12px;color:var(--brown-mid)">Recipes rotate every 4 weeks so you don't get bored. Tap any recipe below for full details.</div>
      </div>
      ${recipes.map(r => buildRecipeCard(r, false)).join('')}`;
  } else {
    const allRecipes = [...Object.values(RECIPE_MENUS).flat()];
    const recipe = allRecipes.find(r => r.id === name) || RECIPE_MENUS.A[0];
    area.innerHTML = buildRecipeCard(recipe, true);
  }
}

function buildRecipeCard(recipe, full) {
  if (!recipe) return '';
  if (!full) return `
    <div class="card" style="margin-bottom:8px;cursor:pointer" onclick="showRecipeById('${recipe.id}')">
      <div class="card-body" style="display:flex;align-items:center;gap:12px">
        <span style="font-size:28px">${recipe.icon}</span>
        <div><div style="font-family:'Press Start 2P',monospace;font-size:7px;color:var(--brown);line-height:1.6">${recipe.name}</div><div style="font-size:11px;color:var(--brown-light);margin-top:2px">${recipe.label}</div></div>
      </div>
    </div>`;
  return `
    <div class="recipe-card visible">
      <div class="recipe-label">${recipe.label}</div>
      <div class="recipe-title">${recipe.icon} ${recipe.name}</div>
      <div class="recipe-why">${recipe.why}</div>
      <div class="recipe-section-label">METHOD</div>
      <ol class="recipe-steps">${recipe.steps.map(s=>`<li>${s}</li>`).join('')}</ol>
    </div>`;
}

function showRecipeById(id) {
  // switch to recipes panel, show that recipe
  showMealPanel('recipes');
  const area = document.getElementById('recipe-area');
  const allRecipes = [...Object.values(RECIPE_MENUS).flat()];
  const recipe = allRecipes.find(r => r.id === id);
  if (recipe) area.innerHTML = buildRecipeCard(recipe, true);
}

function renderGroceries() {
  const container = document.getElementById('grocery-list');
  if (!container) return;
  const checked = JSON.parse(localStorage.getItem('grocery_checked')||'{}');
  container.innerHTML = GROCERY_LIST.map(cat => `
    <div class="grocery-category">
      <div class="grocery-cat-label">${cat.category}</div>
      ${cat.items.map(item => {
        const key = encodeURIComponent(item);
        const isChecked = checked[key];
        return `<div class="grocery-item${isChecked?' checked':''}" onclick="toggleGrocery('${key}',this)">
          <div class="grocery-checkbox">${isChecked?'✓':''}</div>
          <div class="grocery-item-name">${item}</div>
        </div>`;
      }).join('')}
    </div>`).join('');
}
function toggleGrocery(key, el) {
  const checked = JSON.parse(localStorage.getItem('grocery_checked')||'{}');
  checked[key] = !checked[key];
  localStorage.setItem('grocery_checked', JSON.stringify(checked));
  el.classList.toggle('checked', !!checked[key]);
  const box = el.querySelector('.grocery-checkbox');
  if (box) box.textContent = checked[key]?'✓':'';
}
function clearGroceries() { localStorage.removeItem('grocery_checked'); renderGroceries(); }

// ── EXTRA RUNS ────────────────────────────────────────────────────────────────
function renderExtraRuns() {
  const container = document.getElementById('extra-runs-list');
  if (!container) return;
  const extras = runsCache.filter(r => r.mode==='extra');
  if (!extras.length) { container.innerHTML = '<div style="font-size:13px;color:var(--brown-light)">No bonus runs logged yet.</div>'; return; }
  container.innerHTML = extras.slice().reverse().map(r => {
    const dt = r.logged_at ? new Date(r.logged_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '—';
    return `<div class="bonus-run-item">
      <div>
        <div class="bonus-run-date">${dt}</div>
        <div class="bonus-run-km">${r.km_actual||'—'}<span style="font-size:8px;color:var(--brown-light)"> km</span></div>
        <div class="bonus-run-note">${r.notes||r.mood||'Bonus run 💪'}</div>
      </div>
    </div>`;
  }).join('');
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
let _modalCtx = {};
let _selectedMood = '';
let _selectedConds = {};
let _selectedSoreLocs = [];
let _extraModal = false;

function openTodayRunModal() {
  const p = currentPeriod();
  const dayIdx = todayDayIdx();
  const mode = p.mode === 'pre' ? 'pre' : 'plan';
  const week = p.mode === 'pre' ? p.week : p.week;
  const sch = mode==='pre' ? PRETRAIN : SCHEDULE;
  const day = sch[Math.max(0,week-1)]?.[dayIdx];
  if (day) openModal(dayIdx, mode, week, day);
}

function openModal(dayIdx, mode, week, day) {
  _modalCtx = { dayIdx, mode, week, day };
  _selectedMood = '';
  _selectedConds = {};
  _selectedSoreLocs = [];
  _extraModal = false;
  document.getElementById('modal-km').value = day.km || '';
  document.getElementById('modal-notes').value = '';
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.cond-chip').forEach(b => b.classList.remove('selected','sore-selected'));
  document.querySelectorAll('.loc-chip').forEach(b => b.classList.remove('selected'));
  document.getElementById('soreness-row').className = 'soreness-row';
  document.getElementById('modal-day-label').textContent = `${DAY_NAMES[dayIdx]} · ${dayName(day)}`;
  document.getElementById('modal-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('modal-km').focus(), 100);
}

function openExtraModal() {
  _extraModal = true;
  _modalCtx = {};
  _selectedMood = '';
  _selectedConds = {};
  _selectedSoreLocs = [];
  document.getElementById('modal-km').value = '';
  document.getElementById('modal-notes').value = '';
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.cond-chip').forEach(b => b.classList.remove('selected','sore-selected'));
  document.querySelectorAll('.loc-chip').forEach(b => b.classList.remove('selected'));
  document.getElementById('soreness-row').className = 'soreness-row';
  document.getElementById('modal-day-label').textContent = '✦ BONUS RUN';
  document.getElementById('modal-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('modal-km').focus(), 100);
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  if (!_extraModal && _modalCtx.dayIdx !== undefined) {
    saveRun(_modalCtx.mode, _modalCtx.week, _modalCtx.dayIdx, null, null, null, null).then(() => { renderToday(); renderMiles(); renderExtraRuns(); });
  }
  _modalCtx = {};
}

function selectMood(btn) {
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  _selectedMood = btn.dataset.mood;
}

function selectCond(btn, isSore) {
  const cond = btn.dataset.cond;
  // mutual exclusion within groups
  if (cond === 'fresh' || cond === 'tired' || cond === 'sore') {
    document.querySelectorAll('.cond-chip[data-cond="fresh"],.cond-chip[data-cond="tired"],.cond-chip[data-cond="sore"]').forEach(b => b.classList.remove('selected','sore-selected'));
    delete _selectedConds.bodyFeel;
    _selectedSoreLocs = [];
  }
  if (cond === 'stomach-fine' || cond === 'stomach-rough') {
    document.querySelectorAll('.cond-chip[data-cond="stomach-fine"],.cond-chip[data-cond="stomach-rough"]').forEach(b => b.classList.remove('selected','sore-selected'));
    delete _selectedConds.stomach;
  }
  if (isSore) {
    btn.classList.add('sore-selected');
    _selectedConds.bodyFeel = 'sore';
    document.getElementById('soreness-row').className = 'soreness-row visible';
  } else {
    btn.classList.add('selected');
    if (cond === 'fresh' || cond === 'tired') _selectedConds.bodyFeel = cond;
    if (cond === 'stomach-fine') _selectedConds.stomach = 'fine';
    if (cond === 'stomach-rough') _selectedConds.stomach = 'rough';
    if (cond === 'fresh' || cond === 'tired') document.getElementById('soreness-row').className = 'soreness-row';
  }
}

function toggleSoreLoc(btn) {
  const loc = btn.dataset.loc;
  btn.classList.toggle('selected');
  if (btn.classList.contains('selected')) {
    if (!_selectedSoreLocs.includes(loc)) _selectedSoreLocs.push(loc);
  } else {
    _selectedSoreLocs = _selectedSoreLocs.filter(l => l !== loc);
  }
  _selectedConds.soreness = _selectedSoreLocs.length ? _selectedSoreLocs : undefined;
}

async function submitRun() {
  const km = parseFloat(document.getElementById('modal-km').value) || null;
  const notes = document.getElementById('modal-notes').value.trim() || null;
  const conditions = Object.keys(_selectedConds).length ? _selectedConds : null;
  document.getElementById('modal-overlay').style.display = 'none';

  if (_extraModal) {
    _extraModal = false;
    await saveExtraRun(km, _selectedMood||null, notes, conditions);
    renderToday(); renderExtraRuns(); renderMiles();
    _modalCtx = {};
    return;
  }
  const { dayIdx, mode, week } = _modalCtx;
  await saveRun(mode, week, dayIdx, km, _selectedMood||null, notes, conditions);
  renderPlan(); renderToday(); renderMiles(); renderExtraRuns();
  _modalCtx = {};
}

document.getElementById('modal-overlay').addEventListener('click', function(e) { if (e.target===this) closeModal(); });
document.getElementById('loc-overlay').addEventListener('click', function(e) { if (e.target===this) closeLocPicker(); });
document.getElementById('stretch-overlay').addEventListener('click', function(e) { if (e.target===this) closeStretch(); });

// nav dots — hide all but today initially
['plan','miles','tips','meals'].forEach(p => {
  const dot = document.querySelector(`#nav-${p} .nav-dot`);
  if (dot) dot.style.display = 'none';
});

// ── INIT ──────────────────────────────────────────────────────────────────────
updateHeader();
renderToday();
renderPlan();
renderMiles();
renderTips();
renderGroceries();
renderMealTimeline();

renderWeatherWidget().then(() => {
  updateHeroWindow();
  renderMealTimeline();
  renderTonightRecipe();
});

fetchRuns().then(() => {
  runsCache.forEach(r => {
    if (r.mode==='extra'||r.day_idx<0) return;
    const checks = loadChecks(r.mode, r.week);
    if (!checks[r.day_idx]) { checks[r.day_idx]=true; saveChecks(r.mode, r.week, checks); }
  });
  renderToday();
  renderPlan();
  renderMiles();
  renderExtraRuns();
  renderSorenessWarning();
});
