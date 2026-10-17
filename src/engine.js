// ---------- PortAble engine: one terminal gate, one shift, three ways to run it ----------
// Pure and deterministic for a given seed. 5-minute steps from 10:00 to 14:00.
// Half the gate lanes go down at 10:30 for two hours.
const STEP = 5, STEPS = 48, OUTAGE_STEP = 6, OUTAGE_MIN = 120, T0 = 30; // T0 = minutes after 10:00 when the drill decision lands
const POLICIES = {
  fcfs: { name: 'First come, first served', short: 'FCFS', desc: 'Trucks are served in arrival order. A problem box is found when it reaches a lane, and stops that lane.' },
  hold: { name: 'Hold everything', short: 'HOLD', desc: 'When the lanes go down, stop the gate and sweep the yard. Any new problem box stops the gate again.' },
  portable: { name: 'PortAble', short: 'PORTABLE', desc: 'Reconcile every source when a box lands, divert problem boxes to an exception bay, plug in warming reefers first, and serve trucks by cost of delay.' },
};

function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function poisson(r, lam) { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }
function expo(r, mean) { return -mean * Math.log(1 - r()); }
const clockAt = min => { const m = 600 + Math.round(min); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(((m % 60) + 60) % 60).padStart(2, '0'); };

// Trucks arrive (Poisson), each for one box. Some boxes are reefers, some must leave today (last free day),
// some carry a conflict that needs a customs exam, and some reefers develop a unit fault (time to the
// safe-temperature limit is exponential, mean 60 min).
function makeBoxes(cfg, r) {
  const boxes = [];
  const gen = arrive => {
    const reefer = r() < 0.10;
    const b = { arrive, truck: true, reefer, lfdToday: r() < 0.2, exception: r() < 0.05, fault: null, value: reefer ? cfg.reeferValue : 0, code: null };
    if (reefer && r() < 0.15) b.fault = { start: Math.floor(r() * 180), ttl: Math.max(10, Math.round(expo(r, 60))) };
    boxes.push(b);
  };
  for (let i = 0; i < cfg.initialQueue; i++) gen(-Math.floor(r() * 50));
  for (let s = 0; s < STEPS; s++) {
    const n = poisson(r, cfg.arrivalsPerHour * STEP / 60);
    for (let k = 0; k < n; k++) gen(s * STEP + Math.floor(r() * STEP));
  }
  boxes.sort((a, c) => a.arrive - c.arrive);
  return boxes;
}

// The drill's three boxes, injected into a seeded background shift.
function injectDrill(boxes, cfg, D) {
  const F = D.focus;
  // C184: a yard box (no truck can take it while customs holds it). Its unit started failing at 09:48:
  // −18 °C rising 5 °C/h reaches −14.5 °C at 10:30 and the −12 °C limit at 11:00.
  const faultStart = T0 - Math.round((D.tempAtDecision - D.setC) / D.warmPerHour * 60);
  const ttl = Math.round((D.limitC - D.setC) / D.warmPerHour * 60);
  boxes.push({ code: 'C184', arrive: -240, truck: false, reefer: true, lfdToday: false, exception: true, value: F.C184.value, fault: { start: faultStart, ttl } });
  // C392: its truck has waited 70 min by 10:30 (past the 1 h free time) and today is its last free day.
  // Its box only becomes available at 10:30, so the truck rejoins the line then.
  boxes.push({ code: 'C392', arrive: T0 - F.C392.waitedMin, queuedAt: T0, availAt: T0, truck: true, reefer: false, lfdToday: true, exception: false, value: 0, fault: null });
  // C510: its truck was mid-transaction in Lane 2 when the lane went down.
  boxes.push({ code: 'C510', arrive: T0 - 5, availAt: T0, truck: true, reefer: false, lfdToday: false, exception: false, value: 0, fault: null, front: true });
  boxes.sort((a, c) => a.arrive - c.arrive);
}

function costOfDelay(b, t, cfg) {
  // expected cost of making this truck wait one more hour
  const wait = t - b.arrive;
  let c = 0;
  if (wait + 60 > cfg.freeWaitMin) c += cfg.truckWaitPerHour * Math.min(1, (wait + 60 - cfg.freeWaitMin) / 60);
  if (b.lfdToday) c += cfg.demurrageDay * (b.reefer ? cfg.reeferMult : 1) * 0.5;
  return c;
}

