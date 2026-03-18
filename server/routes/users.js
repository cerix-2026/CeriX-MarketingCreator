const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const auth = require('../middleware/auth');
const db = require('../db');

router.get('/', auth(['admin']), async (req, res) => {
  const users = await db.users.getAll();
  res.json(users.map(({ password, ...u }) => u));
});

router.post('/', auth(['admin']), async (req, res) => {
  const { name, email, password, role } = req.body;
  const existing = await db.users.getByEmail(email);
  if (existing) return res.status(400).json({ error: 'Email findes allerede' });
  const hashed = await bcrypt.hash(password, 10);
  const user = { id: uuid(), name, email, password: hashed, role: role || 'editor', createdAt: new Date().toISOString() };
  await db.users.create(user);
  const { password: _, ...safe } = user;
  res.json(safe);
});

router.put('/:id', auth(['admin']), async (req, res) => {
  const { name, email, role, password } = req.body;
  const update = { name, email, role };
  if (password) update.password = await bcrypt.hash(password, 10);
  const user = await db.users.update(req.params.id, update);
  if (!user) return res.status(404).json({ error: 'Bruger ikke fundet' });
  const { password: _, ...safe } = user;
  res.json(safe);
});

router.delete('/:id', auth(['admin']), async (req, res) => {
  await db.users.delete(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
