// ── CONFIG ──────────────────────────────────────────────────────────────────
const RACE_DATE      = new Date(2026, 10, 15); // 15 Nov 2026
const PLAN_START     = new Date(2026, 6, 13);  // 13 Jul 2026 (week 1 Monday)
const PRETRAIN_START = new Date(2026, 5,  1);  // 1 Jun 2026
const TOTAL_WEEKS    = 18;

// ── SUPABASE ─────────────────────────────────────────────────────────────────
const SB_URL = 'https://uqvkrbeuxhddqgrhztwo.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxdmtyYmV1eGhkZHFncmh6dHdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1ODA5ODAsImV4cCI6MjA5NTE1Njk4MH0.yKbOuf-W96oEYeKniNzm9gxgSlenYh-rhglenOYSdkQ';
const SB_HEADERS = { 'Content-Type':'application/json', 'apikey':SB_KEY, 'Authorization':'Bearer '+SB_KEY };

// In-memory cache of logged runs fetched from Supabase
let runsCache = [];

async function fetchRuns() {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/runs?order=logged_at.asc`, { headers: SB_HEADERS });
    runsCache = await res.json();
    if (!Array.isArray(runsCache)) runsCache = [];
  } catch { runsCache = []; }
}

async function saveRun(mode, week, dayIdx, kmActual, mood, notes) {
  try {
    await fetch(`${SB_URL}/rest/v1/runs`, {
      method: 'POST',
      headers: { ...SB_HEADERS, 'Prefer':'return=minimal' },
      body: JSON.stringify({ mode, week, day_idx: dayIdx, km_actual: kmActual || null, mood: mood || null, notes: notes || null })
    });
    await fetchRuns();
  } catch(e) { console.warn('Supabase save failed', e); }
}

async function deleteRun(mode, week, dayIdx) {
  try {
    await fetch(`${SB_URL}/rest/v1/runs?mode=eq.${mode}&week=eq.${week}&day_idx=eq.${dayIdx}`, {
      method: 'DELETE', headers: SB_HEADERS
    });
    await fetchRuns();
  } catch(e) { console.warn('Supabase delete failed', e); }
}

// ── PRE-TRAINING SCHEDULE ────────────────────────────────────────────────────
// 6 weeks of base building: 1 Jun → 12 Jul
// Goal: arrive at Week 1 able to run 5km comfortably 3× per week
// Structure: Mon rest, Tue easy, Wed rest, Thu easy, Fri rest, Sat optional cross, Sun easy/longer
const PRETRAIN = [
  // PT W1 — gentle introduction
  [{type:'rest'},{type:'easy',km:3},{type:'rest'},{type:'easy',km:3},{type:'rest'},{type:'cross',min:20},{type:'easy',km:4}],
  // PT W2
  [{type:'rest'},{type:'easy',km:3},{type:'rest'},{type:'easy',km:3},{type:'rest'},{type:'cross',min:25},{type:'easy',km:4.8}],
  // PT W3
  [{type:'rest'},{type:'easy',km:4},{type:'rest'},{type:'easy',km:4},{type:'rest'},{type:'cross',min:25},{type:'easy',km:5}],
  // PT W4
  [{type:'rest'},{type:'easy',km:4},{type:'rest'},{type:'easy',km:4},{type:'rest'},{type:'cross',min:30},{type:'easy',km:6}],
  // PT W5
  [{type:'rest'},{type:'easy',km:4.8},{type:'rest'},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:30},{type:'easy',km:6.4}],
  // PT W6 — final pre-training week, arrives ready for plan
  [{type:'rest'},{type:'easy',km:4.8},{type:'rest'},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:30},{type:'easy',km:8}],
];

const PT_TOTAL = PRETRAIN.length; // 6

// ── SCHEDULE DATA ────────────────────────────────────────────────────────────
// Each week: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
// type: rest | easy | medium | long | cross | race
// km in km (converted from Hal Higdon miles)
const SCHEDULE = [
  // W1
  [{type:'rest'},{type:'easy',km:4.8},{type:'easy',km:4.8},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:30},{type:'long',km:9.7}],
  // W2
  [{type:'rest'},{type:'easy',km:4.8},{type:'easy',km:4.8},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:30},{type:'long',km:11.3}],
  // W3 stepback
  [{type:'rest'},{type:'easy',km:4.8},{type:'easy',km:6.4},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:40},{type:'long',km:8.1}],
  // W4
  [{type:'rest'},{type:'easy',km:4.8},{type:'easy',km:6.4},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:40},{type:'long',km:14.5}],
  // W5
  [{type:'rest'},{type:'easy',km:4.8},{type:'easy',km:8.1},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:40},{type:'long',km:16.1}],
  // W6 stepback
  [{type:'rest'},{type:'easy',km:4.8},{type:'easy',km:8.1},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:40},{type:'long',km:11.3}],
  // W7
  [{type:'rest'},{type:'easy',km:4.8},{type:'medium',km:9.7},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:50},{type:'long',km:19.3}],
  // W8 half marathon test
  [{type:'rest'},{type:'easy',km:4.8},{type:'medium',km:9.7},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:50},{type:'race',km:21.1,label:'Half Marathon'}],
  // W9 stepback
  [{type:'rest'},{type:'easy',km:4.8},{type:'medium',km:11.3},{type:'easy',km:6.4},{type:'rest'},{type:'cross',min:60},{type:'long',km:16.1}],
  // W10
  [{type:'rest'},{type:'easy',km:4.8},{type:'medium',km:11.3},{type:'easy',km:6.4},{type:'rest'},{type:'cross',min:60},{type:'long',km:24.1}],
  // W11
  [{type:'rest'},{type:'easy',km:6.4},{type:'medium',km:12.9},{type:'easy',km:6.4},{type:'rest'},{type:'cross',min:60},{type:'long',km:25.7}],
  // W12 stepback
  [{type:'rest'},{type:'easy',km:6.4},{type:'medium',km:12.9},{type:'easy',km:8.1},{type:'rest'},{type:'cross',min:60},{type:'long',km:19.3}],
  // W13
  [{type:'rest'},{type:'easy',km:6.4},{type:'medium',km:14.5},{type:'easy',km:8.1},{type:'rest'},{type:'cross',min:60},{type:'long',km:29.0}],
  // W14 stepback
  [{type:'rest'},{type:'easy',km:8.1},{type:'medium',km:14.5},{type:'easy',km:8.1},{type:'rest'},{type:'cross',min:60},{type:'long',km:22.5}],
  // W15 peak
  [{type:'rest'},{type:'easy',km:8.1},{type:'medium',km:16.1},{type:'easy',km:8.1},{type:'rest'},{type:'cross',min:60},{type:'long',km:32.2,label:'THE 20-MILER'}],
  // W16 taper
  [{type:'rest'},{type:'easy',km:8.1},{type:'medium',km:12.9},{type:'easy',km:6.4},{type:'rest'},{type:'cross',min:60},{type:'long',km:19.3}],
  // W17 taper
  [{type:'rest'},{type:'easy',km:6.4},{type:'medium',km:9.7},{type:'easy',km:4.8},{type:'rest'},{type:'cross',min:60},{type:'long',km:12.9}],
  // W18 race week
  [{type:'rest'},{type:'easy',km:4.8},{type:'easy',km:6.4},{type:'easy',km:3.2},{type:'rest'},{type:'rest'},{type:'race',km:42.195,label:'KOBE MARATHON 🌸'}],
];

const DAY_NAMES  = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
const MONTH_NAMES= ['January','February','March','April','May','June','July','August','September','October','November','December'];

const PHASE_MAP = [
  {weeks:[1,2,3],  animal:'🐢', name:'W1–3',   phase:'STARTING'},
  {weeks:[4,5,6],  animal:'🐔', name:'W4–6',   phase:'BUILDING'},
  {weeks:[7,8,9],  animal:'🐰', name:'W7–9',   phase:'RAMPING'},
  {weeks:[10,11,12],animal:'🦊',name:'W10–12', phase:'PEAK'},
  {weeks:[13,14,15],animal:'🐎',name:'W13–15', phase:'PEAK+'},
  {weeks:[16,17,18],animal:'🌸',name:'W16–18', phase:'TAPER'},
  {weeks:[19],     animal:'🏁', name:'RACE',   phase:'15 NOV'},
];

// ── DATE HELPERS ─────────────────────────────────────────────────────────────
function today() {
  const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Returns: { mode: 'pre'|'plan'|'done', week: 1-based }
// mode 'pre'  → week is 1–PT_TOTAL (pre-training week)
// mode 'plan' → week is 1–18
// mode 'done' → training complete
function currentPeriod() {
  const t = today();
  if (t < PRETRAIN_START) return { mode:'pre', week:0 };
  if (t < PLAN_START) {
    const diff = Math.floor((t - PRETRAIN_START) / 86400000);
    return { mode:'pre', week: Math.min(Math.floor(diff / 7) + 1, PT_TOTAL) };
  }
  const diff = Math.floor((t - PLAN_START) / 86400000);
  const w = Math.floor(diff / 7) + 1;
  if (w > TOTAL_WEEKS) return { mode:'done', week: TOTAL_WEEKS };
  return { mode:'plan', week: w };
}

function weekNumber() {
  const p = currentPeriod();
  return p.mode === 'plan' ? p.week : 0;
}

function preWeekStartDate(pw) {
  const d = new Date(PRETRAIN_START);
  d.setDate(d.getDate() + (pw - 1) * 7);
  return d;
}
function weekStartDate(w) {
  const d = new Date(PLAN_START);
  d.setDate(d.getDate() + (w - 1) * 7);
  return d;
}
function daysToRace() {
  return Math.ceil((RACE_DATE - today()) / 86400000);
}
function daysToplan() {
  return Math.ceil((PLAN_START - today()) / 86400000);
}
function formatDateRangePre(pw) {
  const s = preWeekStartDate(pw);
  const e = new Date(s); e.setDate(e.getDate() + 6);
  const opts = {day:'numeric', month:'short'};
  return s.toLocaleDateString('en-GB', opts) + '–' + e.toLocaleDateString('en-GB', {...opts, year:'numeric'});
}
function formatDateRange(w) {
  const s = weekStartDate(w);
  const e = new Date(s); e.setDate(e.getDate() + 6);
  const opts = {day:'numeric', month:'short'};
  return s.toLocaleDateString('en-GB', opts) + '–' + e.toLocaleDateString('en-GB', {...opts, year:'numeric'});
}

// ── LOCALSTORAGE ─────────────────────────────────────────────────────────────
function storageKey(mode, w) { return `${mode}_week_${w}_checks`; }
function loadChecks(mode, w) {
  try { return JSON.parse(localStorage.getItem(storageKey(mode, w))) || {}; } catch { return {}; }
}
function saveChecks(mode, w, checks) {
  localStorage.setItem(storageKey(mode, w), JSON.stringify(checks));
}
function totalKmLogged() {
  // Sum actual km from Supabase runs where km_actual is set, else fall back to scheduled km
  let total = 0;
  runsCache.forEach(r => {
    if (r.km_actual) { total += parseFloat(r.km_actual); return; }
    // fall back to scheduled km for checked-off runs without a logged distance
    const schedule = r.mode === 'pre' ? PRETRAIN : SCHEDULE;
    const weekIdx  = r.week - 1;
    if (schedule[weekIdx] && schedule[weekIdx][r.day_idx]) {
      total += schedule[weekIdx][r.day_idx].km || 0;
    }
  });
  return Math.round(total * 10) / 10;
}

function kmThisWeek() {
  const mode = PRE_TRAINING ? 'pre' : 'plan';
  const week = PRE_TRAINING ? PRE_WEEK : CURR;
  let total = 0;
  runsCache.filter(r => r.mode === mode && r.week === week).forEach(r => {
    if (r.km_actual) { total += parseFloat(r.km_actual); return; }
    const schedule = r.mode === 'pre' ? PRETRAIN : SCHEDULE;
    total += (schedule[r.week-1]?.[r.day_idx]?.km || 0);
  });
  return Math.round(total * 10) / 10;
}

function isRunLogged(mode, week, dayIdx) {
  return runsCache.some(r => r.mode === mode && r.week === week && r.day_idx === dayIdx);
}

function getRunLog(mode, week, dayIdx) {
  return runsCache.find(r => r.mode === mode && r.week === week && r.day_idx === dayIdx);
}

// ── CURRENT PERIOD ───────────────────────────────────────────────────────────
const PERIOD     = currentPeriod();
const CURR       = PERIOD.mode === 'plan' ? PERIOD.week : 0;
const PRE_WEEK   = PERIOD.mode === 'pre'  ? PERIOD.week : 0;
const PRE_TRAINING = PERIOD.mode === 'pre';
const PLAN_DONE  = PERIOD.mode === 'done';

// ── PHASE INFO ───────────────────────────────────────────────────────────────
function getPhase(w) {
  for (const p of PHASE_MAP) if (p.weeks.includes(w)) return p;
  return PHASE_MAP[PHASE_MAP.length - 1];
}

// ── CHECKLIST DETAILS ────────────────────────────────────────────────────────
function dayDetail(d, w) {
  if (d.type === 'rest') return 'Full rest. Let your body repair and grow stronger.';
  if (d.type === 'cross') {
    const opts = [
      'Cycling, swimming, or elliptical — 30 min low impact to flush the legs.',
      'Pilates for runners: hip flexors, glutes, core stability. YouTube has great options.',
      'Swimming or aqua jogging — zero impact, great for lung capacity.',
      'Power walking 45–60 min — underrated for conditioning feet and joints.',
      'Strength circuit: clamshells, squats, reverse lunges, eccentric heel drops.',
      'Cycling at moderate resistance — builds quad endurance without pounding.',
    ];
    return opts[w % opts.length] + ` (${d.min} min)`;
  }
  if (d.type === 'easy')   return `Easy conversational pace. Zone 2. No pushing — if you can't speak a full sentence, slow down.`;
  if (d.type === 'medium') return `Your "sorta-long" midweek run. Comfortable effort the whole way.`;
  if (d.type === 'long')   {
    if (d.km >= 29) return `Your biggest training run yet. Go slow — time on feet, not pace. Fuel every 45 min. Walk aid stations.`;
    if (d.km >= 20) return `Long run. Run 30–90 sec/km slower than race pace. Fuel every 45 min.`;
    return `Long run. Slow and steady — this is the most important run of the week.`;
  }
  if (d.type === 'race') {
    if (d.km > 40) return `RACE DAY. Everything you trained for. Start easy. Walk aid stations. Trust the taper. You are ready. 🌸`;
    return `Half marathon test. Easy effort — use this to test gear, nutrition, and pacing. Nothing new on race day.`;
  }
  return '';
}