// opts.drill: DRILL object; opts.action: what the planner does with C184 at 10:30;
// opts.approveOthers: PortAble's calls on C392/C510 approved (default true when policy is portable)
function runShift(cfg, policy, seed, opts = {}) {
  const r = mulberry(seed);
  const boxes = makeBoxes(cfg, r);
  const D = opts.drill;
  if (D) injectDrill(boxes, cfg, D);
  boxes.forEach((b, i) => Object.assign(b, { id: i, exit: null, fixAt: null, examStart: null, examEnd: null, notBefore: b.availAt !== undefined ? b.availAt : null }));
  const qpos = b => b.queuedAt !== undefined ? b.queuedAt : b.arrive;   // place in an arrival-order line
  const smart = policy === 'portable';
  const approve = opts.approveOthers !== undefined ? opts.approveOthers : smart;

  // PortAble reconciles sources when a box is discharged, so it knows about conflicts before the truck arrives.
  if (smart) boxes.forEach(b => { if (b.exception && !b.code) { b.examStart = b.arrive - 60; b.examEnd = b.examStart + cfg.examMin; } });

  let acc = 0, deduct = 0, holdUntil = -1, holdsLeft = 2;
  const laneBlocks = [];
  const timeline = [];
  const events = [];
  const by = code => boxes.find(b => b.code === code);
  // opts.noBump: the planner rejected PortAble's call to move C392 up the queue
  const cd = (b, t) => (opts.noBump && b.code === 'C392') ? 0 : costOfDelay(b, t, cfg);

  // the drill decision on C184, applied at 10:30
  function applyAction(t) {
    const c = by('C184'); if (!c) return;
    const a = opts.action || 'wait';
    if (a === 'reroute') { c.fixAt = t + cfg.rerouteMin; deduct += 0.5; events.push([t, 'C184 moved to a working reefer plug. Customs hold still on.']); }
    if (a === 'plugExam') { c.fixAt = t + cfg.rerouteMin; c.examStart = c.fixAt; c.examEnd = c.fixAt + cfg.plugExamMin; deduct += 0.5; events.push([t, 'C184 moved to a working plug; perishables exam requested at the stack.']); }
    if (a === 'inspect') { laneBlocks.push(t + 15); c.examStart = t; c.examEnd = t + cfg.examMin; c.fixAt = t + cfg.examMin; events.push([t, 'C184 sent to the exam lane, unplugged. One lane busy for 15 min.']); }
    if (a === 'holdGate') { holdUntil = Math.max(holdUntil, t + cfg.gateHoldMin); c.fixAt = t + 15; c.examStart = t; c.examEnd = t + cfg.examMin; events.push([t, 'Gate held for ' + cfg.gateHoldMin + ' min. Crew plugs C184 in.']); }
    if (a === 'wait') events.push([t, 'C184 left where it is.']);
  }

  for (let s = 0; s < STEPS; s++) {
    const t = s * STEP;
    const outage = s >= OUTAGE_STEP && t < OUTAGE_STEP * STEP + OUTAGE_MIN;
    if (s === OUTAGE_STEP) events.push([t, 'Lanes 2 and 3 go down.']);
    if (s === OUTAGE_STEP + OUTAGE_MIN / STEP) events.push([t, 'Lanes 2 and 3 back up.']);
    if (D && t === T0) {
      applyAction(t);
      const c510 = by('C510');
      if (c510) { if (approve) events.push([t, 'C510 reassigned from Lane 2 to Lane 1.']); else { c510.notBefore = t + D.focus.C510.delayMin; events.push([t, 'C510 waits for Lane 2.']); } }
      const c392 = by('C392');
      if (c392 && smart) events.push([t, opts.noBump ? 'C392 joins the back of the line.' : 'C392 moved to the next free slot.']);
    }

    // hold everything: stop the gate at the outage and sweep the yard
    if (policy === 'hold' && s === OUTAGE_STEP) {
      holdUntil = Math.max(holdUntil, t + cfg.gateHoldMin);
      events.push([t, 'Gate held for a yard sweep.']);
      boxes.forEach(b => {
        if (b.exit !== null || b.code === 'C184') return;
        if (b.exception && b.examStart === null && b.arrive <= t + 60) { b.examStart = t; b.examEnd = t + cfg.examMin; }
        if (b.fault && b.fault.start <= t && b.fixAt === null) b.fixAt = holdUntil;
      });
    }
    // Without PortAble, a failing reefer unit is found on the next manual reefer round (or when it leaves)
    if (!smart && t > 0 && (t + 600) % cfg.reeferRoundMin === 0) boxes.forEach(b => {
      if (b.fault && b.fault.start <= t && b.fixAt === null && b.exit === null) b.fixAt = t + cfg.rerouteMin;
    });
    // PortAble: a warming reefer is detected from its plug sensor and moved to a working plug
    if (smart) boxes.forEach(b => {
      if (!b.fault || b.code || b.fixAt !== null || b.exit !== null) return;
      if (b.fault.start + cfg.detectMin <= t) { b.fixAt = t + cfg.rerouteMin; deduct += 0.5; }
    });

    let lanesUp = cfg.lanes - (outage ? cfg.lanesDown : 0) - laneBlocks.filter(e => e > t).length;
    if (t < holdUntil) lanesUp = 0;
    lanesUp = Math.max(0, lanesUp);
    acc += lanesUp * STEP / cfg.laneMin - deduct; deduct = 0;
    if (lanesUp === 0) acc = Math.min(acc, 0);

    const present = boxes.filter(b => b.truck && b.exit === null && b.arrive <= t);
    let order;
    if (smart) order = present.filter(b => !b.exception || (b.examEnd !== null && b.examEnd <= t))
      .sort((a, c) => (c.front ? 1 : 0) - (a.front ? 1 : 0) || cd(c, t) - cd(a, t) || qpos(a) - qpos(c));
    else order = present.filter(b => !(b.examStart !== null && (b.examEnd === null || b.examEnd > t))).sort((a, c) => (c.front ? 1 : 0) - (a.front ? 1 : 0) || qpos(a) - qpos(c));

    let served = 0;
    for (const b of order) {
      if (acc < 1 || (t < holdUntil)) break;
      if (b.notBefore !== null && t < b.notBefore) continue;
      if (b.exception && b.examEnd === null) {
        // found at the gate
        if (policy === 'hold' && holdsLeft > 0) {
          holdsLeft--; holdUntil = t + 30; b.examStart = t; b.examEnd = t + cfg.examMin;
          events.push([t, 'Problem box at the gate: gate held 30 min.']);
          break;
        }
        laneBlocks.push(t + cfg.laneBlockMin); b.examStart = t + cfg.laneBlockMin; b.examEnd = b.examStart + cfg.examMin; acc -= 1;
        continue;
      }
      if (b.exception && b.examEnd > t) continue;
      b.exit = t + STEP / 2; acc -= 1; served++;
    }
    const q = boxes.filter(b => b.truck && b.exit === null && b.arrive <= t + STEP);
    timeline.push({ t, lanesUp, queue: q.length, served, held: t < holdUntil });
  }

  const END = STEPS * STEP;
  let truckCost = 0, demurrage = 0, spoiled = 0, waitSum = 0, trucks = 0, out = 0, spoiledBoxes = 0;
  for (const b of boxes) {
    if (b.truck) {
      const wait = (b.exit !== null ? b.exit : END) - b.arrive;
      waitSum += wait; trucks++;
      truckCost += Math.max(0, wait - cfg.freeWaitMin) / 60 * cfg.truckWaitPerHour;
      if (b.exit !== null) out++;
    }
    if (b.lfdToday && b.exit === null) demurrage += cfg.demurrageDay * (b.reefer ? cfg.reeferMult : 1);
    // a problem box whose exam never finishes today stays another day
    else if (b.exception && b.exit === null && (b.examEnd === null || b.examEnd > END)) demurrage += cfg.demurrageDay * (b.reefer ? cfg.reeferMult : 1);
    if (b.fault) b.loss = lossOf(b, cfg, END); else b.loss = 0;
    if (b.loss > 0) { spoiled += b.loss; if (b.loss >= b.value * 0.5) spoiledBoxes++; }
  }
  const fees = truckCost + demurrage;
  return {
    policy, seed, boxes, timeline, events: events.map((e, i) => [e[0], e[1], i]).sort((a, c) => a[0] - c[0] || a[2] - c[2]),
    spoiled: Math.round(spoiled), truckCost: Math.round(truckCost), demurrage: Math.round(demurrage), fees: Math.round(fees),
    total: Math.round(spoiled + fees), avgWait: trucks ? waitSum / trucks : 0, out, trucks, spoiledBoxes,
  };
}

