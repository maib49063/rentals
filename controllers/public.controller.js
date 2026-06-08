const pool = require('../config/db');
const fs = require('fs');
const path = require('path');
const os = require('os'); // Добавлено для работы с Vercel /tmp
const PDFDocument = require('pdfkit');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middlewares/auth.middleware');

// Функция скачивания шрифта во временную папку Vercel (/tmp)
const ensureFontExists = async (fontPath) => {
    if (fs.existsSync(fontPath)) {
        const stats = fs.statSync(fontPath);
        if (stats.size > 50000) return;
        fs.unlinkSync(fontPath);
    }

    console.log('[SYS] Скачивание кириллического шрифта для PDF...');

    const urls = [
        'https://cdnjs.cloudflare.com/ajax/libs/materialize/0.98.1/fonts/roboto/Roboto-Regular.ttf',
        'https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Regular.ttf'
    ];

    let lastError = null;

    for (const fontUrl of urls) {
        try {
            const response = await fetch(fontUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            fs.writeFileSync(fontPath, buffer);
            console.log(`[SYS] Шрифт успешно загружен из: ${fontUrl}`);
            return;
        } catch (err) {
            lastError = err;
        }
    }

    throw new Error(`Не удалось скачать шрифт. Ошибка: ${lastError.message}`);
};

exports.getSlider = (req, res) => {
    const sliderDir = path.join(__dirname, '../public/slider');
    if (!fs.existsSync(sliderDir)) return res.json({ images: [] });
    try {
        const files = fs.readdirSync(sliderDir);
        const images = files.filter(file => /\.(jpg|jpeg|png|webp|avif)$/i.test(file));
        res.json({ images });
    } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
};

exports.contact = async (req, res) => {
    const { name, email, message } = req.body;

    if (!email || !message) {
        return res.status(400).json({ error: 'Email и сообщение обязательны.' });
    }

    let userId = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            userId = decoded.id;
        } catch (err) { }
    }

    try {
        await pool.query(
            `INSERT INTO support_tickets (user_id, email, message) VALUES ($1, $2, $3)`,
            [userId, email, message]
        );
        res.status(201).json({ message: 'Данные успешно отправлены в ситуационный центр.' });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка БД при сохранении обращения.' });
    }
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

        const ticketsRes = await pool.query(`
            SELECT id, message, reply, status, created_at 
            FROM support_tickets 
            WHERE user_id = $1 
            ORDER BY created_at DESC
        `, [userId]);

        res.json({
            user: userRes.rows[0],
            bookings: bookingsRes.rows,
            tickets: ticketsRes.rows
        });
    } catch (err) {
        console.error('[SYS GET PROFILE ERROR]:', err);
        res.status(500).json({ error: 'Ошибка загрузки профиля.' });
    }
};

exports.updateProfile = async (req, res) => {
    const userId = req.user.id;
    const { passport, license } = req.body;

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

exports.changePassword = async (req, res) => {
    const userId = req.user.id;
    const { password, password_confirm } = req.body;

    if (!password || !password_confirm) return res.status(400).json({ error: 'Заполните оба поля пароля.' });
    if (password !== password_confirm) return res.status(400).json({ error: 'Пароли не совпадают.' });
    if (password.length < 8 || !/\d/.test(password)) return res.status(400).json({ error: 'Пароль должен быть не менее 8 символов и содержать минимум одну цифру.' });

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
        const bookingRes = await pool.query("SELECT id FROM bookings WHERE id = $1 AND user_id = $2 AND status = 'active'", [bookingId, userId]);
        if (bookingRes.rows.length === 0) return res.status(404).json({ error: 'Активное бронирование не найдено.' });

        await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [bookingId]);
        res.json({ message: 'Бронирование успешно аннулировано.' });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера при отмене бронирования.' });
    }
};