function dayLabel(d) {
  if (d.type === 'rest')   return {text:'REST 💤',  cls:'badge-rest'};
  if (d.type === 'cross')  return {text:'CROSS ✦',  cls:'badge-cross'};
  if (d.type === 'easy')   return {text:'RUN 🏃',   cls:'badge-run'};
  if (d.type === 'medium') return {text:'RUN 🏃',   cls:'badge-run'};
  if (d.type === 'long')   return {text:'LONG ★',   cls:'badge-long'};
  if (d.type === 'race')   return {text:'RACE 🌸',  cls:'badge-race'};
  return {text:'—', cls:'badge-rest'};
}

function dayName(d) {
  if (d.type === 'rest')  return 'Rest';
  if (d.type === 'cross') return `Cross Training`;
  if (d.type === 'easy')  return `Easy Run — ${d.km}km`;
  if (d.type === 'medium')return `Medium Run — ${d.km}km`;
  if (d.type === 'long')  return (d.label ? d.label + ' — ' : 'Long Run — ') + d.km + 'km';
  if (d.type === 'race')  return (d.label || 'Race') + (d.km ? ' — ' + d.km + 'km' : '');
  return '—';
}

// ── WEEKLY TIPS ──────────────────────────────────────────────────────────────
const WEEKLY_TIPS = {
  1:  [{icon:'🦶',tag:'STRETCHING',title:'CALF STRETCH — START HERE',body:'After every run: stand facing a wall, back leg straight, heel flat. Lean in until you feel the pull along your calf. Hold 30 sec each side. Your calves absorb the most impact — make this a non-negotiable habit from day one.'},{icon:'🦶',tag:'INJURY PREVENTION',title:'ECCENTRIC HEEL DROPS',body:'Stand on a step, heels hanging off. Rise on two feet, lower slowly on one over 3 counts. 3 sets of 15 each side, daily. Your single best protection against Achilles tendonitis — start now before mileage builds.'},{icon:'💧',tag:'NUTRITION',title:'HYDRATION BASICS',body:'Drink 500ml water 2 hours before every run. During runs over 60 min, take 150–200ml every 20 min. Urine should be pale yellow. Thirst is already dehydration — don\'t wait for it.'}],
  2:  [{icon:'🍑',tag:'STRETCHING',title:'GLUTE STRETCH — FIGURE FOUR',body:'Lie on your back. Cross one ankle over the opposite knee and gently pull the uncrossed leg toward you. Hold 45 sec each side. Tight glutes shift load to your knees on downhills.'},{icon:'😴',tag:'INJURY PREVENTION',title:'SLEEP IS TRAINING',body:'8+ hours after long runs. Growth hormone — the primary muscle repair signal — releases during deep sleep. Monday rest only works if you actually sleep. Your legs rebuild the night after the run, not during it.'},{icon:'🥚',tag:'NUTRITION',title:'POST-RUN RECOVERY WINDOW',body:'Within 30 min of finishing: eat 3:1 carbs to protein — rice + egg, banana + Greek yoghurt, or chocolate milk. This window is when glycogen replenishment is fastest. Missing it adds a full day to your recovery.'}],
  3:  [{icon:'🌀',tag:'STRETCHING',title:'FOAM ROLL YOUR CALVES',body:'5 min before and after every run. Roll slowly from ankle to knee, pause 20–30 sec on tight spots. Your calves absorb 3× bodyweight each stride — they need the most care and tend to get the least.'},{icon:'📏',tag:'INJURY PREVENTION',title:'TRUST THE STEPBACK WEEK',body:'This week\'s long run drops — don\'t override it. Stepback weeks let bones, tendons, and connective tissue calcify and adapt to the load. Running extra doesn\'t help. It delays the adaptation.'},{icon:'🫙',tag:'NUTRITION',title:'LONG RUN BREAKFAST',body:'2 hours before Sunday runs: oats, banana, a little peanut butter. Test different options until you find what settles perfectly. This Sunday routine should be identical to 15 November.'}],
  4:  [{icon:'🧘',tag:'STRETCHING',title:'HIP FLEXOR STRETCH',body:'Kneel on one knee, shift weight forward until you feel a pull at the front of your hip. Hold 30–45 sec each side after every run. Tight hip flexors cause lower back pain on long runs — and the longest runs are still ahead.'},{icon:'👟',tag:'GEAR CHECK',title:'SHOE MILEAGE CHECK',body:'Running shoes should be replaced every 600–800km. Check yours now. Worn cushioning is a top cause of knee and shin injuries. Race day rule: never wear shoes with fewer than 80km on them.'},{icon:'🍌',tag:'NUTRITION',title:'START PRACTISING GELS',body:'Begin testing gels on your Sunday long run — take one at 60 min. Your gut needs training just like your legs. Try 2–3 brands. Never use a gel on race day that you haven\'t tested in training.'}],
  5:  [{icon:'🦢',tag:'STRETCHING',title:'PIGEON POSE',body:'From downward dog, bring one knee forward toward your wrist. Lower hips toward the floor. Hold 60–90 sec per side. Best done after Sunday long runs while hips are warm. The single best deep hip opener in your toolkit.'},{icon:'🦵',tag:'INJURY PREVENTION',title:'CLAMSHELLS FOR YOUR KNEES',body:'Lie on your side, knees bent, feet together. Lift top knee like a clamshell — 15 reps, 3 sets each side. Targets the gluteus medius, which stops knees collapsing inward when you\'re tired. Do it after Tue and Thu runs.'},{icon:'🧂',tag:'NUTRITION',title:'ELECTROLYTES — START NOW',body:'For runs over 90 min, plain water isn\'t enough. Add electrolyte tabs or a sports drink. Low sodium causes cramping in the final 10km of a marathon — more common than dehydration. Build this habit now.'}],
  6:  [{icon:'🌀',tag:'STRETCHING',title:'FOAM ROLL FULL ROUTINE',body:'Pre-run 5 min: calves, quads, glutes (not IT band directly). Post-run 10 min: same plus hamstrings. Roll slowly, pause on tender spots 20–30 sec. Think of it as a deep-tissue massage you give yourself.'},{icon:'⚠️',tag:'INJURY PREVENTION',title:'STEPBACK — RESPECT IT',body:'Long run drops this week. Your bones and tendons are calcifying under the load from the past 3 weeks. Extra km now don\'t add fitness. They add injury risk right before your most important training weeks.'},{icon:'🧊',tag:'RECOVERY',title:'ICE YOUR LEGS',body:'After long runs over 20km: run cold water over your legs in the shower for 5 minutes. Reduces quad and calf inflammation and shortens recovery. A full ice bath works slightly better — but you\'ll actually do the shower.'}],
  7:  [{icon:'🦵',tag:'STRETCHING',title:'IT BAND — WHAT NOT TO DO',body:'Don\'t stretch the IT band directly — you can\'t effectively. Foam roll the glute and quad around it instead. If you feel outer knee tightness, back off mileage 2 days and roll aggressively. IT band issues snowball fast.'},{icon:'🦵',tag:'INJURY PREVENTION',title:'SHIN SPLINTS — EARLY WARNING',body:'Pain along the inner shinbone that worsens on impact: stop immediately, ice 3× daily. Coming back too early turns 2 days off into 2 weeks. Prevent with daily eccentric heel drops and never skipping rest days.'},{icon:'💧',tag:'NUTRITION',title:'AID STATION WALK STRATEGY',body:'Walk 30–60 sec at every simulated aid stop on Sunday, drink 150–200ml. Practice the Kobe aid station strategy now. This trains your gut, lowers heart rate, and prevents the bonk at 35km.'}],
  8:  [{icon:'🧘',tag:'STRETCHING',title:'PIGEON POSE POST HALF',body:'After Sunday\'s half marathon: spend 90 sec each side in pigeon pose immediately. Your hips held the same position for 2+ hours. This single stretch meaningfully cuts how sore you are on Monday.'},{icon:'🍌',tag:'RACE PREP',title:'HALF MARATHON GEAR TEST',body:'Sunday is your dress rehearsal — wear race socks, shorts, shoes, and watch. Eat your race breakfast 2 hours before. Take gels as planned. Note anything that chafed or didn\'t sit well. You have 10 weeks to fix it.'},{icon:'🧊',tag:'RECOVERY',title:'COLD RINSE AFTER SUNDAY',body:'After the half marathon effort: cold water on legs for 5 min, eat within 30 min, elevate legs 20 min. This three-step routine will have you moving normally by Tuesday.'}],
  9:  [{icon:'🦢',tag:'STRETCHING',title:'HIP OPENER — NON-NEGOTIABLE',body:'Pigeon pose is mandatory as long runs exceed 20km. Your hips lock up maintaining stride for 2+ hours. Release them immediately while still warm. Hold 90 sec per side. If you do only one stretch, do this one.'},{icon:'📏',tag:'INJURY PREVENTION',title:'STEPBACK — LET IT HAPPEN',body:'Long run drops from last week\'s half marathon. Your body needs this reset. Mileage climbs again next week. Adding extra km now to "keep momentum" is exactly how overuse injuries start.'},{icon:'🧂',tag:'NUTRITION',title:'ELECTROLYTES — MANDATORY',body:'You\'re running over 90 min every Sunday. Plain water alone causes hyponatremia (low sodium) which mimics the bonk. Every long run from now: electrolytes from the start. Make it as automatic as lacing up.'}],
  10: [{icon:'🌀',tag:'STRETCHING',title:'FULL FOAM ROLL PROTOCOL',body:'At this mileage, foam rolling isn\'t optional. 10 min post every long run: calves, quads, hamstrings, glutes. Pause 30 sec on anything tender. Think of it as maintenance on a machine you\'re running hard every week.'},{icon:'🫚',tag:'INJURY PREVENTION',title:'IRON CHECK WEEK',body:'Week 10 is the time to get a blood test. High mileage depletes iron especially in female runners. Signs: unusual fatigue, breathing harder than expected. Iron-rich foods: red meat, lentils, spinach + vitamin C.'},{icon:'🍝',tag:'NUTRITION',title:'CARB LOADING REHEARSAL',body:'In the 48 hrs before Sunday\'s long run, shift to 70% carbohydrates. Rice, oats, pasta, bread. Keep portions moderate. This is your practice run for race week carb loading — find what your gut handles well.'}],
  11: [{icon:'🦵',tag:'STRETCHING',title:'QUAD STRETCH — PEAK WEEKS',body:'Stand on one leg, pull your other foot toward your glute. Hold the ankle — not the foot — to avoid knee strain. Hold 30 sec each side after every run. Quads do the heaviest work and need dedicated attention.'},{icon:'⚠️',tag:'INJURY PREVENTION',title:'EASY PACE IS NOT OPTIONAL',body:'At 25km+ long runs, running 30–90 sec/km slower than race pace is critical. If you\'re breathing too hard to speak a full sentence, slow down. Running long runs too fast is the #1 cause of peak week injuries.'},{icon:'🧊',tag:'RECOVERY',title:'ICE BATH AFTER 25KM+',body:'After runs over 25km: 10–15 min in cold water (12–15°C). Reduces inflammation and shortens recovery by a full day. If impractical, 5 min of cold shower on your legs is nearly as effective.'}],
  12: [{icon:'🌀',tag:'STRETCHING',title:'STEPBACK WEEK — STRETCH FOCUS',body:'Lower mileage this week means more time for stretching. Spend 20 min: calves, hip flexors, glutes, pigeon pose, IT band foam roll. This is the week to clear out accumulated tightness before the peak block.'},{icon:'📏',tag:'INJURY PREVENTION',title:'TRUST THE STEPBACK',body:'Long run drops this week. Your bones and tendons are adapting to the load from the past 3 weeks. Extra km now don\'t add fitness — they add injury risk right before your most important 3 weeks.'},{icon:'🎽',tag:'RACE PREP',title:'RACE KIT — START TESTING',body:'Wear your intended race socks and shorts on this week\'s long run. Check for hot spots, seam rub, waistband bounce. You have 6 weeks to fix anything. Nothing new on race day — ever.'}],
  13: [{icon:'🦢',tag:'STRETCHING',title:'HIPS DAILY — PEAK BLOCK',body:'At 30km+ long runs your hips bear enormous cumulative load. Pigeon pose every single day this week — not just after runs. Morning routine: 5 min pigeon each side before breakfast. Your race will be run on the quality of your hip mobility.'},{icon:'⚠️',tag:'INJURY PREVENTION',title:'KOBE OHASHI BRIDGE PREP',body:'The marathon\'s toughest moment: steep incline at 35km over Kobe Ohashi Bridge. Prepare your quads with reverse lunges and step-downs after runs. Slow easy paces now mean your legs have something left at 35km.'},{icon:'💧',tag:'NUTRITION',title:'AID STATION STRATEGY',body:'Walk every simulated aid station on Sunday\'s long run — 30–60 sec, 150ml fluid. Practice until it\'s automatic. At Kobe this prevents early cramping, lowers heart rate, and saves your quads for the Ohashi Bridge.'}],
  14: [{icon:'🧘',tag:'STRETCHING',title:'RECOVERY WEEK — FULL STRETCH',body:'Stepback week means time for the full routine you\'ve been skipping. 20 min: calves, hip flexors, figure-four glute, pigeon, quad, hamstring. Consider a sports massage — your body absorbs it well right now.'},{icon:'🎽',tag:'RACE PREP',title:'RACE KIT FINAL REHEARSAL',body:'Wear your complete race outfit on this week\'s long run — exact shoes, socks, shorts, top, watch, race belt. Check everything. This is your last stepback before peak. Sort any chafing or discomfort now.'},{icon:'🍝',tag:'NUTRITION',title:'PRACTICE RACE MORNING',body:'2 hours before Sunday\'s run: eat your planned race breakfast. Exact same food, exact same timing. Note how you felt at km 10, 15, 20. You have one more long run after this to get it right.'}],
  15: [{icon:'🦵',tag:'STRETCHING',title:'THE 20-MILER RECOVERY STRETCH',body:'After today\'s 32km — the hardest training run of your life — spend 15 min in full stretch immediately. Pigeon pose 90 sec each side. Calf and hip flexor. Foam roll quads. Do not skip this. It changes Monday completely.'},{icon:'🧊',tag:'INJURY PREVENTION',title:'ICE BATH — DO IT TODAY',body:'After the 20-miler: cold shower on legs for 10 min (or ice bath), eat within 30 min, legs elevated 20 min. This is the most important recovery day of your entire training cycle. Protect it like a workout.'},{icon:'🎽',tag:'RACE PREP',title:'EVERYTHING CONFIRMED',body:'You just ran your longest training run. Everything you wore, ate, and did today is locked in for race day. Shoes confirmed. Breakfast confirmed. Gel timing confirmed. 15 November is just a repeat of today, with a finish line.'}],
  16: [{icon:'🌀',tag:'STRETCHING',title:'TAPER — STRETCH MORE',body:'Less running means more stretching time. Use it. Full 20 min routine daily. Your body is banking the training — staying loose and mobile means arriving at the start line in the best possible condition.'},{icon:'📅',tag:'INJURY PREVENTION',title:'TAPER MADNESS IS REAL',body:'You feel sluggish and convinced you\'re losing fitness. You\'re not. This is taper madness and every marathon runner experiences it. Your body is storing glycogen and repairing tissue. The urge to run more is normal. Ignore it.'},{icon:'🍝',tag:'RACE PREP',title:'START CARB LOADING',body:'This week shift toward 65–70% carbohydrates at meals. Rice, pasta, oats, bread, fruit. Keep portions normal — you\'re filling glycogen stores, not overeating. Avoid high-fibre foods and anything your gut doesn\'t know well.'}],
  17: [{icon:'🧘',tag:'STRETCHING',title:'GENTLE DAILY STRETCH ONLY',body:'No deep stretching or foam rolling this week — just gentle movement to stay loose. 10 min morning routine: leg swings, ankle circles, hip rotations. Your muscles are resting and repairing. Don\'t disturb that process.'},{icon:'📅',tag:'RACE PREP',title:'WRITE DOWN RACE MORNING',body:'Plan it precisely: wake time, breakfast, transport, arrival time, warm-up. Walk the course mentally from gun to finish. Know where Ohashi Bridge is. Knowing what\'s coming removes anxiety and saves mental energy for km 35.'},{icon:'☕',tag:'NUTRITION',title:'CAFFEINE STRATEGY',body:'If you\'re a regular coffee drinker: 200mg caffeine 45 min before gun time improves endurance by 2–4%. One strong coffee. Only do this if it\'s tested in training. Some Kobe aid stations offer caffeinated gels — know before you grab one.'}],
  18: [{icon:'🌀',tag:'STRETCHING',title:'RACE WEEK — STAY LOOSE',body:'Short daily walks, gentle leg swings, light calf stretches. Keep blood moving without fatiguing anything. No foam rolling the day before the race. Your job this week is to arrive feeling fresh.'},{icon:'🧠',tag:'RACE PREP',title:'THE MENTAL WALL AT KM 30',body:'Around km 30–35 your glycogen depletes and your brain sends STOP signals. This is expected — you trained for exactly this. Break the race into sections: just get to the next aid station. The wall is a negotiation. You\'ve got this. 🌸'},{icon:'🌅',tag:'RACE PREP',title:'RACE MORNING CHECKLIST',body:'Wake 3 hrs before gun. Eat practiced breakfast. Arrive 60 min early. 10 min easy walking warm-up. Line up in a corral slower than goal pace — first 10km should feel embarrassingly easy. Walk every aid station. Smile at Ohashi Bridge. Finish.'}],
};

