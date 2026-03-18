const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const db = require('../db');

const storage = multer.diskStorage({
  destination: 'server/uploads/brand/',
  filename: (req, file, cb) => cb(null, 'logo' + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', auth(), async (req, res) => {
  res.json(await db.brand.get());
});

router.put('/', auth(['admin', 'editor']), async (req, res) => {
  const updated = await db.brand.update(req.body);
  res.json(updated);
});

router.post('/logo', auth(['admin', 'editor']), upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Ingen fil' });
  const logoUrl = '/uploads/brand/' + req.file.filename;
  await db.brand.update({ logoUrl });
  res.json({ logoUrl });
});

module.exports = router;
