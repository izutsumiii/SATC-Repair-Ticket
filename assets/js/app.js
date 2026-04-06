// Global state
let allTickets = [];
let statusChart = null;
let riskChart = null;
let trendChart = null;
let teamWorkloadChart = null;
let completionPendingChart = null;
let activeTab = 'dashboard'; // Track active tab
let refreshInterval = null;  // Handle for the interval

// Sidebar toggle function
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebarToggle');
    const icon = toggleBtn.querySelector('i');

    document.body.classList.add('sidebar-resizing');
    sidebar.classList.toggle('collapsed');
    const collapsed = sidebar.classList.contains('collapsed');
    document.body.classList.toggle('sidebar-layout-collapsed', collapsed);

    if (collapsed) {
        icon.classList.remove('fa-chevron-left');
        icon.classList.add('fa-chevron-right');
    } else {
        icon.classList.remove('fa-chevron-right');
        icon.classList.add('fa-chevron-left');
    }

    window.setTimeout(function () {
        document.body.classList.remove('sidebar-resizing');
    }, 320);
}

// --- CONFIGURATION ---
// Set to 'php' (local) or 'gas' (Google Apps Script)
const API_MODE = 'gas';

// Real GAS /exec URL: prefer api/config.php (injected as window.GAS_CONFIG) so api/gas_proxy.php can forward server-side.
const GAS_URL = (typeof window.GAS_CONFIG !== 'undefined' && window.GAS_CONFIG.webappUrl)
    ? window.GAS_CONFIG.webappUrl
    : 'https://script.google.com/macros/s/AKfycbwqqTB1TTHP4wMWr9j6A1F8QRVopOTLDqUPZwEciFNg6X4EG6w_cMxp7s2OV3AlLBhqhQ/exec';
/** When true (set in index.php), fetch goes to api/gas_proxy.php — avoids browser→Google CORS, redirects, and cache issues. */
const GAS_USE_PROXY = typeof window.GAS_CONFIG !== 'undefined' && window.GAS_CONFIG.useProxy === true;
window.GAS_URL = GAS_URL;

/** Target URL for each GAS request (direct /exec with _cb, or same-origin proxy + _cb). */
function gasWebAppUrl() {
    const bust = '_cb=' + Date.now();
    if (GAS_USE_PROXY) {
        return 'api/gas_proxy.php?' + bust;
    }
    const sep = GAS_URL.includes('?') ? '&' : '?';
    return `${GAS_URL}${sep}${bust}`;
}
window.gasWebAppUrl = gasWebAppUrl;

/** If response is an error, try to read { error } from JSON (e.g. api/gas_proxy.php curl message). */
async function gasReadErrorFromBody(response) {
    try {
        const j = await response.clone().json();
        if (j && j.error != null && String(j.error).trim() !== '') {
            return String(j.error).trim();
        }
    } catch (e) { /* not JSON */ }
    return '';
}

/** GAS returns JSON; treat success as true only when there is no error field. */
function gasSaveSucceeded(result) {
    if (!result || result.error != null) return false;
    const s = result.success;
    return s === true || s === 'true' || s === 1;
}

// GAS TROUBLESHOOTING — if tickets do not appear in your Google Sheet or the site:
// A. Binding: Writes go to ONE spreadsheet. Either open the script from Extensions → Apps Script ON
//    that sheet, OR in scripts/google_apps_script.js set CONFIG.SPREADSHEET_ID to the master file ID
//    from the URL (.../d/SHEET_ID/edit), paste into Apps Script, redeploy, re-authorize if prompted.
// B. Deployment URL: Deploy → Manage deployments → copy /exec URL; it must match GAS_URL above exactly.
// C. New version: After editing code in the Apps Script editor, Edit deployment → New version → Deploy.
// D. Executions: Apps Script → Executions — after Save, doPost should run; open failures for errors.
// E. Sheet tab: scripts/google_apps_script.js CONFIG.SHEET_NAME must match a tab (default "REPAIR").
// F. Headers: JO NUMBER column must exist and map to ticket_id (see COLUMN_MAP in that file).
// G. Network: DevTools → Network → POST to api/gas_proxy.php (or .../exec if proxy off) → JSON from script.
// G2. Ticket list uses POST { action: 'read' } (not GET) so new rows appear right after create; GET is often cached.
// H. Deploy access: "Who has access" = Anyone (or your org) so PHP cURL can call the web app.
// I. Run app over http://localhost/... (XAMPP), not file://
// J. Console: testGasConnection() — tests GET via proxy or direct.
// K. gas_webapp_url in api/config.php must match your deployment; GAS_USE_PROXY in index.php uses server-side forward.

// Auto-refresh interval (ms). GAS reads can take several seconds; 2s stacks requests and PHP session locks — use a longer interval in gas mode.
const REFRESH_RATE = API_MODE === 'gas' ? 15000 : 2000;

// Risk Keywords Configuration
const RISK_RULES = {
    high: ['fiber cut', 'damage connector', 'damaged connector', 'los', 'loss of signal', 'red los', 'cut'],
    medium: ['blinking red', 'active no internet', 'activate no internet', 'ani','act no int'],
    low: ['pon', 'change modem', 'no power', 'intermittent', 'slow browse']
};

function calculateRisk(description) {
    const raw = String(description || '');
    const desc = raw.toLowerCase();

    // If there is no description at all, treat as No Risk / N/A
    if (!raw.trim()) return 'No Risk';
    
    // Check High Risk first
    if (RISK_RULES.high.some(k => desc.includes(k))) return 'High Risk';
    
    // Then Moderate
    if (RISK_RULES.medium.some(k => desc.includes(k))) return 'Moderate Risk';
    
    // Then Low
    if (RISK_RULES.low.some(k => desc.includes(k))) return 'Low Risk';
    
    // Default Fallback when description doesn't match any keyword
    return 'Unknown Risk'; 
}

/** Combined text for risk rules (aligns with GAS: DESCRIPTION + ISSUE). */
function ticketRiskText(t) {
    const d = t && t.description != null ? String(t.description).trim() : '';
    const i = t && t.issue != null ? String(t.issue).trim() : '';
    return [d, i].filter(Boolean).join(' ');
}

/** Issue column: ISSUE field only (no description fallback in the table). */
function ticketIssueDisplay(t) {
    if (!t || t.issue == null) return '';
    const s = String(t.issue).trim();
    return s;
}

function ticketCitySource(t) {
    return String((t && (t.city || t.municipality)) || '').trim();
}

function ticketClusterSource(t) {
    return String((t && (t.risk_level_source || t.cluster)) || '').trim();
}
// ---------------------

/**
 * @param {string} params - query string e.g. action=read
 * @param {boolean} bustCache - GAS web apps cache GET /exec responses; bust to see fresh sheet data after POST
 */
function getApiUrl(params = '', bustCache = false) {
    if (API_MODE === 'gas') {
        const separator = GAS_URL.includes('?') ? '&' : '?';
        let url = `${GAS_URL}${separator}${params}`;
        if (bustCache) {
            url += '&_cb=' + Date.now();
        }
        return url;
    }
    return `api/api.php?${params}`;
}

/**
 * Load ticket list from GAS using POST. Google may cache GET /exec; POST with identical URL+body
 * can still be cached by intermediaries — always use gasWebAppUrl() + cache: 'no-store'.
 * Uses text/plain body (same as saveTicket) to avoid CORS preflight.
 */
async function fetchGasTickets() {
    return fetch(gasWebAppUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'read' }),
        cache: 'no-store'
    });
}

/** Run in browser console (F12 â†’ Console): testGasConnection()
 * Tests if the GAS URL is reachable and logs the real error if not. */
window.testGasConnection = async function () {
    console.log('Testing GAS URL:', GAS_URL);
    try {
        const r = await fetch(gasWebAppUrl(), { method: 'GET', cache: 'no-store' });
        console.log('Status:', r.status, r.statusText);
        const text = await r.text();
        console.log('Response (first 300 chars):', text.slice(0, 300));
        if (r.ok) console.log('OK â€“ GAS URL is reachable.');
        else console.warn('GAS returned error status. Check your script and deployment.');
    } catch (e) {
        console.error('Connection failed:', e.message);
        console.error('This is usually: wrong URL, GAS not "Anyone", or opening app from file://');
    }
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    if (API_MODE === 'gas' && GAS_URL.includes('YOUR_GOOGLE_SCRIPT')) {
        alert("Please set your Google Apps Script Web App URL in assets/js/app.js!");
    }
    showTab('dashboard');
    startAutoRefresh();

    const addUserSubmit = document.getElementById('addUserSubmit');
    const addUserForm = document.getElementById('addUserForm');
    if (addUserSubmit && addUserForm) {
        addUserSubmit.addEventListener('click', async () => {
            const email = (addUserForm.querySelector('[name="email"]') || {}).value;
            const display_name = (addUserForm.querySelector('[name="display_name"]') || {}).value;
            const role = (addUserForm.querySelector('[name="role"]') || {}).value;
            if (!email || !email.trim()) {
                showToast('Email is required.', 'error');
                return;
            }
            const trimmedEmail = email.trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
                showToast('Please enter a valid email address.', 'error');
                return;
            }
            const originalLabel = addUserSubmit.innerHTML;
            addUserSubmit.disabled = true;
            addUserSubmit.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Adding...';
            const minLoadingMs = 600;
            const startTime = Date.now();
            try {
                const r = await fetch('api/users.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: trimmedEmail, display_name: display_name.trim(), role: role || 'staff' })
                });
                const data = await r.json().catch(() => ({}));
                if (r.ok && data.success) {
                    if (data.email_sent) {
                        showToast('User created. Login details have been sent to their email.', 'success');
                    } else {
                        showToast((data.email_error || 'User created. Email could not be sent; send credentials manually.'), 'info');
                    }
                    addUserForm.reset();
                    bootstrap.Modal.getInstance(document.getElementById('addUserModal'))?.hide();
                    if (activeTab === 'users') await loadUsersManagement();
                } else {
                    showToast(data.error || 'Failed to add user.', 'error');
                }
            } catch (e) {
                showToast('Request failed.', 'error');
            } finally {
                const elapsed = Date.now() - startTime;
                const wait = Math.max(0, minLoadingMs - elapsed);
                setTimeout(() => {
                    addUserSubmit.disabled = false;
                    addUserSubmit.innerHTML = originalLabel;
                }, wait);
            }
        });
    }

    // Use event delegation so Month/Year filter works even if dashboard DOM is updated
    const dashboardView = document.getElementById('dashboard-view');
    if (dashboardView) {
        dashboardView.addEventListener('change', function(e) {
            if (e.target && (e.target.id === 'dashboard-month' || e.target.id === 'dashboard-year')) {
                updateDashboard();
            }
        });
    }

    // Repair Team: clickable ID opens read-only ticket details popup
    document.body.addEventListener('click', function(e) {
        const el = e.target.closest('.ticket-id-view-link');
        if (!el) return;
        e.preventDefault();
        const json = el.getAttribute('data-ticket-json');
        if (json) {
            try {
                const ticket = JSON.parse(json.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
                viewTicket(ticket);
            } catch (err) { console.error(err); }
        }
    });
    document.body.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const el = e.target.closest('.ticket-id-view-link');
        if (!el) return;
        e.preventDefault();
        const json = el.getAttribute('data-ticket-json');
        if (json) {
            try {
                const ticket = JSON.parse(json.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
                viewTicket(ticket);
            } catch (err) { console.error(err); }
        }
    });

    // Auto-update Risk Level when Description matches issue keywords (ticket modal)
    const descField = document.querySelector('#ticketForm textarea[name="description"]');
    const riskSelect = document.querySelector('#ticketForm select[name="risk_level"]');
    if (descField && riskSelect) {
        descField.addEventListener('input', function() {
            const risk = calculateRisk(this.value);
            const value = risk === 'No Risk' ? 'Unknown Risk' : risk;
            if (riskSelect.querySelector(`option[value="${value}"]`)) {
                riskSelect.value = value;
            }
        });
    }

    // Toggle Actions header background extension only when scrolling horizontally
    const ticketsWrapper = document.querySelector('.tickets-table-wrapper');
    if (ticketsWrapper) {
        ticketsWrapper.addEventListener('scroll', function() {
            this.classList.toggle('scrolled-horizontal', this.scrollLeft > 0);
        });
        ticketsWrapper.classList.toggle('scrolled-horizontal', ticketsWrapper.scrollLeft > 0);
    }
});

// Auto Refresh Logic
function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        // Skip auto-refresh on Dashboard and Clusters tabs so user context is not interrupted.
        // Other tabs (tickets, analytics, teams) remain real-time via auto-refresh.
        if (activeTab === 'dashboard' || activeTab === 'clusters') return;

        console.log("Auto-refreshing data...");
        const currentScroll = window.scrollY;
        const currentTabScroll = document.querySelector('.table-responsive') ? document.querySelector('.table-responsive').scrollTop : 0;

        refreshCurrentTab().then(() => {
             // Restore Scroll? 
             // Actually, the issue is that re-rendering HTML wipes the DOM and resets scroll.
             // We need to be smarter.
             // If we are in 'tickets' tab, we are re-rendering the table.
             // If we are in 'analytics', we are re-rendering charts/KPIs.
             
             // Simple fix: Restore window scroll
             // Note: This might be jumpy. Ideally, we diff data.
        });
        
    }, REFRESH_RATE);
}

async function refreshCurrentTab() {
    if (activeTab === 'dashboard') await loadDashboard();
    else if (activeTab === 'clusters') await loadClusters();
    else if (activeTab === 'tickets') await loadTickets(true); // Preserve filters during auto-refresh
    else if (activeTab === 'analytics') await loadAnalytics();
    else if (activeTab === 'teams') await loadTeams();
    else if (activeTab === 'users') await loadUsersManagement();
}

// Navigation
function showTab(tabId) {
    activeTab = tabId; // Update active state
    
    // Hide all views
    ['dashboard-view', 'clusters-view', 'analytics-view', 'tickets-view', 'teams-view', 'users-view'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden-section');
    });
    // Remove active class from nav
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    
    // Show selected view
    const viewEl = document.getElementById(tabId + '-view');
    if (viewEl) viewEl.classList.remove('hidden-section');
    // Set active nav (approximate match)
    const navLink = document.querySelector(`.nav-link[onclick="showTab('${tabId}')"]`);
    if (navLink) navLink.classList.add('active');

    // Load specific data
    refreshCurrentTab();
}
window.showTab = showTab;