// ── MILESTONES ───────────────────────────────────────────────────────────────
const MILESTONES = [
  {icon:'🚀', name:'First Steps',      desc:'Completed Week 1 of training.',               unlock: w => w >= 1,  date:'13 Jul 2026'},
  {icon:'🗓️', name:'One Month In',     desc:'Four weeks of consistent training done.',     unlock: w => w >= 4},
  {icon:'⚡', name:'100km Club',       desc:'Logged 100km in training.',                   unlock: () => totalKmLogged() >= 100},
  {icon:'🌟', name:'Half Way There',   desc:'Passed the halfway point — Week 9 reached.', unlock: w => w >= 9},
  {icon:'🌓', name:'21km Done',        desc:'Completed your half marathon long run.',      unlock: w => w >= 8},
  {icon:'🗻', name:'The 20-Miler',     desc:'Completed the 32km peak run in Week 15.',    unlock: w => w >= 15},
  {icon:'🌸', name:'Taper Mode',       desc:'Entered Week 16. You\'ve done the work.',    unlock: w => w >= 16},
  {icon:'🏁', name:'Kobe Finisher',    desc:'Cross the finish line. 42.195km. You did it.',unlock: w => w >= 19},
];

// ── RENDER FUNCTIONS ─────────────────────────────────────────────────────────
function renderHero() {
  const phase = PRE_TRAINING ? {phase:'PRE-TRAINING', animal:'🐢'} : getPhase(Math.max(CURR, 1));
  const weekLabel = PRE_TRAINING ? `PT${PRE_WEEK}` : PLAN_DONE ? '18' : CURR;
  document.getElementById('stat-week').textContent  = weekLabel;
  document.getElementById('stat-km').textContent    = totalKmLogged();
  document.getElementById('stat-days').textContent  = Math.max(0, daysToRace());
  document.getElementById('stat-phase').textContent = phase.phase;

  const marquee = PRE_TRAINING
    ? `♥ DEBBIE RUNS KOBE ♥ PRE-TRAINING WEEK ${PRE_WEEK} OF ${PT_TOTAL} ♥ BASE BUILDING ♥ PLAN STARTS 13 JUL ♥ ${daysToplan()} DAYS TO GO ♥`
    : `♥ DEBBIE RUNS KOBE ♥ 42.195KM ♥ 15 NOV 2026 ♥ HAL HIGDON NOVICE 1 ♥ WEEK ${CURR} OF ${TOTAL_WEEKS} ♥ ${phase.animal} ${phase.phase} ♥`;
  document.getElementById('marquee-text').textContent = marquee;
}