// Expected claim on a reefer: once past its safe limit, the chance the load is rejected grows to 100%
// over `excursionMin` minutes. The clock stops when it is plugged into a working unit or leaves on a truck.
function lossOf(b, cfg, END) {
  const stop = Math.min(b.fixAt !== null ? b.fixAt : Infinity, b.exit !== null ? b.exit : Infinity, END);
  if (stop <= b.fault.start) return 0;
  const over = Math.max(0, stop - (b.fault.start + b.fault.ttl));
  return b.value * Math.min(1, over / cfg.excursionMin);
}

// C184's return-air temperature over time under a given run
function c184Temp(run, D, t) {
  const c = run.boxes.find(b => b.code === 'C184');
  const fixAt = c.fixAt !== null ? c.fixAt : Infinity;
  if (t <= fixAt) return D.setC + D.warmPerHour * (t - c.fault.start) / 60;
  const peak = D.setC + D.warmPerHour * (fixAt - c.fault.start) / 60;
  return Math.max(D.setC, peak - D.coolPerHour * (t - fixAt) / 60);
}

// What each option looks like 30 minutes after the decision, and at the end of the shift.
function forecast(cfg, D, seed) {
  const base = runShift(cfg, 'portable', seed, { drill: D, action: 'wait' });
  const qAt = (run, t) => run.timeline[Math.round(t / STEP)].queue;
  const out = {};
  for (const a of ['reroute', 'plugExam', 'inspect', 'wait', 'holdGate']) {
    const run = a === 'wait' ? base : runShift(cfg, 'portable', seed, { drill: D, action: a });
    const c = run.boxes.find(b => b.code === 'C184');
    const temp30 = c184Temp(run, D, T0 + 30);
    const q0 = qAt(base, T0 + 30), q1 = qAt(run, T0 + 30);
    out[a] = {
      action: a, run, temp30, peak: Math.max(...[0, 10, 20, 30, 40, 60].map(m => c184Temp(run, D, T0 + m))),
      cargoLoss: Math.round(c.loss), cargoSafe: c.loss === 0,
      congestion: q0 ? Math.round((q1 - q0) / q0 * 100) : 0,
      delayMin: Math.round(run.avgWait - base.avgWait),
      fees: run.fees, total: run.total,
      holdCleared: c.examEnd !== null ? clockAt(c.examEnd) : null,
    };
  }
  const best = Object.values(out).sort((a, c) => a.total - c.total)[0];
  return { options: out, suggested: best.action };
}

