const router = require('express').Router();
const fetch = require('node-fetch');
const { v4: uuid } = require('uuid');
const auth = require('../middleware/auth');
const db = require('../db');

// Log a performance event
router.post('/log', auth(), async (req, res) => {
  try {
    const { contentId, action, contentType, newsCategory, tags, angle, relevanceScore, metadata } = req.body;
    const entry = {
      id: uuid(),
      contentId,
      action,
      contentType,
      newsCategory,
      tags: tags || [],
      angle,
      relevanceScore,
      userName: req.user.name,
      metadata: metadata || {}
    };
    await db.performance.log(entry);
    res.json({ ok: true, entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all logs
router.get('/logs', auth(), async (req, res) => {
  try {
    const logs = await db.performance.getAll();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get aggregated stats
router.get('/stats', auth(), async (req, res) => {
  try {
    const stats = await db.performance.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get AI-powered recommendations based on performance history
router.get('/recommendations', auth(), async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY mangler' });

  try {
    const stats = await db.performance.getStats();
    const logs = await db.performance.getAll();

    if (stats.total < 3) {
      return res.json({
        recommendations: ['Der er endnu ikke nok data til at give anbefalinger. Godkend eller afvis mere indhold for at opbygge indsigt.'],
        dataPoints: stats.total
      });
    }

    const recentLogs = logs.slice(0, 50).map(l =>
      `[${l.action}] Kategori: ${l.newsCategory || l.news_category} | Vinkel: ${l.angle} | Score: ${l.relevanceScore || l.relevance_score}`
    ).join('\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Du er en marketing-analytiker for CeriX, en medspa-klinik.

PERFORMANCE DATA (seneste handlinger):
${recentLogs}

AGGREGEREDE STATS:
- Total handlinger: ${stats.total}
- Fordeling: ${JSON.stringify(stats.byAction)}
- Top godkendte vinkler: ${JSON.stringify(stats.topApprovedAngles)}

Analysér data og returnér KUN et JSON-objekt (ingen markdown):
{
  "recommendations": [
    "Anbefaling 1 — konkret og handlingsorienteret",
    "Anbefaling 2",
    "Anbefaling 3"
  ],
  "preferredCategories": ["kategori der oftest godkendes"],
  "preferredAngles": ["vinkel der oftest godkendes"],
  "avoidCategories": ["kategorier der oftest afvises"],
  "approvalRate": "procentdel af godkendt vs. afvist",
  "insight": "Kort overordnet indsigt om redaktørens præferencer"
}`
        }]
      })
    });

    const data = await response.json();
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'Parse fejl' });

    res.json({ ...JSON.parse(match[0]), dataPoints: stats.total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
