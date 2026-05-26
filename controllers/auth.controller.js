const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { JWT_SECRET } = require('../middlewares/auth.middleware');

exports.register = async (req, res) => {
    const { email, password } = req.body;
    // Убрали тупую проверку пароля, её делает validator.middleware.js

    try {
        const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) return res.status(409).json({ error: 'Пользователь уже существует.' });

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const result = await pool.query(
            `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email`, [email, passwordHash]
        );
        res.status(201).json({ message: 'Учетная запись создана.', user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера.' });
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) return res.status(400).json({ error: 'Введите email и пароль.' });

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        // Проверяем наличие юзера и правильность пароля
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Неверный email или пароль.' });
        }

        // Генерим токен
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ message: 'Авторизация успешна.', token });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера.' });
    }
};