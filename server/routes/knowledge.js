const router = require('express').Router();
const fetch = require('node-fetch');
const { v4: uuid } = require('uuid');
const auth = require('../middleware/auth');
const db = require('../db');

router.get('/', auth(), async (req, res) => {
  res.json(await db.knowledge.get());
});

router.put('/', auth(['admin', 'editor']), async (req, res) => {
  if (req.body.about !== undefined) await db.knowledge.updateAbout(req.body.about);
  res.json(await db.knowledge.get());
});

router.post('/treatment', auth(['admin', 'editor']), async (req, res) => {
  const t = { id: uuid(), ...req.body, source: 'manual', createdAt: new Date().toISOString() };
  await db.knowledge.addTreatment(t);
  res.json(t);
});

router.put('/treatment/:id', auth(['admin', 'editor']), async (req, res) => {
  await db.knowledge.updateTreatment(req.params.id, req.body);
  res.json(await db.knowledge.get());
});

router.delete('/treatment/:id', auth(['admin', 'editor']), async (req, res) => {
  await db.knowledge.deleteTreatment(req.params.id);
  res.json({ ok: true });
});

router.post('/faq', auth(['admin', 'editor']), async (req, res) => {
  const f = { id: uuid(), ...req.body, source: 'manual', createdAt: new Date().toISOString() };
  await db.knowledge.addFaq(f);
  res.json(f);
});

router.delete('/faq/:id', auth(['admin', 'editor']), async (req, res) => {
  await db.knowledge.deleteFaq(req.params.id);
  res.json({ ok: true });
});

router.post('/crawl', auth(['admin']), async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY mangler' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Besøg cerix.dk og find alle behandlinger og ydelser de tilbyder. For hver behandling skal du finde: navn, kategori, beskrivelse, hvad det behandler, prisindikation (hvis tilgængeligt), og hvem der er målgruppen.

Returnér KUN et JSON-objekt (ingen markdown) med denne struktur:
{
  "about": "kort beskrivelse af klinikken",
  "treatments": [
    {
      "name": "behandlingsnavn",
      "category": "kategori (fx Injektion, Laser, Hudpleje)",
      "description": "hvad er behandlingen",
      "treats": "hvad behandler den",
      "targetAudience": "hvem er den til",
      "priceNote": "prisindikation eller null"
    }
  ],
  "faqs": [
    { "question": "spørgsmål", "answer": "svar" }
  ]
}`
        }]
      })
    });

    const data = await response.json();
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'Kunne ikke parse crawl-resultat' });

    const crawled = JSON.parse(match[0]);

    // Clear old crawler data
    await db.knowledge.clearCrawlerData();

    // Add new treatments
    const newTreatments = (crawled.treatments || []).map(t => ({ id: uuid(), ...t, source: 'crawler', createdAt: new Date().toISOString() }));
    for (const t of newTreatments) await db.knowledge.addTreatment(t);

    // Add new FAQs
    const newFaqs = (crawled.faqs || []).map(f => ({ id: uuid(), ...f, source: 'crawler', createdAt: new Date().toISOString() }));
    for (const f of newFaqs) await db.knowledge.addFaq(f);

    // Update about and crawl timestamp
    if (crawled.about) await db.knowledge.updateAbout(crawled.about);
    await db.knowledge.setLastCrawled();

    res.json({ ok: true, treatments: newTreatments.length, faqs: newFaqs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
