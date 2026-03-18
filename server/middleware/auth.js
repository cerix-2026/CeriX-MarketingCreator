const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'cerix-secret-change-in-production';

module.exports = (roles = []) => (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Ikke autoriseret' });
  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    if (roles.length && !roles.includes(decoded.role)) {
      return res.status(403).json({ error: 'Ingen adgang' });
    }
    next();
  } catch {
    res.status(401).json({ error: 'Ugyldig token' });
  }
};