function renderAnimalStrip() {
  const strip = document.getElementById('animal-strip');
  const titleEl = document.getElementById('journey-title');

  if (PRE_TRAINING) {
    titleEl.textContent = `PRE-TRAINING WEEK ${PRE_WEEK} OF ${PT_TOTAL} ✦`;
    // Show a simplified pre-training strip
    const PT_PHASES = [
      {weeks:[1,2], animal:'🐣', name:'PT1–2', phase:'WAKING UP'},
      {weeks:[3,4], animal:'🐥', name:'PT3–4', phase:'WARMING UP'},
      {weeks:[5,6], animal:'🐔', name:'PT5–6', phase:'READY'},
      {weeks:[99],  animal:'🐢', name:'W1–3',  phase:'STARTING'},
    ];
    strip.innerHTML = '';
    PT_PHASES.forEach((p, idx) => {
      const isActive   = p.weeks.includes(PRE_WEEK);
      const isUnlocked = p.weeks[0] <= PRE_WEEK;
      const step = document.createElement('div');
      step.className = 'animal-step' + (isActive ? ' active' : '');
      step.innerHTML = `
        <div class="animal-emoji ${isActive ? 'active' : isUnlocked ? 'unlocked' : ''}">${p.animal}</div>
        <div class="animal-name">${p.name}</div>
        <div class="animal-pace">${p.phase}</div>`;
      strip.appendChild(step);
      if (idx < PT_PHASES.length - 1) {
        const conn = document.createElement('div');
        conn.className = 'animal-connector' + (isUnlocked && !isActive ? ' done' : '');
        strip.appendChild(conn);
      }
    });
    return;
  }

  titleEl.textContent = `YOUR JOURNEY — WEEK ${CURR} OF ${TOTAL_WEEKS} ✦`;
  strip.innerHTML = '';
  PHASE_MAP.forEach((p, idx) => {
    const isActive   = p.weeks.includes(CURR);
    const isUnlocked = p.weeks[0] <= CURR;
    const step = document.createElement('div');
    step.className = 'animal-step' + (isActive ? ' active' : '');
    step.innerHTML = `
      <div class="animal-emoji ${isActive ? 'active' : isUnlocked ? 'unlocked' : ''}">${p.animal}</div>
      <div class="animal-name">${p.name}</div>
      <div class="animal-pace">${p.phase}</div>`;
    strip.appendChild(step);
    if (idx < PHASE_MAP.length - 1) {
      const conn = document.createElement('div');
      conn.className = 'animal-connector' + (isUnlocked && !isActive ? ' done' : isActive ? ' done' : '');
      strip.appendChild(conn);
    }
  });
}

