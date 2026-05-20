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

    const token = localStorage.getItem('token');
    if (token) {
        const headerAuth = document.getElementById('header-auth-link');
        const mobileAuth = document.getElementById('mobile-auth-link');
        const logoutHtml = '<a href="#" class="logout-btn accent">ВЫХОД</a>';

        if (headerAuth) headerAuth.outerHTML = logoutHtml;
        if (mobileAuth) mobileAuth.outerHTML = logoutHtml;

        document.querySelectorAll('.logout-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.removeItem('token');
                window.location.reload();
            });
        });
    }
});