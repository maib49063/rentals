const pool = require('../config/db');
const fs = require('fs');
const path = require('path');

exports.getSlider = (req, res) => {
    const sliderDir = path.join(__dirname, '../public/slider');
    if (!fs.existsSync(sliderDir)) return res.json({ images: [] });
    try {
        const files = fs.readdirSync(sliderDir);
        const images = files.filter(file => /\.(jpg|jpeg|png|webp|avif)$/i.test(file));
        res.json({ images });
    } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
};

exports.contact = (req, res) => {
    const { name, email, message } = req.body;
    console.log('[SYS] Новое сообщение:', { name, email, message });
    res.json({ message: 'Сообщение успешно отправлено.' });
};

exports.getCars = async (req, res) => {
    const { start_date, end_date } = req.query;

    try {
        let query = 'SELECT * FROM cars WHERE is_available = true AND is_deleted = false';
        let params = [];

        if (start_date && end_date) {
            query += ` AND id NOT IN (
                SELECT car_id FROM bookings 
                WHERE status = 'active' 
                AND start_date <= $2 
                AND end_date >= $1
            )`;
            params.push(start_date, end_date);
        }

        query += ' ORDER BY created_at DESC';

        const result = await pool.query(query, params);
        res.json({ cars: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка БД.' });
    }
};

exports.bookCar = async (req, res) => {
    const { car_model, start_date, end_date, passport, license } = req.body;
    const userId = req.user.id;

    if (!car_model || !start_date || !end_date) return res.status(400).json({ error: 'Укажите модель и даты.' });

    const start = new Date(start_date);
    const end = new Date(end_date);
    const today = new Date(); today.setHours(0, 0, 0, 0);

    if (start < today) return res.status(400).json({ error: 'Дата в прошлом.' });
    if (start > end) return res.status(400).json({ error: 'Неверный диапазон дат.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if (passport && license) {
            await client.query('UPDATE users SET passport = $1, license = $2 WHERE id = $3', [passport, license, userId]);
        }

        // Берем price_per_day
        const carRes = await client.query('SELECT id, is_available, price_per_day FROM cars WHERE model = $1 AND is_deleted = false', [car_model]);
        if (carRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Автомобиль не найден.' });
        }
        if (!carRes.rows[0].is_available) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Автомобиль недоступен.' });
        }

        const car_id = carRes.rows[0].id;
        const pricePerDay = parseFloat(carRes.rows[0].price_per_day);

        const overlapRes = await client.query(`
            SELECT id FROM bookings WHERE car_id = $1 AND status = 'active' AND start_date <= $3 AND end_date >= $2
        `, [car_id, start_date, end_date]);

        if (overlapRes.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Машина уже забронирована на эти даты.' });
        }

        // Адекватный подсчет дней
        const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const totalAmount = days * pricePerDay;

        const bookingRes = await client.query(
            `INSERT INTO bookings (user_id, car_id, status, start_date, end_date) VALUES ($1, $2, 'active', $3, $4) RETURNING id`,
            [userId, car_id, start_date, end_date]
        );
        const bookingId = bookingRes.rows[0].id;

        await client.query(
            `INSERT INTO payments (user_id, booking_id, amount, type, status, method, transaction_external_id) 
             VALUES ($1, $2, $3, 'rental', 'completed', 'card', $4)`,
            [userId, bookingId, totalAmount, 'TX_FAKE_' + Date.now()]
        );

        await client.query('COMMIT');
        res.status(201).json({ message: `Оплата ${totalAmount} ₽ прошла успешно! Забронировано.`, booking_id: bookingId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Ошибка бронирования.' });
    } finally {
        client.release();
    }
};

// --- ДОБАВИТЬ В КОНЕЦ public.controller.js ---

exports.getProfile = async (req, res) => {
    const userId = req.user.id;
    try {
        const userRes = await pool.query('SELECT email, passport, license FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден.' });

        const bookingsRes = await pool.query(`
            SELECT b.id AS booking_id, b.status, b.start_date, b.end_date, b.created_at,
                   c.model AS car_model, c.category,
                   p.amount AS payment_amount, p.status AS payment_status
            FROM bookings b
            JOIN cars c ON b.car_id = c.id
            LEFT JOIN payments p ON p.booking_id = b.id
            WHERE b.user_id = $1
            ORDER BY b.created_at DESC
        `, [userId]);

        res.json({
            user: userRes.rows[0],
            bookings: bookingsRes.rows
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка загрузки профиля.' });
    }
};

exports.updateProfile = async (req, res) => {
    const userId = req.user.id;
    const { passport, license } = req.body;

    // Валидация на скорую руку (на бэке она обязательна)
    if (passport && !/^\d{4}\s\d{6}$/.test(passport)) {
        return res.status(400).json({ error: 'Неверный формат паспорта.' });
    }
    if (license && license.length !== 10) {
        return res.status(400).json({ error: 'Права должны быть ровно 10 символов.' });
    }

    try {
        await pool.query('UPDATE users SET passport = $1, license = $2 WHERE id = $3', [passport, license, userId]);
        res.json({ message: 'Данные профиля успешно сохранены.' });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка обновления профиля.' });
    }
};

// --- ДОБАВИТЬ В КОНЕЦ public.controller.js ---

exports.changePassword = async (req, res) => {
    const userId = req.user.id;
    const { password, password_confirm } = req.body;

    if (!password || !password_confirm) {
        return res.status(400).json({ error: 'Заполните оба поля пароля.' });
    }
    if (password !== password_confirm) {
        return res.status(400).json({ error: 'Пароли не совпадают.' });
    }
    if (password.length < 8 || !/\d/.test(password)) {
        return res.status(400).json({ error: 'Пароль должен быть не менее 8 символов и содержать минимум одну цифру.' });
    }

    try {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
        res.json({ message: 'Пароль успешно изменен.' });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера при смене пароля.' });
    }
};

exports.cancelBooking = async (req, res) => {
    const userId = req.user.id;
    const bookingId = req.params.id;

    try {
        // Проверяем, что бронь реально существует, активна и принадлежит этому юзеру
        const bookingRes = await pool.query(
            "SELECT id FROM bookings WHERE id = $1 AND user_id = $2 AND status = 'active'",
            [bookingId, userId]
        );

        if (bookingRes.rows.length === 0) {
            return res.status(404).json({ error: 'Активное бронирование не найдено.' });
        }

        await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [bookingId]);
        res.json({ message: 'Бронирование успешно аннулировано.' });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера при отмене бронирования.' });
    }
};