// --- Dashboard ---
// Filter dashboard by Month/Year. Year only = all data for that year; Month + Year = that month only. Uses date_created from sheet.
function updateDashboard() {
    if (!allTickets) allTickets = [];
    const regionEl = document.getElementById('dashboard-region');
    const monthEl = document.getElementById('dashboard-month');
    const yearEl = document.getElementById('dashboard-year');
    const regionVal = (regionEl && regionEl.value) ? String(regionEl.value).trim() : '';
    const monthVal = (monthEl && monthEl.value != null) ? String(monthEl.value).trim() : '';
    const yearVal = (yearEl && yearEl.value != null) ? String(yearEl.value).trim() : '';
    const month = (monthVal !== '' && !isNaN(parseInt(monthVal, 10))) ? parseInt(monthVal, 10) : 0;
    const year = (yearVal !== '' && !isNaN(parseInt(yearVal, 10))) ? parseInt(yearVal, 10) : 0;

    let filtered = allTickets;
    
    // Filter by year/month
    if (year) {
        if (month >= 1 && month <= 12) {
            const monthIndex = month - 1;
            filtered = filtered.filter(t => {
                const d = parseDateSafe(t.date_created);
                return d && d.getFullYear() === year && d.getMonth() === monthIndex;
            });
        } else {
            // Year only: show all data for that year
            filtered = filtered.filter(t => {
                const d = parseDateSafe(t.date_created);
                return d && d.getFullYear() === year;
            });
        }
    }

    // Filter by region
    if (regionVal) {
        const REGION_DEFS = {
            bukidnon: {
                type: 'city',
                areas: [
                    { key: 'VALENCIA', label: 'Valencia City' },
                    { key: 'MALAYBALAY', label: 'Malaybalay City' },
                    { key: 'MARAMAG', label: 'Maramag' },
                    { key: 'QUEZON', label: 'Quezon' },
                    { key: 'DON CARLOS', label: 'Don Carlos' },
                    { key: 'MANOLO FORTICH', label: 'Manolo Fortich' },
                    { key: 'IMPASUGONG', label: 'Impasugong' },
                    { key: 'SAN FERNANDO', label: 'San Fernando' }
                ]
            },
            davao_city: {
                type: 'cluster',
                areas: [
                    { key: 'NORTH', label: 'North' },
                    { key: 'SOUTH', label: 'South' },
                    { key: 'CENTRO', label: 'Centro' }
                ]
            },
            davao_del_sur: {
                type: 'city',
                areas: [{ key: 'DIGOS', label: 'Digos' }]
            },
            cotabato: {
                type: 'city',
                areas: [{ key: 'KIDAPAWAN', label: 'Kidapawan' }]
            },
            cdo: {
                type: 'city',
                areas: [{ key: 'CDO', label: 'CDO' }]
            },
            davao_del_norte: {
                type: 'city',
                areas: [
                    { key: 'PANABO', label: 'Panabo City' },
                    { key: 'TAGUM', label: 'Tagum City' },
                    { key: 'CARMEN', label: 'Carmen' }
                ]
            },
            misamis_oriental: {
                type: 'city',
                areas: [
                    { key: 'TAGOLOAN', label: 'Tagoloan' },
                    { key: 'VILLANUEVA', label: 'Villanueva' },
                    { key: 'BALINGASAG', label: 'Balingasag' },
                    { key: 'GINGOOG', label: 'Gingoog' }
                ]
            }
        };

        const regionDef = REGION_DEFS[regionVal];
        if (regionDef) {
            filtered = filtered.filter(t => {
                const cityUpper = ticketCitySource(t).toUpperCase();
                const clusterUpper = ticketClusterSource(t).toUpperCase();

                return regionDef.areas.some(a => {
                    if (regionDef.type === 'city') {
                        return cityUpper.indexOf(a.key) !== -1;
                    } else if (regionDef.type === 'cluster') {
                        return clusterUpper.indexOf(a.key) !== -1;
                    }
                    return false;
                });
            });
        }
    }

    const stats = calculateStats(filtered);
    const cardsEl = document.getElementById('summary-cards');
    if (cardsEl) renderSummaryCards(stats);
    try {
        const statusCtx = document.getElementById('statusChart');
        const riskCtx = document.getElementById('riskChart');
        if (statusCtx && riskCtx) renderDashboardCharts(stats);
    } catch (err) {
        console.warn('Dashboard charts update skipped:', err);
    }
}

async function loadDashboard() {
    try {
        const response = API_MODE === 'gas'
            ? await fetchGasTickets()
            : await fetch(getApiUrl('action=read', true), { cache: 'no-store' });
        if (!response.ok) {
            const detail = await gasReadErrorFromBody(response);
            const el = document.getElementById('summary-cards');
            if (el) {
                el.innerHTML = `<div class="col-12 text-center text-danger">Error: server returned ${response.status}.${detail ? ' ' + escapeHtml(detail) : ' Check GAS deployment and api/config.php gas_webapp_url.'}</div>`;
            }
            return;
        }
        const raw = await response.json();

        if (raw.error) {
            document.getElementById('summary-cards').innerHTML = `<div class="col-12 text-center text-danger">Error: ${raw.error}</div>`;
            return;
        }

        allTickets = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.tickets) ? raw.tickets : []);
        updateDashboard();
    } catch (e) {
        console.error("Error loading dashboard:", e);
        document.getElementById('summary-cards').innerHTML = `<div class="col-12 text-center text-danger">Failed to load data. Check console.</div>`;
    }
}