function renderProgressBar() {
  const segTrack = document.getElementById('seg-track');
  const chips    = document.getElementById('week-chips');
  segTrack.innerHTML = chips.innerHTML = '';

  if (PRE_TRAINING) {
    const pct = Math.round((PRE_WEEK / PT_TOTAL) * 100);
    document.getElementById('prog-label').textContent   = `PRE-TRAINING WEEK ${PRE_WEEK} OF ${PT_TOTAL} — BASE BUILDING`;
    document.getElementById('prog-pct').textContent     = pct + '%';
    document.getElementById('capsule-fill').style.width = pct + '%';
    document.getElementById('capsule-label').textContent= `PT WEEK ${PRE_WEEK} / ${PT_TOTAL}`;
    document.getElementById('seg-labels').innerHTML =
      '<span class="seg-label">START</span><span class="seg-label">HALFWAY</span><span class="seg-label">→ JUL 13</span><span class="seg-label">🏃 PLAN</span>';
    for (let i = 1; i <= PT_TOTAL; i++) {
      const s = document.createElement('div');
      s.className = 'seg ' + (i < PRE_WEEK ? 'done' : i === PRE_WEEK ? 'current' : '');
      segTrack.appendChild(s);
      const c = document.createElement('span');
      c.className = 'week-chip ' + (i < PRE_WEEK ? 'done' : i === PRE_WEEK ? 'current' : 'upcoming');
      c.textContent = 'PT' + i;
      chips.appendChild(c);
    }
  } else {
    const pct = PLAN_DONE ? 100 : Math.round((CURR / TOTAL_WEEKS) * 100);
    const phase = getPhase(Math.max(CURR, 1));
    document.getElementById('prog-label').textContent   = `WEEK ${CURR} OF ${TOTAL_WEEKS} — ${phase.phase}`;
    document.getElementById('prog-pct').textContent     = pct + '%';
    document.getElementById('capsule-fill').style.width = pct + '%';
    document.getElementById('capsule-label').textContent= `WEEK ${CURR} / ${TOTAL_WEEKS}`;
    document.getElementById('seg-labels').innerHTML =
      '<span class="seg-label">START</span><span class="seg-label">HALFWAY</span><span class="seg-label">TAPER</span><span class="seg-label">🏁 KOBE</span>';
    for (let i = 1; i <= TOTAL_WEEKS; i++) {
      const s = document.createElement('div');
      s.className = 'seg ' + (i < CURR ? 'done' : i === CURR ? 'current' : '');
      segTrack.appendChild(s);
      const c = document.createElement('span');
      c.className = 'week-chip ' + (i < CURR ? 'done' : i === CURR ? 'current' : 'upcoming');
      c.textContent = 'W' + i;
      chips.appendChild(c);
    }
  }
}

