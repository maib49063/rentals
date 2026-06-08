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

            // Рендерим обращения в поддержку
            renderTickets(data.tickets);

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

            const cancelBtnHtml = b.status === 'active'
                ? `<button class="btn-cancel-booking" data-id="${b.booking_id}">ОТМЕНИТЬ</button>`
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
                    <div class="booking-actions">
                        ${cancelBtnHtml}
                        <button class="btn-receipt" data-id="${b.booking_id}">ДОКУМЕНТ</button>
                    </div>
                </div>
                `;
            bookingsContainer.appendChild(div);
        });

        // 1. Обработчик для кнопки отмены
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
                    loadProfile();
                } catch (err) {
                    alert('ОШИБКА: ' + err.message);
                }
            });
        });

        // 2. Обработчик для скачивания PDF
        document.querySelectorAll('.btn-receipt').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const bookingId = e.target.getAttribute('data-id');
                const originalText = e.target.textContent;
                e.target.textContent = 'ГЕНЕРАЦИЯ...';

                try {
                    const res = await fetch(`/api/bookings/${bookingId}/document`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (!res.ok) {
                        const errorData = await res.json();
                        throw new Error(errorData.error || 'Не удалось сгенерировать документ');
                    }

                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(blob);

                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `RENTALS_DOC_${bookingId.substring(0, 8)}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();

                    window.URL.revokeObjectURL(url);
                    e.target.textContent = originalText;
                } catch (err) {
                    alert('ОШИБКА: ' + err.message);
                    e.target.textContent = originalText;
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

    function renderTickets(tickets) {
        const container = document.getElementById('tickets-container');
        
        // Защита, если HTML-блок еще не добавлен
        if (!container) return; 

        if (!tickets || tickets.length === 0) {
            container.innerHTML = '<div class="mono" style="padding: 40px; border: 2px dashed #000; text-align: center;">ОБРАЩЕНИЙ НЕ НАЙДЕНО</div>';
            return;
        }

        container.innerHTML = '';
        tickets.forEach(ticket => {
            const isAnswered = ticket.status === 'answered' && ticket.reply;
            const statusColor = isAnswered ? 'var(--color-accent)' : '#888';
            const statusText = isAnswered ? 'ОТВЕТ ПОЛУЧЕН' : 'В ОЖИДАНИИ';

            const div = document.createElement('div');
            div.style.border = '2px solid var(--color-text)';
            div.style.padding = '24px';
            div.style.marginBottom = '24px';
            div.style.backgroundColor = 'var(--color-bg)';

            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; border-bottom: 2px solid var(--color-text); padding-bottom: 8px; margin-bottom: 16px;">
                    <span class="mono" style="font-weight: 700;">ЗАПРОС ОТ ${new Date(ticket.created_at).toLocaleDateString('ru-RU')}</span>
                    <span class="mono" style="color: ${statusColor}; font-weight: 900;">[${statusText}]</span>
                </div>
                <div style="margin-bottom: 16px;">
                    <div class="tech-label mono">ВЫ ПИСАЛИ:</div>
                    <p style="margin: 8px 0; font-size: 14px;">${ticket.message}</p>
                </div>
                ${isAnswered ? `
                <div style="background: #f4f4f4; padding: 16px; border-left: 4px solid var(--color-accent); margin-top: 16px;">
                    <div class="tech-label mono" style="color: var(--color-accent);">ОТВЕТ АДМИНИСТРАТОРА:</div>
                    <p style="margin: 8px 0 0 0; font-size: 14px; font-weight: 700;">${ticket.reply}</p>
                </div>
                ` : ''}
            `;
            container.appendChild(div);
        });
    }
    
    // Запуск загрузки профиля при открытии страницы
    loadProfile();
});