// --- Clusters ---
// Month/Year filter + Region dropdown (Bukidnon, Davao City, Davao Del Sur, Cotabato).
// Uses CLUSTER (column M -> risk_level_source) and CITY/MUNICIPALITY (column N -> city).
function updateClusters() {
    if (!allTickets) allTickets = [];
    const monthEl = document.getElementById('clusters-month');
    const yearEl = document.getElementById('clusters-year');
    const regionEl = document.getElementById('clusters-region');

    const monthVal = (monthEl && monthEl.value != null) ? String(monthEl.value).trim() : '';
    const yearVal = (yearEl && yearEl.value != null) ? String(yearEl.value).trim() : '';
    const regionVal = (regionEl && regionEl.value != null) ? String(regionEl.value).trim() : '';

    const month = (monthVal !== '' && !isNaN(parseInt(monthVal, 10))) ? parseInt(monthVal, 10) : 0;
    const year = (yearVal !== '' && !isNaN(parseInt(yearVal, 10))) ? parseInt(yearVal, 10) : 0;

    // 1) Filter by Month/Year (same as dashboard)
    let filtered = allTickets;
    if (year) {
        if (month >= 1 && month <= 12) {
            const monthIndex = month - 1;
            filtered = allTickets.filter(t => {
                const d = parseDateSafe(t.date_created);
                return d && d.getFullYear() === year && d.getMonth() === monthIndex;
            });
        } else {
            filtered = allTickets.filter(t => {
                const d = parseDateSafe(t.date_created);
                return d && d.getFullYear() === year;
            });
        }
    }

    // 1b) Only PENDING: Reschedule + On Hold + Pull Out + For Dispatch + Dispatched (exclude Done / Restored / Resolved)
    const doneLike = /done|resolved|restored|submitted/i;
    filtered = filtered.filter(function (t) {
        const raw = String(t.status || '').trim();
        if (doneLike.test(raw)) return false;
        const n = normalizeStatus(t.status);
        return n === 'Reschedule' || n === 'On Hold' || n === 'For Pull Out' || n === 'For Dispatch' || n === 'Dispatched';
    });

    // 2) Region definitions (based on columns M and N)
    const REGION_DEFS = {
        bukidnon: {
            label: 'Bukidnon',
            type: 'city',
            areas: [
                { key: 'VALENCIA', label: 'Valencia City' },
                { key: 'MALAYBALAY', label: 'Malaybalay City' },
                { key: 'MARAMAG', label: 'Maramag' },
                { key: 'QUEZON', label: 'Quezon' },
                { key: 'DON CARLOS', label: 'Don Carlos' },
                { key: 'MANOLO FORTICH', label: 'Manolo Fortich' },
                { key: 'IMPASUGONG', label: 'Impasugong' },
                { key: 'SAN FERNANDO', label: 'San Fernando' }
            ]
        },
        davao_city: {
            label: 'Davao City',
            type: 'cluster',
            areas: [
                { key: 'NORTH', label: 'North' },
                { key: 'SOUTH', label: 'South' },
                { key: 'CENTRO', label: 'Centro' }
            ]
        },
        davao_del_sur: {
            label: 'Davao Del Sur',
            type: 'city',
            areas: [
                { key: 'DIGOS', label: 'Digos' }
            ]
        },
        cotabato: {
            label: 'Cotabato',
            type: 'city',
            areas: [
                { key: 'KIDAPAWAN', label: 'Kidapawan' }
            ]
        },
        cdo: {
            label: 'CDO',
            type: 'city',
            areas: [
                { key: 'CDO', label: 'CDO' }
            ]
        },
        davao_del_norte: {
            label: 'Davao del Norte',
            type: 'city',
            areas: [
                { key: 'PANABO', label: 'Panabo City' },
                { key: 'TAGUM', label: 'Tagum City' },
                { key: 'CARMEN', label: 'Carmen' }
            ]
        },
        misamis_oriental: {
            label: 'Misamis Oriental',
            type: 'city',
            areas: [
                { key: 'TAGOLOAN', label: 'Tagoloan' },
                { key: 'VILLANUEVA', label: 'Villanueva' },
                { key: 'BALINGASAG', label: 'Balingasag' },
                { key: 'GINGOOG', label: 'Gingoog' },
                { key: 'JASAAN', label: 'Jasaan' },
                { key: 'CLAVERIA', label: 'Claveria' }
            ]
        }
    };

    const regionDef = REGION_DEFS[regionVal] || null;

    // 3) If a region is selected, narrow tickets to that region and count per area.
    const byArea = {};
    let regionTickets = filtered;

    if (regionDef) {
        // Initialize all configured areas with 0
        regionDef.areas.forEach(a => { byArea[a.label] = 0; });

        regionTickets = filtered.filter(t => {
            const cityUpper = ticketCitySource(t).toUpperCase();
            const clusterUpper = ticketClusterSource(t).toUpperCase();

            let match = false;
            regionDef.areas.forEach(a => {
                const key = a.key;
                if (regionDef.type === 'city') {
                    if (cityUpper.indexOf(key) !== -1) {
                        byArea[a.label] = (byArea[a.label] || 0) + 1;
                        match = true;
                    }
                } else if (regionDef.type === 'cluster') {
                    if (clusterUpper.indexOf(key) !== -1) {
                        byArea[a.label] = (byArea[a.label] || 0) + 1;
                        match = true;
                    }
                }
            });
            return match;
        });
    } else {
        // No region selected: group by city/municipality (or cluster), and add region totals (e.g. Bukidnon)
        const generic = {};
        filtered.forEach(t => {
            const city = ticketCitySource(t);
            const cluster = ticketClusterSource(t);
            const key = city || cluster || 'Unspecified';
            if (!generic[key]) generic[key] = 0;
            generic[key] += 1;
        });
        Object.keys(generic).forEach(k => { byArea[k] = generic[k]; });

        // Add region totals (Bukidnon, Davao City, Misamis Oriental, etc.) so they appear in the list (including 0)
        Object.keys(REGION_DEFS).forEach(regionKey => {
            const def = REGION_DEFS[regionKey];
            let total = 0;
            filtered.forEach(t => {
                const cityUpper = ticketCitySource(t).toUpperCase();
                const clusterUpper = ticketClusterSource(t).toUpperCase();
                def.areas.forEach(a => {
                    if (def.type === 'city' && cityUpper.indexOf(a.key) !== -1) total += 1;
                    else if (def.type === 'cluster' && clusterUpper.indexOf(a.key) !== -1) total += 1;
                });
            });
            byArea[def.label] = total;
        });
    }

    const totalTickets = regionDef ? regionTickets.length : filtered.length;
    const totalLocations = Object.keys(byArea).length;

    const cardsContainer = document.getElementById('clusters-summary-cards');
    if (cardsContainer) {
        cardsContainer.innerHTML = [
            { title: 'Total Locations', value: totalLocations, icon: 'fa-map-marker-alt', color: 'primary' },
            { title: 'Pending Tickets', value: totalTickets, icon: 'fa-ticket-alt', color: 'pending' }
        ].map(c => `
            <div class="col-6 col-lg-3">
                <div class="card summary-card bg-${c.color} text-white h-100 shadow-sm">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="me-3">
                                <div class="text-white-50 small text-uppercase fw-bold">${c.title}</div>
                                <div class="fs-2 fw-bold">${c.value}</div>
                            </div>
                            <i class="fas ${c.icon} card-icon"></i>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    const listEl = document.getElementById('clusters-region-list');
    if (listEl) {
        const entries = Object.entries(byArea);
        if (entries.length === 0) {
            listEl.innerHTML = '<p class="text-muted mb-0">No data for the selected period.</p>';
        } else {
            const regionOrder = ['Bukidnon', 'Davao City', 'Davao Del Sur', 'Cotabato', 'CDO', 'Davao del Norte', 'Misamis Oriental'];
            // True if this label is a city/area that belongs to any defined region (so we show only the region total, not duplicate)
            const isCoveredByRegion = (label) => {
                const upper = String(label || '').toUpperCase();
                for (const regionKey of Object.keys(REGION_DEFS)) {
                    const def = REGION_DEFS[regionKey];
                    for (const a of def.areas) {
                        if (upper.indexOf(a.key) !== -1) return true;
                    }
                }
                return false;
            };
            let sorted;
            if (!regionVal) {
                // No region selected: regions + cities not already under a region, then sort by highest count
                const regionFirst = [];
                regionOrder.forEach(label => {
                    if (byArea[label] !== undefined) regionFirst.push([label, byArea[label]]);
                });
                // Exclude region totals and any label that matches a region name (e.g. DAVAO CITY = Davao City)
                const rest = entries.filter(([label]) => {
                    const upper = String(label || '').toUpperCase().trim();
                    if (regionOrder.some(r => String(r).toUpperCase() === upper)) return false;
                    if (regionOrder.includes(label)) return false;
                    if (isCoveredByRegion(label)) return false;
                    return true;
                });
                sorted = regionFirst.concat(rest);
            } else {
                sorted = entries.slice();
            }
            sorted.sort((a, b) => b[1] - a[1]); // Always sort by highest number first
            // Exclude specific locations from the list (none; Davao City and Carmen are regions)
            const excludeFromList = [];
            sorted = sorted.filter(([label]) => !excludeFromList.includes(String(label || '').toUpperCase().trim()));

            // Returns pending tickets that belong to this row label (region, area like Digos/Malaybalay City, or generic city)
            function getTicketsForLabel(label) {
                const lab = String(label || '').trim();
                const labUpper = lab.toUpperCase();
                // 1) Region label (e.g. "Davao Del Sur", "Bukidnon") -> match by region's area keys
                const def = Object.values(REGION_DEFS).find(d => String(d.label).toUpperCase() === labUpper);
                if (def) {
                    return filtered.filter(t => {
                        const cityUpper = ticketCitySource(t).toUpperCase();
                        const clusterUpper = ticketClusterSource(t).toUpperCase();
                        for (const a of def.areas) {
                            if (def.type === 'city' && cityUpper.indexOf(a.key) !== -1) return true;
                            if (def.type === 'cluster' && clusterUpper.indexOf(a.key) !== -1) return true;
                        }
                        return false;
                    });
                }
                // 2) Area label (e.g. "Digos", "Malaybalay City") -> match by that area's key (sheet may have "DIGOS CITY", "MALAYBALAY")
                for (const regionKey of Object.keys(REGION_DEFS)) {
                    const d = REGION_DEFS[regionKey];
                    const area = d.areas.find(a => String(a.label).toUpperCase() === labUpper);
                    if (area) {
                        return filtered.filter(t => {
                            const cityUpper = ticketCitySource(t).toUpperCase();
                            const clusterUpper = ticketClusterSource(t).toUpperCase();
                            if (d.type === 'city') return cityUpper.indexOf(area.key) !== -1;
                            if (d.type === 'cluster') return clusterUpper.indexOf(area.key) !== -1;
                            return false;
                        });
                    }
                }
                // 3) Generic city/municipality (exact or case-insensitive)
                const key = lab || 'Unspecified';
                return filtered.filter(t => {
                    const c = ticketCitySource(t);
                    const cl = ticketClusterSource(t);
                    const k = c || cl || 'Unspecified';
                    return k === key || k.toUpperCase() === labUpper;
                });
            }

            function renderClusterTicketRow(t) {
                const displayStatus = normalizeStatus(t.status);
                const statusColor = getStatusColor(t.status);
                const riskColor = getRiskColor(t.risk_level);
                const ticketJson = (JSON.stringify(t) || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return `<tr class="clusters-ticket-row" data-ticket-json="${ticketJson}">
                    <td class="fw-bold jo-number-pink">#${t.ticket_id}</td>
                    <td class="text-muted">${escapeHtml(t.customer_name || '')}</td>
                    <td><span class="badge bg-${statusColor}" style="font-size: 0.65rem;">${escapeHtml(displayStatus)}</span></td>
                    <td><span class="badge bg-${riskColor}" style="font-size: 0.65rem;">${escapeHtml(t.risk_level || '')}</span></td>
                    <td class="text-end"></td>
                </tr>`;
            }
            function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

            listEl.innerHTML = `
                ${sorted.map(([label, count]) => {
                    const tickets = getTicketsForLabel(label);
                    const tableBody = tickets.length
                        ? tickets.map(t => renderClusterTicketRow(t)).join('')
                        : '<tr><td colspan="5" class="text-muted text-center py-3 small">No pending tickets.</td></tr>';
                    return `
                    <div class="clusters-location-card" data-label="${escapeHtml(label)}">
                        <div class="clusters-location-header" role="button" tabindex="0" aria-expanded="false">
                            <div class="clusters-location-name">
                                <div class="clusters-location-icon">
                                    <i class="fas fa-map-marker-alt"></i>
                                </div>
                                <span class="clusters-location-text">${escapeHtml(label)}</span>
                            </div>
                            <div style="display: flex; align-items: center;">
                                <span class="clusters-location-badge">${count}</span>
                                <i class="fas fa-chevron-right clusters-dropdown-arrow"></i>
                            </div>
                        </div>
                        <div class="clusters-location-details">
                            <div class="clusters-detail-table-wrapper">
                                <table class="clusters-detail-table">
                                    <thead>
                                        <tr>
                                            <th>JO #</th>
                                            <th>Customer</th>
                                            <th>Status</th>
                                            <th>Risk</th>
                                            <th class="text-end">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>${tableBody}</tbody>
                                </table>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            `;
            attachClustersAccordionHandlers();
        }
    }
}

function attachClustersAccordionHandlers() {
    const listEl = document.getElementById('clusters-region-list');
    if (!listEl) return;
    listEl.removeEventListener('click', clustersAccordionOnClick);
    listEl.removeEventListener('keydown', clustersAccordionOnKeydown);
    listEl.addEventListener('click', clustersAccordionOnClick);
    listEl.addEventListener('keydown', clustersAccordionOnKeydown);
}

function clustersAccordionOnKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const header = e.target.closest('.clusters-location-header');
    if (header) {
        e.preventDefault();
        toggleClusterCard(header);
    }
}

function clustersAccordionOnClick(e) {
    const listEl = document.getElementById('clusters-region-list');
    if (!listEl) return;
    
    // Handle card header clicks to toggle expansion
    const header = e.target.closest('.clusters-location-header');
    if (header) {
        toggleClusterCard(header);
    }
}

function toggleClusterCard(header) {
    const card = header.closest('.clusters-location-card');
    if (!card) return;
    
    const isActive = card.classList.contains('active');
    
    // Close all other cards
    const allCards = document.querySelectorAll('.clusters-location-card');
    allCards.forEach(c => c.classList.remove('active'));
    
    // Toggle this card
    if (!isActive) {
        card.classList.add('active');
        header.setAttribute('aria-expanded', 'true');
    } else {
        header.setAttribute('aria-expanded', 'false');
    }
}

async function loadClusters() {
    if (allTickets.length === 0) await loadTickets();
    updateClusters();
}

function calculateStats(tickets) {
    const stats = {
        total: tickets.length,
        rescheduled: 0,
        on_hold: 0,
        pull_out: 0,
        for_dispatch: 0,
        dispatched: 0,
        done_repair: 0,
        done_submitted: 0,
        risk_high: 0,
        risk_medium: 0,
        risk_low: 0
    };

    tickets.forEach(t => {
        const normalized = normalizeStatus(t.status);
        const riskLevel = t.risk_level || calculateRisk(ticketRiskText(t));
        const risk = String(riskLevel).toLowerCase();

        // Status Logic - use normalized status (dispatched vs for dispatch are separate)
        if (normalized === 'Reschedule') {
            stats.rescheduled++;
        } else if (normalized === 'On Hold') {
            stats.on_hold++;
        } else if (normalized === 'For Pull Out') {
            stats.pull_out++;
        } else if (normalized === 'For Dispatch') {
            stats.for_dispatch++;
        } else if (normalized === 'Dispatched') {
            stats.dispatched++;
        } else if (normalized === 'Done Repair Submitted') {
            stats.done_submitted++;
        } else if (normalized === 'Done Repair') {
            stats.done_repair++;
        }
        
        // Risk Logic
        if (risk.includes('high') || risk.includes('critical')) {
            stats.risk_high++;
        } else if (risk.includes('medium') || risk.includes('moderate')) {
            stats.risk_medium++;
        } else {
            stats.risk_low++;
        }
    });
    // Pending = reschedule + on hold + pull out + for dispatch + dispatched (not done, not submitted)
    stats.pending_repairs = stats.rescheduled + stats.on_hold + stats.pull_out + stats.for_dispatch + stats.dispatched;
    return stats;
}

function renderSummaryCards(stats) {
    const container = document.getElementById('summary-cards');
    const cards = [
        { title: 'Done Repair', value: stats.done_repair, icon: 'fa-check', color: 'success' },
        { title: 'Pending Repairs', value: stats.pending_repairs, icon: 'fa-wrench', color: 'primary' },
        { title: 'Rescheduled', value: stats.rescheduled, icon: 'fa-calendar-alt', color: 'warning' },
        { title: 'On Hold', value: stats.on_hold, icon: 'fa-pause-circle', color: 'secondary' },
        { title: 'For Pull Out', value: stats.pull_out, icon: 'fa-truck', color: 'danger' },
        { title: 'For Dispatch', value: stats.for_dispatch, icon: 'fa-paper-plane', color: 'primary' },
        { title: 'Dispatched', value: stats.dispatched, icon: 'fa-shipping-fast', color: 'info' },
        { title: 'Submitted', value: stats.total, icon: 'fa-check-double', color: 'info' }
    ];

    container.innerHTML = cards.map(c => `
        <div class="col-6 col-lg-3">
            <div class="card summary-card bg-${c.color} text-white h-100 shadow-sm">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="me-3">
                            <div class="text-white-50 small text-uppercase fw-bold">${c.title}</div>
                            <div class="fs-2 fw-bold">${c.value}</div>
                        </div>
                        <i class="fas ${c.icon} card-icon"></i>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function renderDashboardCharts(stats) {
    const ctxStatus = document.getElementById('statusChart').getContext('2d');
    const ctxRisk = document.getElementById('riskChart').getContext('2d');

    if (statusChart) statusChart.destroy();
    if (riskChart) riskChart.destroy();

    statusChart = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: ['Rescheduled', 'On Hold', 'Pull Out', 'For Dispatch', 'Dispatched', 'Done'],
            datasets: [{
                data: [stats.rescheduled, stats.on_hold, stats.pull_out, stats.for_dispatch, stats.dispatched, stats.done_repair],
                backgroundColor: ['#ffc107', '#6c757d', '#dc3545', '#0d6efd', '#0dcaf0', '#198754']
            }]
        }
    });

    riskChart = new Chart(ctxRisk, {
        type: 'pie',
        data: {
            labels: ['High', 'Medium', 'Low'],
            datasets: [{
                data: [stats.risk_high, stats.risk_medium, stats.risk_low],
                backgroundColor: ['#dc3545', '#ffc107', '#198754']
            }]
        }
    });
}

// --- Tickets ---
async function loadTickets(preserveFilters = false) {
    try {
        // Only show loading state if not preserving filters (initial load)
        if (!preserveFilters) {
            const tbody = document.getElementById('tickets-table-body');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="13" class="py-5 text-center"><div class="section-loader"><div class="loader"></div><p>Loading Data. Please Wait...</p></div></td></tr>';
            }
        }
        
        // Only reset filters on initial load (not during refresh)
        if (!preserveFilters) {
            const searchInput = document.getElementById('search-input');
            const statusFilter = document.getElementById('filter-status');
            const riskFilter = document.getElementById('filter-risk');
            
            if (searchInput) searchInput.value = '';
            if (statusFilter) statusFilter.value = '';
            if (riskFilter) riskFilter.value = '';
        }
        
        const url = getApiUrl('action=read', true);
        console.log('Fetching tickets from:', API_MODE === 'gas' ? 'GAS POST action=read' : url);

        const response = API_MODE === 'gas'
            ? await fetchGasTickets()
            : await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
            const detail = await gasReadErrorFromBody(response);
            const tbody = document.getElementById('tickets-table-body');
            if (tbody) {
                const msg = detail ? escapeHtml(detail) : 'Check GAS deployment, api/config.php gas_webapp_url, and XAMPP PHP cURL.';
                tbody.innerHTML = '<tr><td colspan="13" class="text-center py-5 text-danger"><i class="fas fa-exclamation-triangle me-2"></i>Error loading tickets: server returned ' + response.status + '. ' + msg + '</td></tr>';
            }
            return;
        }
        const raw = await response.json();
        
        console.log('Tickets API response:', raw);
        
        // GAS error check
        if (raw.error) {
            console.error('API returned error:', raw.error);
            const tbody = document.getElementById('tickets-table-body');
            if (tbody) {
                let errorMsg = raw.error;
                // Translate common error messages to English
                if (errorMsg.toLowerCase().includes('madaming') || errorMsg.toLowerCase().includes('too many')) {
                    errorMsg = 'Too many requests. Please wait a moment and try again.';
                }
                tbody.innerHTML = '<tr><td colspan="13" class="text-center py-5 text-danger"><i class="fas fa-exclamation-triangle me-2"></i>Error loading tickets: ' + escapeHtml(errorMsg) + '</td></tr>';
            }
            return;
        }

        const data = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.tickets) ? raw.tickets : null);
        if (!data) {
            console.error('API did not return an array:', raw);
            const tbody = document.getElementById('tickets-table-body');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="13" class="text-center py-5 text-danger"><i class="fas fa-exclamation-triangle me-2"></i>Invalid data format received</td></tr>';
            }
            return;
        }

        allTickets = data;
        
        // Newest first: ticket # sequence (S2SREPAIR-nnnnn), then date — so a new ticket appears on top
        allTickets.sort(compareTicketsNewestFirst);
        
        // Check for new tickets and update badge
        checkForNewTickets();
        
        // Always render all tickets on initial load
        console.log('âœ“ Loading tickets SUCCESS, total count:', allTickets.length);
        
        if (allTickets.length === 0) {
            const tbody = document.getElementById('tickets-table-body');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="13" class="text-center py-5 text-muted"><i class="fas fa-inbox me-2"></i>No tickets available</td></tr>';
            }
            const countEl = document.getElementById('ticket-count');
            if(countEl) countEl.innerText = 'No tickets';
            updateExportButton();
            return;
        }
        
        // If preserving filters (during refresh), apply current filters
        // Otherwise render all tickets
        if (preserveFilters) {
            filterTickets(true);
        } else {
            renderTicketsTable(allTickets);
            
            // Update count text
            const countEl = document.getElementById('ticket-count');
            if(countEl) countEl.innerText = `Showing ${allTickets.length} ticket${allTickets.length !== 1 ? 's' : ''}`;
        }
        
        console.log('âœ“ Tickets table rendered successfully');
    } catch (e) {
        console.error("Error loading tickets:", e);
        const tbody = document.getElementById('tickets-table-body');
        if (tbody) {
            let errorMsg = e.message || 'Unknown error';
            // Translate common error messages to English
            if (errorMsg.toLowerCase().includes('madaming') || errorMsg.toLowerCase().includes('too many')) {
                errorMsg = 'Too many requests. Please wait a moment and try again.';
            }
                tbody.innerHTML = '<tr><td colspan="13" class="text-center py-5 text-danger"><i class="fas fa-exclamation-triangle me-2"></i>Error: ' + escapeHtml(errorMsg) + '</td></tr>';
        }
        updateExportButton();
    }
}

function escapeAttr(s) {
    if (s == null || s === '') return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
function escapeHtml(s) {
    if (s == null || s === '') return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Return the visible "Ticket #" value (S2SREPAIR-xxxxx).
 *  Some older GAS deployments returned it under `submission_timestamp`, so we normalize here. */
function getTicketIdFormValue(ticket) {
    if (!ticket) return '';
    const prefix = 'S2SREPAIR-';
    const direct = ticket.ticket_id_form != null ? String(ticket.ticket_id_form).trim() : '';
    if (direct && direct.startsWith(prefix)) return direct;

    // Back-compat: if older backend uses submission_timestamp to store the ticket id.
    const alt = ticket.submission_timestamp != null ? String(ticket.submission_timestamp).trim() : '';
    if (alt && alt.startsWith(prefix)) return alt;

    // Last resort: return whatever `ticket_id_form` had (could be empty or non-standard).
    return direct || '';
}

/** Numeric part of S2SREPAIR-000921 for ordering (higher = newer row). Returns -1 if missing/invalid. */
function ticketIdFormSequence(t) {
    const v = getTicketIdFormValue(t);
    const m = /^S2SREPAIR-(\d+)$/i.exec(String(v || '').trim());
    if (m) return parseInt(m[1], 10);
    return -1;
}

/**
 * Newest-first: primary by ticket # sequence (matches sheet append order), then date_created, then JO.
 * Fixes rows that share the same calendar date sorting in random order.
 */
function compareTicketsNewestFirst(a, b) {
    const seqA = ticketIdFormSequence(a);
    const seqB = ticketIdFormSequence(b);
    if (seqA >= 0 || seqB >= 0) {
        if (seqA < 0) return 1;
        if (seqB < 0) return -1;
        if (seqB !== seqA) return seqB - seqA;
    }
    const tA = typeof parseDateSafe === 'function' ? parseDateSafe(a && a.date_created) : null;
    const tB = typeof parseDateSafe === 'function' ? parseDateSafe(b && b.date_created) : null;
    const msA = tA ? tA.getTime() : 0;
    const msB = tB ? tB.getTime() : 0;
    if (msB !== msA) return msB - msA;
    if (seqB !== seqA) return seqB - seqA;
    return String(b && b.ticket_id || '').localeCompare(String(a && a.ticket_id || ''), undefined, { numeric: true });
}

// Store selected ticket IDs to preserve checkbox state (works across paginated pages)
let selectedTicketIds = new Set();

/** Rows per page: keeps DOM small so Tickets tab loads/paints fast; data still fully loaded in memory. */
const TICKETS_PAGE_SIZE = 75;
let ticketsViewList = [];
let ticketsViewPage = 0;

function updateTicketsPaginationUI(total, startIndex, pageRowCount) {
    const el = document.getElementById('tickets-pagination');
    if (!el) return;
    if (!total || pageRowCount === 0) {
        el.innerHTML = '';
        return;
    }
    const pageCount = Math.max(1, Math.ceil(total / TICKETS_PAGE_SIZE));
    const buildPageButtons = function () {
        if (pageCount <= 9) {
            return Array.from({ length: pageCount }, function (_, i) { return i; });
        }
        const pages = [0];
        const start = Math.max(1, ticketsViewPage - 1);
        const end = Math.min(pageCount - 2, ticketsViewPage + 1);
        if (start > 1) pages.push('dots-left');
        for (let i = start; i <= end; i++) pages.push(i);
        if (end < pageCount - 2) pages.push('dots-right');
        pages.push(pageCount - 1);
        return pages;
    };
    const pageButtonsHtml = buildPageButtons().map(function (p) {
        if (typeof p !== 'number') {
            return '<span class="tickets-page-dots" aria-hidden="true">...</span>';
        }
        const isActive = p === ticketsViewPage;
        return '<button type="button" class="btn btn-sm tickets-page-btn' + (isActive ? ' active' : '') + '" ' +
            (isActive ? 'aria-current="page"' : '') + ' onclick="goTicketsPage(' + p + ')">' + (p + 1) + '</button>';
    }).join('');
    el.innerHTML = `
        <div class="tickets-page-controls" role="navigation" aria-label="Ticket pages">
            <button type="button" class="btn btn-sm tickets-page-nav" aria-label="Previous page" title="Previous page" ${ticketsViewPage <= 0 ? 'disabled' : ''} onclick="goTicketsPrevPage()"><i class="fas fa-chevron-left"></i></button>
            ${pageButtonsHtml}
            <button type="button" class="btn btn-sm tickets-page-nav" aria-label="Next page" title="Next page" ${ticketsViewPage >= pageCount - 1 ? 'disabled' : ''} onclick="goTicketsNextPage()"><i class="fas fa-chevron-right"></i></button>
        </div>
    `;
}

function goTicketsPrevPage() {
    if (ticketsViewPage <= 0) return;
    saveCheckboxStates();
    ticketsViewPage--;
    renderTicketsTablePage();
}

function goTicketsNextPage() {
    const pageCount = Math.ceil(ticketsViewList.length / TICKETS_PAGE_SIZE);
    if (ticketsViewPage >= pageCount - 1) return;
    saveCheckboxStates();
    ticketsViewPage++;
    renderTicketsTablePage();
}

function goTicketsPage(pageIndex) {
    const pageCount = Math.ceil(ticketsViewList.length / TICKETS_PAGE_SIZE);
    if (pageCount <= 0) return;
    const target = Math.max(0, Math.min(pageCount - 1, Number(pageIndex)));
    if (!Number.isFinite(target) || target === ticketsViewPage) return;
    saveCheckboxStates();
    ticketsViewPage = target;
    renderTicketsTablePage();
}

/** Full list to display (all or filtered). By default resets to page 0; pass preservePage true to keep/clamp current page (e.g. silent refresh). */
function renderTicketsTable(tickets, preservePage) {
    ticketsViewList = Array.isArray(tickets) ? tickets : [];
    const n = ticketsViewList.length;
    const maxPage = n > 0 ? Math.max(0, Math.ceil(n / TICKETS_PAGE_SIZE) - 1) : 0;
    if (preservePage) {
        ticketsViewPage = Math.max(0, Math.min(ticketsViewPage, maxPage));
    } else {
        ticketsViewPage = 0;
    }
    renderTicketsTablePage();
}

function renderTicketsTablePage() {
    const tbody = document.getElementById('tickets-table-body');
    const secondDispatchHeader = document.getElementById('th-second-dispatch');
    const secondDispatchCol = document.getElementById('col-second-dispatch');
    const thirdDispatchHeader = document.getElementById('th-third-dispatch');
    const thirdDispatchCol = document.getElementById('col-third-dispatch');

    if (!tbody) {
        console.error('âŒ Tickets table body element (#tickets-table-body) not found!');
        return;
    }

    const tickets = ticketsViewList;
    console.log('â†’ Rendering tickets table page, total:', tickets ? tickets.length : 0, 'page', ticketsViewPage + 1);

    saveCheckboxStates();

    const showSecondDispatch = Array.isArray(tickets) && tickets.some(t => {
        const val = t && (t.date_second_dispatch ?? t.second_dispatch);
        return val != null && String(val).trim() !== '';
    });
    const showThirdDispatch = Array.isArray(tickets) && tickets.some(t => {
        const val = t && (t.date_third_dispatch ?? t.third_dispatch);
        return val != null && String(val).trim() !== '';
    });
    if (secondDispatchHeader) secondDispatchHeader.classList.toggle('d-none', !showSecondDispatch);
    if (secondDispatchCol) secondDispatchCol.style.display = showSecondDispatch ? '' : 'none';
    if (thirdDispatchHeader) thirdDispatchHeader.classList.toggle('d-none', !showThirdDispatch);
    if (thirdDispatchCol) thirdDispatchCol.style.display = showThirdDispatch ? '' : 'none';

    if (!tickets || tickets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="13" class="text-center py-5 text-muted">No tickets found</td></tr>';
        updateTicketsPaginationUI(0, 0, 0);
        updateExportButton();
        return;
    }

    const start = ticketsViewPage * TICKETS_PAGE_SIZE;
    const pageTickets = tickets.slice(start, start + TICKETS_PAGE_SIZE);

    const checkedRendered = new Set();
    const rows = pageTickets.map(t => {
        const displayStatus = normalizeStatus(t.status);
        const statusColor = getStatusColor(t.status);
        const statusIcon = getStatusIcon(t.status);
        const riskColor = getRiskColor(t.risk_level);
        const customer = t.customer_name != null ? String(t.customer_name) : '';
        const issueOnly = ticketIssueDisplay(t);
        const contactCell = t.contact_num != null ? String(t.contact_num) : '';
        const ticketJson = escapeAttr(JSON.stringify(t));
        const tid = String(t.ticket_id);
        const isChecked = selectedTicketIds.has(tid) && !checkedRendered.has(tid) ? (checkedRendered.add(tid), 'checked') : '';

        return `
        <tr>
            <td class="ps-3">
                <input type="checkbox" class="ticket-checkbox" value="${escapeAttr(t.ticket_id)}" ${isChecked} onchange="handleTicketCheckboxChange(this)">
            </td>
            <td class="ticket-number-value-cell"><span class="ticket-number-value-inner">${escapeHtml(getTicketIdFormValue(t)) || ''}</span></td>
            <td class="fw-bold jo-number-pink ticket-id-view-link" role="button" tabindex="0" data-ticket-json="${ticketJson}" title="View ticket details" style="cursor: pointer;">#${escapeHtml(t.ticket_id)}</td>
            <td class="text-muted small">${escapeHtml(contactCell) || ''}</td>
            <td class="text-muted small">${escapeHtml(t.date_created)}</td>
            <td class="fw-medium ticket-cell-customer" title="${escapeAttr(customer)}">${escapeHtml(customer)}</td>
            <td><span class="ticket-issue" title="${escapeAttr(issueOnly)}">${escapeHtml(issueOnly) || '—'}</span></td>
            <td>
                <span class="badge bg-${statusColor} text-uppercase" style="letter-spacing: 0.5px; padding: 6px 10px;" title="${escapeAttr(displayStatus)}">
                    <i class="${statusIcon} me-1"></i> ${escapeHtml(displayStatus)}
                </span>
            </td>
            <td><span class="badge bg-${riskColor}" title="${escapeAttr(t.risk_level)}">${escapeHtml(t.risk_level)}</span></td>
            <td><span class="small text-muted"><i class="fas fa-users me-1"></i> ${escapeHtml(t.team) || 'Unassigned'}</span></td>
            <td class="text-muted small">${escapeHtml(t.first_dispatch)}</td>
            <td class="text-muted small second-dispatch-cell${showSecondDispatch ? '' : ' d-none'}">${escapeHtml(t.date_second_dispatch || t.second_dispatch)}</td>
            <td class="text-muted small third-dispatch-cell${showThirdDispatch ? '' : ' d-none'}">${escapeHtml(t.date_third_dispatch || t.third_dispatch)}</td>
        </tr>
    `}).join('');

    tbody.innerHTML = rows;
    updateTicketsPaginationUI(tickets.length, start, pageTickets.length);
    updateExportButton();
    const wrap = document.querySelector('.tickets-table-wrapper');
    if (wrap) wrap.scrollTop = 0;
    console.log('âœ“ Table HTML updated, page rows:', pageTickets.length, 'of', tickets.length);
}

// Merge visible checkbox state into selectedTicketIds (does not clear other pages' selections).
function saveCheckboxStates() {
    try {
        const tbody = document.getElementById('tickets-table-body');
        const checkboxes = tbody ? tbody.querySelectorAll('input[type="checkbox"].ticket-checkbox') : [];
        checkboxes.forEach(cb => {
            const id = cb.value;
            if (cb.checked) selectedTicketIds.add(id);
            else selectedTicketIds.delete(id);
        });
    } catch (e) {
        console.error('saveCheckboxStates:', e);
    }
}

function getStatusIcon(status) {
    status = String(status || '').toLowerCase();
    if (status.includes('submitted')) return 'fas fa-file-import';
    if (status.includes('done') || status.includes('resolved')) return 'fas fa-check-circle';
    if (status.includes('reschedule')) return 'fas fa-clock';
    if (status.includes('pull')) return 'fas fa-truck';
    if (status.includes('hold')) return 'fas fa-pause-circle';
    if (status.includes('dispatched')) return 'fas fa-shipping-fast';
    if (status.includes('dispatch')) return 'fas fa-paper-plane';
    if (status.includes('repair')) return 'fas fa-tools';
    return 'fas fa-circle';
}

function getStatusColor(status) {
    status = String(status || '').toLowerCase().trim();
    if (status.includes('submitted')) return 'info';
    if (status.includes('done') || status.includes('resolved') || status.includes('completed')) return 'success';
    /* Pending-type statuses: one soft, professional style */
    if (status.includes('reschedule')) return 'pending';
    if (status.includes('pull')) return 'pending';
    if (status.includes('hold')) return 'pending';
    if (status.includes('dispatched')) return 'pending';
    if (status.includes('dispatch')) return 'pending';
    if (status.includes('repair') || status.includes('open')) return 'primary';
    return 'dark';
}

function getRiskColor(risk) {
    if (risk === 'High Risk') return 'danger';
    if (risk === 'Moderate Risk') return 'warning';
    if (risk === 'Low Risk') return 'success';
    if (risk === 'Unknown Risk') return 'secondary';
    return 'success';
}

/** Normalize status by word: map to standard labels. Check "dispatched" before "dispatch". */
function normalizeStatus(status) {
    const s = String(status || '').trim().toLowerCase();
    if (!s) return status || '';
    if (s.includes('submitted')) return 'Done Repair Submitted';
    if (s.includes('done')) return 'Done Repair';
    if (s.includes('reschedule') || s.includes('rescheduled')) return 'Reschedule';
    if (s.includes('hold')) return 'On Hold';
    if (s.includes('pull')) return 'For Pull Out';
    if (s.includes('dispatched')) return 'Dispatched';  // before "dispatch" so "dispatched" is separate
    if (s.includes('dispatch')) return 'For Dispatch';
    if (s.includes('repair')) return 'For Repair';
    return status.trim() || status;
}

function filterTickets(preservePage) {
    // Ensure allTickets is loaded
        if (!allTickets || allTickets.length === 0) {
        console.warn('No tickets data available to filter');
        const tbody = document.getElementById('tickets-table-body');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="13" class="text-center py-5 text-muted">No tickets available</td></tr>';
        }
        updateExportButton();
        return;
    }
    
    const searchEl = document.getElementById('search-input');
    const statusEl = document.getElementById('filter-status');
    const riskEl = document.getElementById('filter-risk');
    const search = (searchEl && searchEl.value) ? searchEl.value.toLowerCase() : '';
    const statusFilter = (statusEl && statusEl.value) ? statusEl.value : '';
    const risk = (riskEl && riskEl.value) ? riskEl.value : '';

    const filtered = allTickets.filter(t => {
        const searchable = [
            t.ticket_id_form,
            t.ticket_id,
            t.customer_name,
            t.issue,
            t.description,
            t.contact_num,
            t.account_number,
            t.team,
            t.status,
            t.risk_level
        ].filter(Boolean).map(v => String(v).toLowerCase());
        const matchesSearch = !search.trim() || searchable.some(val => val.includes(search));
        let matchesStatus = true;
        if (statusFilter) {
            if (statusFilter === 'Pending') {
                const n = normalizeStatus(t.status);
                matchesStatus = n !== 'Done Repair' && n !== 'Done Repair Submitted';
            } else {
                matchesStatus = normalizeStatus(t.status) === statusFilter;
            }
        }
        const matchesRisk = risk ? t.risk_level === risk : true;
        return matchesSearch && matchesStatus && matchesRisk;
    });

    filtered.sort(compareTicketsNewestFirst);

    console.log(`Filtering tickets: ${filtered.length} of ${allTickets.length} match criteria`);

    // Update count text
    const countEl = document.getElementById('ticket-count');
    if(countEl) countEl.innerText = `Showing ${filtered.length} ticket${filtered.length !== 1 ? 's' : ''}`;

    renderTicketsTable(filtered, !!preservePage);
}

// Sorting
let sortDirection = 1; // 1 for asc, -1 for desc
function sortTable(column) {
    sortDirection *= -1;
    allTickets.sort((a, b) => {
        if (column === 'ticket_id_form') {
            const nA = ticketIdFormSequence(a);
            const nB = ticketIdFormSequence(b);
            if (nA < 0 && nB < 0) return 0;
            if (nA < 0) return 1 * sortDirection;
            if (nB < 0) return -1 * sortDirection;
            if (nA < nB) return -1 * sortDirection;
            if (nA > nB) return 1 * sortDirection;
            return 0;
        }
        let valA = a[column];
        let valB = b[column];
        if (valA == null || valA === '') valA = '';
        if (valB == null || valB === '') valB = '';
        if (column === 'date_created' || column === 'first_dispatch' || column === 'date_second_dispatch' || column === 'date_third_dispatch') {
            const dA = typeof parseDateSafe === 'function' ? parseDateSafe(valA) : null;
            const dB = typeof parseDateSafe === 'function' ? parseDateSafe(valB) : null;
            valA = dA ? dA.getTime() : 0;
            valB = dB ? dB.getTime() : 0;
            if (valA < valB) return -1 * sortDirection;
            if (valA > valB) return 1 * sortDirection;
            return 0;
        }
        // Handle numbers if needed
        if (!isNaN(valA) && !isNaN(valB) && valA !== '' && valB !== '') {
            valA = Number(valA);
            valB = Number(valB);
        } else {
            valA = String(valA).toLowerCase();
            valB = String(valB).toLowerCase();
        }

        if (valA < valB) return -1 * sortDirection;
        if (valA > valB) return 1 * sortDirection;
        return 0;
    });
    renderTicketsTable(allTickets);
}

// --- CRUD ---
const ticketModal = new bootstrap.Modal(document.getElementById('ticketModal'));
const ticketViewModal = new bootstrap.Modal(document.getElementById('ticketViewModal'));
/** 'new' | 'edit' — do not rely on modal title text (fragile); GAS needs action create vs update. */
let ticketModalMode = 'edit';

/** Show a toast notification at top right. type: 'success' | 'error' */
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast-item ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(100%)';
        el.style.transition = 'opacity 0.3s, transform 0.3s';
        setTimeout(() => el.remove(), 300);
    }, 3500);
}

/** Parse ticket_id_form like "S2SREPAIR-00001" and return next number. Uses latest from allTickets. */
function getNextTicketNumber() {
    const prefix = 'S2SREPAIR-';
    let maxNum = 0;
    (allTickets || []).forEach(t => {
        const v = getTicketIdFormValue(t);
        if (v.startsWith(prefix)) {
            const num = parseInt(v.slice(prefix.length), 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
        }
    });
    const next = maxNum + 1;
    return prefix + String(next).padStart(5, '0');
}

async function openTicketModal() {
    showToast('Create ticket is disabled.', 'error');
}

function editTicket(ticket) {
    showToast('Edit ticket is disabled.', 'error');
}

/** Populate ticket form with ticket data (used by edit and view). */
function populateTicketForm(form, ticket) {
    for (const key in ticket) {
        if (form.elements[key]) {
            if (form.elements[key].type === 'date' && ticket[key]) {
                const d = new Date(ticket[key]);
                if (!isNaN(d.getTime())) {
                    const dateStr = ticket[key].split('T')[0];
                    form.elements[key].value = dateStr;
                }
            } else if (key === 'status') {
                form.elements[key].value = normalizeStatus(ticket[key]);
            } else {
                form.elements[key].value = ticket[key];
            }
        }
    }
    const displayEl = document.getElementById('display-ticket-number');
    if (displayEl) displayEl.textContent = getTicketIdFormValue(ticket);
}

// Store current ticket for Viber export
let currentViewTicket = null;

/** Show ticket details in read-only popup (View Ticket modal, modern UI). */
function viewTicket(ticket) {
    const normalizedTicket = ticket ? Object.assign({}, ticket, { ticket_id_form: getTicketIdFormValue(ticket) }) : ticket;
    currentViewTicket = normalizedTicket; // Store for Viber export
    
    document.getElementById('ticketViewModalTitle').innerText = 'View Ticket #' + (ticket.ticket_id || '');
    const teamEl = document.getElementById('ticketViewModalTeamIndicator');
    if (teamEl) {
        const teamName = ticket.team && String(ticket.team).trim() ? String(ticket.team).trim() : '';
        teamEl.textContent = teamName ? teamName : '';
        teamEl.style.display = teamName ? '' : 'none';
    }
    const set = function (id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value != null && String(value).trim() !== '' ? String(value).trim() : '';
    };
    const setDate = function (id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        if (!value) { el.textContent = ''; return; }
        const d = new Date(value);
        const str = isNaN(d.getTime()) ? '' : value.split('T')[0];
        el.textContent = str;
    };
    set('tv-ticket_id_form', normalizedTicket && normalizedTicket.ticket_id_form);
    set('tv-ticket_id', normalizedTicket && normalizedTicket.ticket_id);
    setDate('tv-date_created', normalizedTicket && normalizedTicket.date_created);
    set('tv-customer_name', normalizedTicket && normalizedTicket.customer_name);
    set('tv-account_number', normalizedTicket && normalizedTicket.account_number);
    set('tv-contact_num', normalizedTicket && normalizedTicket.contact_num);
    set('tv-address', normalizedTicket && normalizedTicket.address);
    set('tv-cluster', normalizedTicket && normalizedTicket.cluster);
    set('tv-municipality', normalizedTicket && normalizedTicket.municipality);
    set('tv-longlat', normalizedTicket && normalizedTicket.longlat);
    set('tv-issue', normalizedTicket && normalizedTicket.issue);
    set('tv-description', normalizedTicket && normalizedTicket.description);
    set('tv-status', normalizedTicket && normalizedTicket.status ? normalizeStatus(normalizedTicket.status) : '');
    set('tv-risk_level', normalizedTicket && normalizedTicket.risk_level);
    set('tv-team', normalizedTicket && normalizedTicket.team);
    set('tv-technician', normalizedTicket && normalizedTicket.technician);
    setDate('tv-date_started', normalizedTicket && normalizedTicket.date_started);
    setDate('tv-first_dispatch', normalizedTicket && normalizedTicket.first_dispatch);
    setDate('tv-date_completed', normalizedTicket && normalizedTicket.date_completed);
    set('tv-remarks', normalizedTicket && normalizedTicket.remarks);
    ticketViewModal.show();
}

/** PDF receipt (implemented in receipt-pdf.js; requires jsPDF on the page). */
function downloadTicketReceiptPdf() {
    if (typeof window.generateTicketReceiptPdf !== 'function') {
        showToast('Receipt PDF is not available. Refresh the page.', 'error');
        return;
    }
    if (!currentViewTicket) {
        showToast('No ticket data available.', 'error');
        return;
    }
    try {
        window.generateTicketReceiptPdf(currentViewTicket);
    } catch (e) {
        console.error(e);
        showToast('Could not generate PDF.', 'error');
    }
}

/** Set all ticket form controls enabled or disabled (false = read-only). */
function setTicketFormEditable(editable) {
    const form = document.getElementById('ticketForm');
    if (!form) return;
    form.querySelectorAll('input, select, textarea').forEach(function (el) {
        el.disabled = !editable;
    });
}

/** Primary action label: Create (new ticket) vs Save changes (edit). Clears save-label backup so loading state restores the right text. */
function syncTicketModalPrimaryButton() {
    const btn = document.getElementById('ticketModalBtnSave');
    const titleEl = document.getElementById('modalTitle');
    if (!btn || !titleEl) return;
    delete btn.dataset.saveLabelBackup;
    const isNew = titleEl.innerText === 'New Ticket';
    btn.innerHTML = isNew ? 'Create' : 'Save changes';
}

function refreshTicketForm() {
    const form = document.getElementById('ticketForm');
    if (!form) return;
    form.reset();
    document.getElementById('ticket_id').value = '';
    const nextTicket = getNextTicketNumber();
    document.getElementById('ticket_id_form').value = nextTicket;
    const displayEl = document.getElementById('display-ticket-number');
    if (displayEl) displayEl.textContent = nextTicket;
    const dateInput = document.querySelector('input[name="date_created"]');
    if (dateInput) dateInput.valueAsDate = new Date();
}

/** Disables the ticket modal Save button and shows a spinner while save is in flight. */
function setTicketSaveUi(saving) {
    const btn = document.getElementById('ticketModalBtnSave');
    if (!btn) return;
    if (saving) {
        if (btn.dataset.saveLabelBackup == null) {
            btn.dataset.saveLabelBackup = btn.innerHTML.trim();
        }
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        const titleEl = document.getElementById('modalTitle');
        const isNew = titleEl && titleEl.innerText === 'New Ticket';
        const busyLabel = isNew ? 'Creating...' : 'Saving...';
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>' + busyLabel;
    } else {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        if (btn.dataset.saveLabelBackup != null) {
            btn.innerHTML = btn.dataset.saveLabelBackup;
        }
    }
}

/** When GAS append succeeds but read lags, build a row so the table updates immediately. */
function buildStubTicketFromGasCreate(formSnapshot, gasResult) {
    const jo = String(gasResult.ticket_id || '').trim();
    const ticketForm = String(gasResult.ticket_id_form || '').trim();
    const desc = formSnapshot.description != null ? String(formSnapshot.description).trim() : '';
    const issue = formSnapshot.issue != null ? String(formSnapshot.issue).trim() : '';
    const riskText = ticketRiskText({ description: desc, issue: issue || desc });
    return {
        ticket_id: jo,
        ticket_id_form: ticketForm,
        submission_timestamp: ticketForm,
        date_created: formSnapshot.date_created || '',
        customer_name: formSnapshot.customer_name != null ? String(formSnapshot.customer_name) : '',
        description: desc,
        issue: issue || desc,
        contact_num: formSnapshot.contact_num || '',
        account_number: formSnapshot.account_number || '',
        address: formSnapshot.address || '',
        status: formSnapshot.status || 'Pending',
        risk_level: calculateRisk(riskText),
        team: formSnapshot.team || '',
        technician: formSnapshot.technician || '',
        date_started: formSnapshot.date_started || '',
        first_dispatch: formSnapshot.first_dispatch || '',
        date_completed: formSnapshot.date_completed || '',
        remarks: formSnapshot.remarks || ''
    };
}

/**
 * After creating a ticket, reload the list with retries (sheet read can briefly lag behind append).
 * If the JO still never appears, merge a stub so the user sees the row until the next full sync.
 */
async function refreshTicketsAfterGasSave(isNewFlow, formSnapshot, gasResult) {
    if (!isNewFlow) {
        await loadTickets(true);
        return;
    }
    const jo = String(gasResult.ticket_id || (formSnapshot && formSnapshot.ticket_id) || '').trim();
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
            await new Promise(function (r) { setTimeout(r, 450 + attempt * 150); });
        } else {
            await new Promise(function (r) { setTimeout(r, 550); });
        }
        await loadTickets(false);
        if (jo && allTickets.some(function (t) { return String(t.ticket_id).trim() === jo; })) {
            return;
        }
    }
    if (jo && formSnapshot && !allTickets.some(function (t) { return String(t.ticket_id).trim() === jo; })) {
        const stub = buildStubTicketFromGasCreate(formSnapshot, gasResult);
        allTickets = [stub].concat(allTickets.filter(function (t) { return String(t.ticket_id).trim() !== jo; }));
        allTickets.sort(compareTicketsNewestFirst);
        renderTicketsTable(allTickets);
        const countEl = document.getElementById('ticket-count');
        if (countEl) {
            countEl.innerText = 'Showing ' + allTickets.length + ' ticket' + (allTickets.length !== 1 ? 's' : '');
        }
        console.warn('Repair ticket list did not include the new JO after several refreshes; showing a local row until the next sync.');
    }
}

async function saveTicket() {
    showToast('Create/Edit is disabled.', 'error');
}

// --- Analytics ---
async function loadAnalytics() {
    if (allTickets.length === 0) await loadTickets(); // Ensure data is loaded
    toggleMonthYearDropdowns();
    updateAnalytics(true);
}

async function exportAnalyticsPdf() {
    const JsPdf = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : null;
    if (!JsPdf) {
        showToast('PDF exporter is not available. Refresh the page.', 'error');
        return;
    }
    const exportBtn = document.getElementById('analytics-export-btn');

    try {
        if (exportBtn) {
            exportBtn.disabled = true;
            exportBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Exporting...';
        }
        if (allTickets.length === 0) {
            await loadTickets();
        }
        // Make sure KPIs and charts are freshly rendered before snapshotting.
        updateAnalytics(true);
        await new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); });

        const doc = new JsPdf({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 12;
        let y = margin;

        const addSectionGap = function (gap = 6) {
            y += gap;
            if (y > pageH - margin) {
                doc.addPage();
                y = margin;
            }
        };

        const ensureSpace = function (neededHeight) {
            if (y + neededHeight > pageH - margin) {
                doc.addPage();
                y = margin;
            }
        };

        const line = function (text, size = 10, color = [33, 37, 41]) {
            doc.setFontSize(size);
            doc.setTextColor(color[0], color[1], color[2]);
            doc.text(String(text), margin, y);
            y += size * 0.55;
        };

        const safeText = function (id, fallback) {
            const el = document.getElementById(id);
            const v = el ? String(el.innerText || '').trim() : '';
            return v || fallback;
        };
        const inputValue = function (id, fallback) {
            const el = document.getElementById(id);
            const v = el ? String(el.value || '').trim() : '';
            return v || fallback;
        };

        const selectedText = function (id, fallback) {
            const el = document.getElementById(id);
            if (!el || !el.options || el.selectedIndex < 0) return fallback;
            const txt = String(el.options[el.selectedIndex].text || '').trim();
            return txt || fallback;
        };

        const chartImageById = function (canvasId) {
            const chartRefMap = {
                trendChart: trendChart,
                teamWorkloadChart: teamWorkloadChart,
                completionPendingChart: completionPendingChart
            };
            const chartRef = chartRefMap[canvasId];
            if (chartRef && typeof chartRef.toBase64Image === 'function') {
                try {
                    return chartRef.toBase64Image('image/png', 1);
                } catch (e) {}
            }
            const canvas = document.getElementById(canvasId);
            if (canvas && typeof canvas.toDataURL === 'function') {
                return canvas.toDataURL('image/png');
            }
            return '';
        };

        const addChart = function (title, canvasId) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            const imgData = chartImageById(canvasId);
            const maxW = pageW - margin * 2;
            const ratio = canvas.height > 0 ? (canvas.width / canvas.height) : 1.8;
            const drawW = maxW;
            const drawH = Math.max(45, Math.min(90, drawW / ratio));
            ensureSpace(10 + drawH + 6);
            line(title, 11, [73, 80, 87]);
            if (!imgData || /^data:,\s*$/.test(imgData)) {
                line('No chart image available.', 9, [120, 120, 120]);
                addSectionGap(2);
                return;
            }
            doc.addImage(imgData, 'PNG', margin, y + 1.5, drawW, drawH, undefined, 'FAST');
            y += drawH + 8;
        };

        const regionLabel = selectedText('analytics-region', 'All Regions');
        const filterLabel = selectedText('analytics-filter', 'All Time');
        const monthLabel = selectedText('analytics-month', 'Month');
        const yearLabel = selectedText('analytics-year', 'Year');
        const dateFrom = inputValue('analytics-date-from', '');
        const dateTo = inputValue('analytics-date-to', '');

        doc.setFontSize(16);
        doc.setTextColor(17, 24, 39);
        doc.text('SATC Repair Ticket Analytics', margin, y);
        y += 8;

        line('Generated: ' + new Date().toLocaleString(), 10, [107, 114, 128]);
        line('Region: ' + regionLabel, 10, [107, 114, 128]);
        line('Date Filter: ' + filterLabel, 10, [107, 114, 128]);
        if (filterLabel.toLowerCase().includes('month') || monthLabel !== 'Month' || yearLabel !== 'Year') {
            line('Month/Year: ' + monthLabel + ' ' + yearLabel, 10, [107, 114, 128]);
        }
        if (dateFrom || dateTo) {
            line('Custom Range: ' + (dateFrom || '-') + ' to ' + (dateTo || '-'), 10, [107, 114, 128]);
        }

        addSectionGap(2);
        doc.setDrawColor(229, 231, 235);
        doc.line(margin, y, pageW - margin, y);
        addSectionGap(6);

        line('KPI Summary', 12, [17, 24, 39]);
        line('Total Logged: ' + safeText('stat-total-analytics', '--'), 10);
        line('Completion Rate: ' + safeText('stat-completion-rate', '--%'), 10);
        line('Pending Rate: ' + safeText('stat-pending-rate', '--%'), 10);
        line('Avg. Repair Time: ' + safeText('stat-avg-time', '-- Days'), 10);

        addSectionGap(4);
        addChart('Repair Volume Trends', 'trendChart');
        addChart('Team Workload', 'teamWorkloadChart');
        addChart('Completed vs Pending', 'completionPendingChart');

        const issuesList = document.querySelectorAll('#top-issues-list .top-issues-item');
        if (issuesList && issuesList.length > 0) {
            ensureSpace(20);
            line('Top Issues', 12, [17, 24, 39]);
            issuesList.forEach(function (item, idx) {
                const labelEl = item.querySelector('.top-issues-item-label');
                const countEl = item.querySelector('.top-issues-item-count');
                const label = labelEl ? String(labelEl.textContent || '').trim() : 'Issue';
                const count = countEl ? String(countEl.textContent || '').trim() : '0';
                ensureSpace(7);
                line((idx + 1) + '. ' + label + ' - ' + count, 10, [55, 65, 81]);
            });
        }

        const stamp = new Date().toISOString().slice(0, 10);
        doc.save('satc-analytics-report-' + stamp + '.pdf');
        showToast('Analytics exported to PDF.', 'success');
    } catch (err) {
        console.error(err);
        showToast('Failed to export analytics PDF.', 'error');
    } finally {
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.innerHTML = '<i class="fas fa-file-pdf me-1"></i> Export PDF';
        }
    }
}

function toggleMonthYearDropdowns() {
    const filter = document.getElementById('analytics-filter').value;
    const monthYearGroup = document.getElementById('analytics-monthyear-group');
    const customGroup = document.getElementById('analytics-custom-group');
    
    if (monthYearGroup) {
        monthYearGroup.classList.toggle('d-none', filter !== 'monthyear');
    }
    if (customGroup) {
        customGroup.classList.toggle('d-none', filter !== 'custom');
    }
}

/** Safely parse date (handles yyyy-MM-dd, MM/DD/YYYY, and Google Sheets serial numbers) */
function parseDateSafe(dateStr) {
    if (dateStr === undefined || dateStr === null) return null;
    const str = String(dateStr).trim();
    if (!str || str === '') return null;

    // Google Sheets serial: days since 1899-12-30
    const serial = typeof dateStr === 'number' ? dateStr : (/^\d+$/.test(str) ? parseInt(str, 10) : NaN);
    if (!isNaN(serial) && serial > 0) {
        const utc = new Date((serial - 25569) * 86400 * 1000);
        if (!isNaN(utc.getTime())) {
            const y = utc.getUTCFullYear(), m = utc.getUTCMonth(), day = utc.getUTCDate();
            if (y >= 2015 && y <= new Date().getFullYear() + 5) return new Date(y, m, day);
        }
    }

    // Try yyyy-MM-dd format first (from Google Apps Script conversion)
    let match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const day = parseInt(match[3], 10);
        const d = new Date(year, month, day);
        if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
            const currentYear = new Date().getFullYear();
            if (year >= 2015 && year <= currentYear + 5) return d;
        }
    }

    // Try MM/DD/YYYY or M/D/YYYY format (from sheet)
    match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) {
        const month = parseInt(match[1], 10) - 1;
        const day = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);
        const d = new Date(year, month, day);
        if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
            const currentYear = new Date().getFullYear();
            if (year >= 2015 && year <= currentYear + 5) return d;
        }
    }

    // Fallback to standard Date parsing
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        const currentYear = new Date().getFullYear();
        const parsedYear = d.getFullYear();
        if (parsedYear >= 2015 && parsedYear <= currentYear + 5) return d;
    }
    return null;
}

function updateAnalytics(isRefresh = false) {
    const __debugRunId = 'analytics-region-' + Date.now();
    // #region agent log
    fetch('http://127.0.0.1:7607/ingest/b3bba1b6-94ec-4a1d-9a60-edd9561a01ed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'90c739'},body:JSON.stringify({sessionId:'90c739',runId:__debugRunId,hypothesisId:'H1',location:'assets/js/app.js:updateAnalytics:start',message:'updateAnalytics entered',data:{isRefresh:isRefresh,allTicketsCount:Array.isArray(allTickets)?allTickets.length:-1,activeTab:activeTab},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const filter = document.getElementById('analytics-filter').value;
    let filtered = allTickets;
    const now = new Date();

    if (filter === 'year') {
        filtered = allTickets.filter(t => {
            const d = parseDateSafe(t.date_created);
            return d && d.getFullYear() === now.getFullYear();
        });
    } else if (filter === 'month') {
        filtered = allTickets.filter(t => {
            const d = parseDateSafe(t.date_created);
            return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        });
    } else if (filter === 'week') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        filtered = allTickets.filter(t => {
            const d = parseDateSafe(t.date_created);
            return d && d >= startOfWeek && d <= endOfWeek;
        });
    } else if (filter === 'monthyear') {
        const monthEl = document.getElementById('analytics-month');
        const yearEl = document.getElementById('analytics-year');
        const month = monthEl ? parseInt(monthEl.value, 10) : 0;
        const year = yearEl ? parseInt(yearEl.value, 10) : 0;
        if (year) {
            if (month >= 1 && month <= 12) {
                const monthIndex = month - 1;
                filtered = allTickets.filter(t => {
                    const d = parseDateSafe(t.date_created);
                    return d && d.getFullYear() === year && d.getMonth() === monthIndex;
                });
            } else {
                filtered = allTickets.filter(t => {
                    const d = parseDateSafe(t.date_created);
                    return d && d.getFullYear() === year;
                });
            }
        }
    } else if (filter === 'custom') {
        const fromEl = document.getElementById('analytics-date-from');
        const toEl = document.getElementById('analytics-date-to');
        const fromDate = fromEl && fromEl.value ? new Date(fromEl.value) : null;
        const toDate = toEl && toEl.value ? new Date(toEl.value) : null;
        
        if (fromDate && toDate) {
            toDate.setHours(23, 59, 59, 999); // Include end date
            filtered = allTickets.filter(t => {
                const d = parseDateSafe(t.date_created);
                return d && d >= fromDate && d <= toDate;
            });
        } else if (fromDate) {
            filtered = allTickets.filter(t => {
                const d = parseDateSafe(t.date_created);
                return d && d >= fromDate;
            });
        } else if (toDate) {
            toDate.setHours(23, 59, 59, 999);
            filtered = allTickets.filter(t => {
                const d = parseDateSafe(t.date_created);
                return d && d <= toDate;
            });
        }
    }
    // #region agent log
    fetch('http://127.0.0.1:7607/ingest/b3bba1b6-94ec-4a1d-9a60-edd9561a01ed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'90c739'},body:JSON.stringify({sessionId:'90c739',runId:__debugRunId,hypothesisId:'H2',location:'assets/js/app.js:updateAnalytics:afterDateFilter',message:'date filter applied',data:{filter:filter,countAfterDate:Array.isArray(filtered)?filtered.length:-1},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    // Filter by region (works with all date options including custom range)
    const analyticsRegionEl = document.getElementById('analytics-region');
    const analyticsRegionVal = (analyticsRegionEl && analyticsRegionEl.value) ? String(analyticsRegionEl.value).trim() : '';
    // #region agent log
    fetch('http://127.0.0.1:7607/ingest/b3bba1b6-94ec-4a1d-9a60-edd9561a01ed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'90c739'},body:JSON.stringify({sessionId:'90c739',runId:__debugRunId,hypothesisId:'H3',location:'assets/js/app.js:updateAnalytics:regionSelection',message:'region selection state',data:{analyticsRegionVal:analyticsRegionVal,hasRegionElement:!!analyticsRegionEl},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (analyticsRegionVal) {
        const REGION_DEFS_ANALYTICS = {
            bukidnon: { type: 'city', areas: [{ key: 'VALENCIA' }, { key: 'MALAYBALAY' }, { key: 'MARAMAG' }, { key: 'QUEZON' }, { key: 'DON CARLOS' }, { key: 'MANOLO FORTICH' }, { key: 'IMPASUGONG' }, { key: 'SAN FERNANDO' }] },
            davao_city: { type: 'cluster', areas: [{ key: 'NORTH' }, { key: 'SOUTH' }, { key: 'CENTRO' }] },
            davao_del_sur: { type: 'city', areas: [{ key: 'DIGOS' }] },
            cotabato: { type: 'city', areas: [{ key: 'KIDAPAWAN' }] },
            cdo: { type: 'city', areas: [{ key: 'CDO' }] },
            davao_del_norte: { type: 'city', areas: [{ key: 'PANABO' }, { key: 'TAGUM' }, { key: 'CARMEN' }] },
            misamis_oriental: { type: 'city', areas: [{ key: 'TAGOLOAN' }, { key: 'VILLANUEVA' }, { key: 'BALINGASAG' }, { key: 'GINGOOG' }, { key: 'JASAAN' }, { key: 'CLAVERIA' }] }
        };
        const regionDef = REGION_DEFS_ANALYTICS[analyticsRegionVal];
        // #region agent log
        fetch('http://127.0.0.1:7607/ingest/b3bba1b6-94ec-4a1d-9a60-edd9561a01ed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'90c739'},body:JSON.stringify({sessionId:'90c739',runId:__debugRunId,hypothesisId:'H4',location:'assets/js/app.js:updateAnalytics:regionDef',message:'region definition lookup',data:{hasRegionDef:!!regionDef,regionType:regionDef?regionDef.type:'none',areasCount:regionDef&&Array.isArray(regionDef.areas)?regionDef.areas.length:0,sampleTicketShape:(Array.isArray(filtered)&&filtered[0])?{hasCity:Object.prototype.hasOwnProperty.call(filtered[0],'city'),hasMunicipality:Object.prototype.hasOwnProperty.call(filtered[0],'municipality'),hasRiskLevelSource:Object.prototype.hasOwnProperty.call(filtered[0],'risk_level_source'),hasCluster:Object.prototype.hasOwnProperty.call(filtered[0],'cluster')}:null},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        if (regionDef) {
            filtered = filtered.filter(t => {
                const cityUpper = ticketCitySource(t).toUpperCase();
                const clusterUpper = ticketClusterSource(t).toUpperCase();
                return regionDef.areas.some(a => {
                    if (regionDef.type === 'city') return cityUpper.indexOf(a.key) !== -1;
                    if (regionDef.type === 'cluster') return clusterUpper.indexOf(a.key) !== -1;
                    return false;
                });
            });
            // #region agent log
            fetch('http://127.0.0.1:7607/ingest/b3bba1b6-94ec-4a1d-9a60-edd9561a01ed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'90c739'},body:JSON.stringify({sessionId:'90c739',runId:__debugRunId,hypothesisId:'H5',location:'assets/js/app.js:updateAnalytics:afterRegionFilter',message:'region filter applied',data:{analyticsRegionVal:analyticsRegionVal,countAfterRegion:Array.isArray(filtered)?filtered.length:-1},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
        }
    }

    // --- KPI Cards (Safe to update innerText without scroll jump) ---
    const total = filtered.length;
    const completed = filtered.filter(t => t.status && (t.status.toLowerCase().includes('done') || t.status.toLowerCase().includes('resolved'))).length;
    const pending = total - completed;
    
    // Avg Repair Time Calculation
    let totalDays = 0;
    let countWithDates = 0;
    filtered.forEach(t => {
        if(t.date_started && t.date_completed) {
            const start = parseDateSafe(t.date_started);
            const end = parseDateSafe(t.date_completed);
            if (start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
                const diffTime = Math.abs(end - start);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                if(!isNaN(diffDays) && diffDays >= 0) {
                    totalDays += diffDays;
                    countWithDates++;
                }
            }
        }
    });
    const avgDays = countWithDates > 0 ? (totalDays / countWithDates).toFixed(1) : 0;

    // Use specific IDs to update text only
    const elTotal = document.getElementById('stat-total-analytics');
    if(elTotal) elTotal.innerText = total;
    
    const elComplete = document.getElementById('stat-completion-rate');
    if(elComplete) elComplete.innerText = total > 0 ? Math.round((completed/total)*100) + '%' : '0%';
    
    const elPending = document.getElementById('stat-pending-rate');
    if(elPending) elPending.innerText = total > 0 ? Math.round((pending/total)*100) + '%' : '0%';
    
    const elAvg = document.getElementById('stat-avg-time');
    if(elAvg) elAvg.innerText = avgDays + ' Days';


    // --- Trend Chart ---
    // "This Week": daily buckets for 7 days (Sunâ€“Sat).
    // "This Month" or "Month & Year" with month: daily buckets (days 1â€“31).
    // Otherwise: monthly buckets.
    const buckets = {};
    const monthEl = document.getElementById('analytics-month');
    const yearEl = document.getElementById('analytics-year');
    const isMonthYearWithMonth = filter === 'monthyear' && monthEl && parseInt(monthEl.value, 10) >= 1 && parseInt(monthEl.value, 10) <= 12;
    const useDailyView = filter === 'month' || isMonthYearWithMonth;
    const useWeeklyView = filter === 'week';
    let trendYear = now.getFullYear();
    let trendMonth = now.getMonth();
    if (isMonthYearWithMonth && yearEl) {
        trendYear = parseInt(yearEl.value, 10);
        trendMonth = parseInt(monthEl.value, 10) - 1;
    }
    const daysInTrendMonth = new Date(trendYear, trendMonth + 1, 0).getDate();

    // For "This Week": get week bounds (Sunâ€“Sat) and day index 0..6
    let weekStart = null;
    if (useWeeklyView) {
        weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
    }

    filtered.forEach(t => {
        const d = parseDateSafe(t.date_created);
        if (d && !isNaN(d.getTime())) {
            if (useWeeklyView && weekStart) {
                const dayIndex = Math.floor((d - weekStart) / (24 * 60 * 60 * 1000));
                if (dayIndex >= 0 && dayIndex <= 6) buckets[dayIndex] = (buckets[dayIndex] || 0) + 1;
            } else if (useDailyView) {
                const day = d.getDate();
                buckets[day] = (buckets[day] || 0) + 1;
            } else {
                const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
                buckets[key] = (buckets[key] || 0) + 1;
            }
        }
    });

    let labels, data;
    if (useWeeklyView && weekStart) {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        labels = [];
        data = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart);
            d.setDate(weekStart.getDate() + i);
            labels.push(dayNames[i] + ' ' + (d.getMonth() + 1) + '/' + d.getDate());
            data.push(buckets[i] || 0);
        }
    } else if (useDailyView) {
        labels = [];
        data = [];
        for (let day = 1; day <= daysInTrendMonth; day++) {
            labels.push(day);
            data.push(buckets[day] || 0);
        }
    } else {
        // Monthly buckets: sort by year/month and show friendly labels like "Oct 2023"
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const rawKeys = Object.keys(buckets).sort((a, b) => {
            const [ya, ma] = String(a).split('-').map(Number);
            const [yb, mb] = String(b).split('-').map(Number);
            if (ya === yb) return ma - mb;
            return ya - yb;
        });
        labels = rawKeys.map(key => {
            const parts = String(key).split('-');
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10); // 1â€“12
            if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                return `${monthNames[month - 1]} ${year}`;
            }
            return key;
        });
        data = rawKeys.map(k => buckets[k]);
    }

    // Check if chart exists
    const ctx = document.getElementById('trendChart');
    if (!ctx) return; // Tab might be hidden

    if (trendChart) {
        // Update existing chart data instead of destroying
        trendChart.data.labels = labels;
        trendChart.data.datasets[0].data = data;
        trendChart.update('none'); // Update without animation to prevent jump
    } else {
        // Create new
        trendChart = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Repair Requests',
                    data: data,
                    borderColor: '#ff4081',
                    backgroundColor: 'rgba(255, 64, 129, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#ff4081',
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Allow chart to fill container height
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { borderDash: [5, 5] } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // --- Team Workload (horizontal bar) â€“ not on Dashboard ---
    const teamCounts = {};
    filtered.forEach(t => {
        const team = (t.team || 'Unassigned').trim();
        teamCounts[team] = (teamCounts[team] || 0) + 1;
    });
    const teamEntries = Object.entries(teamCounts).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const teamLabels = teamEntries.map(([t]) => t);
    const teamData = teamEntries.map(([, c]) => c);
    const teamCtx = document.getElementById('teamWorkloadChart');
    if (teamCtx) {
        if (teamWorkloadChart) teamWorkloadChart.destroy();
        teamWorkloadChart = new Chart(teamCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: teamLabels,
                datasets: [{
                    label: 'Tickets',
                    data: teamData,
                    backgroundColor: 'rgba(255, 64, 129, 0.7)',
                    borderColor: '#ff4081',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, grid: { display: false } },
                    y: { grid: { display: false } }
                }
            }
        });
    }

    // --- Completed vs Pending (horizontal bar) â€“ not on Dashboard ---
    const completedCount = filtered.filter(t => t.status && (String(t.status).toLowerCase().includes('done') || String(t.status).toLowerCase().includes('resolved') || String(t.status).toLowerCase().includes('complete') || String(t.status).toLowerCase().includes('fixed')));
    const pendingCount = filtered.length - completedCount.length;
    const compCtx = document.getElementById('completionPendingChart');
    if (compCtx) {
        if (completionPendingChart) completionPendingChart.destroy();
        completionPendingChart = new Chart(compCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Completed', 'Pending'],
                datasets: [{
                    label: 'Tickets',
                    data: [completedCount.length, pendingCount],
                    backgroundColor: ['#198754', '#FEF3C7'],
                    borderColor: ['#198754', '#B45309'],
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, grid: { display: false } },
                    y: { grid: { display: false } }
                }
            }
        });
    }

    // --- Top Issues Logic (sleek UI: rank circles, bar, colored counts) ---
    
    const issues = {};
    filtered.forEach(t => {
        const label = (t.issue && String(t.issue).trim()) ? String(t.issue).toLowerCase().trim()
            : (t.description ? String(t.description).toLowerCase().trim() : 'unknown');
        issues[label] = (issues[label] || 0) + 1;
    });

    const sortedIssues = Object.entries(issues).sort((a,b) => b[1] - a[1]).slice(0, 5);
    const maxCount = sortedIssues.length ? Math.max(...sortedIssues.map(([, c]) => c)) : 1;
    
    const issuesList = document.getElementById('top-issues-list');
    if(issuesList) {
        if(sortedIssues.length > 0) {
            const rankColors = ['top-issues-rank-1', 'top-issues-rank-2', 'top-issues-rank-3', 'top-issues-rank-4', 'top-issues-rank-5'];
            issuesList.innerHTML = sortedIssues.map(([desc, count], i) => {
                const safeDesc = (desc || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
                const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
                const rankClass = rankColors[i] || 'top-issues-rank-5';
                return `
                <li class="top-issues-item">
                    <span class="top-issues-item-rank ${rankClass}">${i + 1}</span>
                    <div class="top-issues-item-body">
                        <span class="top-issues-item-label text-truncate" title="${safeDesc}">${escapeHtml(desc)}</span>
                        <div class="top-issues-item-bar"><span class="top-issues-item-fill ${rankClass}" style="width: ${pct}%"></span></div>
                    </div>
                    <span class="top-issues-item-count ${rankClass}">${count}</span>
                </li>`;
            }).join('');
        } else {
            issuesList.innerHTML = '<li class="top-issues-empty">No data available</li>';
        }
    }
}

// --- Teams ---
async function loadTeams() {
    if (allTickets.length === 0) await loadTickets();
    
    // Dynamically populate team select based on data
    const teams = new Set();
    allTickets.forEach(t => {
        if(t.team) teams.add(t.team.trim().toUpperCase()); // Convert to uppercase
    });
    
    // Convert to array, unique, and sort alphabetically with natural number sorting
    const uniqueTeams = Array.from(teams).filter((t, index, self) => 
        index === self.findIndex((x) => x === t)
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));

    const select = document.getElementById('team-select');
    const currentVal = select.value ? select.value.toUpperCase() : '';
    
    select.innerHTML = '<option value="">Choose a Repair Team...</option>' + 
        uniqueTeams.map(t => `<option value="${t}">${t}</option>`).join('');
        
    if(currentVal) select.value = currentVal;
}

const ROLE_LABELS = { programmer: 'System Administrator', company_owner: 'Admin', staff: 'Staff', maintenance_provider: 'System Administrator' };

async function loadUsersManagement() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    try {
        const r = await fetch('api/users.php');
        if (!r.ok) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-danger">Unable to load users.</td></tr>';
            return;
        }
        const list = await r.json();
        if (!Array.isArray(list)) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-muted">No users.</td></tr>';
            return;
        }
        window._usersList = list;
        const isAdmin = (window.USER_ROLE || '') === 'company_owner';
        const isSystemAdminUser = (r) => r === 'programmer' || r === 'maintenance_provider';
        const formatCreated = (createdAt) => {
            if (!createdAt) return '';
            const d = new Date(createdAt);
            return isNaN(d.getTime()) ? createdAt : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        };
        tbody.innerHTML = list.map(u => {
            const un = escapeHtml(u.username);
            const em = escapeHtml(u.email);
            const dn = escapeHtml(u.display_name || u.username);
            const created = formatCreated(u.created_at);
            const showActions = !isAdmin || !isSystemAdminUser(u.role);
            const actionsCell = showActions
                ? `<td class="users-actions-cell">
                    <button type="button" class="btn btn-sm users-action-btn users-action-edit btn-edit-user" data-username="${un}" title="Edit"><i class="fas fa-pen"></i><span>Edit</span></button>
                    <button type="button" class="btn btn-sm users-action-btn users-action-resend btn-resend-user" data-username="${un}" title="Resend login email"><i class="fas fa-paper-plane"></i><span>Resend</span></button>
                    <button type="button" class="btn btn-sm users-action-btn users-action-delete btn-delete-user" data-username="${un}" data-display-name="${dn}" title="Delete"><i class="fas fa-user-minus"></i><span>Delete</span></button>
                </td>`
                : '<td class="users-actions-cell text-muted small"></td>';
            return `<tr>
                <td>${em}</td>
                <td>${dn}</td>
                <td>${ROLE_LABELS[u.role] || u.role}</td>
                <td class="text-muted small">${escapeHtml(created)}</td>
                ${actionsCell}
            </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-danger">Failed to load users.</td></tr>';
    }
}

// Manage users: Edit, Delete, Resend (event delegation)
document.body.addEventListener('click', async function(e) {
    const editBtn = e.target.closest('.btn-edit-user');
    const deleteBtn = e.target.closest('.btn-delete-user');
    const resendBtn = e.target.closest('.btn-resend-user');
    if (editBtn) {
        const username = editBtn.getAttribute('data-username');
        const list = window._usersList;
        const user = list && list.find(u => u.username === username);
        if (user) {
            document.getElementById('editUserUsername').value = user.username;
            document.getElementById('editUserEmail').value = user.email || '';
            document.getElementById('editUserDisplayName').value = user.display_name || '';
            document.getElementById('editUserRole').value = user.role || 'staff';
            new bootstrap.Modal(document.getElementById('editUserModal')).show();
        }
    } else if (deleteBtn) {
        const username = deleteBtn.getAttribute('data-username');
        const displayName = deleteBtn.getAttribute('data-display-name') || username;
        if (!username) return;
        document.getElementById('deleteUserConfirmName').textContent = displayName;
        document.getElementById('deleteUserConfirmBtn').setAttribute('data-pending-username', username);
        new bootstrap.Modal(document.getElementById('deleteUserConfirmModal')).show();
    } else if (resendBtn) {
        const username = resendBtn.getAttribute('data-username');
        if (!username) return;

        resendBtn.disabled = true;
        try {
            const r = await fetch('api/users.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resend', username }) });
            const data = await r.json().catch(() => ({}));
            if (r.ok && data.success) {
                showToast(data.email_sent ? 'New login details sent to user\'s email.' : (data.email_error || 'Email could not be sent; share credentials manually.'), data.email_sent ? 'success' : 'info');
            } else {
                showToast(data.error || 'Failed to resend.', 'error');
            }
        } catch (err) {
            showToast('Request failed.', 'error');
        }
        resendBtn.disabled = false;
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const editUserSubmit = document.getElementById('editUserSubmit');
    const editUserForm = document.getElementById('editUserForm');
    if (editUserSubmit && editUserForm) {
        editUserSubmit.addEventListener('click', async function() {
            const username = document.getElementById('editUserUsername').value;
            const email = (document.getElementById('editUserEmail') || {}).value;
            const display_name = document.getElementById('editUserDisplayName').value;
            const role = document.getElementById('editUserRole').value;
            if (!username) return;
            const trimmedEmail = (email || '').trim();
            if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
                showToast('Please enter a valid email address.', 'error');
                return;
            }
            editUserSubmit.disabled = true;
            try {
                const r = await fetch('api/users.php', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email: trimmedEmail, display_name: display_name.trim(), role: role || 'staff' })
                });
                const data = await r.json().catch(() => ({}));
                if (r.ok && data.success) {
                    showToast('User updated.', 'success');
                    bootstrap.Modal.getInstance(document.getElementById('editUserModal'))?.hide();
                    if (activeTab === 'users') await loadUsersManagement();
                } else {
                    showToast(data.error || 'Failed to update user.', 'error');
                }
            } catch (e) {
                showToast('Request failed.', 'error');
            }
            editUserSubmit.disabled = false;
        });
    }

    const deleteUserConfirmBtn = document.getElementById('deleteUserConfirmBtn');
    if (deleteUserConfirmBtn) {
        deleteUserConfirmBtn.addEventListener('click', async function() {
            const username = deleteUserConfirmBtn.getAttribute('data-pending-username');
            if (!username) return;
            deleteUserConfirmBtn.disabled = true;
            const originalLabel = deleteUserConfirmBtn.innerHTML;
            deleteUserConfirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Deleting...';
            try {
                const r = await fetch('api/users.php', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username })
                });
                const data = await r.json().catch(() => ({}));
                if (r.ok && data.success) {
                    showToast('User deleted.', 'success');
                    bootstrap.Modal.getInstance(document.getElementById('deleteUserConfirmModal'))?.hide();
                    if (activeTab === 'users') await loadUsersManagement();
                } else {
                    showToast(data.error || 'Failed to delete user.', 'error');
                }
            } catch (e) {
                showToast('Request failed.', 'error');
            } finally {
                deleteUserConfirmBtn.disabled = false;
                deleteUserConfirmBtn.innerHTML = originalLabel;
            }
        });
    }
});

