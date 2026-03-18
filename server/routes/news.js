const router = require('express').Router();
const fetch = require('node-fetch');
const auth = require('../middleware/auth');

router.post('/fetch', auth(), async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY mangler' });

  const today = new Date().toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 5000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Du er brancheanalytiker for kosmetisk medicin og medspa. Søg og find 25 aktuelle nyheder pr. ${today}.

Kategorier: "global" (international industri), "denmark" (dansk specifik), "regulatory" (Styrelsen for Patientsikkerhed, Sikkerhedsforeningen, EU), "social" (sociale medier trends fra kunder/klinikejere).

Returnér KUN et JSON-array uden markdown. Hvert objekt: { "title":"(max 12 ord)", "summary":"2-3 sætninger", "category":"global|denmark|regulatory|social", "source":"kildenavn", "tags":["tag1","tag2"], "url":"https://...eller null" }

25 nyheder som rent JSON-array.`
        }]
      })
    });
    const data = await response.json();
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return res.status(500).json({ error: 'Parse fejl' });
    res.json(JSON.parse(match[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
