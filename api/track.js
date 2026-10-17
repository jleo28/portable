// Vercel serverless function: POST /api/track
// Creates a Terminal49 tracking request with the server-side key (never shipped to the browser).
// Terminal49's free plan allows exactly this call; reading tracking data back needs a paid plan or trial.
const TYPES = ['bill_of_lading', 'booking_number', 'container'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST.' });
  const key = process.env.T49_API_KEY;
  if (!key) return res.status(500).json({ ok: false, error: 'The server has no Terminal49 key. Set T49_API_KEY in the Vercel project settings.' });

  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const request_type = TYPES.includes(body.request_type) ? body.request_type : 'bill_of_lading';
  const request_number = String(body.request_number || '').trim();
  const scac = body.scac ? String(body.scac).trim().toUpperCase() : '';
  if (!/^[A-Za-z0-9]{4,20}$/.test(request_number)) return res.status(400).json({ ok: false, error: 'Number must be 4–20 letters or digits.' });
  if (scac && !/^[A-Z]{4}$/.test(scac)) return res.status(400).json({ ok: false, error: 'Carrier code must be four letters.' });

  const attributes = { request_type, request_number };
  if (scac) attributes.scac = scac; else attributes.auto_detect_vocc_scac = true;

  try {
    const r = await fetch('https://api.terminal49.com/v2/tracking_requests', {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/vnd.api+json', Accept: 'application/vnd.api+json' },
      body: JSON.stringify({ data: { type: 'tracking_request', attributes } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = (j.errors && j.errors[0]) || {};
      return res.status(r.status).json({ ok: false, status: r.status, error: e.detail || e.title || 'Terminal49 refused the request.' });
    }
    const a = (j.data && j.data.attributes) || {};
    return res.status(201).json({ ok: true, id: j.data && j.data.id, status: a.status, request_number: a.request_number, scac: a.scac, created_at: a.created_at });
  } catch (err) {
    return res.status(502).json({ ok: false, error: 'Could not reach Terminal49.' });
  }
};
