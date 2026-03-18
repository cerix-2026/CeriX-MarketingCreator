const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const SECRET = process.env.JWT_SECRET || 'cerix-secret-change-in-production';

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await db.users.getByEmail(email);
  if (!user) return res.status(401).json({ error: 'Forkert email eller adgangskode' });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Forkert email eller adgangskode' });
  const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

router.get('/me', require('../middleware/auth')(), (req, res) => {
  res.json(req.user);
});

module.exports = router;
