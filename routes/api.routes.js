const express = require('express');
const router = express.Router();

const { authenticateToken, authenticateAdmin } = require('../middlewares/auth.middleware');
const upload = require('../middlewares/upload.middleware');
const { contactValidation, registerValidation, bookingValidation } = require('../middlewares/validator.middleware');

const authCtrl = require('../controllers/auth.controller');
const publicCtrl = require('../controllers/public.controller');
const adminCtrl = require('../controllers/admin.controller');

// --- АВТОРИЗАЦИЯ ---
router.post('/auth/register', registerValidation, authCtrl.register);
router.post('/auth/login', authCtrl.login);
router.post('/auth/forgot-password', authCtrl.requestResetCode);
router.post('/auth/reset-password', authCtrl.resetPassword);

// --- ПУБЛИЧНЫЕ И ПОЛЬЗОВАТЕЛЬСКИЕ МАРШРУТЫ ---
router.get('/slider', publicCtrl.getSlider);
router.post('/contact', contactValidation, publicCtrl.contact);
router.get('/cars', publicCtrl.getCars);
router.post('/bookings', authenticateToken, bookingValidation, publicCtrl.bookCar);

// Профиль и управление бронью
router.get('/profile', authenticateToken, publicCtrl.getProfile);
router.put('/profile', authenticateToken, publicCtrl.updateProfile);
router.put('/profile/password', authenticateToken, publicCtrl.changePassword);
router.put('/bookings/:id/cancel', authenticateToken, publicCtrl.cancelBooking);
router.get('/bookings/:id/document', authenticateToken, publicCtrl.getBookingDocument);

// --- АДМИНКА ---
router.get('/admin/bookings', authenticateAdmin, adminCtrl.getBookings);
router.put('/admin/bookings/:id/cancel', authenticateAdmin, adminCtrl.cancelBooking);

// Управление автопарком
router.get('/admin/cars', authenticateAdmin, adminCtrl.getCars);
router.post('/admin/cars', authenticateAdmin, upload.single('image'), adminCtrl.addCar);
router.put('/admin/cars/:id', authenticateAdmin, adminCtrl.updateCar);
router.put('/admin/cars/:id/photo', authenticateAdmin, upload.single('image'), adminCtrl.updatePhoto);
router.delete('/admin/cars/:id', authenticateAdmin, adminCtrl.deleteCar);

// Управление обращениями в поддержку
router.get('/admin/tickets', authenticateAdmin, adminCtrl.getTickets);
router.post('/admin/tickets/:ticketId/reply', authenticateAdmin, adminCtrl.replyTicket);

module.exports = router;