function renderHearts(doneCount, totalCount) {
  const container = document.getElementById('hearts-container');
  container.innerHTML = '';
  for (let i = 0; i < totalCount; i++) {
    const h = document.createElement('span');
    h.className = 'pixel-heart' + (i >= doneCount ? ' empty' : '');
    h.textContent = '♥';
    container.appendChild(h);
  }
}

function renderDialogue() {
  let msg;
  if (PRE_TRAINING && PRE_WEEK === 0) {
    msg = `🐢 Pre-training starts 1 Jun 2026. ${daysToRace()} days to race day. Let\'s build your base!`;
  } else if (PRE_TRAINING) {
    msg = `🐢 Pre-training week ${PRE_WEEK} of ${PT_TOTAL}. Easy runs to build your base before the plan kicks off. ${daysToplan()} days until the official Hal Higdon plan begins on 13 Jul.`;
  } else if (PLAN_DONE) {
    msg = `🌸 All 18 weeks complete. Race day is ${daysToRace() > 0 ? 'in ' + daysToRace() + ' days' : 'TODAY'}. You are ready. Trust the training.`;
  } else {
    const phase = getPhase(CURR);
    const next = PHASE_MAP.find(p => p.weeks[0] > CURR);
    msg = `${phase.animal} Week ${CURR} of ${TOTAL_WEEKS} — ${phase.phase} phase!${next ? ' Keep going to unlock ' + next.animal + ' ' + next.name + '.' : ''}`;
  }
  document.getElementById('dialogue-text').innerHTML = msg + '<span class="cursor">▼</span>';
}

function buildChecklistHTML(days, checks, mode, weekRef) {
  const list = document.getElementById('checklist');
  list.innerHTML = '';
  let doneCount = 0, checkableCount = 0;

  days.forEach((d, i) => {
    const isRest = d.type === 'rest';
    const isDone = !!checks[i];
    if (!isRest) { checkableCount++; if (isDone) doneCount++; }

    const item = document.createElement('div');
    item.className = 'check-item' + (isDone ? ' done' : '') + (isRest ? ' rest-day' : '');
    if (!isRest) item.onclick = () => toggleCheck(i, mode, weekRef);

    const label = dayLabel(d);
    const runLog = isDone ? getRunLog(mode, weekRef, i) : null;
    const kmLine = runLog?.km_actual
      ? `<span style="font-family:'Press Start 2P';font-size:7px;color:var(--green)">✓ ${runLog.km_actual}km ${runLog.mood || ''}</span>`
      : '';
    item.innerHTML = `
      <div class="check-box">${isDone ? '✓' : isRest ? '—' : ''}</div>
      <div class="check-content">
        <div class="check-day">${DAY_NAMES[i]}</div>
        <div class="check-name">${dayName(d)}</div>
        <div class="check-detail">${dayDetail(d, weekRef)}</div>
        ${kmLine}
      </div>
      <span class="check-badge ${label.cls}">${label.text}</span>`;
    list.appendChild(item);
  });
  return { doneCount, checkableCount };
}

function renderChecklist() {
  if (PLAN_DONE) {
    document.getElementById('checklist-title').textContent = '☑ THIS_WEEK.EXE';
    document.getElementById('week-title').textContent = 'TRAINING COMPLETE!';
    document.getElementById('week-subtitle').textContent = 'All 18 weeks done. Taper and race. 🌸';
    document.getElementById('done-pill').textContent = '✓';
    document.getElementById('checklist').innerHTML = '';
    document.getElementById('streak-row').innerHTML = '';
    renderHearts(7, 7);
    return;
  }

  if (PRE_TRAINING) {
    if (PRE_WEEK === 0) {
      document.getElementById('checklist-title').textContent = '☑ PRE_TRAINING.EXE';
      document.getElementById('week-title').textContent = 'PRE-TRAINING STARTS 1 JUN';
      document.getElementById('week-subtitle').textContent = `${daysToplan()} days until official plan · ${daysToRace()} days to race`;
      document.getElementById('done-pill').textContent = '—';
      document.getElementById('checklist').innerHTML = '';
      document.getElementById('streak-row').innerHTML = '';
      return;
    }

    const days   = PRETRAIN[PRE_WEEK - 1];
    const checks = loadChecks('pre', PRE_WEEK);
    document.getElementById('checklist-title').textContent = `☑ PRE_TRAINING.EXE — PT WEEK ${PRE_WEEK}`;
    document.getElementById('week-title').textContent      = `PRE-TRAINING WEEK ${PRE_WEEK} · ${formatDateRangePre(PRE_WEEK)}`;
    document.getElementById('week-subtitle').textContent   = `Base building · Easy runs only · ${daysToplan()} days until Hal Higdon plan`;

    const { doneCount, checkableCount } = buildChecklistHTML(days, checks, 'pre', PRE_WEEK);
    document.getElementById('done-pill').textContent = `${doneCount} / ${checkableCount} DONE`;
    renderHearts(doneCount, checkableCount);

    const streakRow = document.getElementById('streak-row');
    streakRow.innerHTML = `
      <div class="streak-pill"><span class="streak-emoji">🐢</span> BASE BUILDING</div>
      <div class="streak-pill"><span class="streak-emoji">🎽</span> ${totalKmLogged()} KM TOTAL</div>
      <div class="streak-pill"><span class="streak-emoji">🏃</span> ${kmThisWeek()} KM THIS WEEK</div>
      <div class="streak-pill"><span class="streak-emoji">📅</span> ${daysToplan()} DAYS TO PLAN</div>`;
    return;
  }

  // Official plan weeks
  const days   = SCHEDULE[CURR - 1];
  const checks = loadChecks('plan', CURR);
  const phase  = getPhase(CURR);

  document.getElementById('checklist-title').textContent = `☑ THIS_WEEK.EXE — WEEK ${CURR}`;
  document.getElementById('week-title').textContent      = `WEEK ${CURR} · ${formatDateRange(CURR)}`;
  document.getElementById('week-subtitle').textContent   = `Hal Higdon Novice 1 · ${phase.phase} phase`;

  const { doneCount, checkableCount } = buildChecklistHTML(days, checks, 'plan', CURR);
  document.getElementById('done-pill').textContent = `${doneCount} / ${checkableCount} DONE`;
  renderHearts(doneCount, checkableCount);

  const streakRow = document.getElementById('streak-row');
  streakRow.innerHTML = `
    <div class="streak-pill"><span class="streak-emoji">${phase.animal}</span> ${phase.phase}</div>
    <div class="streak-pill"><span class="streak-emoji">🎽</span> ${totalKmLogged()} KM TOTAL</div>
    <div class="streak-pill"><span class="streak-emoji">🏃</span> ${kmThisWeek()} KM THIS WEEK</div>
    <div class="streak-pill"><span class="streak-emoji">⛅</span> ${Math.max(0,daysToRace())} DAYS TO KOBE</div>`;
}

