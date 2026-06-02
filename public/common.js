document.addEventListener('DOMContentLoaded', () => {
    const btnOpen = document.getElementById('open-menu');
    const btnClose = document.getElementById('close-menu');
    const menu = document.getElementById('mobile-menu');

    if (btnOpen && btnClose && menu) {
        btnOpen.addEventListener('click', () => {
            menu.classList.add('is-open');
            document.body.style.overflow = 'hidden';
        });
        btnClose.addEventListener('click', () => {
            menu.classList.remove('is-open');
            const modal = document.getElementById('booking-modal');
            if (!modal || !modal.classList.contains('is-open')) document.body.style.overflow = '';
        });
    }

    // --- ЗАМЕНИ ЭТОТ КУСОК В common.js ---
    const token = localStorage.getItem('token');
    if (token) {
        const headerAuth = document.getElementById('header-auth-link');
        const mobileAuth = document.getElementById('mobile-auth-link');

        // Добавили ссылку на Кабинет рядом с Кнопкой выхода
        const logoutHtml = `
            <a href="profile.html" style="margin-right:16px;">КАБИНЕТ</a>
            <a href="#" class="logout-btn accent">ВЫХОД</a>
        `;

        if (headerAuth) headerAuth.outerHTML = logoutHtml;
        if (mobileAuth) mobileAuth.outerHTML = logoutHtml;

        document.querySelectorAll('.logout-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.removeItem('token');
                window.location.href = 'index.html'; // Выкидываем на главную при логауте
            });
        });
    }
});

// --- ДОБАВИТЬ В КОНЕЦ common.js ---

document.addEventListener('DOMContentLoaded', () => {
    // Автоматически внедряем структуру алерта, если ее еще нет на странице
    if (!document.getElementById('sys-alert-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'sys-alert-overlay';
        overlay.className = 'sys-alert-overlay';
        overlay.innerHTML = `
            <div class="sys-alert-box">
                <div class="sys-alert-header" id="sys-alert-header">[SYS.MSG.ERROR]</div>
                <div class="sys-alert-text" id="sys-alert-text">ТЕКСТ ОШИБКИ</div>
                <button class="sys-alert-btn" id="sys-alert-btn">[ ИНИЦИАЛИЗИРОВАТЬ ОК ]</button>
            </div>
        `;
        document.body.appendChild(overlay);
    }
});

/**
 * Кастомный системный алерт
 * @param {string} message - Текст сообщения
 * @param {boolean} isError - true для ошибки (красный), false для успеха (зеленый)
 * @param {function} callback - Функция, которая выполнится строго ПОСЛЕ закрытия алерта
 */
window.sysAlert = (message, isError = true, callback = null) => {
    const overlay = document.getElementById('sys-alert-overlay');
    const header = document.getElementById('sys-alert-header');
    const text = document.getElementById('sys-alert-text');
    const btn = document.getElementById('sys-alert-btn');

    if (!overlay || !header || !text || !btn) return;

    // Стилизуем под тип сообщения
    header.textContent = isError ? '[SYS.MSG.ERROR]' : '[SYS.MSG.SUCCESS]';
    header.style.color = isError ? 'var(--color-accent)' : '#008000';

    text.textContent = message;

    // Показываем окно
    overlay.classList.add('is-visible');
    document.body.style.overflow = 'hidden';

    // Очищаем предыдущие обработчики событий (клонированием кнопки)
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', () => {
        overlay.classList.remove('is-visible');
        document.body.style.overflow = '';
        if (callback && typeof callback === 'function') {
            callback();
        }
    });
};