const router = require('express').Router();
const fetch = require('node-fetch');
const { v4: uuid } = require('uuid');
const auth = require('../middleware/auth');
const db = require('../db');

router.get('/', auth(), async (req, res) => {
  const content = await db.content.getAll();
  res.json(content);
});

router.post('/generate', auth(['admin', 'editor']), async (req, res) => {
  const { newsItem, contentTypes = ['newsletter', 'meta_ad'] } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY mangler' });

  const brand = await db.brand.get();
  const kb = await db.knowledge.get();

  const brandContext = `
CERIX BRAND GUIDE:
- Tagline: ${brand.tagline}
- Tone: ${brand.tone}
- Gør: ${(brand.doList || []).join(' | ')}
- Undgå: ${(brand.dontList || []).join(' | ')}
- Primærfarve: ${brand.colors?.primary} | Sekundærfarve: ${brand.colors?.secondary}

CERIX YDELSER (${(kb.treatments || []).length} behandlinger):
${(kb.treatments || []).slice(0, 15).map(t => `- ${t.name} (${t.category}): ${(t.description || '').slice(0, 80)}`).join('\n')}

OM CERIX: ${kb.about || 'Professionel æstetisk klinik i Danmark'}`;

  const newsContext = `
NYHED AT SKABE INDHOLD OM:
Titel: ${newsItem.title}
Resumé: ${newsItem.summary}
Kategori: ${newsItem.category}
Tags: ${(newsItem.tags || []).join(', ')}`;

  // Get performance recommendations if available
  let perfContext = '';
  try {
    const stats = await db.performance.getStats();
    if (stats.total > 5 && stats.topApprovedAngles?.length > 0) {
      perfContext = `\n\nPERFORMANCE INDSIGT (baseret på ${stats.total} beslutninger):
Foretrukne vinkler: ${stats.topApprovedAngles.map(a => a.angle).join(', ')}
Brug gerne disse typer vinkler da de har høj godkendelsesrate.`;
    }
  } catch {}

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `Du er Cerix's marketing ekspert. Brug brand guide og ydelser til at skabe indhold.

${brandContext}
${newsContext}
${perfContext}

OPGAVE: Skab følgende indholdstyper baseret på nyheden og Cerix's position.

Returnér KUN et JSON-objekt (ingen markdown):
{
  "relevanceScore": 1-10,
  "relevanceReason": "Kort forklaring",
  "angle": "Den specifikke vinkel vi bruger",
  "newsletter": {
    "subject": "Emnefeltet (max 60 tegn)",
    "preheader": "Preheader tekst (max 90 tegn)",
    "headline": "Overskrift",
    "body": "Brødtekst (200-300 ord, brug Cerix tone)",
    "cta": "Call-to-action tekst",
    "ctaUrl": "/behandlinger"
  },
  "meta_ad": {
    "primary": "Primær annoncetekst (max 125 tegn)",
    "headline": "Overskrift (max 40 tegn)",
    "description": "Beskrivelse (max 30 tegn)",
    "variants": [
      { "format": "Feed", "copy": "Tekst tilpasset feed" },
      { "format": "Story", "copy": "Kort og direkte til story" },
      { "format": "Carousel slide 1", "copy": "Første slide hook" }
    ]
  },
  "imagePrompt": "Billedprompt til AI-generator der passer Cerix æstetik (professionel, lys, minimalistisk klinik)"
}`
        }]
      })
    });

    const data = await response.json();
    if (!data.content || data.error) {
      return res.status(500).json({ error: data.error?.message || 'AI API fejl: ' + JSON.stringify(data.error || data).slice(0, 200) });
    }
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'Parse fejl fra AI' });

    const generated = JSON.parse(match[0]);
    const contentItem = {
      id: uuid(),
      newsItem,
      generated,
      status: 'draft',
      createdBy: req.user.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.content.create(contentItem);

    // Auto-log generation event
    await db.performance.log({
      id: uuid(),
      contentId: contentItem.id,
      action: 'generated',
      contentType: contentTypes.join(','),
      newsCategory: newsItem.category,
      tags: newsItem.tags || [],
      angle: generated.angle,
      relevanceScore: generated.relevanceScore,
      userName: req.user.name,
      metadata: {}
    });

    res.json(contentItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/status', auth(['admin', 'editor']), async (req, res) => {
  const { status } = req.body;
  const content = await db.content.updateStatus(req.params.id, status);
  if (!content) return res.status(404).json({ error: 'Ikke fundet' });

  // Auto-log status change for performance tracking
  try {
    await db.performance.log({
      id: uuid(),
      contentId: content.id,
      action: status,
      contentType: content.generated ? Object.keys(content.generated).filter(k => ['newsletter', 'meta_ad'].includes(k)).join(',') : '',
      newsCategory: content.newsItem?.category,
      tags: content.newsItem?.tags || [],
      angle: content.generated?.angle,
      relevanceScore: content.generated?.relevanceScore,
      userName: req.user.name,
      metadata: {}
    });
  } catch {}

  res.json(content);
});

router.delete('/:id', auth(['admin', 'editor']), async (req, res) => {
  await db.content.delete(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