function toggleCheck(dayIdx, mode, week) {
  const checks = loadChecks(mode, week);
  const wasChecked = !!checks[dayIdx];

  if (wasChecked) {
    // Untick — remove from localStorage and Supabase
    checks[dayIdx] = false;
    saveChecks(mode, week, checks);
    deleteRun(mode, week, dayIdx).then(() => {
      renderChecklist();
      renderHero();
      renderMilestones();
    });
    return;
  }

  // Tick — mark locally immediately for instant feedback
  checks[dayIdx] = true;
  saveChecks(mode, week, checks);
  renderChecklist();

  // Get schedule entry
  const schedule = mode === 'pre' ? PRETRAIN : SCHEDULE;
  const day = schedule[week - 1]?.[dayIdx];

  // If it's a running day, open the log modal
  if (day && day.type !== 'rest' && day.type !== 'cross') {
    openModal(dayIdx, mode, week, day);
  } else {
    // Rest or cross — just save silently with no km
    saveRun(mode, week, dayIdx, null, null, null).then(() => {
      renderHero();
      renderMilestones();
    });
  }
}

// ── MODAL ────────────────────────────────────────────────────────────────────
let _modalCtx = {};
let _selectedMood = '';

function openModal(dayIdx, mode, week, day) {
  _modalCtx = { dayIdx, mode, week, day };
  _selectedMood = '';
  document.getElementById('modal-km').value = day.km || '';
  document.getElementById('modal-notes').value = '';
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('modal-day-label').textContent =
    `${DAY_NAMES[dayIdx]} · ${dayName(day)}`;
  const overlay = document.getElementById('modal-overlay');
  overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('modal-km').focus(), 100);
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  // Run was already ticked locally — still save to Supabase without km detail
  const { dayIdx, mode, week } = _modalCtx;
  if (dayIdx !== undefined) {
    saveRun(mode, week, dayIdx, null, null, null).then(() => {
      renderHero();
      renderMilestones();
    });
  }
  _modalCtx = {};
}

function selectMood(btn) {
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  _selectedMood = btn.dataset.mood;
}

async function submitRun() {
  const { dayIdx, mode, week } = _modalCtx;
  const km    = parseFloat(document.getElementById('modal-km').value) || null;
  const notes = document.getElementById('modal-notes').value.trim() || null;

  document.getElementById('modal-overlay').style.display = 'none';
  await saveRun(mode, week, dayIdx, km, _selectedMood || null, notes);
  renderChecklist();
  renderHero();
  renderMilestones();
  _modalCtx = {};
}

// Close modal on overlay click
document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// ── CALENDAR ─────────────────────────────────────────────────────────────────
let calYear, calMonth;
(function initCal() {
  const t = today();
  calYear  = t.getFullYear();
  calMonth = t.getMonth();
})();

function buildCalendarData() {
  const map = {};
  // Pre-training weeks
  for (let pw = 1; pw <= PT_TOTAL; pw++) {
    const weekStart = preWeekStartDate(pw);
    PRETRAIN[pw - 1].forEach((d, i) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      map[key] = d;
    });
  }
  // Plan weeks
  for (let w = 1; w <= TOTAL_WEEKS; w++) {
    const weekStart = weekStartDate(w);
    SCHEDULE[w - 1].forEach((d, i) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      map[key] = d;
    });
  }
  return map;
}
const CAL_MAP = buildCalendarData();

function renderCalendar() {
  const label = document.getElementById('cal-month-label');
  label.textContent = MONTH_NAMES[calMonth].toUpperCase() + ' ' + calYear;

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
    const h = document.createElement('div');
    h.className = 'cal-day-header'; h.textContent = d; grid.appendChild(h);
  });

  const firstDay  = new Date(calYear, calMonth, 1).getDay();
  const daysInMon = new Date(calYear, calMonth + 1, 0).getDate();
  const t = today();

  for (let i = 0; i < firstDay; i++) {
    const c = document.createElement('div'); c.className = 'cal-cell other'; grid.appendChild(c);
  }
  for (let d = 1; d <= daysInMon; d++) {
    const isToday = d === t.getDate() && calMonth === t.getMonth() && calYear === t.getFullYear();
    const cell = document.createElement('div');
    cell.className = 'cal-cell' + (isToday ? ' today' : '');
    const key = `${calYear}-${calMonth}-${d}`;
    const entry = CAL_MAP[key];
    let html = `<span class="day-num">${d}</span>`;
    if (entry) {
      const dotType = entry.type === 'medium' ? 'easy' : entry.type;
      const dotLabel = entry.km ? entry.km + 'km' : entry.min ? entry.min + 'min' : entry.type;
      html += `<span class="run-dot ${dotType}">${dotLabel}</span>`;
    }
    cell.innerHTML = html;
    grid.appendChild(cell);
  }
}

function changeMonth(delta) {
  calMonth += delta;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  renderCalendar();
}

// ── MILESTONES ───────────────────────────────────────────────────────────────
function renderMilestones() {
  const grid = document.getElementById('milestones-grid');
  grid.innerHTML = '';
  MILESTONES.forEach(m => {
    const unlocked = m.unlock(CURR);
    const card = document.createElement('div');
    card.className = 'milestone-card ' + (unlocked ? 'unlocked' : 'locked');
    card.innerHTML = `
      <div class="ms-header ${unlocked ? 'unlocked' : 'locked'}">
        <span class="ms-icon">${m.icon}</span>
        <span class="ms-badge ${unlocked ? 'unlocked' : 'locked'}">${unlocked ? 'UNLOCKED' : 'LOCKED'}</span>
      </div>
      <div class="ms-body">
        <div class="ms-name">${m.name}</div>
        <div class="ms-desc">${m.desc}</div>
        ${unlocked && m.date ? `<div class="ms-date">✓ ${m.date}</div>` : ''}
      </div>`;
    grid.appendChild(card);
  });
}

