# PortAble

**When the port is disrupted, find the box that can't wait, and the gentlest move that still saves it.**

PortAble is a decision tool for the terminal planner, built on Terminal49. It has two lives:

- **Ordinary day:** watch inbound boxes (real Terminal49 data) for holds, fees and last free days before the ship lands.
- **Crisis:** when half the gate lanes go down, rank problem boxes by the expected cost of waiting, reconcile conflicting sources on a box (carrier, scale, customs, reefer plug), and forecast every option before the planner commits. PortAble suggests; the planner decides.

Ports & Logistics lens (Terminal49), InnovateLA Dual-Use Hackathon, Oct 2026.

## The drill (about 3 minutes)

1. **Shift start.** Real COSCO shipment on the EVER LAUREL (BOL 9509953390), due at APM Terminals Oct 28. Track another box with a live Terminal49 call.
2. **Which box can't wait?** 10:30, lanes 2 and 3 down. Three alerts: C184 (reefer warming), C392 (charges running), C510 (truck stuck in a dead lane).
3. **Four stories.** Carrier says empty, scale says 26.4 t, customs hold, reefer warming. Mark which sources you trust.
4. **Decide.** Reroute, plug in + request exam, inspect now, wait, or hold the whole gate. Release is locked by the customs hold. Each option shows its forecast at 11:00.
5. **+30 minutes.** Watch the result play out.
6. **Shift report.** Your shift vs. first-come-first-served vs. hold-everything, then a 300-run benchmark. Switch the port profile to Tianjin (twist 2).

## Real vs. simulated

| Layer | Source |
| --- | --- |
| 4 inbound containers, vessel, terminal, ETA, holds, fees, last free day, urgency | **Real**, Terminal49 snapshot (tracked Oct 17, 2026) |
| "Track another box" | **Live** Terminal49 API call (`POST /v2/tracking_requests`) from the server |
| C184, C392, C510 and the background truck flow | **Simulated**, in Terminal49's own field names so real data can drop in |
| Reefer temperature, scale weight, lane status | **Simulated**: the terminal's own systems; Terminal49 doesn't carry these |

Terminal49's free plan only allows creating tracking requests. Reading tracking data back needs a paid plan or API trial; with read access, the snapshot becomes a live feed with no change to the engine.

## Run it

- **Locally:** `python3 build.py`, then open `index.html`. Everything works except "Track another box", which needs the server.
- **Deploy (Vercel):** `npx vercel` from this folder, then `npx vercel env add T49_API_KEY` (paste the key), then `npx vercel --prod`. The key stays on the server in `api/track.js`; it never reaches the browser.

Edit files in `src/`, then run `python3 build.py`.

## How it's built

- `src/engine.js` — the model. One gate, 10:00–14:00 in 5-minute steps, 4 lanes with 2 down from 10:30 to 12:30. Poisson truck arrivals; some boxes carry a conflict needing a customs exam; some reefers develop a unit fault (time to the safe limit is exponential, mean 60 min). Three policies: first-come-first-served, hold-everything, PortAble. For each option on C184 it re-runs the rest of the shift, which is where every forecast comes from.
- `src/data.js` — the Terminal49 snapshot, the drill, and every parameter with its source.
- `src/app.js`, `src/style.css`, `src/body.html`, `src/head.html` — the interface.
- `api/track.js` — Vercel function that creates a Terminal49 tracking request.
- `build.py` — assembles `index.html` (deploy) and `artifact.html` (preview).

## Where the numbers come from

| Parameter | Value | Source |
| --- | --- | --- |
| Free time before demurrage, LA/LB | 3–5 days, 4 most common | FreightFigures, 2026 |
| Demurrage, first days (dry) | $175–$225/day → $200 | FreightFigures, 2026 |
| Reefer demurrage | ~3–4× dry → 3.5× | FreightFigures, 2026 |
| Truck waiting | 1–2 h free, then hourly → 1 h free, $100/h | Ship4wd drayage guide |
| Average truck turn time, LA/LB | ~90 min | Harbor Trucking Assn via TT News (2017) |
| Reefer cargo value | "several hundred thousand USD" → $180,000 | Swedish Club |
| Reefer warming after unit fault | 5 °C/h | Assumption |
| Manual reefer checks without PortAble | every 2 h | Assumption |
| Gate service, exam, hold durations | 10 min/truck/lane; 35–60 min exams | Assumption |

A small model for comparing plans, not a forecast of a real terminal.

## Responsible use

PortAble never releases a box under a customs hold, and every exam-related option keeps the hold in place. Misuse risk: forecasts could be used to justify skipping inspections or to deprioritize a shipper unfairly. We limit that by keeping a person on every call that changes a box's handling, and by showing where sources disagree instead of hiding it.

## Twists

- **Twist 1, funding:** sell to terminals and fit their federal grants: FEMA Port Security Grant Program (FY26: $95M, terminal operators eligible) and MARAD Port Infrastructure Development Program (FY26: ≥$450M; freight ITS, digital infrastructure and resilience eligible; private partners can join a public lead). Both FY26 windows have closed, so the target is FY27. SBIR for the startup itself.
- **Twist 2, global:** the real boxes were loaded in Tianjin. Same engine, different port profile; outside North America the adapter reads the local port community system instead of Terminal49.
- **Twist 3, poster:** separate deliverable.

## AI tools used

Claude (planning, research, code). List any others the team used.
