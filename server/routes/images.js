const router = require('express').Router();
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { v4: uuid } = require('uuid');
const auth = require('../middleware/auth');
const db = require('../db');

const storage = multer.diskStorage({
  destination: 'server/uploads/images/',
  filename: (req, file, cb) => cb(null, uuid() + path.extname(file.originalname))
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Kun billeder tilladt'));
  }
});

router.get('/', auth(), async (req, res) => {
  const { tag, category } = req.query;
  const images = await db.images.getAll({ tag, category });
  res.json(images);
});

router.post('/', auth(['admin', 'editor']), upload.array('images', 20), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'Ingen filer' });
  const { tags, category, isBrandDna } = req.body;

  const newImages = [];
  for (const file of req.files) {
    const img = {
      id: uuid(),
      filename: file.filename,
      originalName: file.originalname,
      url: '/uploads/images/' + file.filename,
      size: file.size,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      category: category || 'general',
      isBrandDna: isBrandDna === 'true',
      uploadedBy: req.user.name,
      createdAt: new Date().toISOString()
    };
    await db.images.create(img);
    newImages.push(img);
  }
  res.json(newImages);
});

router.put('/:id', auth(['admin', 'editor']), async (req, res) => {
  await db.images.update(req.params.id, req.body);
  const img = await db.images.getById(req.params.id);
  if (!img) return res.status(404).json({ error: 'Billede ikke fundet' });
  res.json(img);
});

router.delete('/:id', auth(['admin', 'editor']), async (req, res) => {
  const filename = await db.images.delete(req.params.id);
  if (filename) {
    try { fs.unlinkSync('server/uploads/images/' + filename); } catch {}
  }
  res.json({ ok: true });
});

module.exports = router;
