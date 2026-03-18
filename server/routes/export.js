const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../db');

// Generate Mailchimp-compatible HTML newsletter
router.get('/newsletter/:contentId', auth(), async (req, res) => {
  try {
    const content = await db.content.getById(req.params.contentId);
    if (!content) return res.status(404).json({ error: 'Indhold ikke fundet' });

    const brand = await db.brand.get();
    const nl = content.generated?.newsletter;
    if (!nl) return res.status(400).json({ error: 'Ingen newsletter data' });

    const colors = brand.colors || {};
    const fonts = brand.fonts || {};
    const primary = colors.primary || '#1A2E4A';
    const secondary = colors.secondary || '#C9A85C';
    const bg = colors.background || '#F7F5F0';
    const text = colors.text || '#1A2535';
    const accent = colors.accent || '#E8F2EF';

    const bodyParagraphs = (nl.body || '').split('\n').filter(Boolean).map(p =>
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:${text};font-family:'DM Sans',Arial,sans-serif;">${p}</p>`
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="da" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${nl.subject}</title>
  <!--[if mso]>
  <style>table{border-collapse:collapse;}td{font-family:Arial,sans-serif;}</style>
  <![endif]-->
  <style>
    body{margin:0;padding:0;background:${bg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table{border-spacing:0;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
    img{border:0;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
    a{color:${secondary};text-decoration:underline;}
    @media screen and (max-width:600px){
      .container{width:100%!important;padding:0 16px!important;}
      .mobile-full{width:100%!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${bg};">
  <!-- Preheader -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${nl.preheader || ''}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background:${primary};padding:32px 40px;text-align:center;">
              ${brand.logoUrl
                ? `<img src="${brand.logoUrl}" alt="CeriX" width="140" style="display:block;margin:0 auto 16px;">`
                : `<h1 style="margin:0;font-family:'Playfair Display',Georgia,serif;font-size:28px;color:#ffffff;letter-spacing:1px;">CERIX</h1>`
              }
              <p style="margin:8px 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:${secondary};letter-spacing:2px;text-transform:uppercase;">${brand.tagline || ''}</p>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding:40px 40px 24px;">
              <h2 style="margin:0;font-family:'Playfair Display',Georgia,serif;font-size:26px;line-height:1.3;color:${primary};">${nl.headline}</h2>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:0 40px 32px;">
              ${bodyParagraphs}
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding:0 40px 40px;" align="center">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:${secondary};border-radius:6px;">
                    <a href="${nl.ctaUrl || '#'}" target="_blank" style="display:inline-block;padding:14px 36px;font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:600;color:${primary};text-decoration:none;letter-spacing:0.5px;">${nl.cta}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid ${accent};margin:0;">
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:32px 40px;text-align:center;">
              <p style="margin:0 0 8px;font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#999;">CeriX — Professionelle æstetiske behandlinger</p>
              <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#999;">
                <a href="*|UNSUB|*" style="color:#999;">Afmeld nyhedsbrev</a> | <a href="*|UPDATE_PROFILE|*" style="color:#999;">Opdater præferencer</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    if (req.query.download === 'true') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="cerix-newsletter-${content.id}.html"`);
    } else {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export Meta Ad data with format-specific copy
router.get('/meta-ad/:contentId', auth(), async (req, res) => {
  try {
    const content = await db.content.getById(req.params.contentId);
    if (!content) return res.status(404).json({ error: 'Indhold ikke fundet' });

    const ad = content.generated?.meta_ad;
    if (!ad) return res.status(400).json({ error: 'Ingen Meta Ad data' });

    const formats = {
      feed: {
        name: 'Feed Post',
        ratio: '1:1',
        width: 1080,
        height: 1080,
        copy: ad.variants?.find(v => v.format === 'Feed')?.copy || ad.primary
      },
      story: {
        name: 'Story / Reels',
        ratio: '9:16',
        width: 1080,
        height: 1920,
        copy: ad.variants?.find(v => v.format === 'Story')?.copy || ad.primary
      },
      banner: {
        name: 'Banner / Link Ad',
        ratio: '1.91:1',
        width: 1200,
        height: 628,
        copy: ad.primary
      }
    };

    res.json({
      contentId: content.id,
      headline: ad.headline,
      description: ad.description,
      primaryText: ad.primary,
      formats,
      variants: ad.variants || [],
      imagePrompt: content.generated?.imagePrompt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Preview Meta Ad in specific format
router.get('/meta-ad/:contentId/preview/:format', auth(), async (req, res) => {
  try {
    const content = await db.content.getById(req.params.contentId);
    if (!content) return res.status(404).json({ error: 'Indhold ikke fundet' });

    const brand = await db.brand.get();
    const ad = content.generated?.meta_ad;
    if (!ad) return res.status(400).json({ error: 'Ingen Meta Ad data' });

    const format = req.params.format;
    const specs = {
      feed: { w: 1080, h: 1080, scale: 0.35 },
      story: { w: 1080, h: 1920, scale: 0.25 },
      banner: { w: 1200, h: 628, scale: 0.45 }
    };
    const spec = specs[format] || specs.feed;
    const pw = Math.round(spec.w * spec.scale);
    const ph = Math.round(spec.h * spec.scale);

    const colors = brand.colors || {};
    const primary = colors.primary || '#1A2E4A';
    const secondary = colors.secondary || '#C9A85C';
    const bg = colors.background || '#F7F5F0';

    const variant = ad.variants?.find(v => v.format.toLowerCase().includes(format)) || {};

    const html = `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Meta Ad Preview — ${format}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'DM Sans',system-ui,sans-serif;background:#f0f2f5;padding:40px;display:flex;justify-content:center;align-items:flex-start;min-height:100vh;}
    .preview-card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1);max-width:500px;width:100%;}
    .preview-header{display:flex;align-items:center;gap:12px;padding:16px;}
    .avatar{width:40px;height:40px;border-radius:50%;background:${primary};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;}
    .name{font-weight:600;font-size:14px;color:#1c1e21;}
    .sponsored{font-size:12px;color:#65676b;}
    .ad-text{padding:0 16px 12px;font-size:14px;line-height:1.5;color:#1c1e21;}
    .image-area{width:${pw}px;height:${ph}px;background:linear-gradient(135deg,${primary},${secondary});display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.6);font-size:14px;text-align:center;padding:20px;margin:0 auto;}
    .cta-bar{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-top:1px solid #e4e6ea;}
    .cta-left{font-size:12px;color:#65676b;}
    .cta-left strong{display:block;font-size:14px;color:#1c1e21;}
    .cta-btn{background:${secondary};color:${primary};border:none;padding:8px 20px;border-radius:6px;font-weight:600;font-size:13px;cursor:pointer;}
    .format-badge{display:inline-block;background:${primary};color:#fff;padding:4px 12px;border-radius:4px;font-size:11px;font-weight:600;margin:16px;letter-spacing:1px;}
    .meta-info{padding:16px;background:#f8f9fa;font-size:12px;color:#65676b;border-top:1px solid #e4e6ea;}
    .meta-info span{display:block;margin-bottom:4px;}
  </style>
</head>
<body>
  <div class="preview-card">
    <span class="format-badge">${format.toUpperCase()} ${spec.w}x${spec.h}</span>

    <div class="preview-header">
      <div class="avatar">C</div>
      <div>
        <div class="name">CeriX</div>
        <div class="sponsored">Sponsoreret</div>
      </div>
    </div>

    <div class="ad-text">${variant.copy || ad.primary}</div>

    <div class="image-area">
      Billedområde<br>${spec.w}x${spec.h}px
    </div>

    <div class="cta-bar">
      <div class="cta-left">
        cerix.dk
        <strong>${ad.headline}</strong>
        ${ad.description || ''}
      </div>
      <button class="cta-btn">${ad.variants?.[0]?.format === 'Carousel slide 1' ? 'Se mere' : 'Book nu'}</button>
    </div>

    <div class="meta-info">
      <span><strong>Format:</strong> ${format} (${spec.w}x${spec.h}px)</span>
      <span><strong>Primær tekst:</strong> ${ad.primary}</span>
      <span><strong>Headline:</strong> ${ad.headline}</span>
      <span><strong>Beskrivelse:</strong> ${ad.description || '-'}</span>
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
