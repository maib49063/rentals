require('dotenv').config();
const express = require('express');
const path = require('path');
const apiRoutes = require('./routes/api.routes');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Подключаем все наши разбитые роуты
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[SYS] Сервер запущен: http://localhost:${PORT}`);
    console.log(`[SYS] Архитектура: MVC. К защите диплома готов.`);
});