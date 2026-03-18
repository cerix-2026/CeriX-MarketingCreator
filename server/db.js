/**
 * CeriX Database Abstraction Layer
 * Dual-mode: PostgreSQL (if DATABASE_URL) or JSON files (local dev)
 */
const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');

const DATA_DIR = path.join(__dirname, 'data');

// --- JSON helpers ---
const jsonRead = (file) => {
  const fp = path.join(DATA_DIR, file);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
};
const jsonWrite = (file, data) => {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
};

let pool = null;

async function initPostgres() {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false
  });

  // Create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'editor',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS brand_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS knowledge (
      id INTEGER PRIMARY KEY DEFAULT 1,
      about TEXT DEFAULT '',
      last_crawled TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS treatments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      description TEXT,
      treats TEXT,
      target_audience TEXT,
      price_note TEXT,
      source TEXT DEFAULT 'manual',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS faqs (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      source TEXT DEFAULT 'manual',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT,
      url TEXT NOT NULL,
      size INTEGER,
      tags TEXT[] DEFAULT '{}',
      category TEXT DEFAULT 'general',
      is_brand_dna BOOLEAN DEFAULT FALSE,
      uploaded_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS content (
      id TEXT PRIMARY KEY,
      news_item JSONB,
      generated JSONB,
      status TEXT DEFAULT 'draft',
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS competitor_ads (
      id TEXT PRIMARY KEY,
      advertiser TEXT,
      ad_text TEXT,
      image_url TEXT,
      cta TEXT,
      platform TEXT,
      start_date TEXT,
      status TEXT DEFAULT 'active',
      search_term TEXT,
      raw_data JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS competitor_insights (
      id TEXT PRIMARY KEY,
      analysis JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS performance_log (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      action TEXT NOT NULL,
      content_type TEXT,
      news_category TEXT,
      tags TEXT[] DEFAULT '{}',
      angle TEXT,
      relevance_score INTEGER,
      user_name TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS visual_prompts (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      prompt TEXT NOT NULL,
      format TEXT,
      brand_context JSONB,
      status TEXT DEFAULT 'generated',
      result_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log('✅ PostgreSQL tables ready');
}

// --- Database interface ---
const db = {
  isPG: () => !!pool,

  async init() {
    if (process.env.DATABASE_URL) {
      await initPostgres();
      // Seed admin user if empty
      const { rows } = await pool.query('SELECT COUNT(*) FROM users');
      if (parseInt(rows[0].count) === 0) {
        const bcrypt = require('bcryptjs');
        const hashed = await bcrypt.hash('cerix2024', 10);
        await pool.query(
          'INSERT INTO users (id, name, email, password, role) VALUES ($1, $2, $3, $4, $5)',
          ['1', 'Admin', 'admin@cerix.dk', hashed, 'admin']
        );
      }
      // Seed brand settings if empty
      const brandCheck = await pool.query('SELECT COUNT(*) FROM brand_settings');
      if (parseInt(brandCheck.rows[0].count) === 0) {
        const defaultBrand = {
          colors: { primary: '#1A2E4A', secondary: '#C9A85C', accent: '#E8F2EF', text: '#1A2535', background: '#F7F5F0' },
          fonts: { heading: 'Playfair Display', body: 'DM Sans', mono: 'DM Mono' },
          tone: 'Faglig og varm, aldrig klinisk. Vi taler til kvinder 35–55 der vil have professionelle resultater uden unødigt drama.',
          tagline: 'Professionelle æstetiske behandlinger i verdensklasse',
          doList: ['Brug faglige termer forklaret i klarsprog', 'Vær tryg og kompetent', 'Fremhæv resultater og sikkerhed'],
          dontList: ['Aldrig "billig" — brug "tilgængelig"', 'Ingen overdrevne løfter', 'Undgå medicinsk jargon uden forklaring'],
          logoUrl: null
        };
        await pool.query('INSERT INTO brand_settings (id, data) VALUES (1, $1)', [JSON.stringify(defaultBrand)]);
      }
      // Seed knowledge if empty
      const kbCheck = await pool.query('SELECT COUNT(*) FROM knowledge');
      if (parseInt(kbCheck.rows[0].count) === 0) {
        await pool.query('INSERT INTO knowledge (id, about) VALUES (1, $1)', ['']);
      }
    }
  },

  // --- Users ---
  users: {
    async getAll() {
      if (pool) {
        const { rows } = await pool.query('SELECT id, name, email, role, created_at as "createdAt" FROM users ORDER BY created_at');
        return rows;
      }
      return jsonRead('users.json') || [];
    },
    async getByEmail(email) {
      if (pool) {
        const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        return rows[0] ? { ...rows[0], createdAt: rows[0].created_at } : null;
      }
      return (jsonRead('users.json') || []).find(u => u.email === email);
    },
    async create(user) {
      if (pool) {
        await pool.query(
          'INSERT INTO users (id, name, email, password, role) VALUES ($1, $2, $3, $4, $5)',
          [user.id, user.name, user.email, user.password, user.role]
        );
        return user;
      }
      const users = jsonRead('users.json') || [];
      users.push(user);
      jsonWrite('users.json', users);
      return user;
    },
    async update(id, data) {
      if (pool) {
        const sets = [];
        const vals = [];
        let i = 1;
        if (data.name) { sets.push(`name = $${i++}`); vals.push(data.name); }
        if (data.email) { sets.push(`email = $${i++}`); vals.push(data.email); }
        if (data.role) { sets.push(`role = $${i++}`); vals.push(data.role); }
        if (data.password) { sets.push(`password = $${i++}`); vals.push(data.password); }
        vals.push(id);
        await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i}`, vals);
        const { rows } = await pool.query('SELECT id, name, email, role, created_at as "createdAt" FROM users WHERE id = $1', [id]);
        return rows[0];
      }
      const users = jsonRead('users.json') || [];
      const idx = users.findIndex(u => u.id === id);
      if (idx === -1) return null;
      users[idx] = { ...users[idx], ...data };
      jsonWrite('users.json', users);
      return users[idx];
    },
    async delete(id) {
      if (pool) {
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        return;
      }
      jsonWrite('users.json', (jsonRead('users.json') || []).filter(u => u.id !== id));
    }
  },

  // --- Brand ---
  brand: {
    async get() {
      if (pool) {
        const { rows } = await pool.query('SELECT data, updated_at FROM brand_settings WHERE id = 1');
        if (!rows[0]) return {};
        return { ...rows[0].data, updatedAt: rows[0].updated_at };
      }
      return jsonRead('brand.json') || {};
    },
    async update(data) {
      if (pool) {
        const current = await db.brand.get();
        const { updatedAt, ...rest } = current;
        const merged = { ...rest, ...data };
        await pool.query('UPDATE brand_settings SET data = $1, updated_at = NOW() WHERE id = 1', [JSON.stringify(merged)]);
        return db.brand.get();
      }
      const current = jsonRead('brand.json') || {};
      const merged = { ...current, ...data, updatedAt: new Date().toISOString() };
      jsonWrite('brand.json', merged);
      return merged;
    }
  },

  // --- Knowledge ---
  knowledge: {
    async get() {
      if (pool) {
        const kb = await pool.query('SELECT about, last_crawled as "lastCrawled", updated_at as "updatedAt" FROM knowledge WHERE id = 1');
        const treatments = await pool.query('SELECT id, name, category, description, treats, target_audience as "targetAudience", price_note as "priceNote", source, created_at as "createdAt" FROM treatments ORDER BY created_at');
        const faqs = await pool.query('SELECT id, question, answer, source, created_at as "createdAt" FROM faqs ORDER BY created_at');
        return {
          ...(kb.rows[0] || {}),
          treatments: treatments.rows,
          faqs: faqs.rows
        };
      }
      return jsonRead('knowledge.json') || { treatments: [], faqs: [], about: '' };
    },
    async updateAbout(about) {
      if (pool) {
        await pool.query('UPDATE knowledge SET about = $1, updated_at = NOW() WHERE id = 1', [about]);
        return;
      }
      const kb = jsonRead('knowledge.json') || {};
      jsonWrite('knowledge.json', { ...kb, about, updatedAt: new Date().toISOString() });
    },
    async addTreatment(t) {
      if (pool) {
        await pool.query(
          'INSERT INTO treatments (id, name, category, description, treats, target_audience, price_note, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [t.id, t.name, t.category, t.description, t.treats, t.targetAudience, t.priceNote, t.source || 'manual']
        );
        return t;
      }
      const kb = jsonRead('knowledge.json') || {};
      kb.treatments = [...(kb.treatments || []), t];
      jsonWrite('knowledge.json', { ...kb, updatedAt: new Date().toISOString() });
      return t;
    },
    async updateTreatment(id, data) {
      if (pool) {
        const sets = [];
        const vals = [];
        let i = 1;
        for (const [k, v] of Object.entries(data)) {
          const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
          if (['name','category','description','treats','target_audience','price_note','source'].includes(col)) {
            sets.push(`${col} = $${i++}`);
            vals.push(v);
          }
        }
        if (sets.length) {
          vals.push(id);
          await pool.query(`UPDATE treatments SET ${sets.join(', ')} WHERE id = $${i}`, vals);
        }
        return;
      }
      const kb = jsonRead('knowledge.json') || {};
      kb.treatments = (kb.treatments || []).map(t => t.id === id ? { ...t, ...data } : t);
      jsonWrite('knowledge.json', { ...kb, updatedAt: new Date().toISOString() });
    },
    async deleteTreatment(id) {
      if (pool) { await pool.query('DELETE FROM treatments WHERE id = $1', [id]); return; }
      const kb = jsonRead('knowledge.json') || {};
      kb.treatments = (kb.treatments || []).filter(t => t.id !== id);
      jsonWrite('knowledge.json', { ...kb, updatedAt: new Date().toISOString() });
    },
    async addFaq(f) {
      if (pool) {
        await pool.query('INSERT INTO faqs (id, question, answer, source) VALUES ($1,$2,$3,$4)', [f.id, f.question, f.answer, f.source || 'manual']);
        return f;
      }
      const kb = jsonRead('knowledge.json') || {};
      kb.faqs = [...(kb.faqs || []), f];
      jsonWrite('knowledge.json', { ...kb, updatedAt: new Date().toISOString() });
      return f;
    },
    async deleteFaq(id) {
      if (pool) { await pool.query('DELETE FROM faqs WHERE id = $1', [id]); return; }
      const kb = jsonRead('knowledge.json') || {};
      kb.faqs = (kb.faqs || []).filter(f => f.id !== id);
      jsonWrite('knowledge.json', { ...kb, updatedAt: new Date().toISOString() });
    },
    async clearCrawlerData() {
      if (pool) {
        await pool.query("DELETE FROM treatments WHERE source = 'crawler'");
        await pool.query("DELETE FROM faqs WHERE source = 'crawler'");
        return;
      }
      const kb = jsonRead('knowledge.json') || {};
      kb.treatments = (kb.treatments || []).filter(t => t.source !== 'crawler');
      kb.faqs = (kb.faqs || []).filter(f => f.source !== 'crawler');
      jsonWrite('knowledge.json', { ...kb, updatedAt: new Date().toISOString() });
    },
    async setLastCrawled() {
      if (pool) {
        await pool.query('UPDATE knowledge SET last_crawled = NOW(), updated_at = NOW() WHERE id = 1');
        return;
      }
      const kb = jsonRead('knowledge.json') || {};
      jsonWrite('knowledge.json', { ...kb, lastCrawled: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
  },

  // --- Images ---
  images: {
    async getAll(filters = {}) {
      if (pool) {
        let q = 'SELECT id, filename, original_name as "originalName", url, size, tags, category, is_brand_dna as "isBrandDna", uploaded_by as "uploadedBy", created_at as "createdAt" FROM images';
        const conds = [];
        const vals = [];
        if (filters.tag) { conds.push(`$${vals.length + 1} = ANY(tags)`); vals.push(filters.tag); }
        if (filters.category) { conds.push(`category = $${vals.length + 1}`); vals.push(filters.category); }
        if (conds.length) q += ' WHERE ' + conds.join(' AND ');
        q += ' ORDER BY created_at DESC';
        const { rows } = await pool.query(q, vals);
        return rows;
      }
      let images = jsonRead('images.json') || [];
      if (filters.tag) images = images.filter(i => (i.tags || []).includes(filters.tag));
      if (filters.category) images = images.filter(i => i.category === filters.category);
      return images;
    },
    async create(img) {
      if (pool) {
        await pool.query(
          'INSERT INTO images (id, filename, original_name, url, size, tags, category, is_brand_dna, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [img.id, img.filename, img.originalName, img.url, img.size, img.tags || [], img.category, img.isBrandDna || false, img.uploadedBy]
        );
        return img;
      }
      const images = jsonRead('images.json') || [];
      images.push(img);
      jsonWrite('images.json', images);
      return img;
    },
    async update(id, data) {
      if (pool) {
        const sets = [];
        const vals = [];
        let i = 1;
        if (data.tags) { sets.push(`tags = $${i++}`); vals.push(data.tags); }
        if (data.category) { sets.push(`category = $${i++}`); vals.push(data.category); }
        if (data.isBrandDna !== undefined) { sets.push(`is_brand_dna = $${i++}`); vals.push(data.isBrandDna); }
        if (sets.length) {
          vals.push(id);
          await pool.query(`UPDATE images SET ${sets.join(', ')} WHERE id = $${i}`, vals);
        }
        return;
      }
      const images = jsonRead('images.json') || [];
      const idx = images.findIndex(i => i.id === id);
      if (idx !== -1) images[idx] = { ...images[idx], ...data, id };
      jsonWrite('images.json', images);
    },
    async delete(id) {
      if (pool) {
        const { rows } = await pool.query('SELECT filename FROM images WHERE id = $1', [id]);
        await pool.query('DELETE FROM images WHERE id = $1', [id]);
        return rows[0]?.filename;
      }
      const images = jsonRead('images.json') || [];
      const img = images.find(i => i.id === id);
      jsonWrite('images.json', images.filter(i => i.id !== id));
      return img?.filename;
    },
    async getById(id) {
      if (pool) {
        const { rows } = await pool.query('SELECT * FROM images WHERE id = $1', [id]);
        return rows[0];
      }
      return (jsonRead('images.json') || []).find(i => i.id === id);
    }
  },

  // --- Content ---
  content: {
    async getAll() {
      if (pool) {
        const { rows } = await pool.query(
          'SELECT id, news_item as "newsItem", generated, status, created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt" FROM content ORDER BY created_at DESC'
        );
        return rows;
      }
      return (jsonRead('content.json') || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },
    async getById(id) {
      if (pool) {
        const { rows } = await pool.query(
          'SELECT id, news_item as "newsItem", generated, status, created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt" FROM content WHERE id = $1', [id]
        );
        return rows[0];
      }
      return (jsonRead('content.json') || []).find(c => c.id === id);
    },
    async create(item) {
      if (pool) {
        await pool.query(
          'INSERT INTO content (id, news_item, generated, status, created_by) VALUES ($1,$2,$3,$4,$5)',
          [item.id, JSON.stringify(item.newsItem), JSON.stringify(item.generated), item.status, item.createdBy]
        );
        return item;
      }
      const content = jsonRead('content.json') || [];
      content.push(item);
      jsonWrite('content.json', content);
      return item;
    },
    async updateStatus(id, status) {
      if (pool) {
        await pool.query('UPDATE content SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
        const { rows } = await pool.query(
          'SELECT id, news_item as "newsItem", generated, status, created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt" FROM content WHERE id = $1', [id]
        );
        return rows[0];
      }
      const content = jsonRead('content.json') || [];
      const idx = content.findIndex(c => c.id === id);
      if (idx === -1) return null;
      content[idx].status = status;
      content[idx].updatedAt = new Date().toISOString();
      jsonWrite('content.json', content);
      return content[idx];
    },
    async delete(id) {
      if (pool) { await pool.query('DELETE FROM content WHERE id = $1', [id]); return; }
      jsonWrite('content.json', (jsonRead('content.json') || []).filter(c => c.id !== id));
    }
  },

  // --- Competitor Ads ---
  competitors: {
    async getAll() {
      if (pool) {
        const { rows } = await pool.query(
          'SELECT id, advertiser, ad_text as "adText", image_url as "imageUrl", cta, platform, start_date as "startDate", status, search_term as "searchTerm", raw_data as "rawData", created_at as "createdAt" FROM competitor_ads ORDER BY created_at DESC'
        );
        return rows;
      }
      return jsonRead('competitors.json') || [];
    },
    async create(ad) {
      if (pool) {
        await pool.query(
          'INSERT INTO competitor_ads (id, advertiser, ad_text, image_url, cta, platform, start_date, status, search_term, raw_data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [ad.id, ad.advertiser, ad.adText, ad.imageUrl, ad.cta, ad.platform, ad.startDate, ad.status || 'active', ad.searchTerm, JSON.stringify(ad.rawData || {})]
        );
        return ad;
      }
      const ads = jsonRead('competitors.json') || [];
      ads.push({ ...ad, createdAt: new Date().toISOString() });
      jsonWrite('competitors.json', ads);
      return ad;
    },
    async getById(id) {
      if (pool) {
        const { rows } = await pool.query('SELECT * FROM competitor_ads WHERE id = $1', [id]);
        return rows[0];
      }
      return (jsonRead('competitors.json') || []).find(a => a.id === id);
    },
    async saveInsight(insight) {
      if (pool) {
        await pool.query('INSERT INTO competitor_insights (id, analysis) VALUES ($1, $2)', [insight.id, JSON.stringify(insight.analysis)]);
        return insight;
      }
      const insights = jsonRead('competitor_insights.json') || [];
      insights.push({ ...insight, createdAt: new Date().toISOString() });
      jsonWrite('competitor_insights.json', insights);
      return insight;
    },
    async getLatestInsight() {
      if (pool) {
        const { rows } = await pool.query('SELECT id, analysis, created_at as "createdAt" FROM competitor_insights ORDER BY created_at DESC LIMIT 1');
        return rows[0] || null;
      }
      const insights = jsonRead('competitor_insights.json') || [];
      return insights[insights.length - 1] || null;
    }
  },

  // --- Performance ---
  performance: {
    async log(entry) {
      if (pool) {
        await pool.query(
          'INSERT INTO performance_log (id, content_id, action, content_type, news_category, tags, angle, relevance_score, user_name, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [entry.id, entry.contentId, entry.action, entry.contentType, entry.newsCategory, entry.tags || [], entry.angle, entry.relevanceScore, entry.userName, JSON.stringify(entry.metadata || {})]
        );
        return entry;
      }
      const logs = jsonRead('performance.json') || [];
      logs.push({ ...entry, createdAt: new Date().toISOString() });
      jsonWrite('performance.json', logs);
      return entry;
    },
    async getAll() {
      if (pool) {
        const { rows } = await pool.query('SELECT * FROM performance_log ORDER BY created_at DESC');
        return rows;
      }
      return jsonRead('performance.json') || [];
    },
    async getStats() {
      if (pool) {
        const total = await pool.query('SELECT COUNT(*) FROM performance_log');
        const byAction = await pool.query('SELECT action, COUNT(*) as count FROM performance_log GROUP BY action');
        const byCategory = await pool.query('SELECT news_category, action, COUNT(*) as count FROM performance_log GROUP BY news_category, action');
        const byAngle = await pool.query("SELECT angle, COUNT(*) as count FROM performance_log WHERE action = 'approved' GROUP BY angle ORDER BY count DESC LIMIT 10");
        const recentTrend = await pool.query("SELECT DATE(created_at) as date, action, COUNT(*) as count FROM performance_log WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY DATE(created_at), action ORDER BY date");
        return {
          total: parseInt(total.rows[0].count),
          byAction: byAction.rows,
          byCategory: byCategory.rows,
          topApprovedAngles: byAngle.rows,
          recentTrend: recentTrend.rows
        };
      }
      const logs = jsonRead('performance.json') || [];
      const byAction = {};
      const byCategory = {};
      const angleCount = {};
      logs.forEach(l => {
        byAction[l.action] = (byAction[l.action] || 0) + 1;
        const key = `${l.newsCategory}:${l.action}`;
        byCategory[key] = (byCategory[key] || 0) + 1;
        if (l.action === 'approved' && l.angle) {
          angleCount[l.angle] = (angleCount[l.angle] || 0) + 1;
        }
      });
      return {
        total: logs.length,
        byAction: Object.entries(byAction).map(([action, count]) => ({ action, count })),
        byCategory: Object.entries(byCategory).map(([key, count]) => {
          const [news_category, action] = key.split(':');
          return { news_category, action, count };
        }),
        topApprovedAngles: Object.entries(angleCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([angle, count]) => ({ angle, count })),
        recentTrend: []
      };
    }
  },

  // --- Visual Prompts ---
  visual: {
    async save(prompt) {
      if (pool) {
        await pool.query(
          'INSERT INTO visual_prompts (id, content_id, prompt, format, brand_context, status, result_url) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [prompt.id, prompt.contentId, prompt.prompt, prompt.format, JSON.stringify(prompt.brandContext || {}), prompt.status || 'generated', prompt.resultUrl]
        );
        return prompt;
      }
      const prompts = jsonRead('visual_prompts.json') || [];
      prompts.push({ ...prompt, createdAt: new Date().toISOString() });
      jsonWrite('visual_prompts.json', prompts);
      return prompt;
    },
    async getByContentId(contentId) {
      if (pool) {
        const { rows } = await pool.query('SELECT * FROM visual_prompts WHERE content_id = $1 ORDER BY created_at DESC', [contentId]);
        return rows;
      }
      return (jsonRead('visual_prompts.json') || []).filter(p => p.contentId === contentId);
    },
    async getAll() {
      if (pool) {
        const { rows } = await pool.query('SELECT * FROM visual_prompts ORDER BY created_at DESC');
        return rows;
      }
      return jsonRead('visual_prompts.json') || [];
    }
  }
};

module.exports = db;