// ── TIPS ─────────────────────────────────────────────────────────────────────
let currentTipIdx = 0;
// Pre-training tips — 3 per week, keyed to PT week number
const PRETRAIN_TIPS = {
  1: [
    { icon:'🐣', tag:'GETTING STARTED', title:'WHY PRE-TRAINING MATTERS',
      body:'The official Hal Higdon plan assumes you can already run 5km comfortably three times a week. These 6 weeks get you there safely. Arriving at Week 1 undertrained is the most common reason beginners drop out by Week 4. Build the base first.' },
    { icon:'🍳', tag:'FOOD & FUEL', title:'EAT BEFORE YOU RUN — ALWAYS',
      body:'Even for short runs, eat a small snack 60–90 min before you head out. A banana, a slice of toast with peanut butter, or a small bowl of oats. Running on empty teaches your body nothing useful and makes the run feel terrible. Feed the machine.' },
    { icon:'🌅', tag:'ROUTINE', title:'PICK YOUR RUN DAYS NOW',
      body:'Decide which 3 days per week you\'ll run and put them in your calendar as non-negotiable. Tuesday, Thursday, Sunday works well — it matches the plan structure you\'ll follow for the next 6 months. Consistency at this stage matters more than pace or distance.' },
  ],
  2: [
    { icon:'🦶', tag:'INJURY PREVENTION', title:'ECCENTRIC HEEL DROPS — START NOW',
      body:'Stand on a step, heels hanging off. Rise on two feet, lower slowly on one foot over 3 counts. 3 sets of 15 each side, daily. Your single best protection against Achilles tendonitis — a very common first marathon injury. Start this habit 20 weeks before it matters most.' },
    { icon:'🥣', tag:'FOOD & FUEL', title:'YOUR PRE-RUN BREAKFAST',
      body:'For Sunday runs: oats with banana and a little peanut butter, 90 min before you leave. This is the breakfast you\'ll eat on race morning in November. Start testing it now so it\'s completely automatic by then. Your gut needs training too.' },
    { icon:'😴', tag:'ROUTINE', title:'PROTECT YOUR SLEEP',
      body:'Set a consistent bedtime — even on non-run days. Sleep is when your body rebuilds from training. 7–8 hours is the target. If you\'re tired on run days, the run feels much harder than it should. Good sleep is the cheapest performance tool you have.' },
  ],
  3: [
    { icon:'🌀', tag:'STRETCHING', title:'5 MIN AFTER EVERY RUN',
      body:'You don\'t need a full yoga session. Just five minutes: calf stretch on a wall, hip flexor lunge, figure-four glute. Do it every single time while your muscles are still warm. This habit will protect you all the way to race day.' },
    { icon:'🥗', tag:'FOOD & FUEL', title:'EAT MORE THAN YOU THINK YOU NEED',
      body:'New runners often underfuel without realising. Running increases your appetite AND your energy needs. Don\'t restrict food during training — especially carbohydrates. Rice, oats, bread, pasta, fruit are your best friends for the next 6 months.' },
    { icon:'📱', tag:'ROUTINE', title:'TRACK YOUR RUNS — START NOW',
      body:'Download Strava, Garmin Connect, or even just use the Notes app. Log every run: date, distance, how you felt. This data becomes motivating and useful as training gets harder. Seeing Week 1 PT runs alongside Week 15 long runs tells a story worth reading.' },
  ],
  4: [
    { icon:'🧘', tag:'STRETCHING', title:'HIP FLEXORS — YOUR WEAKEST LINK',
      body:'Most desk workers have chronically tight hip flexors. Kneel on one knee, shift your weight forward until you feel the pull at the front of your hip. Hold 30–45 sec each side after every run. Tight hip flexors are the hidden cause of a lot of lower back pain on long runs.' },
    { icon:'🍌', tag:'FOOD & FUEL', title:'CARBS ARE NOT THE ENEMY',
      body:'Marathon training runs on carbohydrates. Your muscles store them as glycogen — the primary fuel for runs over 30 minutes. Don\'t cut carbs during training. Rice, oats, sweet potato, banana, pasta: these are performance foods. Eat them without guilt.' },
    { icon:'🌙', tag:'ROUTINE', title:'EVENING RUNS — WHAT TO EAT',
      body:'If you run after work, have a light carb-based snack 60–90 min before: a banana, a few crackers with hummus, a small bowl of rice. Don\'t run on a full dinner — wait 2 hrs. Don\'t run on empty after a long workday — you\'ll feel terrible and hate every minute.' },
  ],
  5: [
    { icon:'🦢', tag:'STRETCHING', title:'PIGEON POSE — ADD THIS NOW',
      body:'From downward dog, bring one knee forward toward your wrist, lower your hips toward the floor. Hold 60 sec per side. Hips are the foundation of your running stride. Adding this stretch 7 weeks before the plan starts means it\'s already a habit when long runs begin.' },
    { icon:'🫙', tag:'FOOD & FUEL', title:'POST-RUN RECOVERY WINDOW',
      body:'Within 30 minutes of finishing any run, eat something with a 3:1 carb-to-protein ratio. Banana + Greek yoghurt. Rice + egg. Chocolate milk. This 30-minute window is when your muscles absorb nutrients fastest. Miss it and you add a full day to your recovery.' },
    { icon:'💆', tag:'ROUTINE', title:'BUILD A REST DAY RITUAL',
      body:'Monday is rest day in the plan. Use it for something that actively recovers you: a slow walk, a bath, foam rolling, or just doing nothing physical. Rest days are not wasted days — they are when your body actually adapts to the training. Protect them.' },
  ],
  6: [
    { icon:'🌀', tag:'STRETCHING', title:'FULL PRE-RUN WARM-UP',
      body:'Before every run from now: 5 min of leg swings, hip circles, ankle rotations, and a slow 3-minute walk to ease in. Cold muscles are injury-prone muscles. The warm-up feels like a waste of time until the day it prevents a pulled muscle at km 2.' },
    { icon:'🍽️', tag:'FOOD & FUEL', title:'RACE WEEK NUTRITION — PREVIEW',
      body:'In the 3 days before Sunday\'s long run this week, eat slightly more carbohydrates than usual. This is your first mini carb-load rehearsal. Rice, oats, pasta, bread. Notice how you feel on Sunday\'s run compared to previous weeks. You\'ll feel the difference.' },
    { icon:'📅', tag:'ROUTINE', title:'YOU\'RE READY FOR THE PLAN',
      body:'Next week the official Hal Higdon plan begins. You arrive stronger, more consistent, and better fuelled than most first-time marathon runners at this stage. Your legs know what running feels like. Your gut knows what to eat. Your calendar knows which days are run days. Go get it. 🐢' },
  ],
};

function showTip(idx) {
  currentTipIdx = idx;
  const w = PRE_TRAINING ? (PRE_WEEK || 1) : Math.max(1, Math.min(CURR || 1, TOTAL_WEEKS));
  const tipBank = PRE_TRAINING ? PRETRAIN_TIPS : WEEKLY_TIPS;
  const tips = tipBank[w] || (PRE_TRAINING ? PRETRAIN_TIPS[1] : WEEKLY_TIPS[1]);
  const tip  = tips[idx];
  const container = document.getElementById('tip-of-week');
  container.style.animation = 'none';
  container.offsetHeight;
  container.style.animation = '';
  container.innerHTML = `
    <span class="tip-icon">${tip.icon}</span>
    <div class="tip-content">
      <div class="tip-week-label">${PRE_TRAINING ? 'PRE-TRAINING WEEK' : 'WEEK'} ${w} · TIP ${idx + 1} OF 3</div>
      <div class="tip-title">${tip.title}</div>
      <div class="tip-body">${tip.body}</div>
      <span class="tip-tag">${tip.tag}</span>
    </div>`;
  document.querySelectorAll('.tip-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
}

// ── INIT ─────────────────────────────────────────────────────────────────────
// Render with localStorage first for instant load, then re-render once Supabase responds
renderHero();
renderAnimalStrip();
renderProgressBar();
renderDialogue();
renderChecklist();
renderCalendar();
renderMilestones();
showTip(0);

// Fetch Supabase runs, sync to localStorage, re-render
fetchRuns().then(() => {
  // Sync Supabase → localStorage so checkboxes reflect server state
  runsCache.forEach(r => {
    const checks = loadChecks(r.mode, r.week);
    if (!checks[r.day_idx]) {
      checks[r.day_idx] = true;
      saveChecks(r.mode, r.week, checks);
    }
  });
  renderHero();
  renderChecklist();
  renderMilestones();
});