function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

function loadTeamDetails() {
    const team = document.getElementById('team-select').value;
    const container = document.getElementById('team-details');
    
    const wrapper = document.getElementById('team-select-wrapper');
    if (wrapper) wrapper.classList.toggle('team-select-has-value', !!team);

    if (!team) {
        container.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="fas fa-users-cog fa-4x mb-3 opacity-25"></i>
                <h5>No Team Selected</h5>
                <p>Please select a repair team to view details.</p>
            </div>`;
        return;
    }

    const teamTickets = allTickets.filter(t => (t.team || '').trim().toUpperCase() === team);
    window._activeWorkloadTickets = teamTickets;
    window._activeWorkloadSortColumn = window._activeWorkloadSorColumn || '';
    window._activeWorkloadSortDirection = window._activeWorkloadSortDirection || 1;

    const total = teamTickets.length;
    const completed = teamTickets.filter(t => t.status && (t.status.toLowerCase().includes('done') || t.status.toLowerCase().includes('resolved') || t.status.toLowerCase().includes('complete') || t.status.toLowerCase().includes('fixed'))).length;
    const pending = total - completed;

    const displayList = getSortedActiveWorkloadList();
    const displayCount = displayList.length;

    container.innerHTML = `
        <div class="row g-4 mb-4 team-summary-cards-row">
            <div class="col-md-4">
                <div class="card summary-card bg-primary text-white h-100 shadow-sm team-summary-card">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="me-3">
                                <div class="text-white-50 small text-uppercase fw-bold">Total Assigned</div>
                                <div class="fs-2 fw-bold">${total}</div>
                            </div>
                            <i class="fas fa-clipboard-list card-icon"></i>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card summary-card bg-success text-white h-100 shadow-sm team-summary-card">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="me-3">
                                <div class="text-white-50 small text-uppercase fw-bold">Completed</div>
                                <div class="fs-2 fw-bold">${completed}</div>
                            </div>
                            <i class="fas fa-check-double card-icon"></i>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card summary-card bg-warning text-white h-100 shadow-sm team-summary-card">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="me-3">
                                <div class="text-white-50 small text-uppercase fw-bold">Pending</div>
                                <div class="fs-2 fw-bold">${pending}</div>
                            </div>
                            <i class="fas fa-hourglass-half card-icon"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="row">
            <div class="col-12">
                <div class="card border-0 shadow-sm">
                    <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center">
                        <h5 class="mb-0 fw-bold">Active Workload</h5>
                        <span class="badge rounded-pill active-workload-ticket-count" id="active-workload-count-badge">${displayCount} Tickets</span>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive active-workload-table-wrapper" style="max-height: 400px; overflow-y: auto;">
                            <table class="table table-hover align-middle mb-0" id="active-workload-table">
                                <thead class="position-sticky top-0" style="z-index: 10;">
                                    <tr>
                                        <th class="ps-4 border-0 rounded-start">ID</th>
                                        <th class="border-0">Issue</th>
                                        <th onclick="sortActiveWorkloadTable('status')" class="border-0">Status <i class="fas fa-sort small ms-1"></i></th>
                                        <th onclick="sortActiveWorkloadTable('risk_level')" class="border-0 rounded-end">Risk <i class="fas fa-sort small ms-1"></i></th>
                                    </tr>
                                </thead>
                                <tbody id="active-workload-tbody">
                                    ${displayCount > 0 ? displayList.map(t => {
                                        const q = (JSON.stringify(t) || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                        return `
                                        <tr>
                                            <td class="ps-4 fw-bold jo-number-pink ticket-id-view-link" role="button" tabindex="0" data-ticket-json="${q}" title="View ticket details">#${t.ticket_id}</td>
                                            <td><div class="text-truncate" style="max-width: 300px;" title="${(ticketIssueDisplay(t) || '').replace(/"/g, '&quot;')}">${(ticketIssueDisplay(t) || '—').replace(/</g, '&lt;')}</div></td>
                                            <td><span class="badge bg-${getStatusColor(t.status)}" title="${(normalizeStatus(t.status) || '').replace(/"/g, '&quot;')}">${normalizeStatus(t.status)}</span></td>
                                            <td><span class="badge bg-${getRiskColor(t.risk_level)}" title="${(t.risk_level || '').replace(/"/g, '&quot;')}">${t.risk_level}</span></td>
                                        </tr>
                                    `; }).join('') : '<tr><td colspan="4" class="text-center py-4 text-muted">No tickets assigned to this team.</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function getSortedActiveWorkloadList() {
    const list = (window._activeWorkloadTickets || []).slice();
    const col = window._activeWorkloadSortColumn || '';
    const dir = window._activeWorkloadSortDirection || 1;
    if (!col) return list;
    list.sort((a, b) => {
        let valA = col === 'status' ? normalizeStatus(a.status) : (a[col] || '');
        let valB = col === 'status' ? normalizeStatus(b.status) : (b[col] || '');
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
    });
    return list;
}

function sortActiveWorkloadTable(column) {
    if (window._activeWorkloadSortColumn === column) {
        window._activeWorkloadSortDirection *= -1;
    } else {
        window._activeWorkloadSortColumn = column;
        window._activeWorkloadSortDirection = 1;
    }
    updateActiveWorkloadTableBody();
}

function updateActiveWorkloadTableBody() {
    const tbody = document.getElementById('active-workload-tbody');
    const badge = document.getElementById('active-workload-count-badge');
    if (!tbody || !badge) return;
    const list = getSortedActiveWorkloadList();
    badge.textContent = list.length + ' Tickets';
    const ticketJson = (t) => (JSON.stringify(t) || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    tbody.innerHTML = list.length > 0 ? list.map(t => `
        <tr>
            <td class="ps-4 fw-bold jo-number-pink ticket-id-view-link" role="button" tabindex="0" data-ticket-json="${ticketJson(t)}" title="View ticket details">#${t.ticket_id}</td>
            <td><div class="text-truncate" style="max-width: 300px;" title="${(ticketIssueDisplay(t) || '').replace(/"/g, '&quot;')}">${(ticketIssueDisplay(t) || '—').replace(/</g, '&lt;')}</div></td>
            <td><span class="badge bg-${getStatusColor(t.status)}" title="${(normalizeStatus(t.status) || '').replace(/"/g, '&quot;')}">${normalizeStatus(t.status)}</span></td>
            <td><span class="badge bg-${getRiskColor(t.risk_level)}" title="${(t.risk_level || '').replace(/"/g, '&quot;')}">${t.risk_level}</span></td>
        </tr>
    `).join('') : '<tr><td colspan="4" class="text-center py-4 text-muted">No tickets assigned to this team.</td></tr>';
}

// --- Checkbox and Viber (5-ticket limit) – logic from test.php ---
const MAX_VIBER_TICKETS = 5;

function handleTicketCheckboxChange(checkbox) {
    try {
        const id = checkbox.value;
        if (checkbox.checked) {
            selectedTicketIds.add(id);
            if (selectedTicketIds.size > MAX_VIBER_TICKETS) {
                selectedTicketIds.delete(id);
                checkbox.checked = false;
                showToast('Only up to 5 tickets can be copied for Viber.', 'error');
            }
        } else {
            selectedTicketIds.delete(id);
        }
        updateExportButton();
    } catch (e) {
        console.error('handleTicketCheckboxChange:', e);
    }
}

function updateExportButton() {
    try {
        const tbody = document.getElementById('tickets-table-body');
        if (!tbody) return;
        saveCheckboxStates();
        const uniqueCount = selectedTicketIds.size;

        const viberBtn = document.getElementById('viber-export-btn');
        const clearBtn = document.getElementById('clear-selection-btn');
        const countEl = document.getElementById('viber-selection-count');
        if (viberBtn) {
            viberBtn.style.display = 'inline-block';
            viberBtn.disabled = uniqueCount < 1 || uniqueCount > MAX_VIBER_TICKETS;
        }
        if (clearBtn) {
            clearBtn.style.display = uniqueCount > 0 ? 'inline-block' : 'none';
        }
        if (countEl) {
            if (uniqueCount > 0) {
                countEl.style.display = '';
                countEl.textContent = uniqueCount === 1 ? '1 ticket selected' : uniqueCount + ' tickets selected';
            } else {
                countEl.style.display = 'none';
            }
        }
    } catch (e) {
        console.error('updateExportButton:', e);
    }
}

function clearAllSelections() {
    try {
        const tbody = document.getElementById('tickets-table-body');
        const checkboxes = tbody ? tbody.querySelectorAll('input[type="checkbox"].ticket-checkbox') : [];
        selectedTicketIds.clear();
        checkboxes.forEach(cb => cb.checked = false);
        updateExportButton();
        showToast('All selections cleared', 'success');
    } catch (e) {
        console.error('clearAllSelections:', e);
    }
}

// --- Viber Export Functions ---

function formatTicketForViber(ticket) {
    const formatValue = (val) => val != null && String(val).trim() !== '' ? String(val).trim() : 'N/A';
    const formatDate = (val) => {
        if (!val) return 'N/A';
        const d = new Date(val);
        return isNaN(d.getTime()) ? val : val.split('T')[0];
    };

    return `TICKET DETAILS
Ticket #: ${formatValue(ticket.ticket_id_form)}
JO Number: ${formatValue(ticket.ticket_id)}
Date Created: ${formatDate(ticket.date_created)}
Customer: ${formatValue(ticket.customer_name)}
Account: ${formatValue(ticket.account_number)}
Contact: ${formatValue(ticket.contact_num)}
Address: ${formatValue(ticket.address)}
Issue: ${formatValue(ticket.issue)}
Description: ${formatValue(ticket.description)}
Status: ${formatValue(ticket.status ? normalizeStatus(ticket.status) : ticket.status)}
Risk Level: ${formatValue(ticket.risk_level)}
Team: ${formatValue(ticket.team)}
Technician: ${formatValue(ticket.technician)}
Date Started: ${formatDate(ticket.date_started)}
1st Dispatch: ${formatDate(ticket.first_dispatch)}
Date Completed: ${formatDate(ticket.date_completed)}
Remarks: ${formatValue(ticket.remarks)}
`;
}

// Clipboard-only Viber sending (no deep-link) to avoid truncation and keep ALL data.
function copyTextToClipboardWithFallback(text, successMessage) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            if (successMessage) showToast(successMessage, 'success');
        }).catch(() => {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                if (successMessage) showToast(successMessage, 'success');
            } catch (err) {
                showToast('Please copy manually and paste into Viber', 'info');
            }
            document.body.removeChild(textarea);
        });
    } else {
        showToast('Please copy manually and paste into Viber', 'info');
    }
}

