/* ============================================================
   Carnet d'Entretien Automobile — JS principal
   Gestion API, toasts, alertes, sidebar véhicule
   ============================================================ */

const API = '/api';

// ---------- Toasts ----------
function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ---------- API helper ----------
async function apiGet(path) {
    const res = await fetch(API + path);
    if (!res.ok) throw new Error(`Erreur ${res.status}`);
    return res.json();
}

async function apiPost(path, body) {
    const res = await fetch(API + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erreur ${res.status}`);
    }
    return res.json();
}

async function apiPut(path, body) {
    const res = await fetch(API + path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Erreur ${res.status}`);
    return res.json();
}

async function apiDelete(path) {
    const res = await fetch(API + path, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Erreur ${res.status}`);
    return res.json();
}

// ---------- Format helpers ----------
function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatMoney(amount, currency = 'EUR') {
    if (amount === null || amount === undefined) return '—';
    const symbols = { EUR: '€', GBP: '£', CHF: 'CHF', USD: '$' };
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: currency,
        currencyDisplay: 'symbol',
    }).format(amount).replace('€', symbols[currency] || currency);
}

function formatKm(km) {
    if (km === null || km === undefined) return '—';
    return new Intl.NumberFormat('fr-FR').format(km) + ' km';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ---------- Sidebar vehicle info ----------
async function loadSidebarVehicle() {
    try {
        const v = await apiGet('/vehicle');
        const nameEl = document.getElementById('sv-name');
        const kmEl = document.getElementById('sv-km');
        if (nameEl) nameEl.textContent = `${v.brand} ${v.model} ${v.year}`;
        if (kmEl) kmEl.textContent = formatKm(v.current_mileage);
    } catch (e) { /* silencieux */ }
}

// ---------- Alertes ----------
let alertsPanelOpen = false;

function toggleAlerts() {
    alertsPanelOpen = !alertsPanelOpen;
    document.getElementById('alerts-panel').classList.toggle('open', alertsPanelOpen);
    document.getElementById('alerts-overlay').classList.toggle('open', alertsPanelOpen);
    if (alertsPanelOpen) loadAlertsPanel();
}

async function loadAlertsPanel() {
    const listEl = document.getElementById('alerts-list');
    listEl.innerHTML = '<p class="text-muted">Chargement…</p>';
    try {
        const alerts = await apiGet('/alerts?dismissed=false');
        if (!alerts.length) {
            listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><h3>Aucune alerte</h3><p>Tout est en ordre.</p></div>';
            return;
        }
        listEl.innerHTML = alerts.map(a => `
            <div class="alert-item severity-${a.severity}">
                <button class="dismiss-btn" onclick="dismissAlert(${a.id})" title="Ignorer">✕</button>
                <h5>${escapeHtml(a.title)}</h5>
                <p>${escapeHtml(a.message)}</p>
                <small class="text-muted">${formatDate(a.created_at)}</small>
            </div>
        `).join('');
    } catch (e) {
        listEl.innerHTML = '<p class="text-danger">Erreur de chargement</p>';
    }
}

async function dismissAlert(id) {
    try {
        await apiPost(`/alerts/${id}/dismiss`, {});
        loadAlertsPanel();
        loadAlertBadge();
        showToast('Alerte ignorée', 'success');
    } catch (e) {
        showToast('Erreur', 'error');
    }
}

async function loadAlertBadge() {
    try {
        const alerts = await apiGet('/alerts?dismissed=false');
        const badge = document.getElementById('alert-badge');
        const urgent = alerts.filter(a => a.severity === 'urgent' || a.severity === 'en_retard').length;
        if (alerts.length > 0) {
            badge.style.display = 'flex';
            badge.textContent = alerts.length;
            badge.style.background = urgent > 0 ? 'var(--danger)' : 'var(--warning)';
        } else {
            badge.style.display = 'none';
        }
    } catch (e) { /* silencieux */ }
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
    loadSidebarVehicle();
    loadAlertBadge();
    const bell = document.getElementById('alert-bell');
    if (bell) bell.addEventListener('click', toggleAlerts);

    // Rafraîchir le badge toutes les 60s
    setInterval(loadAlertBadge, 60000);
});

// ---------- Badges helpers ----------
function statusBadge(status) {
    const map = {
        'ok': '<span class="badge badge-success">✓ À jour</span>',
        'soon': '<span class="badge badge-warning">⚠ Bientôt</span>',
        'overdue': '<span class="badge badge-danger">✕ En retard</span>',
    };
    return map[status] || '<span class="badge badge-muted">' + status + '</span>';
}

function severityBadge(severity) {
    const map = {
        'info': '<span class="badge badge-info">ℹ Info</span>',
        'attention': '<span class="badge badge-warning">⚠ Attention</span>',
        'warning': '<span class="badge badge-warning">⚠ Attention</span>',
        'urgent': '<span class="badge badge-danger">🔴 Urgent</span>',
        'en_retard': '<span class="badge badge-critical">🔴 En retard</span>',
    };
    return map[severity] || `<span class="badge badge-muted">${severity}</span>`;
}

function docTypeBadge(type) {
    const map = {
        'facture': '🧾 Facture',
        'controle_technique': '🔍 Contrôle technique',
        'devis': '📋 Devis',
        'recu': '🧾 Reçu',
        'autre': '📄 Autre',
    };
    return map[type] || type;
}

function countryFlag(country) {
    const flags = {
        'France': '🇫🇷', 'Italie': '🇮🇹', 'Royaume-Uni': '🇬🇧',
        'Allemagne': '🇩🇪', 'Espagne': '🇪🇸', 'Belgique': '🇧🇪',
        'Pays-Bas': '🇳🇱', 'Suisse': '🇨🇭', 'Portugal': '🇵🇹', 'Luxembourg': '🇱🇺',
    };
    return flags[country] || '🌍';
}

function langFlag(lang) {
    const flags = {
        'fr': '🇫🇷', 'en': '🇬🇧', 'it': '🇮🇹', 'de': '🇩🇪',
        'es': '🇪🇸', 'pt': '🇵🇹', 'nl': '🇳🇱',
    };
    return flags[lang] || '🌍';
}
