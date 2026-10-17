// ---------- PortAble interface ----------
const SEED = 7;
const UI_STEPS = ['Shift start', 'Which box can’t wait?', 'Four stories', 'Decide', '+30 minutes', 'Shift report'];
const LA = PROFILES.la;
const FC = forecast(LA, DRILL, SEED);          // every option, run to the end of the shift
const BASE = FC.options.wait.run;               // "do nothing about C184" reference run
const TRI = triage(LA, DRILL);
const S = { step: 0, open: null, picked: null, trust: {}, trustChecked: false, action: null, approveC510: true, approveC392: true,
  run: null, runIdx: T0 / STEP, timer: null, profile: 'la', bench: {}, track: null, tracking: false, form: { number: '', type: 'bill_of_lading', scac: '' } };

const $ = (sel, el = document) => el.querySelector(sel);
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tC = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + ' °C';
const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
const OPTION_ORDER = ['reroute', 'plugExam', 'inspect', 'wait', 'holdGate', 'release'];

// ---------- the gate strip ----------
function gateHTML(t, tl) {
  const outage = t >= OUTAGE_STEP * STEP && t < OUTAGE_STEP * STEP + OUTAGE_MIN;
  const expectUp = 4 - (outage ? 2 : 0);
  const blocked = Math.max(0, expectUp - tl.lanesUp);
  const lanes = [1, 2, 3, 4].map(n => {
    if (tl.held) return { n, st: 'held', note: 'HELD' };
    if (outage && (n === 2 || n === 3)) return { n, st: 'down', note: 'DOWN' };
    if (blocked && n === 4) return { n, st: 'busy', note: 'EXAM' };
    return { n, st: 'up', note: '' };
  });
  const up = lanes.filter(l => l.st === 'up').length;
  const per = up ? Math.min(10, Math.ceil(tl.queue / up)) : 0;
  return `<div class="glabel"><span class="eyebrow">In-gate</span><b>${up} of 4 lanes open</b></div>
    <div class="lanes">${lanes.map(l => `<div class="lane ${l.st}"><span class="ln"><i class="light"></i>Lane ${l.n}</span>
      <span class="track">${l.st === 'up' ? '<i class="truck"></i>'.repeat(per) : ''}${l.note ? `<span class="note">${l.note}</span>` : ''}</span></div>`).join('')}</div>
    <div class="qbox"><span class="eyebrow">Trucks waiting</span><b>${tl.queue}</b></div>`;
}
function gateState() {
  if (S.step === 0) return [0, BASE.timeline[0]];
  if (S.step <= 3) return [T0, BASE.timeline[T0 / STEP]];
  if (S.step === 4 && S.run) return [S.runIdx * STEP, S.run.timeline[S.runIdx]];
  const run = S.run || BASE; return [STEPS * STEP, run.timeline[STEPS - 1]];
}