function sendTicketViaViber(ticket) {
    if (!ticket) {
        showToast('No ticket data available', 'error');
        return;
    }   

    const message = formatTicketForViber(ticket);
    copyTextToClipboardWithFallback(message, 'Full ticket copied! Please paste in Viber (Ctrl+V)');
    openViberApp();
}

function sendCurrentTicketViaViber() {
    if (currentViewTicket) {
        sendTicketViaViber(currentViewTicket);
    } else {
        showToast('No ticket data available', 'error');
    }
}

function sendSelectedTicketsViaViber() {
    try {
        saveCheckboxStates();
        const tbody = document.getElementById('tickets-table-body');
        if (selectedTicketIds.size === 0) {
            showToast('Please select at least one ticket', 'error');
            return;
        }
        if (selectedTicketIds.size > MAX_VIBER_TICKETS) {
            showToast('Only up to 5 tickets can be copied for Viber.', 'error');
            return;
        }

        const selectedTickets = [...selectedTicketIds].map(id =>
            (typeof allTickets !== 'undefined' && allTickets ? allTickets : ticketsViewList).find(t => String(t.ticket_id) === id)
        ).filter(Boolean);

        const count = selectedTickets.length;

        // Format multiple tickets: "1. TICKET DETAILS\n..." then "2. TICKET DETAILS..." etc.
        const messages = selectedTickets.map((ticket, index) => {
            const ticketText = formatTicketForViber(ticket);
            return `${index + 1}. ${ticketText}`;
        });

        const combinedMessage = messages.join('\n\n');

        copyTextToClipboardWithFallback(combinedMessage, `Full details for ${count} ticket(s) copied! Paste in Viber (Ctrl+V)`);
        openViberApp();

        // Clear checkboxes after send
        selectedTicketIds.clear();
        if (tbody) {
            tbody.querySelectorAll('input[type="checkbox"].ticket-checkbox').forEach(cb => { cb.checked = false; });
        }
        updateExportButton();
    } catch (e) {
        console.error('sendSelectedTicketsViaViber:', e);
    }
}

