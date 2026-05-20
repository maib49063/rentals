document.addEventListener('DOMContentLoaded', () => {
    const catalog = document.getElementById('catalog');
    let allCars = [];

    // Запрещаем выбирать даты в прошлом в календаре
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('start_date').setAttribute('min', todayStr);
    document.getElementById('end_date').setAttribute('min', todayStr);

    async function loadCars() {
        try {
            const res = await fetch('/api/cars');
            const data = await res.json();
            allCars = data.cars;
            renderCars('all');
        } catch (err) {
            catalog.innerHTML = '<h2>Ошибка связи с сервером.</h2>';
        }
    }

    function renderCars(filterCategory) {
        catalog.innerHTML = '';
        const filtered = filterCategory === 'all' ? allCars : allCars.filter(c => c.category === filterCategory);

        if (filtered.length === 0) {
            catalog.innerHTML = '<div style="grid-column: 1/-1; padding: 40px; border: 2px dashed #000; text-align: center;">В ДАННОЙ КАТЕГОРИИ НЕТ СВОБОДНЫХ МАШИН</div>';
            return;
        }

        filtered.forEach(car => {
            const imgSrc = car.image_url || 'https://images.unsplash.com/photo-1563720360172-67b8f3dce741?q=80&w=1000&auto=format&fit=crop';
            const article = document.createElement('article');
            article.className = 'car-card';
            article.innerHTML = `
                <div class="car-img"><img src="${imgSrc}" alt="${car.model}"></div>
                <h2>${car.model}</h2>
                <ul class="specs"><li>Класс: ${car.category.toUpperCase()}</li></ul>
                <div class="price">${car.price_per_minute} ₽ / МИН</div>
                <button class="btn-rent" data-model="${car.model}">Арендовать</button>
            `;
            catalog.appendChild(article);
        });

        document.querySelectorAll('.btn-rent').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.getElementById('modal-model-name').textContent = e.target.getAttribute('data-model');
                document.getElementById('booking-modal').classList.add('is-open');
                document.body.style.overflow = 'hidden';
            });
        });
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
        const rules = { passport: /^\d{4}\s\d{6}$/, license: /^.{10}$/, phone: /^\+7\d{10}$/ };

        inputs.forEach(input => {
            const val = input.value.trim();
            if (val === '' || (rules[input.name] && !rules[input.name].test(val))) {
                input.classList.add('error');
                isValid = false;
            } else {
                input.classList.remove('error');
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
                // ВОТ ЗДЕСЬ Я ДОБАВИЛ ПАСПОРТ И ПРАВА В ОТПРАВКУ
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

                alert('УСПЕХ: ' + data.message);
                closeModal();
                loadCars();
            } catch (err) { alert('ОШИБКА: ' + err.message); }
        }
    });

    form.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', () => { if (input.classList.contains('error')) input.classList.remove('error'); });
    });

    loadCars();
});