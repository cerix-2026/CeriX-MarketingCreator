const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directories exist
['server/data', 'server/uploads/images', 'server/uploads/brand'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Init default JSON data files if missing (only used when DATABASE_URL is not set)
if (!process.env.DATABASE_URL) {
  const initData = (file, def) => {
    const fp = path.join(__dirname, 'data', file);
    if (!fs.existsSync(fp)) fs.writeFileSync(fp, JSON.stringify(def, null, 2));
  };

  initData('users.json', [
    {
      id: '1',
      name: 'Admin',
      email: 'admin@cerix.dk',
      password: "$2a$10$VpM0Qohfkelp74oYR8ACmekndjOkG3lGpI5wrCHEhJ4xdSnYx5w1C",
      role: 'admin',
      createdAt: new Date().toISOString()
    }
  ]);
  initData('brand.json', {
    colors: { primary: '#1A2E4A', secondary: '#C9A85C', accent: '#E8F2EF', text: '#1A2535', background: '#F7F5F0' },
    fonts: { heading: 'Playfair Display', body: 'DM Sans', mono: 'DM Mono' },
    tone: 'Faglig og varm, aldrig klinisk. Vi taler til kvinder 35-55 der vil have professionelle resultater uden unodigt drama.',
    tagline: 'Professionelle æstetiske behandlinger i verdensklasse',
    doList: ['Brug faglige termer forklaret i klarsprog', 'Vær tryg og kompetent', 'Fremhæv resultater og sikkerhed'],
    dontList: ['Aldrig "billig" - brug "tilgængelig"', 'Ingen overdrevne løfter', 'Undgå medicinsk jargon uden forklaring'],
    logoUrl: null,
    updatedAt: new Date().toISOString()
  });
  initData('knowledge.json', { treatments: [], faqs: [], about: '', lastCrawled: null, updatedAt: new Date().toISOString() });
  initData('images.json', []);
  initData('content.json', []);
  initData('competitors.json', []);
  initData('competitor_insights.json', []);
  initData('performance.json', []);
  initData('visual_prompts.json', []);
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/brand',       require('./routes/brand'));
app.use('/api/knowledge',   require('./routes/knowledge'));
app.use('/api/images',      require('./routes/images'));
app.use('/api/users',       require('./routes/users'));
app.use('/api/news',        require('./routes/news'));
app.use('/api/content',     require('./routes/content'));
app.use('/api/competitors', require('./routes/competitors'));
app.use('/api/visual',      require('./routes/visual'));
app.use('/api/export',      require('./routes/export'));
app.use('/api/performance', require('./routes/performance'));

// Serve React frontend
app.use(express.static(path.join(__dirname, '..', 'client')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// Initialize database and start server
(async () => {
  try {
    await db.init();
    const mode = process.env.DATABASE_URL ? 'PostgreSQL' : 'JSON-filer';
    app.listen(PORT, () => {
      console.log(`CeriX Marketing Engine - port ${PORT} (${mode})`);
    });
  } catch (err) {
    console.error('Startup fejl:', err.message);
    process.exit(1);
  }
})();
