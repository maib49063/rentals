    document.addEventListener('DOMContentLoaded', () => {
        const token = localStorage.getItem('token');
        if (!token) {
            alert('ДОСТУП ЗАБЛОКИРОВАН. АВТОРИЗУЙТЕСЬ.');
            window.location.href = 'auth.html';
            return;
        }

        const headers = { 'Authorization': `Bearer ${token}` };

        const userEmailEl = document.getElementById('user-email');
        const passwordInput = document.getElementById('password');
        const passwordConfirmInput = document.getElementById('password_confirm');
        const passwordForm = document.getElementById('password-form');
        const bookingsContainer = document.getElementById('bookings-container');

        async function loadProfile() {
            try {
                const res = await fetch('/api/profile', { headers });
                if (!res.ok) {
                    if (res.status === 401 || res.status === 403) {
                        localStorage.removeItem('token');
                        window.location.href = 'auth.html';
                        return;
                    }
                    throw new Error('Не удалось загрузить данные профиля');
                }

                const data = await res.json();

                // Отображаем Email без всяких "паспортов системы"
                userEmailEl.textContent = data.user.email;

                // Рендерим заказы
                renderBookings(data.bookings);

            } catch (err) {
                bookingsContainer.innerHTML = `<div class="mono" style="color:var(--color-accent); font-weight:bold;">ERR_LOAD: ${err.message}</div>`;
            }
        }

        function renderBookings(bookings) {
            bookingsContainer.innerHTML = '';
            if (bookings.length === 0) {
                bookingsContainer.innerHTML = '<div class="mono" style="padding: 40px; border: 2px dashed #000; text-align: center;">НЕТ ЗАРЕГИСТРИРОВАННЫХ ИНТЕГРАЦИЙ В ПОТОК</div>';
                return;
            }

            bookings.forEach(b => {
                const start = new Date(b.start_date).toLocaleDateString('ru-RU');
                const end = new Date(b.end_date).toLocaleDateString('ru-RU');
                const statusText = b.status === 'active' ? 'АКТИВНО' : 'АННУЛИРОВАНО';
                const statusClass = b.status === 'active' ? 'status-active' : 'status-cancelled';

                const amountText = b.payment_amount ? `${parseFloat(b.payment_amount)} ₽` : 'РАСЧЕТ...';

                // Кнопка отмены активна только для статуса 'active'
                const cancelBtnHtml = b.status === 'active'
                    ? `<button class="btn-cancel-booking" data-id="${b.booking_id}">Отменить</button>`
                    : '';

                const div = document.createElement('div');
                div.className = 'booking-item';
                div.innerHTML = `
                <div class="booking-main">
                    <div class="booking-car">${b.car_model}</div>
                    <div class="booking-dates mono">${start} — ${end}</div>
                </div>
                <div class="booking-meta">
                    <div class="booking-price mono">${amountText}</div>
                    <div><span class="booking-status mono ${statusClass}">${statusText}</span></div>
                    ${cancelBtnHtml}
                </div>
            `;
                bookingsContainer.appendChild(div);
            });

            // Навешиваем обработчики на кнопки отмены
            document.querySelectorAll('.btn-cancel-booking').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const bookingId = e.target.getAttribute('data-id');
                    if (!confirm('Точно аннулировать бронирование машины?')) return;

                    try {
                        const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            }
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'Ошибка отмены');

                        alert('БРОНИРОВАНИЕ АННУЛИРОВАНО');
                        loadProfile(); // Перезагружаем список
                    } catch (err) {
                        alert('ОШИБКА: ' + err.message);
                    }
                });
            });
        }

        // Обработка смены пароля
        passwordForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const password = passwordInput.value;
            const password_confirm = passwordConfirmInput.value;

            if (password !== password_confirm) {
                alert('Пароли не совпадают!');
                return;
            }

            if (password.length < 8 || !/\d/.test(password)) {
                alert('Пароль должен быть от 8 символов и иметь хотя бы одну цифру!');
                return;
            }

            try {
                const res = await fetch('/api/profile/password', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ password, password_confirm })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Не удалось обновить пароль.');

                alert('ПАРОЛЬ ИЗМЕНЕН УСПЕШНО');
                passwordForm.reset();
            } catch (err) {
                alert('ОШИБКА: ' + err.message);
            }
        });

        loadProfile();
    });