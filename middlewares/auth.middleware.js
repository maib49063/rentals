const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_rentals_key_123';

const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Отказ в доступе. Токен отсутствует.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Недействительный или просроченный токен.' });
        req.user = user;
        next();
    });
};

const authenticateAdmin = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Отказ в доступе.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Недействительный токен.' });
        if (user.role !== 'admin') return res.status(403).json({ error: 'Сюда нельзя. Только для админа.' });
        req.user = user;
        next();
    });
};

module.exports = { authenticateToken, authenticateAdmin, JWT_SECRET };