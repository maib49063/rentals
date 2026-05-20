const pool = require('../config/db');
const fs = require('fs');
const path = require('path');

exports.getSlider = (req, res) => {
    const sliderDir = path.join(__dirname, '../../public/slider');
    if (!fs.existsSync(sliderDir)) return res.json({ images: [] });
    try {
        const files = fs.readdirSync(sliderDir);
        const images = files.filter(file => /\.(jpg|jpeg|png|webp|avif)$/i.test(file));
        res.json({ images });
    } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
};

exports.contact = (req, res) => {
    res.json({ message: 'Сообщение успешно отправлено.' });
};

exports.getCars = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM cars WHERE is_available = true AND is_deleted = false ORDER BY created_at DESC');
        res.json({ cars: result.rows });
    } catch (err) { res.status(500).json({ error: 'Ошибка БД.' }); }
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
        if (passport && license) await client.query('UPDATE users SET passport = $1, license = $2 WHERE id = $3', [passport, license, userId]);

        const carRes = await client.query('SELECT id, is_available FROM cars WHERE model = $1 AND is_deleted = false', [car_model]);
        if (carRes.rows.length === 0) return res.status(404).json({ error: 'Автомобиль не найден.' });
        if (!carRes.rows[0].is_available) return res.status(400).json({ error: 'Автомобиль недоступен.' });

        const overlapRes = await client.query(`
            SELECT id FROM bookings WHERE car_id = $1 AND status = 'active' AND start_date <= $3 AND end_date >= $2
        `, [carRes.rows[0].id, start_date, end_date]);

        if (overlapRes.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Машина уже забронирована на эти даты.' });
        }

        const bookingRes = await client.query(
            `INSERT INTO bookings (user_id, car_id, status, start_date, end_date) VALUES ($1, $2, 'active', $3, $4) RETURNING id`, [userId, carRes.rows[0].id, start_date, end_date]
        );

        await client.query('COMMIT');
        res.status(201).json({ message: 'Забронировано.', booking_id: bookingRes.rows[0].id });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Ошибка бронирования.' });
    } finally { client.release(); }
};