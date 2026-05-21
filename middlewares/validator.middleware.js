const { body, validationResult } = require('express-validator');

// Общая функция, которая ловит ошибки из правил ниже
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        // Отправляем пользователю текст первой попавшейся ошибки
        return res.status(400).json({ error: errors.array()[0].msg });
    }
    next();
};

// Правила для формы контактов
const contactValidation = [
    body('name').trim().notEmpty().withMessage('Имя обязательно').escape(), // escape() режет XSS-скрипты
    body('email').isEmail().withMessage('Некорректный email').normalizeEmail(),
    body('message').trim().notEmpty().withMessage('Сообщение обязательно').isLength({ max: 1000 }).withMessage('Слишком длинное сообщение').escape(),
    handleValidationErrors
];

// Правила для регистрации
const registerValidation = [
    body('email').isEmail().withMessage('Некорректный email').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Пароль минимум 8 символов').matches(/\d/).withMessage('Пароль должен содержать цифру'),
    handleValidationErrors
];

// Правила для бронирования (дублируем проверку с фронта на бэке)
const bookingValidation = [
    body('car_model').trim().notEmpty().withMessage('Модель обязательна').escape(),
    body('start_date').isISO8601().withMessage('Неверный формат даты начала'),
    body('end_date').isISO8601().withMessage('Неверный формат даты завершения'),
    body('passport').matches(/^\d{4}\s\d{6}$/).withMessage('Неверный формат паспорта (нужно 4 цифры пробел 6 цифр)'),
    body('license').isLength({ min: 10, max: 10 }).withMessage('Права должны содержать ровно 10 символов'),
    handleValidationErrors
];

module.exports = { contactValidation, registerValidation, bookingValidation };