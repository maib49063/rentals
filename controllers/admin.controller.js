const pool = require('../config/db');

exports.getBookings = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT b.id AS booking_id, u.email AS user_email, c.model AS car_model, b.status, b.created_at, b.start_date, b.end_date
            FROM bookings b JOIN users u ON b.user_id = u.id JOIN cars c ON b.car_id = c.id
            WHERE b.status = 'active' ORDER BY b.created_at DESC
        `);
        res.json({ bookings: result.rows });
    } catch (err) { res.status(500).json({ error: 'Ошибка БД.' }); }
};

exports.cancelBooking = async (req, res) => {
    try {
        await pool.query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1 AND status = 'active'`, [req.params.id]);
        res.json({ message: 'Бронь аннулирована.' });
    } catch (err) { res.status(500).json({ error: 'Ошибка сервера.' }); }
};

exports.getCars = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM cars WHERE is_deleted = false ORDER BY created_at DESC');
        res.json({ cars: result.rows });
    } catch (err) { res.status(500).json({ error: 'Ошибка БД.' }); }
};

exports.addCar = async (req, res) => {
    const { model, category, price_per_day, tech_regulations } = req.body;
    // ИЗМЕНЕНО: теперь берем полный URL-путь из Cloudinary
    let imageUrl = req.file ? req.file.path : null;
    try {
        await pool.query(
            `INSERT INTO cars (model, category, price_per_day, image_url, tech_regulations) VALUES ($1, $2, $3, $4, $5)`,
            [model, category, price_per_day, imageUrl, tech_regulations || '']
        );
        res.status(201).json({ message: 'Добавлено.' });
    } catch (err) { res.status(500).json({ error: 'Ошибка БД.' }); }
};

exports.updatePhoto = async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не прикреплен.' });
    // ИЗМЕНЕНО: теперь берем полный URL-путь из Cloudinary
    const imageUrl = req.file.path;
    try {
        await pool.query(`UPDATE cars SET image_url = $1 WHERE id = $2`, [imageUrl, req.params.id]);
        res.json({ message: 'Обновлено.', image_url: imageUrl });
    } catch (err) { res.status(500).json({ error: 'Ошибка БД.' }); }
};

exports.updateCar = async (req, res) => {
    const { category, price_per_day, tech_regulations } = req.body;
    const carId = req.params.id;

    if (!category || !price_per_day) {
        return res.status(400).json({ error: 'Заполните класс и цену.' });
    }

    try {
        const result = await pool.query(
            'UPDATE cars SET category = $1, price_per_day = $2, tech_regulations = $3 WHERE id = $4 RETURNING id',
            [category, price_per_day, tech_regulations, carId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Машина не найдена.' });
        }

        res.json({ message: 'Данные машины успешно обновлены.' });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка БД при обновлении.' });
    }
};

exports.deleteCar = async (req, res) => {
    try {
        await pool.query('UPDATE cars SET is_deleted = true, is_available = false WHERE id = $1', [req.params.id]);
        res.json({ message: 'Машина списана.' });
    } catch (err) { res.status(500).json({ error: 'Ошибка БД.' }); }
};

// Получить все тикеты пользователей для админки
exports.getTickets = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, email, message, reply, status, created_at 
            FROM support_tickets 
            ORDER BY status DESC, created_at DESC
        `);
        res.json({ tickets: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка БД при получении обращений.' });
    }
};

// Ответить на тикет
exports.replyTicket = async (req, res) => {
    const { ticketId } = req.params;
    const { reply } = req.body;

    if (!reply || reply.trim() === '') {
        return res.status(400).json({ error: 'Текст ответа не может быть пустым.' });
    }

    try {
        const result = await pool.query(
            `UPDATE support_tickets SET reply = $1, status = 'answered' WHERE id = $2 RETURNING *`,
            [reply, ticketId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Обращение не найдено.' });
        }

        res.json({ message: 'Ответ успешно отправлен.', ticket: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера при сохранении ответа.' });
    }
};