const express = require('express');
const router = express.Router();

const { authenticateToken, authenticateAdmin } = require('../middlewares/auth.middleware');
const upload = require('../middlewares/upload.middleware');
// Подключаем наши новые валидаторы
const { contactValidation, registerValidation, bookingValidation } = require('../middlewares/validator.middleware');

const authCtrl = require('../controllers/auth.controller');
const publicCtrl = require('../controllers/public.controller');
const adminCtrl = require('../controllers/admin.controller');

// Авторизация (навесили registerValidation)
router.post('/auth/register', registerValidation, authCtrl.register);
router.post('/auth/login', authCtrl.login);

// Паблик
router.get('/slider', publicCtrl.getSlider);
// Навесили contactValidation
router.post('/contact', contactValidation, publicCtrl.contact);
router.get('/cars', publicCtrl.getCars);
// Навесили bookingValidation
router.post('/bookings', authenticateToken, bookingValidation, publicCtrl.bookCar);

// Админка
router.get('/admin/bookings', authenticateAdmin, adminCtrl.getBookings);
router.put('/admin/bookings/:id/cancel', authenticateAdmin, adminCtrl.cancelBooking);
router.get('/admin/cars', authenticateAdmin, adminCtrl.getCars);
router.post('/admin/cars', authenticateAdmin, upload.single('image'), adminCtrl.addCar);
router.put('/admin/cars/:id', authenticateAdmin, adminCtrl.updateCar); // Обновление цены/класса
router.put('/admin/cars/:id/photo', authenticateAdmin, upload.single('image'), adminCtrl.updatePhoto);
router.delete('/admin/cars/:id', authenticateAdmin, adminCtrl.deleteCar);

// --- ДОБАВИТЬ В api.routes.js ---
router.get('/profile', authenticateToken, publicCtrl.getProfile);
router.put('/profile', authenticateToken, publicCtrl.updateProfile);
const bcrypt = require('bcrypt'); // Добавь на самый верх public.controller.js
// --- ДОБАВИТЬ В api.routes.js ---
router.put('/profile/password', authenticateToken, publicCtrl.changePassword);
router.put('/bookings/:id/cancel', authenticateToken, publicCtrl.cancelBooking);

// --- ДОБАВИТЬ В api.routes.js ---
router.post('/auth/forgot-password', authCtrl.requestResetCode); // Шаг 1: отправка кода
router.post('/auth/reset-password', authCtrl.resetPassword);       // Шаг 2: сброс по коду
module.exports = router;