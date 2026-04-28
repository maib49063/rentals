require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// Настройка Multer (сохранение фоток машин)
// ==========================================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// Конфигурация БД
// ==========================================
const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
});

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_rentals_key_123';

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Отказ в доступе. Токен отсутствует.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Недействительный или просроченный токен.' });
        req.user = user;
        next();
    });
};

// ==========================================
// РОУТЫ: Авторизация
// ==========================================
app.post('/api/auth/register', async (req, res) => {
    const { email, password, passport, license } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Заполните все обязательные поля.' });

    try {
        const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) return res.status(409).json({ error: 'Пользователь уже существует.' });

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const result = await pool.query(
            `INSERT INTO users (email, password_hash, passport, license) VALUES ($1, $2, $3, $4) RETURNING id, email`,[email, passwordHash, passport || '0000 000000', license || '0000000000']
        );
        res.status(201).json({ message: 'Учетная запись успешно создана.', user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Введите email и пароль.' });

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Неверный email или пароль.' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ message: 'Авторизация успешна.', token });
    } catch (err) {
        res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
    }
});

// ==========================================
// РОУТЫ: Автопарк (Для клиентов)
// ==========================================
app.get('/api/cars', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM cars WHERE is_available = true ORDER BY created_at DESC');
        res.json({ cars: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка загрузки автопарка.' });
    }
});

// ==========================================
// РОУТЫ: Аренда
// ==========================================
app.post('/api/bookings', authenticateToken, async (req, res) => {
    const { car_model, start_date, end_date } = req.body;
    const userId = req.user.id;

    if (!car_model || !start_date || !end_date) return res.status(400).json({ error: 'Укажите модель и даты аренды.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const carRes = await client.query('SELECT id, is_available FROM cars WHERE model = $1', [car_model]);
        if (carRes.rows.length === 0) return res.status(404).json({ error: 'Автомобиль не найден.' });
        if (!carRes.rows[0].is_available) return res.status(400).json({ error: 'Автомобиль недоступен.' });

        const car_id = carRes.rows[0].id;
        const bookingRes = await client.query(
            `INSERT INTO bookings (user_id, car_id, status, start_date, end_date) VALUES ($1, $2, 'active', $3, $4) RETURNING id`,
            [userId, car_id, start_date, end_date]
        );

        await client.query('UPDATE cars SET is_available = false WHERE id = $1', [car_id]);
        await client.query('COMMIT');
        res.status(201).json({ message: 'Машина забронирована.', booking_id: bookingRes.rows[0].id });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
    } finally {
        client.release();
    }
});

// ==========================================
// РОУТЫ: АДМИНКА
// ==========================================

app.get('/api/admin/bookings', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT b.id AS booking_id, u.email AS user_email, c.model AS car_model, b.status, b.created_at, b.start_date, b.end_date
            FROM bookings b 
            JOIN users u ON b.user_id = u.id 
            JOIN cars c ON b.car_id = c.id
            WHERE b.status = 'active'
            ORDER BY b.created_at DESC
        `);
        res.json({ bookings: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка загрузки бронирований.' });
    }
});

app.put('/api/admin/bookings/:id/cancel', async (req, res) => {
    const bookingId = req.params.id;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const bRes = await client.query('SELECT car_id FROM bookings WHERE id = $1 AND status = $2', [bookingId, 'active']);
        if (bRes.rows.length === 0) return res.status(400).json({ error: 'Бронь не найдена или уже неактивна.' });

        const carId = bRes.rows[0].car_id;

        await client.query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [bookingId]);
        await client.query(`UPDATE cars SET is_available = true WHERE id = $1`, [carId]);

        await client.query('COMMIT');
        res.json({ message: 'Бронь аннулирована. Машина снова доступна.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Ошибка сервера при отмене.' });
    } finally {
        client.release();
    }
});

app.get('/api/admin/cars', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM cars ORDER BY created_at DESC');
        res.json({ cars: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка загрузки автопарка.' });
    }
});

app.post('/api/admin/cars', upload.single('image'), async (req, res) => {
    const { model, category, price_per_minute } = req.body;
    if (!model || !category || !price_per_minute) return res.status(400).json({ error: 'Заполните все поля.' });

    let imageUrl = null;
    if (req.file) imageUrl = `/uploads/${req.file.filename}`;

    try {
        await pool.query(
            `INSERT INTO cars (model, category, price_per_minute, image_url) VALUES ($1, $2, $3, $4)`,
            [model, category, price_per_minute, imageUrl]
        );
        res.status(201).json({ message: 'Автомобиль успешно добавлен в систему.' });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка при добавлении машины.' });
    }
});

// АДМИНКА: Обновить только фотку у уже существующей машины
app.put('/api/admin/cars/:id/photo', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не прикреплен.' });

    const imageUrl = `/uploads/${req.file.filename}`;
    const carId = req.params.id;

    try {
        // Опционально: можно достать старый image_url и удалить файл с диска с помощью fs.unlinkSync, 
        // но сейчас просто перезаписываем путь в БД, чтобы не усложнять
        const result = await pool.query(
            `UPDATE cars SET image_url = $1 WHERE id = $2 RETURNING id`,[imageUrl, carId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Машина не найдена.' });
        }

        res.json({ message: 'Фотография машины успешно обновлена.', image_url: imageUrl });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка при обновлении фото.' });
    }
});

app.delete('/api/admin/cars/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM cars WHERE id = $1', [req.params.id]);
        res.json({ message: 'Машина навсегда удалена из базы.' });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка при удалении.' });
    }
});

// ==========================================
// Запуск сервера
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[SYS] Сервер РЕНТАЛС запущен на порту ${PORT}`);
    console.log(`[SYS] Сайт: http://localhost:${PORT}`);
    console.log(`[SYS] Админка: http://localhost:${PORT}/admin.html`);
});