exports.getBookingDocument = async (req, res) => {
    const userId = req.user.id;
    const bookingId = req.params.id;

    try {
        // ИЗМЕНЕНО ДЛЯ VERCEL: Записываем шрифт во временную папку сервера
        const fontPath = path.join(os.tmpdir(), 'Roboto-Regular.ttf');
        await ensureFontExists(fontPath);

        const result = await pool.query(`
            SELECT b.id AS booking_id, b.start_date, b.end_date, b.created_at, b.status AS booking_status,
                   c.model, c.category, c.price_per_day,
                   p.amount, p.transaction_external_id, p.created_at AS payment_date,
                   u.email, u.passport, u.license
            FROM bookings b
            JOIN cars c ON b.car_id = c.id
            JOIN payments p ON p.booking_id = b.id
            JOIN users u ON b.user_id = u.id
            WHERE b.id = $1 AND b.user_id = $2
        `, [bookingId, userId]);

        if (result.rows.length === 0) return res.status(404).json({ error: 'Документ не найден.' });

        const data = result.rows[0];
        const start = new Date(data.start_date);
        const end = new Date(data.end_date);
        const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const totalAmount = parseFloat(data.amount) || 0;
        const pricePerDay = parseFloat(data.price_per_day) || 0;
        const tax = (totalAmount * 0.2 / 1.2).toFixed(2);

        const doc = new PDFDocument({ margin: 50, size: 'A4' });

        doc.font(fontPath);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="RENTALS_RECEIPT_${data.booking_id.substring(0, 8)}.pdf"`);
        doc.pipe(res);

        doc.fontSize(22).text('РЕНТАЛС // СИСТЕМА', { align: 'left' });
        doc.fontSize(10).fillColor('#666666').text('МАРШРУТНАЯ КВИТАНЦИЯ И ЭЛЕКТРОННЫЙ ЧЕК', { align: 'left' });
        doc.fontSize(8).fillColor('#000000');
        doc.text('ООО "РЕНТАЛС ИНФРАСТРУКТУРА"', 350, 50, { align: 'right' });
        doc.text('ИНН: 7700123456 | ОГРН: 1237700000000', 350, 65, { align: 'right' });
        doc.text('Тел: 8 800 555 01 99 | sys@rentals.com', 350, 80, { align: 'right' });

        doc.moveTo(50, 110).lineTo(545, 110).lineWidth(2).stroke();
        doc.y = 130;
        doc.fontSize(12).text('[ РЕКВИЗИТЫ ОПЕРАЦИИ ]', 50, doc.y);
        doc.fontSize(10).moveDown(0.8);
        doc.text(`СЧЕТ №:        ${data.booking_id.toUpperCase()}`);
        doc.text(`ДАТА ОПЛАТЫ:   ${new Date(data.payment_date).toLocaleString('ru-RU')}`);
        doc.text(`ТРАНЗАКЦИЯ ID: ${data.transaction_external_id}`);
        doc.text(`МЕТОД ОПЛАТЫ:  БАНКОВСКАЯ КАРТА (ONLINE)`);
        doc.text(`СТАТУС:        ${data.booking_status === 'active' ? 'ОПЛАЧЕНО / АКТИВНО' : 'АННУЛИРОВАНО'}`);

        doc.moveDown(2);
        doc.fontSize(12).text('[ ДАННЫЕ ОПЕРАТОРА (АРЕНДАТОРА) ]');
        doc.fontSize(10).moveDown(0.8);
        doc.text(`ПОЛЬЗОВАТЕЛЬ:  ${data.email}`);
        doc.text(`ПАСПОРТ:       ${data.passport || 'НЕ ПРЕДОСТАВЛЕН'}`);
        doc.text(`ВУ (ПРАВА):    ${data.license || 'НЕ ПРЕДОСТАВЛЕНЫ'}`);

        doc.moveDown(2);
        doc.fontSize(12).text('[ ИНФОРМАЦИЯ ОБ ОБЪЕКТЕ И ЛОКАЦИИ ]');
        doc.fontSize(10).moveDown(0.8);
        doc.text(`АВТОМОБИЛЬ:    ${data.model.toUpperCase()} (КЛАСС: ${data.category.toUpperCase()})`);
        doc.text(`ПЕРИОД АРЕНДЫ: ${new Date(data.start_date).toLocaleDateString('ru-RU')} — ${new Date(data.end_date).toLocaleDateString('ru-RU')} (${days} ДН.)`);

        doc.moveDown(0.5);
        doc.text(`МЕСТО ВЫДАЧИ:  УЛ. БЕРЛИНСКАЯ 14, ТЕРМИНАЛ B, ЗОНА P1`);
        doc.text(`МЕСТО ВОЗВРАТА:УЛ. БЕРЛИНСКАЯ 14, ТЕРМИНАЛ B, ЗОНА P1`);

        doc.moveDown(2);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(1).stroke();
        doc.moveDown(1);

        doc.fontSize(10);
        doc.text('НАИМЕНОВАНИЕ УСЛУГИ', 50, doc.y);
        doc.text('ТАРИФ', 250, doc.y);
        doc.text('КОЛ-ВО', 350, doc.y);
        doc.text('СУММА', 450, doc.y, { width: 95, align: 'right' });

        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).stroke();
        doc.moveDown(0.5);

        let rowY = doc.y;
        doc.text(`АРЕНДА: ${data.model.toUpperCase()}`, 50, rowY);
        doc.text(`${pricePerDay.toFixed(2)} RUB/СУТ`, 250, rowY);
        doc.text(`${days} ДН.`, 350, rowY);
        doc.text(`${totalAmount.toFixed(2)} RUB`, 450, rowY, { width: 95, align: 'right' });

        doc.moveDown(1);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(1).stroke();
        doc.moveDown(1);

        doc.fontSize(10).text(`В ТОМ ЧИСЛЕ НДС (20%): ${tax} RUB`, { align: 'right' });
        doc.moveDown(0.5);
        doc.fontSize(16).text(`ИТОГО К ОПЛАТЕ: ${totalAmount.toFixed(2)} RUB`, { align: 'right' });

        doc.moveDown(4);
        doc.fontSize(8).fillColor('gray');
        doc.text('НАСТОЯЩИЙ ДОКУМЕНТ ПОДТВЕРЖДАЕТ ФАКТ ЗАКЛЮЧЕНИЯ ДОГОВОРА ПРИСОЕДИНЕНИЯ (ОФЕРТЫ).', { align: 'center' });
        doc.text('ОПЛАЧИВАЯ ДАННЫЙ СЧЕТ, АРЕНДАТОР СОГЛАШАЕТСЯ С ПРАВИЛАМИ ПОЛЬЗОВАНИЯ СЕРВИСОМ РЕНТАЛС.', { align: 'center' });
        doc.text('ДОКУМЕНТ СГЕНЕРИРОВАН АВТОМАТИЧЕСКИ. ПОДПИСЬ И ПЕЧАТЬ НЕ ТРЕБУЮТСЯ СОГЛАСНО ФЗ-422.', { align: 'center' });

        doc.end();
    } catch (err) {
        console.error('[SYS PDF ERROR]:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Ошибка генерации документа.' });
    }
};