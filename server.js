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
        // Добавил рандом, чтобы файлы с одинаковым названием не перезаписывали друг друга
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname).toLowerCase());
    }
});

// Фильтр: пускаем только картинки
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Только изображения (JPG, PNG, WEBP, AVIF)!'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // Ограничение: максимум 5 МБ
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

const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Отказ в доступе. Токен отсутствует.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Недействительный или просроченный токен.' });

        // Теперь проверяем по нормальной человеческой роли из БД
        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Сюда нельзя. Только для админа.' });
        }

        req.user = user;
        next();
    });
};

// ==========================================
// РОУТЫ: Авторизация
// ==========================================
app.post('/api/auth/register', async (req, res) => {
    const { email, password, passport, license } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Заполните все обязательные поля.' });
    }

    // Жесткая валидация пароля на сервере
    if (password.length < 8 || !/\d/.test(password)) {
        return res.status(400).json({ error: 'Пароль должен содержать минимум 8 символов и хотя бы одну цифру.' });
    }

    try {
        const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) return res.status(409).json({ error: 'Пользователь уже существует.' });

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Паспорт и права оставим пустыми, юзер заполнит их при первой аренде
        const result = await pool.query(
            `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email`, [email, passwordHash]
        );
        res.status(201).json({ message: 'Учетная запись успешно создана.', user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
    }
});