// Open Viber with a short hint only. Full ticket text is always copied to clipboard (no URL length limit / truncation).
function openViberApp() {
    try {
        const hint = 'Paste ticket details from clipboard here (Ctrl+V).';
        const openUrl = 'viber://forward?text=' + encodeURIComponent(hint);
        const link = document.createElement('a');
        link.href = openUrl;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (e) {
        console.warn('Viber open link failed:', e);
    }
}

// --- New Tickets Notification Badge ---

function checkForNewTickets() {
    if (!allTickets || allTickets.length === 0) return;

    // Get last seen ticket ID from localStorage
    const lastSeenTicketId = localStorage.getItem('lastSeenTicketId');
    const lastSeenTimestamp = localStorage.getItem('lastSeenTicketTimestamp');

    if (!lastSeenTicketId && !lastSeenTimestamp) {
        // First time - store current newest ticket
        const newestTicket = allTickets[0]; // Already sorted newest first
        if (newestTicket && newestTicket.ticket_id) {
            localStorage.setItem('lastSeenTicketId', String(newestTicket.ticket_id));
            localStorage.setItem('lastSeenTicketTimestamp', String(Date.now()));
        }
        return;
    }

    // Count new tickets
    let newCount = 0;
    if (lastSeenTicketId) {
        // Count tickets newer than last seen ID
        const lastSeenIndex = allTickets.findIndex(t => String(t.ticket_id) === lastSeenTicketId);
        if (lastSeenIndex > 0) {
            newCount = lastSeenIndex;
        } else if (lastSeenIndex === -1) {
            // Last seen ticket not found - might be deleted, count all as new
            newCount = allTickets.length;
        }
    } else if (lastSeenTimestamp) {
        // Fallback: count by timestamp
        const lastSeenTime = parseInt(lastSeenTimestamp);
        newCount = allTickets.filter(t => {
            if (!t.date_created) return false;
            const ticketTime = new Date(t.date_created).getTime();
            return ticketTime > lastSeenTime;
        }).length;
    }

    // Update badge
    const badge = document.getElementById('new-tickets-badge');
    if (badge) {
        if (newCount > 0) {
            badge.textContent = newCount > 99 ? '99+' : newCount;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }

    // Update last seen when user clicks Dashboard
    const dashboardLink = document.querySelector('a[onclick="showTab(\'dashboard\')"]');
    if (dashboardLink && !dashboardLink.dataset.listenerAdded) {
        dashboardLink.addEventListener('click', function() {
            // Update last seen to current newest ticket
            if (allTickets.length > 0 && allTickets[0].ticket_id) {
                localStorage.setItem('lastSeenTicketId', String(allTickets[0].ticket_id));
                localStorage.setItem('lastSeenTicketTimestamp', String(Date.now()));
                // Hide badge
                const badge = document.getElementById('new-tickets-badge');
                if (badge) badge.style.display = 'none';
            }
        });
        dashboardLink.dataset.listenerAdded = 'true';
    }
}

