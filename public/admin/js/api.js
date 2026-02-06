// API helper for admin dashboard
const API = {
    baseUrl: '/api',

    async request(method, path, body = null) {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin'
        };
        if (body) options.body = JSON.stringify(body);

        const res = await fetch(`${this.baseUrl}${path}`, options);
        const data = await res.json();

        if (!res.ok) {
            if (res.status === 401) {
                window.location.href = '/admin/login.html';
                throw new Error('Session expired');
            }
            throw new Error(data.error || 'Request failed');
        }
        return data;
    },

    get(path) { return this.request('GET', path); },
    post(path, body) { return this.request('POST', path, body); },
    put(path, body) { return this.request('PUT', path, body); },

    // Auth
    login(data) { return this.post('/auth/admin/login', data); },
    logout() { return this.post('/auth/logout'); },

    // Admin
    dashboard() { return this.get('/admin/dashboard'); },
    affiliates(params = '') { return this.get(`/admin/affiliates${params}`); },
    affiliateDetail(id) { return this.get(`/admin/affiliates/${id}`); },
    updateAffiliateStatus(id, status) { return this.put(`/admin/affiliates/${id}/status`, { status }); },
    referrals(params = '') { return this.get(`/admin/referrals${params}`); },
    payouts(params = '') { return this.get(`/admin/payouts${params}`); },
    processPayout(id, data) { return this.put(`/admin/payouts/${id}`, data); },
    webhookLogs(params = '') { return this.get(`/admin/webhooks/logs${params}`); },
};

function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatCurrency(amount) {
    const num = parseFloat(amount) || 0;
    return `$${num.toFixed(2)}`;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

function statusBadge(status) {
    return `<span class="badge badge-${status}">${status.replace('_', ' ')}</span>`;
}

function renderPagination(container, pagination, onPageChange) {
    const { page, pages, total } = pagination;
    if (pages <= 1) { container.innerHTML = ''; return; }

    let html = `<span class="page-info">${total} total</span>`;
    html += `<button ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">← Prev</button>`;
    const start = Math.max(1, page - 2);
    const end = Math.min(pages, page + 2);
    for (let i = start; i <= end; i++) {
        html += `<button class="${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    html += `<button ${page >= pages ? 'disabled' : ''} data-page="${page + 1}">Next →</button>`;
    container.innerHTML = html;
    container.querySelectorAll('button[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            const p = parseInt(btn.dataset.page);
            if (p >= 1 && p <= pages) onPageChange(p);
        });
    });
}

function initSidebar() {
    const hamburger = document.querySelector('.hamburger');
    const sidebar = document.querySelector('.sidebar');
    if (hamburger && sidebar) {
        hamburger.addEventListener('click', () => sidebar.classList.toggle('open'));
        document.addEventListener('click', (e) => {
            if (!sidebar.contains(e.target) && !hamburger.contains(e.target)) sidebar.classList.remove('open');
        });
    }
}

async function handleLogout() {
    try { await API.logout(); } catch(e) {}
    window.location.href = '/admin/login.html';
}

document.addEventListener('DOMContentLoaded', initSidebar);
