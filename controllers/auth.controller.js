const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { JWT_SECRET } = require('../middlewares/auth.middleware');
const nodemailer = require('nodemailer'); // Подключаем nodemailer

// Временное хранилище кодов сброса в оперативной памяти (email -> { code, expiresAt })
const resetCodes = new Map();

exports.register = async (req, res) => {
    const { email, password } = req.body;
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

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Неверный email или пароль.' });
        }

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ message: 'Авторизация успешна.', token });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера.' });
    }
};

// 1. ЗАПРОС КОДА НА ПОЧТУ
exports.requestResetCode = async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Укажите email адрес.' });

    try {
        // Проверяем существование пользователя
        const userRes = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь с таким email не найден.' });
        }

        // Генерируем 6-значный цифровой код
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // Записываем код в память на 5 минут
        resetCodes.set(email, {
            code,
            expiresAt: Date.now() + 5 * 60 * 1000
        });

        // Настройка почтового транспорта
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '465'),
            secure: process.env.SMTP_SECURE === 'true', // true для порта 465
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        const mailOptions = {
            from: `"РЕНТАЛС СИСТЕМА" <${process.env.SMTP_USER}>`,
            to: email,
            subject: 'РЕНТАЛС: Код сброса пароля',
            text: `Ваш проверочный код: ${code}\nКод действителен в течение 5 минут.`,
            html: `
                <div style="font-family: monospace; padding: 24px; border: 2px solid #000; background-color: #fff; max-width: 500px;">
                    <h2 style="color: #E3000F; margin-top: 0; text-transform: uppercase;">РЕНТАЛС // СБРОС ДОСТУПА</h2>
                    <p style="font-size: 14px; font-weight: bold;">Вы инициировали восстановление доступа к системе.</p>
                    <div style="background-color: #000; color: #fff; padding: 16px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 4px; margin: 24px 0;">
                        ${code}
                    </div>
                    <p style="font-size: 11px; color: #666; margin-bottom: 0;">Код действителен 5 минут. Если вы не делали этот запрос, проигнорируйте письмо.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ message: 'Код подтверждения отправлен на вашу почту.' });

    } catch (err) {
        console.error('[SMTP ERROR]:', err);
        res.status(500).json({ error: 'Не удалось отправить письмо. Проверьте настройки SMTP в файле .env.' });
    }
};

// 2. СБРОС ПАРОЛЯ ПО КОДУ
exports.resetPassword = async (req, res) => {
    const { email, code, password, password_confirm } = req.body;

    if (!email || !code || !password || !password_confirm) {
        return res.status(400).json({ error: 'Заполните все поля, включая полученный код.' });
    }

    if (password !== password_confirm) {
        return res.status(400).json({ error: 'Пароли не совпадают.' });
    }

    if (password.length < 8 || !/\d/.test(password)) {
        return res.status(400).json({ error: 'Пароль должен быть от 8 символов и иметь хотя бы одну цифру.' });
    }

    try {
        const stored = resetCodes.get(email);
        if (!stored) {
            return res.status(400).json({ error: 'Код не запрашивался или срок его действия истек.' });
        }

        if (stored.code !== code.trim()) {
            return res.status(400).json({ error: 'Неверный код подтверждения.' });
        }

        if (Date.now() > stored.expiresAt) {
            resetCodes.delete(email);
            return res.status(400).json({ error: 'Срок действия кода истек. Запросите новый.' });
        }

        const userRes = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден.' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [passwordHash, email]);

        // Удаляем код после успешной операции
        resetCodes.delete(email);

        res.json({ message: 'Пароль успешно обновлен. Войдите с новыми учетными данными.' });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера при обновлении пароля.' });
    }
};

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    tls: {
        // Игнорируем ошибки сертификатов, если трафик перехватывается провайдером или прокси
        rejectUnauthorized: false
    }
});