// Triage: what does it cost if nobody acts on each box for the next 30 minutes?
function triage(cfg, D) {
  const ttlLeft = (D.limitC - D.tempAtDecision) / D.warmPerHour * 60; // minutes until C184 crosses its limit
  const lateFix = T0 + 30 + cfg.rerouteMin;                              // acting 30 min late
  const over = Math.max(0, lateFix - (T0 + ttlLeft));
  return {
    C184: { cost: Math.round(D.focus.C184.value * Math.min(1, over / cfg.excursionMin)), why: 'crosses −12 °C in ' + Math.round(ttlLeft) + ' min; acting 30 min late risks the load', irreversible: true },
    C392: { cost: Math.round(cfg.truckWaitPerHour * 0.5), why: 'truck already past its free hour: +$' + cfg.truckWaitPerHour + '/h; last free day today', irreversible: false },
    C510: { cost: Math.round(cfg.truckWaitPerHour * Math.max(0, (D.focus.C510.delayMin + 30 - cfg.freeWaitMin + 5)) / 60), why: 'stuck in a dead lane: +' + D.focus.C510.delayMin + ' min until reassigned; still inside its free hour', irreversible: false },
  };
}

// Monte Carlo: the same three policies across many random outages.
function benchmark(cfg, n = 300, seed0 = 1000) {
  const res = {};
  for (const p of Object.keys(POLICIES)) {
    const runs = [];
    for (let i = 0; i < n; i++) runs.push(runShift(cfg, p, seed0 + i));
    const mean = k => runs.reduce((s, x) => s + x[k], 0) / n;
    const pct = (k, q) => { const v = runs.map(x => x[k]).sort((a, c) => a - c); return v[Math.min(n - 1, Math.floor(q * n))]; };
    res[p] = { spoiled: mean('spoiled'), fees: mean('fees'), avgWait: mean('avgWait'), out: mean('out'), total: mean('total'), p90: pct('total', 0.9) };
  }
  return { n, res };
}

if (typeof module !== 'undefined') module.exports = { STEP, STEPS, T0, OUTAGE_STEP, OUTAGE_MIN, POLICIES, runShift, forecast, triage, benchmark, c184Temp, clockAt, lossOf };
