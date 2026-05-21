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
    res.json({ message: 'Сообщение успешно отправлено.' });
};

exports.getCars = async (req, res) => {
    const { start_date, end_date } = req.query; // Ловим даты из поиска

    try {
        let query = 'SELECT * FROM cars WHERE is_available = true AND is_deleted = false';
        let params = [];

        // Если юзер ввел даты — отсекаем занятые машины через подзапрос
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

        // Обновляем паспорт и права
        if (passport && license) {
            await client.query('UPDATE users SET passport = $1, license = $2 WHERE id = $3', [passport, license, userId]);
        }

        // Вытаскиваем машину и ЕЁ ЦЕНУ
        const carRes = await client.query('SELECT id, is_available, price_per_minute FROM cars WHERE model = $1 AND is_deleted = false', [car_model]);
        if (carRes.rows.length === 0) return res.status(404).json({ error: 'Автомобиль не найден.' });
        if (!carRes.rows[0].is_available) return res.status(400).json({ error: 'Автомобиль недоступен.' });

        const car_id = carRes.rows[0].id;
        const pricePerMinute = parseFloat(carRes.rows[0].price_per_minute);

        // Проверка на занятость (пересечение дат)
        const overlapRes = await client.query(`
            SELECT id FROM bookings WHERE car_id = $1 AND status = 'active' AND start_date <= $3 AND end_date >= $2
        `, [car_id, start_date, end_date]);

        if (overlapRes.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Машина уже забронирована на эти даты.' });
        }

        // Высчитываем грубую стоимость аренды (дней * 24ч * 60м * цена)
        // ВАЖНО: +1 нужен, чтобы аренда на 1 день считалась как минимум за 1 полный день
        const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const totalAmount = days * 24 * 60 * pricePerMinute;

        // 1. Создаем бронь
        const bookingRes = await client.query(
            `INSERT INTO bookings (user_id, car_id, status, start_date, end_date) VALUES ($1, $2, 'active', $3, $4) RETURNING id`, [userId, car_id, start_date, end_date]
        );
        const bookingId = bookingRes.rows[0].id;

        // 2. СРАЗУ СОЗДАЕМ ЧЕК ОБ ОПЛАТЕ (Эмуляция эквайринга для диплома)
        await client.query(
            `INSERT INTO payments (user_id, booking_id, amount, type, status, method, transaction_external_id) 
             VALUES ($1, $2, $3, 'rental', 'completed', 'card', $4)`,
            [userId, bookingId, totalAmount, 'TX_FAKE_' + Date.now()]
        );

        await client.query('COMMIT');

        // Возвращаем успех с суммой
        res.status(201).json({ message: `Оплата ${totalAmount} ₽ прошла успешно! Забронировано.`, booking_id: bookingId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Ошибка бронирования.' });
    } finally {
        client.release();
    }
};