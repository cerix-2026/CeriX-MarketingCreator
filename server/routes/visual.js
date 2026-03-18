const router = require('express').Router();
const fetch = require('node-fetch');
const { v4: uuid } = require('uuid');
const auth = require('../middleware/auth');
const db = require('../db');

// Generate image prompt based on brand DNA + content context
router.post('/generate-prompt', auth(['admin', 'editor']), async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY mangler' });

  const { contentId, format = 'feed', customContext } = req.body;

  try {
    const brand = await db.brand.get();
    const brandImages = await db.images.getAll({ category: 'brand-dna' });

    let contentContext = customContext || '';
    if (contentId) {
      const content = await db.content.getById(contentId);
      if (content) {
        contentContext = `
Nyhed: ${content.newsItem?.title}
Vinkel: ${content.generated?.angle}
Newsletter headline: ${content.generated?.newsletter?.headline}
Meta ad tekst: ${content.generated?.meta_ad?.primary}
Eksisterende billedprompt: ${content.generated?.imagePrompt}`;
      }
    }

    const formatSpecs = {
      feed: { ratio: '1:1', px: '1080x1080', desc: 'Instagram/Facebook feed post' },
      story: { ratio: '9:16', px: '1080x1920', desc: 'Instagram/Facebook Story eller Reels' },
      banner: { ratio: '1.91:1', px: '1200x628', desc: 'Facebook/Instagram banner annonce' }
    };
    const spec = formatSpecs[format] || formatSpecs.feed;

    const brandDnaContext = brandImages.length > 0
      ? `\nBrand DNA billeder (${brandImages.length} stk): Disse billeder definerer CeriX's visuelle stil — lys, minimalistisk, professionel klinik-æstetik.`
      : '';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Du er en kreativ art director for CeriX, en premium medspa-klinik.

BRAND DNA:
- Primærfarve: ${brand.colors?.primary} (dyb navy)
- Sekundærfarve: ${brand.colors?.secondary} (guld)
- Accentfarve: ${brand.colors?.accent}
- Baggrund: ${brand.colors?.background} (varm creme)
- Tone: ${brand.tone}
- Tagline: ${brand.tagline}
${brandDnaContext}

FORMAT: ${spec.desc} (${spec.ratio}, ${spec.px})
${contentContext}

Generér en detaljeret billedprompt til Canva/AI-generering. Prompten skal:
1. Matche CeriX's brand-farver og æstetik
2. Være professionel, lys og minimalistisk
3. Passe til ${spec.desc} formatet
4. Inkludere specifikke farve-hex-koder fra brand guide
5. Beskrive komposition, belysning og stemning

Returnér KUN et JSON-objekt (ingen markdown):
{
  "prompt": "Den fulde, detaljerede billedprompt",
  "canvaSearchTerms": ["søgeord1", "søgeord2", "søgeord3"],
  "suggestedElements": ["element1", "element2"],
  "colorPalette": ["#hex1", "#hex2"],
  "mood": "beskrivelse af stemningen",
  "composition": "beskrivelse af komposition",
  "textOverlay": {
    "headline": "foreslået headline tekst",
    "subtext": "foreslået undertekst",
    "ctaButton": "CTA knap tekst"
  }
}`
        }]
      })
    });

    const data = await response.json();
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'Parse fejl fra AI' });

    const result = JSON.parse(match[0]);

    // Save the prompt
    const promptRecord = {
      id: uuid(),
      contentId: contentId || null,
      prompt: result.prompt,
      format,
      brandContext: result,
      status: 'generated',
      resultUrl: null
    };
    await db.visual.save(promptRecord);

    res.json({
      ok: true,
      promptId: promptRecord.id,
      ...result,
      format: spec
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Analyze brand DNA images with Claude Vision
router.post('/analyze-brand-dna', auth(['admin', 'editor']), async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY mangler' });

  try {
    const brandImages = await db.images.getAll({ category: 'brand-dna' });
    if (!brandImages.length) return res.status(400).json({ error: 'Ingen Brand DNA-billeder uploadet. Upload billeder med kategorien "Brand DNA" først.' });

    const brand = await db.brand.get();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: `Du er en brand-designer der analyserer visuel identitet.

CeriX har ${brandImages.length} Brand DNA-billeder uploadet med disse tags: ${brandImages.map(i => (i.tags || []).join(', ')).join(' | ')}.

Deres brand guide specificerer:
- Farver: ${brand.colors?.primary}, ${brand.colors?.secondary}, ${brand.colors?.accent}
- Tone: ${brand.tone}
- Fonte: ${brand.fonts?.heading}, ${brand.fonts?.body}

Baseret på disse billeder og brand guide, returnér KUN et JSON-objekt (ingen markdown):
{
  "styleAnalysis": {
    "overallAesthetic": "beskrivelse af den overordnede æstetik",
    "colorUsage": "hvordan farver bruges i praksis",
    "lightingStyle": "typisk belysning",
    "compositionPatterns": ["mønster1", "mønster2"],
    "textureAndFinish": "tekstur og finish"
  },
  "doInVisuals": ["gør dette i visuals", "gør dette"],
  "dontInVisuals": ["undgå dette", "undgå dette"],
  "canvaStyleKeywords": ["keyword1", "keyword2", "keyword3"],
  "recommendedTemplateStyles": ["stil1", "stil2"],
  "photoDirectionGuide": "kort guide til fotosessioner"
}`
        }]
      })
    });

    const data = await response.json();
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'Parse fejl fra AI' });

    res.json(JSON.parse(match[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all generated prompts
router.get('/prompts', auth(), async (req, res) => {
  try {
    const prompts = await db.visual.getAll();
    res.json(prompts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get prompts for specific content
router.get('/prompts/:contentId', auth(), async (req, res) => {
  try {
    const prompts = await db.visual.getByContentId(req.params.contentId);
    res.json(prompts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
