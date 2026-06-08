require('dotenv').config();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Настройка доступа к твоему облаку
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Настройка хранилища
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'rentals_cars', // Название папки, которая создастся в облаке
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 1000, crop: 'limit' }] // Бонус: автоматическое сжатие слишком больших фото
    }
});

// Фильтр оставим для надежности
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Только изображения!'), false);
    }
};

const upload = multer({ storage, fileFilter });

module.exports = upload;