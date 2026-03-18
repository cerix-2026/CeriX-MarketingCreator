const router = require('express').Router();
const fetch = require('node-fetch');
const { v4: uuid } = require('uuid');
const auth = require('../middleware/auth');
const db = require('../db');

// Mock data for when META_ACCESS_TOKEN is not set
const MOCK_ADS = [
  {
    advertiser: 'Copenhagen Beauty Clinic',
    adText: 'Opdag vores eksklusive Botox-tilbud denne måned. Naturlige resultater af erfarne specialister. Book din gratis konsultation i dag!',
    imageUrl: null,
    cta: 'Book nu',
    platform: 'facebook',
    startDate: '2026-03-01',
    status: 'active',
    searchTerm: 'medspa copenhagen'
  },
  {
    advertiser: 'Nordic Skin Studio',
    adText: 'Laser hudforyngelse — 20% rabat i marts. Klinisk bevist teknologi for synligt yngre hud på kun 3 behandlinger.',
    imageUrl: null,
    cta: 'Læs mere',
    platform: 'instagram',
    startDate: '2026-03-05',
    status: 'active',
    searchTerm: 'æstetisk klinik'
  },
  {
    advertiser: 'Aura Aesthetics',
    adText: 'Fillers udført af certificerede læger. Vi prioriterer din sikkerhed og naturlige resultater. Se før/efter galleri.',
    imageUrl: null,
    cta: 'Se resultater',
    platform: 'facebook',
    startDate: '2026-02-28',
    status: 'active',
    searchTerm: 'fillers denmark'
  },
  {
    advertiser: 'Glow Klinikken',
    adText: 'Kemisk peeling til alle hudtyper. Få en lysere, glattere hud. Certificerede dermatologer. Første behandling kun 799 kr.',
    imageUrl: null,
    cta: 'Book tid',
    platform: 'instagram',
    startDate: '2026-03-10',
    status: 'active',
    searchTerm: 'hudpleje klinik'
  },
  {
    advertiser: 'Skin by Sophia',
    adText: 'Microneedling + PRP — den ultimative kombinationsbehandling. Stimulér din huds naturlige kollagenproduktion. Limited spots!',
    imageUrl: null,
    cta: 'Bestil tid',
    platform: 'facebook',
    startDate: '2026-03-08',
    status: 'active',
    searchTerm: 'medspa copenhagen'
  },
  {
    advertiser: 'DermaLux Clinic',
    adText: 'Professionel aknebehandling med resultater du kan se. Skræddersyet behandlingsplan af specialister. Gratis hudanalyse.',
    imageUrl: null,
    cta: 'Gratis analyse',
    platform: 'instagram',
    startDate: '2026-03-12',
    status: 'active',
    searchTerm: 'hudpleje klinik'
  }
];

// List saved competitor ads
router.get('/', auth(), async (req, res) => {
  try {
    const ads = await db.competitors.getAll();
    res.json(ads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single ad
router.get('/:id', auth(), async (req, res) => {
  try {
    const ad = await db.competitors.getById(req.params.id);
    if (!ad) return res.status(404).json({ error: 'Annonce ikke fundet' });
    res.json(ad);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch competitor ads from Meta Ad Library or use mock data
router.post('/fetch', auth(['admin', 'editor']), async (req, res) => {
  const { searchTerms = ['medspa copenhagen', 'æstetisk klinik', 'hudpleje klinik', 'fillers denmark'] } = req.body;
  const metaToken = process.env.META_ACCESS_TOKEN;

  try {
    let newAds = [];

    if (metaToken) {
      // Real Meta Ad Library API call
      for (const term of searchTerms) {
        const url = `https://graph.facebook.com/v19.0/ads_archive?` +
          `access_token=${metaToken}` +
          `&search_terms=${encodeURIComponent(term)}` +
          `&ad_reached_countries=DK` +
          `&ad_type=ALL` +
          `&fields=id,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_captions,page_name,ad_delivery_start_time,ad_snapshot_url,publisher_platforms` +
          `&limit=10`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.data) {
          for (const ad of data.data) {
            newAds.push({
              id: uuid(),
              advertiser: ad.page_name || 'Unknown',
              adText: (ad.ad_creative_bodies || []).join(' '),
              imageUrl: ad.ad_snapshot_url || null,
              cta: (ad.ad_creative_link_titles || []).join(' '),
              platform: (ad.publisher_platforms || []).join(', '),
              startDate: ad.ad_delivery_start_time || null,
              status: 'active',
              searchTerm: term,
              rawData: ad
            });
          }
        }
      }
    } else {
      // Use mock data
      newAds = MOCK_ADS.map(ad => ({ id: uuid(), ...ad, rawData: {} }));
    }

    // Save to database
    for (const ad of newAds) {
      await db.competitors.create(ad);
    }

    res.json({
      ok: true,
      source: metaToken ? 'meta_ad_library' : 'mock_data',
      count: newAds.length,
      ads: newAds
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Analyze competitor ads with Claude
router.post('/analyze', auth(['admin', 'editor']), async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY mangler' });

  try {
    const ads = await db.competitors.getAll();
    const brand = await db.brand.get();

    if (!ads.length) return res.status(400).json({ error: 'Ingen konkurrentannoncer at analysere. Hent annoncer først.' });

    const adsContext = ads.slice(0, 20).map(a =>
      `[${a.advertiser}] ${a.adText} | CTA: ${a.cta} | Platform: ${a.platform}`
    ).join('\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `Du er en konkurrenceanalytiker for æstetisk medicin og medspa-branchen i Danmark.

CERIX BRAND:
- Tagline: ${brand.tagline}
- Tone: ${brand.tone}
- Farver: ${brand.colors?.primary}, ${brand.colors?.secondary}

KONKURRENTERS ANNONCER:
${adsContext}

Analysér disse annoncer og returnér KUN et JSON-objekt (ingen markdown):
{
  "patterns": [
    { "pattern": "beskrivelse af mønster", "frequency": "høj/medium/lav", "examples": ["eksempel1"] }
  ],
  "hooks": [
    { "hook": "den specifikke hook/vinkel", "effectiveness": "høj/medium/lav", "why": "forklaring" }
  ],
  "ctaPatterns": [
    { "cta": "CTA tekst", "frequency": "antal gange set" }
  ],
  "visualThemes": ["tema1", "tema2"],
  "cerixOpportunities": [
    { "opportunity": "beskrivelse", "suggestedAngle": "vinkel CeriX kan bruge", "suggestedCopy": "eksempel tekst" }
  ],
  "competitorStrengths": ["styrke1"],
  "competitorWeaknesses": ["svaghed1"],
  "recommendations": ["anbefaling1", "anbefaling2"]
}`
        }]
      })
    });

    const data = await response.json();
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'Parse fejl fra AI' });

    const analysis = JSON.parse(match[0]);
    const insight = { id: uuid(), analysis };
    await db.competitors.saveInsight(insight);

    res.json({ ok: true, insight });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get latest insights
router.get('/insights/latest', auth(), async (req, res) => {
  try {
    const insight = await db.competitors.getLatestInsight();
    res.json(insight || { analysis: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
