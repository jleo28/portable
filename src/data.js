// ---------- PortAble data: real Terminal49 snapshot + sourced model parameters ----------

// REAL: pulled from Terminal49 (tracking request created 2026-10-17 20:03 UTC).
// Fields keep Terminal49's own names so a live API read can drop straight in.
const T49_SNAPSHOT = {
  pulled_at: '2026-10-17T20:03:24Z',
  source: 'Terminal49 tracking (snapshot)',
  shipment: {
    bill_of_lading: '9509953390', shipping_line_scac: 'COSU', shipping_line_name: 'COSCO',
    port_of_lading_name: 'Tianjinxingang', port_of_discharge_name: 'Los Angeles',
    pod_vessel_name: 'EVER LAUREL', voyage: '1241E', pod_eta_at: '2026-10-28T13:00:00Z',
    pol_vessel_departed_at: '2026-10-01T21:31:12Z',
    pod_terminal_name: 'APM Terminals', pod_terminal_nickname: 'APMT', pod_terminal_firms_code: 'W185',
  },
  containers: ['OOCU8185051', 'TRHU5485372', 'TGBU4865142', 'CSNU6554910'].map(number => ({
    number, equipment_type: 'dry', equipment_length_ft: 40, equipment_height: 'high_cube',
    current_status: 'on_ship', available_for_pickup: false, availability_known: false,
    pickup_lfd: null, holds_at_pod_terminal: [], fees_at_pod_terminal: [], fees_total_amount: 0,
    urgency: 'unknown', urgency_reason: 'terminal availability has never been checked',
    latest_event: 'container.transport.estimated.vessel_arrived',
  })),
};

// Model parameters. `src` says where each number comes from; anything marked "assumption" is ours.
const PROFILES = {
  la: {
    name: 'Los Angeles · APM Terminals', short: 'LA',
    dataSource: 'Terminal49 (live adapter)',
    lanes: 4, lanesDown: 2, laneMin: 10,
    arrivalsPerHour: 20, initialQueue: 12,
    freeWaitMin: 60, truckWaitPerHour: 100,
    freeDays: 4, demurrageDay: 200, reeferMult: 3.5,
    reeferValue: 180000,
    examMin: 35, plugExamMin: 60, laneBlockMin: 45, gateHoldMin: 45, rerouteMin: 10, detectMin: 5,
    excursionMin: 30, reeferRoundMin: 120,
    illustrative: false,
  },
  tianjin: {
    name: 'Tianjin · illustrative profile', short: 'TJ',
    dataSource: 'Port community system (adapter to build)',
    lanes: 6, lanesDown: 3, laneMin: 8,
    arrivalsPerHour: 34, initialQueue: 18,
    freeWaitMin: 90, truckWaitPerHour: 40,
    freeDays: 7, demurrageDay: 120, reeferMult: 3,
    reeferValue: 180000,
    examMin: 40, plugExamMin: 75, laneBlockMin: 45, gateHoldMin: 45, rerouteMin: 10, detectMin: 5,
    excursionMin: 30, reeferRoundMin: 120,
    illustrative: true,
  },
};

const SOURCES_NOTE = [
  ['Free time before demurrage, LA/Long Beach', '3–5 days, 4 most common', 'FreightFigures, 2026'],
  ['Demurrage, first days past free time (dry)', '$175–$225 per day → we use $200', 'FreightFigures, 2026'],
  ['Reefer demurrage', 'about 3–4× dry → we use 3.5×', 'FreightFigures, 2026'],
  ['Truck waiting time', '1–2 h free, then charged per hour → we use 1 h free, $100/h', 'Ship4wd drayage guide'],
  ['Average truck turn time, LA/LB', 'about 90 minutes', 'Harbor Trucking Assn via TT News (2017)'],
  ['Reefer cargo value', '"several hundred thousand USD" per box → we use $180,000', 'Swedish Club cargo advice'],
  ['Reefer warming rate after a unit fault', '5 °C per hour (return air)', 'Assumption: no public rate; depends on box, cargo, weather'],
  ['Manual reefer checks without PortAble', 'every 2 hours', 'Assumption: terminals check plugs on rounds'],
  ['Gate service time, exam and hold durations', '10 min per truck per lane; 35–60 min exams', 'Assumption: stylized terminal'],
];

// The drill: the moment a terminal planner has to decide.
const DRILL = {
  date: 'Wed Oct 28', start: '10:00', decisionAt: '10:30',
  setC: -18, limitC: -12, warmPerHour: 5, coolPerHour: 6, tempAtDecision: -14.5,
  focus: {
    C184: { code: 'C184', kind: 'reefer', label: 'Refrigerated · frozen seafood', value: 180000,
      stories: {
        carrier: { says: 'EMPTY', note: 'Manifest filed by the shipping line before sailing.', trust: 'doubt',
          why: 'Paperwork from weeks ago, and today’s scale contradicts it.' },
        scale: { says: 'HEAVY · 26.4 t', note: 'Weighed at the terminal this morning.', trust: 'trust',
          why: 'A physical reading taken today on a calibrated scale.' },
        customs: { says: 'HOLD · agriculture exam', note: 'A legal hold. Only customs can lift it.', trust: 'binding',
          why: 'Binding whether you believe it or not. Release stays locked.' },
        reefer: { says: 'WARMING · −14.5 °C, set −18 °C', note: 'Live plug sensor, every 5 minutes.', trust: 'trust',
          why: 'A live sensor. The clock it starts is the reason this box can’t wait.' },
      } },
    C392: { code: 'C392', kind: 'dry', label: 'General cargo · past last free day', waitedMin: 70 },
    C510: { code: 'C510', kind: 'dry', label: 'General cargo · truck was in Lane 2', delayMin: 20 },
  },
};

const ACTIONS = {
  reroute: { label: 'Reroute to reefer stack', short: 'REROUTE', desc: 'Move it to a working plug. The customs hold stays; no exam requested yet.' },
  plugExam: { label: 'Plug in + request exam', short: 'PLUG + EXAM', desc: 'Move it to a working plug and ask customs for a perishables-priority exam there.' },
  inspect: { label: 'Inspect now', short: 'INSPECT', desc: 'Send it to the exam lane unplugged to settle the weight question first.' },
  wait: { label: 'Wait', short: 'WAIT', desc: 'Leave it where it is and keep the gate moving.' },
  holdGate: { label: 'Hold the whole gate', short: 'HOLD GATE', desc: 'The “bang”: stop every lane until this box is sorted out.' },
  release: { label: 'Release', short: 'RELEASE', desc: 'Locked: customs has a hold on this box.', locked: true },
};

if (typeof module !== 'undefined') module.exports = { T49_SNAPSHOT, PROFILES, SOURCES_NOTE, DRILL, ACTIONS };
