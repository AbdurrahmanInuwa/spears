const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');

const router = express.Router();

let anthropic = null;
function getClient() {
  if (anthropic) return anthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  anthropic = new Anthropic({ apiKey });
  return anthropic;
}

const SYSTEM_PROMPT = `You are an emergency-response coverage analyst.

You help size the realistic geographical coverage radius (in meters) for an
emergency-response institution (hospital, clinic, police station, fire station,
ambulance hub, etc.).

Rules:
- The user has confirmed the lat/lng is the institution's actual operating
  location. Do not second-guess the coordinates.
- Reason about: institution type, urban vs rural setting (infer from address),
  realistic response capacity for that type and country.
- Bias toward smaller radii for clinics and urban facilities, larger for
  regional hospitals, fire and rescue serving sparse areas.
- Output a single JSON object only — no prose, no markdown.

Return JSON of the exact shape:
{ "radius_m": <integer between 200 and 25000>, "reason": "<one sentence, ≤ 25 words>" }`;

router.post('/suggest-coverage', async (req, res) => {
  try {
    const client = getClient();
    if (!client) {
      return res
        .status(503)
        .json({ error: 'AI service not configured (missing ANTHROPIC_API_KEY)' });
    }

    const { name, type, country, address, lat, lng } = req.body || {};
    if (!name || !type || !address) {
      return res.status(400).json({
        error: 'Missing required fields',
        fields: ['name', 'type', 'address'],
      });
    }

    const userPrompt = `Institution name: ${name}
Type: ${type}
Country (ISO alpha-2): ${country || 'unknown'}
Address: ${address}
Confirmed coordinates: ${lat ?? '?'}, ${lng ?? '?'}

Recommend the response coverage radius.`;

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text =
      msg.content?.find((c) => c.type === 'text')?.text ||
      msg.content?.[0]?.text ||
      '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('AI returned non-JSON:', text);
      return res.status(502).json({ error: 'AI did not return parseable JSON' });
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('AI JSON parse error:', e, 'raw:', text);
      return res.status(502).json({ error: 'AI returned invalid JSON' });
    }

    const rawRadius = Number(parsed.radius_m);
    const radius_m = Number.isFinite(rawRadius)
      ? Math.max(200, Math.min(25000, Math.round(rawRadius)))
      : 2000;
    const reason = String(parsed.reason || '').slice(0, 240);

    res.json({ radius_m, reason });
  } catch (err) {
    console.error('AI suggest-coverage error:', err);
    res.status(500).json({ error: 'AI request failed' });
  }
});

// POST /api/ai/place-name
// Body: { address }
// Takes a long Google-style postal address and returns a short, natural
// place name (e.g. "Wuse 2, Abuja"). Cached client-side; backend just
// asks Claude.
const PLACE_NAME_SYSTEM = `You convert long postal/Google-formatted addresses
into a short, natural place label that someone would say out loud.

Rules:
- Pick a NEIGHBORHOOD or DISTRICT + CITY when available (e.g. "Wuse 2, Abuja")
- Otherwise CITY + COUNTRY (e.g. "Lagos, Nigeria")
- No plot numbers, no postal codes, no street names, no full state/region names
- Maximum 40 characters
- Reply ONLY with JSON of the shape: { "name": "<short label>" }`;

router.post('/place-name', async (req, res) => {
  try {
    const client = getClient();
    if (!client) {
      return res
        .status(503)
        .json({ error: 'AI service not configured (missing ANTHROPIC_API_KEY)' });
    }
    const { address } = req.body || {};
    if (!address) {
      return res.status(400).json({ error: 'address required' });
    }

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 128,
      system: PLACE_NAME_SYSTEM,
      messages: [{ role: 'user', content: `Address: ${address}` }],
    });

    const text =
      msg.content?.find((c) => c.type === 'text')?.text ||
      msg.content?.[0]?.text ||
      '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(502).json({ error: 'AI returned no JSON' });
    let parsed;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return res.status(502).json({ error: 'AI returned invalid JSON' });
    }
    const name = String(parsed.name || '').slice(0, 60);
    if (!name) return res.status(502).json({ error: 'AI returned empty name' });
    res.json({ name });
  } catch (err) {
    console.error('AI place-name error:', err);
    res.status(500).json({ error: 'AI request failed' });
  }
});

module.exports = router;