// ---------- step 0: an ordinary day, with real Terminal49 data ----------
function stepShift() {
  const sh = T49_SNAPSHOT.shipment;
  const pulled = new Date(T49_SNAPSHOT.pulled_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const rows = T49_SNAPSHOT.containers.map(c => `<tr>
      <td class="mono">${c.number}</td><td>40′ high cube, dry</td><td>On ship</td>
      <td>${c.holds_at_pod_terminal.length ? 'Yes' : 'None reported'}</td><td class="num">${money(c.fees_total_amount)}</td>
      <td>Not published yet</td><td><span class="tag mute">${esc(c.urgency)}</span></td></tr>`).join('');
  const t = S.track;
  const result = t ? `<div class="result ${t.ok ? 'good' : 'err'}" role="status">${t.ok
      ? `Tracking request created · status <b>${esc(t.status || 'pending')}</b><br>id ${esc(t.id || '')}<br>Terminal49 will attach the shipment as soon as the carrier confirms it.`
      : esc(t.error)}</div>` : '';
  return `<section class="panel lede">
      <span class="eyebrow">Ordinary Tuesday view · the planner’s inbound watch</span>
      <h1>Know which box will hurt before the ship lands.</h1>
      <p>PortAble sits on Terminal49. Every day it watches inbound boxes for holds, fees and last free days, so the planner already has a plan when something breaks. Below is a real shipment heading to this terminal.</p>
    </section>
    <div class="cols">
      <section class="panel">
        <div class="row"><h2>Inbound to APMT</h2><span class="spacer"></span><span class="tag live">LIVE · Terminal49</span></div>
        <div class="ship">
          <div><span class="eyebrow">Vessel</span><b>${sh.pod_vessel_name}</b><span class="mono">${sh.shipping_line_name} · ${sh.voyage}</span></div>
          <div><span class="eyebrow">From</span><b>Tianjin</b><span class="mono">left Oct 1</span></div>
          <div><span class="eyebrow">Arrives</span><b>Wed Oct 28</b><span class="mono">6:00 AM PT (ETA)</span></div>
          <div><span class="eyebrow">Bill of lading</span><b class="mono">${sh.bill_of_lading}</b><span class="mono">${sh.pod_terminal_firms_code}</span></div>
        </div>
        <div class="tablewrap"><table>
          <thead><tr><th>Container</th><th>Type</th><th>Status</th><th>Holds</th><th class="num">Fees</th><th>Last free day</th><th>T49 urgency</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
        <p class="mono" style="font-size:12px;color:var(--muted)">Terminal49 snapshot, tracked ${pulled} PT. Terminal49 marks urgency “unknown” because terminal availability has never been checked; that is the gap PortAble fills.</p>
        <div class="verdict"><b>PortAble’s pre-arrival read</b>
          <span>If discharged Oct 28, the last free day lands around Nov 1 (LA/Long Beach default: 4 free days). Each day past it costs about ${money(LA.demurrageDay)} per box. No holds yet: PortAble re-checks after discharge and flags any box whose sources disagree.</span></div>
      </section>
      <section class="panel">
        <div class="row"><h3>Track another box</h3><span class="spacer"></span><span class="tag live">Terminal49 API</span></div>
        <p style="font-size:14px;color:var(--muted)">Sends a real tracking request to Terminal49 from the deployed app.</p>
        <form class="form" id="trackForm" novalidate>
          <label for="tNum">Number<input id="tNum" name="number" autocomplete="off" placeholder="e.g. 9509953390" value="${esc(S.form.number)}" required></label>
          <div class="two">
            <label for="tType">Type<select id="tType" name="type">${[['bill_of_lading', 'Bill of lading'], ['booking_number', 'Booking'], ['container', 'Container (beta)']].map(([v, n]) => `<option value="${v}" ${S.form.type === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <label for="tScac">Carrier<input id="tScac" name="scac" maxlength="4" placeholder="COSU" autocomplete="off" value="${esc(S.form.scac)}"></label>
          </div>
          <button class="btn primary" type="submit" ${S.tracking ? 'disabled' : ''}>${S.tracking ? 'Sending…' : 'Start tracking'}</button>
        </form>
        ${result}
      </section>
    </div>
    <section class="panel">
      <div class="row"><div class="lede"><span class="eyebrow">The drill</span><h2>Wed Oct 28, 10:30. The day this ship lands, half the gate goes down.</h2>
        <p>Rehearse the outage before it happens. The four real boxes stay on PortAble\u2019s watch list; three simulated problem boxes test the plan.</p></div>
        <span class="spacer"></span><button class="btn primary" data-act="go" data-step="1">Start the drill</button></div>
    </section>`;
}

// ---------- step 1: which box can't wait? ----------
const ALERTS = [
  { code: 'C184', level: 'crit', head: 'Reefer temp rising', meta: 'Critical in 30 min', kind: DRILL.focus.C184.label,
    dl: [['Reefer', '−14.5 °C (set −18), rising 5 °C/h'], ['Customs', 'Hold'], ['Gate', 'No truck yet (held box)']] },
  { code: 'C392', level: 'warn', head: 'Charges accumulating', meta: '+$100/hr', kind: DRILL.focus.C392.label,
    dl: [['Truck', 'Waiting 70 min (1 h free)'], ['Last free day', 'Today'], ['Charges', '$100 per hour of waiting']] },
  { code: 'C510', level: 'warn', head: 'Lane blocked', meta: '+20 min delay', kind: DRILL.focus.C510.label,
    dl: [['Truck', 'Was in Lane 2 when it went down'], ['Waited', '5 min'], ['Delay', '+20 min until reassigned']] },
];
function stepTriage() {
  const alerts = ALERTS.map(a => {
    const open = S.open === a.code;
    return `<div class="alert ${a.level} ${open ? 'open' : ''}">
      <span class="stripe"></span>
      <button class="body" data-act="open" data-code="${a.code}" aria-expanded="${open}" style="border:0;background:none;text-align:left">
        <span class="code">${a.code} <span class="tag sim">SIM</span></span>
        <span><b>${a.head}</b> · ${a.meta}</span><span class="meta">${a.kind}</span>
      </button>
      <span class="side"><span class="tag ${a.level}">${a.level === 'crit' ? 'CRITICAL' : 'WATCH'}</span></span>
      ${open ? `<div class="detail"><dl>${a.dl.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
        <div class="row"><button class="btn primary small" data-act="pick" data-code="${a.code}">This one can’t wait</button></div></div>` : ''}
    </div>`;
  }).join('');
  let verdict = '';
  if (S.picked) {
    const right = S.picked === 'C184';
    const costs = ['C184', 'C392', 'C510'].map(c => `<div class="cost ${c === 'C184' ? 'top' : ''}"><span class="eyebrow">${c} · if nobody acts for 30 min</span>
        <b>${money(TRI[c].cost)}</b><span style="font-size:13px">${esc(TRI[c].why)}</span></div>`).join('');
    verdict = `<section class="panel">
      <div class="verdict ${right ? 'good' : 'bad'}"><b>${right ? 'Right call. C184 is the only one that can’t be undone.' : S.picked + ' can wait. C184 can’t.'}</b>
        <span>${right ? 'Fees and delays come back down. A load past its safe temperature stays lost.' : 'Its cost grows slowly and comes back down once handled. C184 crosses its safe temperature in 30 minutes, and a spoiled load stays spoiled.'}</span></div>
      <div class="costs">${costs}</div>
      <p style="font-size:13px;color:var(--muted)">Ranked by expected cost of waiting 30 minutes. C184: chance the load is rejected grows to 100% over 30 min past −12 °C, times a ${money(DRILL.focus.C184.value)} cargo value.</p>
      <div class="row">${right ? '' : '<button class="btn" data-act="repick">Pick again</button>'}<span class="spacer"></span>
        <button class="btn primary" data-act="go" data-step="2">Open C184’s four stories</button></div>
    </section>`;
  }
  return `<section class="panel lede"><span class="eyebrow">10:30 · Lanes 2 and 3 down · ${BASE.trucks} trucks booked this shift</span>
      <h1>Three boxes need attention. Which one can’t wait?</h1>
      <p>Open each alert to see its situation, then pick the box that has to be handled first.</p></section>
    <section class="panel"><div class="row"><h2>Active alerts</h2></div><div class="alerts">${alerts}</div></section>${verdict}`;
}

// ---------- step 2: one box, four stories ----------
const SRC_NAMES = { carrier: 'Carrier manifest', scale: 'Terminal scale', customs: 'Customs', reefer: 'Reefer plug' };
function stepStories() {
  const st = DRILL.focus.C184.stories;
  const all = Object.keys(st).every(k => S.trust[k]);
  const cards = Object.entries(st).map(([k, v]) => {
    const pick = S.trust[k];
    const expected = v.trust === 'doubt' ? 'doubt' : 'trust';
    const read = S.trustChecked ? `<div class="read ${pick === expected ? 'match' : 'miss'}"><b>PortAble: ${v.trust === 'binding' ? 'binding' : v.trust}.</b> ${esc(v.why)}</div>` : '';
    return `<div class="story"><span class="src">${SRC_NAMES[k]}</span>
      <span class="says ${k === 'carrier' ? '' : 'flag'}">${esc(v.says)}</span><span class="why">${esc(v.note)}</span>
      <div class="seg" role="group" aria-label="Do you trust the ${SRC_NAMES[k]}?">
        <button data-act="trust" data-src="${k}" data-v="trust" aria-pressed="${pick === 'trust'}" ${S.trustChecked ? 'disabled' : ''}>Trust</button>
        <button data-act="trust" data-src="${k}" data-v="doubt" aria-pressed="${pick === 'doubt'}" ${S.trustChecked ? 'disabled' : ''}>Doubt</button></div>${read}</div>`;
  }).join('');
  const score = Object.entries(st).filter(([k, v]) => S.trust[k] === (v.trust === 'doubt' ? 'doubt' : 'trust')).length;
  return `<section class="panel lede"><span class="eyebrow">C184 · one box, four stories <span class="tag sim">SIM</span></span>
      <h1>Every source says something different. Which do you believe?</h1>
      <p>The carrier says empty, the scale says heavy, customs has a hold and the plug says it’s warming. Mark each source before deciding.</p></section>
    <section class="panel"><div class="stories">${cards}</div>
      <div class="row">${S.trustChecked ? `<span><b>${score} of 4</b> match PortAble’s read. Physical readings from today beat paperwork from weeks ago, and the customs hold binds either way, so Release stays locked.</span>` : ''}
        <span class="spacer"></span>
        ${S.trustChecked ? '<button class="btn primary" data-act="go" data-step="3">Decide what to do</button>'
          : `<button class="btn primary" data-act="check" ${all ? '' : 'disabled'}>Check against PortAble</button>`}</div></section>`;
}

// ---------- step 3: decide, with a forecast for every option ----------
function stepDecide() {
  const opts = OPTION_ORDER.map(a => {
    const A = ACTIONS[a];
    if (A.locked) return `<button class="opt" disabled aria-disabled="true"><span class="name">${A.short} <span class="tag mute">LOCKED</span></span><span class="d">${A.desc}</span></button>`;
    const o = FC.options[a];
    const tempBad = o.temp30 >= DRILL.limitC;
    return `<button class="opt" data-act="choose" data-a="${a}" aria-pressed="${S.action === a}">
      <span class="name">${A.short}${FC.suggested === a ? ' <span class="tag sugg">PORTABLE SUGGESTS</span>' : ''}</span>
      <span class="d">${A.desc}</span>
      <dl><dt>C184 at 11:00</dt><dd class="${tempBad ? 'bad' : 'good'}">${tC(o.temp30)}</dd>
        <dt>Expected cargo claim</dt><dd class="${o.cargoLoss ? 'bad' : 'good'}">${o.cargoLoss ? money(o.cargoLoss) : 'none'}</dd>
        <dt>Gate queue at 11:00</dt><dd class="${o.congestion > 5 ? 'bad' : ''}">${sign(o.congestion)}%</dd>
        <dt>Avg truck wait</dt><dd class="${o.delayMin > 5 ? 'bad' : ''}">${sign(o.delayMin)} min</dd>
        <dt>Customs hold</dt><dd>${o.holdCleared ? 'exam done ' + o.holdCleared : 'stays on'}</dd></dl></button>`;
  }).join('');
  const appr = S.action ? `<section class="panel"><div class="row"><h3>PortAble also wants to</h3><span class="spacer"></span><span class="eyebrow">You approve or reject each call</span></div>
      <div class="approvals">
        ${approveRow('C510', 'Reassign C510’s truck from dead Lane 2 to Lane 1', 'approveC510')}
        ${approveRow('C392', 'Move C392 to the next free slot (last free day today, truck already paying)', 'approveC392')}
      </div>
      <div class="row"><span class="spacer"></span><button class="btn primary" data-act="run">Commit and run 30 minutes</button></div></section>` : '';
  return `<section class="panel lede"><span class="eyebrow">10:30 · C184 · what would you do?</span>
      <h1>PortAble ran the rest of the shift once for every option.</h1>
      <p>Each card shows where things stand at 11:00. Queue and wait are compared with leaving C184 alone. Pick one; you can still overrule PortAble.</p></section>
    <section class="panel"><div class="options">${opts}</div></section>${appr}`;
}
function approveRow(code, text, key) {
  return `<div class="approve"><span><b class="mono">${code}</b> · ${text}</span>
    <div class="seg" role="group" aria-label="${code}"><button data-act="approve" data-k="${key}" data-v="1" aria-pressed="${S[key]}">Approve</button>
    <button data-act="approve" data-k="${key}" data-v="0" aria-pressed="${!S[key]}">Reject</button></div></div>`;
}

// ---------- step 4: +30 minutes ----------
function thermoSVG(temp) {
  const lo = -20, hi = -6, y = v => 190 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * 170;
  const ly = y(DRILL.limitC), ty = y(temp), over = temp >= DRILL.limitC;
  return `<svg viewBox="0 0 130 210" role="img" aria-label="C184 temperature ${tC(temp)}">
    <rect x="44" y="16" width="22" height="178" rx="11" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>
    <rect x="49" y="${ty}" width="12" height="${190 - ty}" rx="6" fill="${over ? 'var(--crit)' : 'var(--live)'}"/>
    <line x1="36" x2="90" y1="${ly}" y2="${ly}" stroke="var(--crit)" stroke-width="2" stroke-dasharray="4 3"/>
    <text x="92" y="${ly + 4}" font-size="11" fill="var(--crit)" font-family="IBM Plex Mono, monospace">limit</text>
    <text x="38" y="${y(-18) + 4}" font-size="11" text-anchor="end" fill="var(--muted)" font-family="IBM Plex Mono, monospace">−18</text>
    <text x="38" y="${ly + 4}" font-size="11" text-anchor="end" fill="var(--muted)" font-family="IBM Plex Mono, monospace">−12</text>
    <text x="38" y="${y(-8) + 4}" font-size="11" text-anchor="end" fill="var(--muted)" font-family="IBM Plex Mono, monospace">−8</text>
  </svg>`;
}
function stepRun() {
  const run = S.run, t = S.runIdx * STEP;
  const temp = c184Temp(run, DRILL, t);
  const log = run.events.filter(e => e[0] <= t && e[0] >= T0).map(e => `<li><span>${clockAt(e[0])}</span><span>${esc(e[1])}</span></li>`).join('');
  const done = S.runIdx >= (T0 + 30) / STEP;
  return `<section class="panel lede"><span class="eyebrow">You chose: ${ACTIONS[S.action].label}</span>
      <h1>${done ? '11:00. Here’s where things landed.' : 'Running the next 30 minutes…'}</h1></section>
    <section class="panel"><div class="runwrap">
      <div class="thermo"><span class="eyebrow">C184 return air</span>${thermoSVG(temp)}<b>${tC(temp)}</b></div>
      <div style="display:grid;gap:12px;align-content:start;min-width:0"><span class="eyebrow">Shift log</span><ul class="log">${log}</ul></div>
    </div></section>${done ? outcomeHTML() : ''}`;
}
function outcomeHTML() {
  const run = S.run, c = run.boxes.find(b => b.code === 'C184');
  const temp = c184Temp(run, DRILL, T0 + 30);
  const q = tt => run.timeline[tt / STEP].queue, qb = tt => BASE.timeline[tt / STEP].queue;
  const cong = qb(T0 + 30) ? Math.round((q(T0 + 30) - qb(T0 + 30)) / qb(T0 + 30) * 100) : 0;
  const delay = Math.round(run.avgWait - BASE.avgWait);
  const lost = c.loss, cls = lost === 0 ? 'good' : lost >= c.value ? 'bad' : 'mid';
  const head = lost === 0 ? 'C184 cargo protected' : lost >= c.value ? 'C184 cargo lost' : 'C184 cargo at risk';
  const sub = lost === 0 ? 'Temperature back under control and falling.' : `Expected claim by end of shift: ${money(lost)}.`;
  const b392 = run.boxes.find(b => b.code === 'C392'), b510 = run.boxes.find(b => b.code === 'C510');
  const fee392 = Math.max(0, ((b392.exit ?? STEPS * STEP) - b392.arrive) - LA.freeWaitMin) / 60 * LA.truckWaitPerHour;
  return `<section class="panel outcome">
      <div class="outhead ${cls}"><b>${head}</b><span>${sub}</span></div>
      <div class="stats">
        <div class="stat"><span class="eyebrow">C184 at 11:00</span><b>${tC(temp)}</b></div>
        <div class="stat"><span class="eyebrow">Gate queue vs. waiting</span><b>${sign(cong)}%</b></div>
        <div class="stat"><span class="eyebrow">Avg truck wait</span><b>${sign(delay)} min</b></div>
        <div class="stat"><span class="eyebrow">Customs hold</span><b>${c.examEnd !== null ? 'Exam ' + clockAt(c.examEnd) : 'Still on'}</b></div>
      </div>
      <div class="tablewrap"><table><thead><tr><th>Box</th><th>What happened</th><th class="num">Out of the gate</th><th class="num">Waiting charges</th></tr></thead><tbody>
        <tr><td class="mono">C392</td><td>${S.approveC392 ? 'Moved to the next free slot' : 'Left in arrival order'}</td><td class="num">${b392.exit !== null ? clockAt(b392.exit) : 'not today'}</td><td class="num">${money(fee392)}</td></tr>
        <tr><td class="mono">C510</td><td>${S.approveC510 ? 'Reassigned to Lane 1' : 'Waited for Lane 2 (+20 min)'}</td><td class="num">${b510.exit !== null ? clockAt(b510.exit) : 'not today'}</td><td class="num">${money(Math.max(0, ((b510.exit ?? STEPS * STEP) - b510.arrive) - LA.freeWaitMin) / 60 * LA.truckWaitPerHour)}</td></tr>
      </tbody></table></div>
      <div class="row"><button class="btn" data-act="go" data-step="3">Try another option</button><span class="spacer"></span><button class="btn primary" data-act="go" data-step="5">See the shift report</button></div>
    </section>`;
}

// ---------- step 5: shift report + benchmark ----------
function stepReport() {
  const mine = S.run || runShift(LA, 'portable', SEED, { drill: DRILL, action: FC.suggested });
  const rows = [
    ['Your shift (PortAble + your calls)', mine, true],
    ['First come, first served', runShift(LA, 'fcfs', SEED, { drill: DRILL, action: 'wait' })],
    ['Hold everything', runShift(LA, 'hold', SEED, { drill: DRILL, action: 'holdGate' })],
  ];
  const best = k => Math.min(...rows.map(r => r[1][k])), most = k => Math.max(...rows.map(r => r[1][k]));
  const mark = (v, b) => v === b ? ` <span class="best">●</span>` : '';
  const table = rows.map(([n, r, me]) => `<tr class="${me ? 'me' : ''}"><td>${n}</td>
      <td class="num">${money(r.spoiled)}${mark(r.spoiled, best('spoiled'))}</td><td class="num">${money(r.fees)}${mark(r.fees, best('fees'))}</td>
      <td class="num">${Math.round(r.avgWait)} min${mark(r.avgWait, best('avgWait'))}</td><td class="num">${r.out} of ${r.trucks}${mark(r.out, most('out'))}</td></tr>`).join('');

  const P = PROFILES[S.profile];
  if (!S.bench[S.profile]) S.bench[S.profile] = benchmark(P, 300);
  const B = S.bench[S.profile], max = Math.max(...Object.values(B.res).map(x => x.total));
  const order = Object.keys(POLICIES).sort((a, c) => B.res[a].total - B.res[c].total);
  const bars = order.map(p => `<div class="barrow ${p === 'portable' ? 'me' : ''}"><span>${POLICIES[p].name}</span>
      <span class="bartrack"><span class="barfill" style="width:${Math.max(1, B.res[p].total / max * 85).toFixed(1)}%"></span><span class="barval">${money(B.res[p].total)}</span></span></div>`).join('');
  const btable = order.map(p => { const x = B.res[p]; return `<tr class="${p === 'portable' ? 'me' : ''}"><td>${POLICIES[p].name}</td>
      <td class="num">${money(x.spoiled)}</td><td class="num">${money(x.fees)}</td><td class="num">${Math.round(x.avgWait)} min</td><td class="num">${x.out.toFixed(0)}</td><td class="num">${money(x.p90)}</td></tr>`; }).join('');
  const srcs = SOURCES_NOTE.map(([a, b, c]) => `<div><span>${a}</span><span class="mono">${b}</span><span>${c}</span></div>`).join('');
  return `<section class="panel lede"><span class="eyebrow">14:00 · End of shift</span><h1>Shift report</h1>
      <p>The same outage, the same trucks, run three ways. Cargo claims are expected values; fees are truck waiting time plus demurrage on boxes that miss their last free day.</p></section>
    <section class="panel"><div class="row"><h2>This drill</h2><span class="spacer"></span><span class="tag sim">SIM</span></div>
      <div class="tablewrap"><table><thead><tr><th>Plan</th><th class="num">Cargo claims</th><th class="num">Fees</th><th class="num">Avg truck wait</th><th class="num">Trucks out</th></tr></thead><tbody>${table}</tbody></table></div>
      <p style="font-size:13px;color:var(--muted)">● best in column. Without PortAble, a failing reefer is found on the next manual plug check; with it, the plug sensor and the scale are reconciled as soon as the box lands.</p></section>
    <section class="panel">
      <div class="row"><h2>Across ${B.n} simulated outages</h2><span class="spacer"></span>
        <div class="seg" role="group" aria-label="Port profile">${Object.entries(PROFILES).map(([k, v]) => `<button data-act="profile" data-p="${k}" aria-pressed="${S.profile === k}">${v.short === 'LA' ? 'Los Angeles' : 'Tianjin'}</button>`).join('')}</div></div>
      <p>Random truck arrivals, problem boxes and reefer faults each run, same lane outage. Bars show the average total cost per shift (cargo claims plus fees).</p>
      <div class="bars">${bars}</div>
      <div class="tablewrap"><table><thead><tr><th>Policy</th><th class="num">Cargo claims</th><th class="num">Fees</th><th class="num">Avg wait</th><th class="num">Trucks out</th><th class="num">Bad day (90th pct)</th></tr></thead><tbody>${btable}</tbody></table></div>
      <div class="verdict"><b>${P.name}</b><span>Data source: ${P.dataSource}. ${P.illustrative ? 'Tianjin parameters are illustrative placeholders, not sourced. The point: the engine is port-agnostic; only the data adapter and the tariff numbers change.' : 'Parameters below. The engine is the same at any port; outside North America the data adapter changes from Terminal49 to the local port community system.'}</span></div>
    </section>
    <section class="panel"><h3>Where the numbers come from</h3><div class="srcs">${srcs}</div>
      <p style="font-size:13px;color:var(--muted)">A small model for comparing plans, not a forecast of a real terminal. Every assumption is listed so it can be replaced with a terminal’s own data.</p></section>
    <section class="panel"><div class="row"><button class="btn" data-act="go" data-step="0">Back to inbound watch</button><span class="spacer"></span><button class="btn primary" data-act="restart">Run the drill again</button></div></section>`;
}

// ---------- render + events ----------
function render() {
  $('#steps').innerHTML = UI_STEPS.map((n, i) => `<li class="${i < S.step ? 'done' : i === S.step ? 'now' : ''}" ${i === S.step ? 'aria-current="step"' : ''}><span>${n}</span></li>`).join('');
  const [t, tl] = gateState();
  $('#gate').innerHTML = gateHTML(t, tl);
  $('#clock').textContent = DRILL.date + ' · ' + clockAt(t);
  const views = [stepShift, stepTriage, stepStories, stepDecide, stepRun, stepReport];
  $('#stage').innerHTML = views[S.step]();
}
function go(step) {
  if (S.timer) { clearInterval(S.timer); S.timer = null; }
  S.step = step; render(); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function startRun() {
  S.run = runShift(LA, 'portable', SEED, { drill: DRILL, action: S.action, approveOthers: S.approveC510, noBump: !S.approveC392 });
  S.runIdx = T0 / STEP; go(4);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { S.runIdx = (T0 + 30) / STEP; render(); return; }
  S.timer = setInterval(() => {
    S.runIdx++; render();
    if (S.runIdx >= (T0 + 30) / STEP) { clearInterval(S.timer); S.timer = null; }
  }, 650);
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === 'go') return go(+b.dataset.step);
  if (a === 'open') { S.open = S.open === b.dataset.code ? null : b.dataset.code; return render(); }
  if (a === 'pick') { S.picked = b.dataset.code; return render(); }
  if (a === 'repick') { S.picked = null; S.open = 'C184'; return render(); }
  if (a === 'trust') { S.trust[b.dataset.src] = b.dataset.v; return render(); }
  if (a === 'check') { S.trustChecked = true; return render(); }
  if (a === 'choose') { S.action = b.dataset.a; return render(); }
  if (a === 'approve') { S[b.dataset.k] = b.dataset.v === '1'; return render(); }
  if (a === 'run') return startRun();
  if (a === 'profile') { S.profile = b.dataset.p; return render(); }
  if (a === 'restart') { Object.assign(S, { open: null, picked: null, trust: {}, trustChecked: false, action: null, approveC510: true, approveC392: true, run: null }); return go(1); }
});

document.addEventListener('submit', async e => {
  if (e.target.id !== 'trackForm') return;
  e.preventDefault();
  const number = $('#tNum').value.trim(), type = $('#tType').value, scac = $('#tScac').value.trim().toUpperCase();
  S.form = { number, type, scac };
  if (!/^[A-Za-z0-9]{4,20}$/.test(number)) { S.track = { ok: false, error: 'Enter a bill of lading, booking or container number (letters and digits only).' }; return render(); }
  if (scac && !/^[A-Z]{4}$/.test(scac)) { S.track = { ok: false, error: 'Carrier code is four letters, like COSU for COSCO. Leave it blank to let Terminal49 detect it.' }; return render(); }
  S.tracking = true; S.track = null; render();
  try {
    const r = await fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_type: type, request_number: number, scac: scac || undefined }) });
    const j = await r.json().catch(() => null);
    if (!j) throw new Error('no json');
    S.track = j.ok ? j : { ok: false, error: 'Terminal49: ' + (j.error || 'request refused') + (j.status ? ' (HTTP ' + j.status + ')' : '') };
  } catch (err) {
    S.track = { ok: false, error: 'This copy can’t reach the PortAble server, so no request was sent. Live tracking works on the deployed app.' };
  }
  S.tracking = false; render();
});

render();
