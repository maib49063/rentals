document.addEventListener('DOMContentLoaded', () => {
    const catalog = document.getElementById('catalog');
    const searchStart = document.getElementById('search_start');
    const searchEnd = document.getElementById('search_end');
    const btnSearch = document.getElementById('btn-search');

    let allCars = [];

    // Блокируем выбор прошлых дат
    const todayStr = new Date().toISOString().split('T')[0];
    searchStart.setAttribute('min', todayStr);
    searchEnd.setAttribute('min', todayStr);
    document.getElementById('start_date').setAttribute('min', todayStr);
    document.getElementById('end_date').setAttribute('min', todayStr);

    async function loadCars() {
        try {
            let url = '/api/cars';
            const s = searchStart.value;
            const e = searchEnd.value;

            // Если даты выбраны, кидаем их серверу
            if (s && e) {
                url += `?start_date=${s}&end_date=${e}`;
            }

            const res = await fetch(url);
            const data = await res.json();
            allCars = data.cars;

            // Сбрасываем фильтр категорий на "Все" при новом поиске
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.filter-btn[data-filter="all"]').classList.add('active');

            renderCars('all');
        } catch (err) {
            catalog.innerHTML = '<h2>Ошибка связи с сервером.</h2>';
        }
    }

    // Обработка кнопки поиска
    btnSearch.addEventListener('click', () => {
        if (searchStart.value && searchEnd.value && searchStart.value > searchEnd.value) {
            alert('Дата "С" не может быть позже даты "ПО"');
            return;
        }
        loadCars();
    });

    function renderCars(filterCategory) {
        catalog.innerHTML = '';
        const filtered = filterCategory === 'all' ? allCars : allCars.filter(c => c.category === filterCategory);

        if (filtered.length === 0) {
            catalog.innerHTML = '<div style="grid-column: 1/-1; padding: 40px; border: 2px dashed #000; text-align: center;">НА ЭТИ ДАТЫ НЕТ СВОБОДНЫХ МАШИН</div>';
            return;
        }

        filtered.forEach(car => {
            const imgSrc = car.image_url || 'https://images.unsplash.com/photo-1563720360172-67b8f3dce741?q=80&w=1000&auto=format&fit=crop';
            const article = document.createElement('article');
            article.className = 'car-card';
            article.innerHTML = `
                <div class="car-img clickable-area"><img src="${imgSrc}" alt="${car.model}"></div>
                <h2 class="clickable-area">${car.model}</h2>
                <ul class="specs"><li>Класс: ${car.category.toUpperCase()}</li></ul>
                <div class="price">${car.price_per_day} ₽ / СУТКИ</div>
                <button class="btn-rent" data-model="${car.model}">Арендовать</button>
            `;
            catalog.appendChild(article);

            // Клик по кнопке "Арендовать" из сетки
            article.querySelector('.btn-rent').addEventListener('click', (e) => {
                openBookingModal(car.model);
            });

            // Клик по фото или заголовку - открытие страницы спецификации
            article.querySelectorAll('.clickable-area').forEach(el => {
                el.addEventListener('click', () => openCarDetails(car));
            });
        });
    }

    // Вынесли открытие модалки бронирования в отдельную функцию
    function openBookingModal(modelName) {
        document.getElementById('modal-model-name').textContent = modelName;
        if (searchStart.value) document.getElementById('start_date').value = searchStart.value;
        if (searchEnd.value) document.getElementById('end_date').value = searchEnd.value;
        document.getElementById('booking-modal').classList.add('is-open');
        document.body.style.overflow = 'hidden';
    }

    // --- НОВАЯ ЛОГИКА: ПОЛНОЭКРАННАЯ КАРТОЧКА ---
    const detailsOverlay = document.getElementById('car-details-overlay');
    const closeDetailsBtn = document.getElementById('close-details-btn');
    const detailsBody = document.getElementById('details-body');
    const otherCarsGrid = document.getElementById('other-cars-grid');

    closeDetailsBtn.addEventListener('click', () => {
        detailsOverlay.classList.remove('is-open');
        document.body.style.overflow = '';
    });

    function openCarDetails(car) {
        // Разбираем строку регламента из базы данных, делим по строкам и оборачиваем в <li>
        let techListHtml = '';
        if (car.tech_regulations) {
            techListHtml = car.tech_regulations
                .split('\n')
                .filter(line => line.trim() !== '')
                .map(line => `<li>> ${line.trim().toUpperCase()}</li>`)
                .join('');
        } else {
            // Запасной дефолтный вариант на случай отсутствия регламента в базе данных
            techListHtml = `
                <li>> ПРИВОД: 2WD / 4WD СИСТЕМА</li>
                <li>> ТРАНСМИССИЯ: АВТОМАТИЧЕСКАЯ</li>
                <li>> СТРАХОВКА: КАСКО (БЕЗ ФРАНШИЗЫ)</li>
                <li>> ТЕЛЕМАТИКА: ВСТРОЕННЫЙ КОМПЛЕКС</li>
                <li>> ТОПЛИВО: АИ-95 / ДТ (ВКЛЮЧЕНО)</li>
            `;
        }

        // Отрисовка основной информации об автомобиле
        const imgSrc = car.image_url || 'https://images.unsplash.com/photo-1563720360172-67b8f3dce741?q=80&w=1000&auto=format&fit=crop';
        detailsBody.innerHTML = `
            <div class="details-image-container">
                <img src="${imgSrc}" alt="${car.model}">
            </div>
            <div class="details-info-container">
                <div class="mono" style="color:var(--color-accent); font-weight:700; margin-bottom:8px;">[CLASS: ${car.category.toUpperCase()}]</div>
                <h1 class="details-title">${car.model}</h1>
                <div class="tech-reglament-box">
                    <div style="font-size:14px; font-weight:900; margin-bottom:16px; text-transform:uppercase;">ТЕХНИЧЕСКИЙ РЕГЛАМЕНТ АВТОМОБИЛЯ</div>
                    <ul>
                        ${techListHtml}
                    </ul>
                </div>
                <div class="details-price-row">
                    <div style="font-size:12px; font-weight:700;">ТАРИФ:</div>
                    <div class="details-price">${car.price_per_day} ₽/СУТ</div>
                </div>
                <button class="details-btn-rent" data-model="${car.model}">ИНИЦИАЛИЗИРОВАТЬ АРЕНДУ</button>
            </div>
        `;

        // Клик "Инициализировать аренду" внутри страницы авто
        detailsBody.querySelector('.details-btn-rent').addEventListener('click', (e) => {
            detailsOverlay.classList.remove('is-open'); // закрываем спецификацию
            openBookingModal(car.model); // открываем окно оплаты
        });

        // Отрисовка блока "Другие авто" (берем 3 штуки, кроме текущей)
        otherCarsGrid.innerHTML = '';
        const otherCars = allCars.filter(c => c.id !== car.id).slice(0, 3);

        otherCars.forEach(otherCar => {
            const otherImg = otherCar.image_url || 'https://images.unsplash.com/photo-1563720360172-67b8f3dce741?q=80&w=1000&auto=format&fit=crop';
            const article = document.createElement('article');
            article.className = 'car-card other-car-card clickable-area';
            article.innerHTML = `
                <div class="car-img"><img src="${otherImg}" alt="${otherCar.model}"></div>
                <h2 style="padding: 16px 16px 8px; font-size: 20px;">${otherCar.model}</h2>
                <div class="price" style="padding: 16px;">${otherCar.price_per_day} ₽ / СУТ</div>
            `;
            // При клике на "другое авто" обновляем содержимое окна с эффектом скролла
            article.addEventListener('click', () => {
                detailsOverlay.scrollTo({ top: 0, behavior: 'smooth' });
                setTimeout(() => openCarDetails(otherCar), 150); // Небольшая задержка для плавности
            });
            otherCarsGrid.appendChild(article);
        });

        // Показываем окно
        detailsOverlay.classList.add('is-open');
        document.body.style.overflow = 'hidden';
    }

    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderCars(btn.getAttribute('data-filter'));
        });
    });

    const modal = document.getElementById('booking-modal');
    const btnClose = document.getElementById('close-modal');
    const form = document.getElementById('booking-form');

    const closeModal = () => {
        modal.classList.remove('is-open');
        document.body.style.overflow = '';
        form.reset();
        document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
    };

    btnClose.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal(); });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        let isValid = true;
        const inputs = form.querySelectorAll('input[required]');
        // ПРАВИЛО ДЛЯ КАРТЫ (ровно 16 цифр)
        const rules = { passport: /^\d{4}\s\d{6}$/, license: /^.{10}$/, phone: /^\+7\d{10}$/, card_number: /^\d{16}$/ };

        inputs.forEach(input => {
            // Специальная проверка для чекбокса
            if (input.type === 'checkbox') {
                if (!input.checked) {
                    input.classList.add('error');
                    isValid = false;
                } else {
                    input.classList.remove('error');
                }
            } else {
                // Стандартная проверка для текста/дат
                const val = input.value.trim();
                if (val === '' || (rules[input.name] && !rules[input.name].test(val))) {
                    input.classList.add('error');
                    isValid = false;
                } else {
                    input.classList.remove('error');
                }
            }
        });

        if (isValid) {
            const token = localStorage.getItem('token');
            if (!token) {
                alert('Сначала войди в систему!');
                window.location.href = 'auth.html';
                return;
            }

            const modelName = document.getElementById('modal-model-name').textContent;
            const startDate = document.getElementById('start_date').value;
            const endDate = document.getElementById('end_date').value;
            const passport = document.getElementById('passport').value;
            const license = document.getElementById('license').value;

            const start = new Date(startDate);
            const end = new Date(endDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (start < today) {
                alert('Ошибка: Дата начала не может быть в прошлом!');
                return;
            }
            if (start > end) {
                alert('Ошибка: Дата завершения не может быть раньше даты начала!');
                return;
            }

            try {
                const res = await fetch('/api/bookings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({
                        car_model: modelName,
                        start_date: startDate,
                        end_date: endDate,
                        passport: passport,
                        license: license
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Ошибка сервера');

                // Передаем false (это не ошибка, а успех) и коллбэк на закрытие и обновление
                sysAlert('СТАТУС ТРАНЗАКЦИИ: ' + data.message, false, () => {
                    closeModal();
                    loadCars();
                });
            } catch (err) {
                // Вызываем красный алерт ошибки
                sysAlert('ОШИБКА: ' + err.message, true);
            }
        }
    });

    // Очистка ошибки при вводе текста ИЛИ клике по чекбоксу
    form.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', () => {
            if (input.classList.contains('error')) input.classList.remove('error');
        });
        input.addEventListener('change', () => {
            if (input.type === 'checkbox' && input.classList.contains('error')) input.classList.remove('error');
        });
    });

    // Загрузка по умолчанию без дат
    loadCars();
});