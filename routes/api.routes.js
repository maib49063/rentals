const express = require('express');
const router = express.Router();

const { authenticateToken, authenticateAdmin } = require('../middlewares/auth.middleware');
const upload = require('../middlewares/upload.middleware');

const authCtrl = require('../controllers/auth.controller');
const publicCtrl = require('../controllers/public.controller');
const adminCtrl = require('../controllers/admin.controller');

// Авторизация
router.post('/auth/register', authCtrl.register);
router.post('/auth/login', authCtrl.login);

// Паблик
router.get('/slider', publicCtrl.getSlider);
router.post('/contact', publicCtrl.contact);
router.get('/cars', publicCtrl.getCars);
router.post('/bookings', authenticateToken, publicCtrl.bookCar);

// Админка
router.get('/admin/bookings', authenticateAdmin, adminCtrl.getBookings);
router.put('/admin/bookings/:id/cancel', authenticateAdmin, adminCtrl.cancelBooking);
router.get('/admin/cars', authenticateAdmin, adminCtrl.getCars);
router.post('/admin/cars', authenticateAdmin, upload.single('image'), adminCtrl.addCar);
router.put('/admin/cars/:id/photo', authenticateAdmin, upload.single('image'), adminCtrl.updatePhoto);
router.delete('/admin/cars/:id', authenticateAdmin, adminCtrl.deleteCar);
router.put('/admin/cars/:id', authenticateAdmin, adminCtrl.updateCar);

module.exports = router;