// ==========================================
// РОУТ: Слайдер на главной странице
// ==========================================
app.get('/api/slider', (req, res) => {
    const sliderDir = path.join(__dirname, 'public', 'slider');

    // Если папки нет, создаем ее, чтобы сервер не падал
    if (!fs.existsSync(sliderDir)) {
        fs.mkdirSync(sliderDir, { recursive: true });
        return res.json({ images: [] });
    }

    try {
        const files = fs.readdirSync(sliderDir);
        // Фильтруем мусор, оставляем только картинки
        const images = files.filter(file => /\.(jpg|jpeg|png|webp|avif)$/i.test(file));
        res.json({ images });
    } catch (err) {
        console.error('[SYS] Ошибка чтения папки слайдера:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
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

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' }); res.json({ message: 'Авторизация успешна.', token });
    } catch (err) {
        res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
    }
});

// ==========================================
// РОУТ: Обратная связь
// ==========================================
app.post('/api/contact', async (req, res) => {
    const { name, email, message } = req.body;
    if (!name || !email || !message) return res.status(400).json({ error: 'Заполните все поля формы.' });

    try {
        console.log('[SYS] Новое сообщение из формы обратной связи:', { name, email, message });
        res.json({ message: 'Сообщение успешно отправлено. Мы свяжемся с вами в ближайшее время.' });
    } catch (err) {
        console.error('[SYS] Ошибка обработки формы:', err);
        res.status(500).json({ error: 'Не удалось отправить сообщение. Попробуйте позже.' });
    }
});

// ==========================================
// РОУТЫ: Автопарк (Для клиентов)
// ==========================================
app.get('/api/cars', async (req, res) => {
    try {
        // Показываем клиентам только свободные и не удаленные машины
        const result = await pool.query('SELECT * FROM cars WHERE is_available = true AND is_deleted = false ORDER BY created_at DESC');
        res.json({ cars: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка загрузки автопарка.' });
    }
});

// ==========================================
// РОУТЫ: Аренда
// ==========================================
app.post('/api/bookings', authenticateToken, async (req, res) => {
    const { car_model, start_date, end_date, passport, license } = req.body;
    const userId = req.user.id;

    if (!car_model || !start_date || !end_date) return res.status(400).json({ error: 'Укажите модель и даты аренды.' });

    // Жесткая проверка дат
    const start = new Date(start_date);
    const end = new Date(end_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Обнуляем время, чтобы сравнивать только дни

    if (start < today) {
        return res.status(400).json({ error: 'Путешествия во времени запрещены. Дата начала не может быть в прошлом.' });
    }
    if (start > end) {
        return res.status(400).json({ error: 'Дата начала не может быть позже даты завершения.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Проверяем, существует ли машина и не в ремонте ли она (is_available = true)
        const carRes = await client.query('SELECT id, is_available FROM cars WHERE model = $1', [car_model]);
        if (carRes.rows.length === 0) return res.status(404).json({ error: 'Автомобиль не найден.' });
        if (!carRes.rows[0].is_available) return res.status(400).json({ error: 'Автомобиль временно выведен из эксплуатации.' });

        const car_id = carRes.rows[0].id;

        // Сохраняем/обновляем документы юзера в базе
        await client.query('UPDATE users SET passport = $1, license = $2 WHERE id = $3', [passport, license, userId]);
        
        // 2. ПРОВЕРКА НА ПЕРЕСЕЧЕНИЕ ДАТ (Ищем активные брони, которые наслаиваются на наши даты)
        const overlapRes = await client.query(`
            SELECT id FROM bookings 
            WHERE car_id = $1 
              AND status = 'active'
              AND start_date <= $3
              AND end_date >= $2
        `, [car_id, start_date, end_date]);

        if (overlapRes.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Машина уже забронирована на эти даты. Выберите другой период.' });
        }

        // 3. Создаем бронь. Статус машины (is_available) больше НЕ трогаем!
        const bookingRes = await client.query(
            `INSERT INTO bookings (user_id, car_id, status, start_date, end_date) VALUES ($1, $2, 'active', $3, $4) RETURNING id`, [userId, car_id, start_date, end_date]
        );

        await client.query('COMMIT');
        res.status(201).json({ message: 'Машина успешно забронирована на выбранные даты.', booking_id: bookingRes.rows[0].id });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[SYS] Ошибка бронирования:', err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
    } finally {
        client.release();
    }
});


// ==========================================
// РОУТЫ: АДМИНКА
// ==========================================

app.get('/api/admin/bookings', authenticateAdmin, async (req, res) => {
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

app.put('/api/admin/bookings/:id/cancel', authenticateAdmin, async (req, res) => {
    const bookingId = req.params.id;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Проверяем существование активной брони
        const bRes = await client.query('SELECT car_id FROM bookings WHERE id = $1 AND status = $2', [bookingId, 'active']);
        if (bRes.rows.length === 0) return res.status(400).json({ error: 'Бронь не найдена или уже неактивна.' });

        // Просто меняем статус брони на cancelled. Трогать is_available самой машины больше не нужно.
        await client.query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [bookingId]);

        await client.query('COMMIT');
        res.json({ message: 'Бронь аннулирована.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Ошибка сервера при отмене.' });
    } finally {
        client.release();
    }
});

app.get('/api/admin/cars', authenticateAdmin, async (req, res) => {
    try {
        // Показываем админу только не удаленные машины
        const result = await pool.query('SELECT * FROM cars WHERE is_deleted = false ORDER BY created_at DESC');
        res.json({ cars: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка загрузки автопарка.' });
    }
});

app.post('/api/admin/cars', authenticateAdmin, upload.single('image'), async (req, res) => {
    const { model, category, price_per_minute } = req.body;
    if (!model || !category || !price_per_minute) return res.status(400).json({ error: 'Заполните все поля.' });

    let imageUrl = null;
    if (req.file) imageUrl = `/uploads/${req.file.filename}`;

    try {
        await pool.query(
            `INSERT INTO cars (model, category, price_per_minute, image_url) VALUES ($1, $2, $3, $4)`, [model, category, price_per_minute, imageUrl]
        );
        res.status(201).json({ message: 'Автомобиль успешно добавлен в систему.' });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка при добавлении машины.' });
    }
});

app.put('/api/admin/cars/:id/photo', authenticateAdmin, upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не прикреплен.' });

    const imageUrl = `/uploads/${req.file.filename}`;
    const carId = req.params.id;

    try {
        const result = await pool.query(
            `UPDATE cars SET image_url = $1 WHERE id = $2 RETURNING id`, [imageUrl, carId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Машина не найдена.' });
        }

        res.json({ message: 'Фотография машины успешно обновлена.', image_url: imageUrl });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка при обновлении фото.' });
    }
});

app.delete('/api/admin/cars/:id', authenticateAdmin, async (req, res) => {
    try {
        // Делаем Soft Delete: помечаем как удаленную и заодно снимаем с линии
        await pool.query('UPDATE cars SET is_deleted = true, is_available = false WHERE id = $1', [req.params.id]);
        res.json({ message: 'Машина списана из автопарка (скрыта).' });
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