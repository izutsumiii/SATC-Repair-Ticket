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
    const main = document.querySelector('main');
    const footer = document.querySelector('.system-footer');
    const toggleBtn = document.getElementById('sidebarToggle');
    
    sidebar.classList.toggle('collapsed');
    
    // Adjust main content margin, width, and button position
    if (sidebar.classList.contains('collapsed')) {
        main.style.marginLeft = '70px';
        main.style.width = 'calc(100% - 70px)';
        if (footer) {
            footer.style.marginLeft = '70px';
            footer.style.width = 'calc(100% - 70px)';
        }
        toggleBtn.style.left = '55px';
    } else {
        main.style.marginLeft = '16.66667%';
        main.style.width = 'calc(100% - 16.66667%)';
        if (footer) {
            footer.style.marginLeft = '16.66667%';
            footer.style.width = 'calc(100% - 16.66667%)';
        }
        toggleBtn.style.left = 'calc(16.66667% - 15px)';
    }
}

// --- CONFIGURATION ---
// Set to 'php' (local) or 'gas' (Google Apps Script)
const API_MODE = 'gas';

// PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL HERE (must end with /exec):
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzcuLV1n4uBd2wPTOJd8KSo77LtOIjF9RLyJ3DtAKsWzHYPoRoWxw-xaUgSZN2Yq4-23A/exec';
window.GAS_URL = GAS_URL; // so console test and fallback can use it

// GAS TROUBLESHOOTING (Network error / connection failed):
// 1. Deploy: In Google Apps Script → Deploy → Manage deployments → Edit → set "Who has access" to "Anyone".
// 2. URL: After redeploy, copy the new Web app URL and paste it in GAS_URL above (replace the whole string).
// 3. Run via HTTP: Open the app at http://localhost/... (XAMPP), not as file:// (file on disk).
// 4. Test in console: Open DevTools (F12) → Console → type: testGasConnection()
//    This will try to call GAS and print the real error or "OK" so you can debug.

// Auto-refresh interval in milliseconds (e.g., 2000 = 2 seconds)
const REFRESH_RATE = 2000 

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
// ---------------------

function getApiUrl(params = '') {
    if (API_MODE === 'gas') {
        const separator = GAS_URL.includes('?') ? '&' : '?';
        return `${GAS_URL}${separator}${params}`;
    } else {
        return `api/api.php?${params}`;
    }
}

/** Run in browser console (F12 → Console): testGasConnection()
 * Tests if the GAS URL is reachable and logs the real error if not. */
window.testGasConnection = async function () {
    console.log('Testing GAS URL:', GAS_URL);
    try {
        const r = await fetch(GAS_URL, { method: 'GET' });
        console.log('Status:', r.status, r.statusText);
        const text = await r.text();
        console.log('Response (first 300 chars):', text.slice(0, 300));
        if (r.ok) console.log('OK – GAS URL is reachable.');
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
}

// Navigation
function showTab(tabId) {
    activeTab = tabId; // Update active state
    
    // Hide all views
    ['dashboard-view', 'clusters-view', 'analytics-view', 'tickets-view', 'teams-view'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden-section');
    });
    // Remove active class from nav
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    
    // Show selected view
    document.getElementById(tabId + '-view').classList.remove('hidden-section');
    // Set active nav (approximate match)
    const navLink = document.querySelector(`.nav-link[onclick="showTab('${tabId}')"]`);
    if (navLink) navLink.classList.add('active');

    // Load specific data
    refreshCurrentTab();
}

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
                const cityUpper = String(t.city || '').toUpperCase();
                const clusterUpper = String(t.risk_level_source || '').toUpperCase();

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
        const url = getApiUrl('action=read');
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            document.getElementById('summary-cards').innerHTML = `<div class="col-12 text-center text-danger">Error: ${data.error}</div>`;
            return;
        }

        allTickets = Array.isArray(data) ? data : (data && Array.isArray(data.tickets) ? data.tickets : []);
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
            const cityUpper = String(t.city || '').toUpperCase();
            const clusterUpper = String(t.risk_level_source || '').toUpperCase();

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
            const city = String(t.city || '').trim();
            const cluster = String(t.risk_level_source || '').trim();
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
                const cityUpper = String(t.city || '').toUpperCase();
                const clusterUpper = String(t.risk_level_source || '').toUpperCase();
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
                        const cityUpper = String(t.city || '').toUpperCase();
                        const clusterUpper = String(t.risk_level_source || '').toUpperCase();
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
                            const cityUpper = String(t.city || '').toUpperCase();
                            const clusterUpper = String(t.risk_level_source || '').toUpperCase();
                            if (d.type === 'city') return cityUpper.indexOf(area.key) !== -1;
                            if (d.type === 'cluster') return clusterUpper.indexOf(area.key) !== -1;
                            return false;
                        });
                    }
                }
                // 3) Generic city/municipality (exact or case-insensitive)
                const key = lab || 'Unspecified';
                return filtered.filter(t => {
                    const c = String(t.city || '').trim();
                    const cl = String(t.risk_level_source || '').trim();
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
                    <td class="text-muted">${escapeHtml(t.customer_name || '—')}</td>
                    <td><span class="badge bg-${statusColor}" style="font-size: 0.65rem;">${escapeHtml(displayStatus)}</span></td>
                    <td><span class="badge bg-${riskColor}" style="font-size: 0.65rem;">${escapeHtml(t.risk_level || '')}</span></td>
                    <td class="text-end">
                        <button type="button" class="btn btn-sm btn-light text-primary border-0 py-1 px-2 btn-edit-cluster-ticket" title="Edit ticket"><i class="fas fa-edit"></i> Edit</button>
                    </td>
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
    
    // Handle edit button clicks
    const editBtn = e.target.closest('.btn-edit-cluster-ticket');
    if (editBtn) {
        e.preventDefault();
        e.stopPropagation();
        const row = editBtn.closest('.clusters-ticket-row');
        if (row) {
            const json = row.getAttribute('data-ticket-json');
            if (json) {
                try {
                    const ticket = JSON.parse(json.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
                    editTicket(ticket);
                } catch (err) {
                    console.error('Failed to parse ticket JSON:', err);
                }
            }
        }
        return;
    }

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
        const riskLevel = calculateRisk(t.description);
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
                tbody.innerHTML = '<tr><td colspan="10" class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted fw-medium">Loading Data. Please Wait...</p></td></tr>';
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
        
        const url = getApiUrl('action=read');
        console.log('Fetching tickets from:', url);
        
        const response = await fetch(url);
        const data = await response.json();
        
        console.log('Tickets API response:', data);
        
        // GAS error check
        if (data.error) {
            console.error('API returned error:', data.error);
            const tbody = document.getElementById('tickets-table-body');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="10" class="text-center py-5 text-danger"><i class="fas fa-exclamation-triangle me-2"></i>Error loading tickets: ' + data.error + '</td></tr>';
            }
            return;
        }

        // Check if data is an array
        if (!Array.isArray(data)) {
            console.error('API did not return an array:', data);
            const tbody = document.getElementById('tickets-table-body');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="10" class="text-center py-5 text-danger"><i class="fas fa-exclamation-triangle me-2"></i>Invalid data format received</td></tr>';
            }
            return;
        }

        allTickets = data;
        
        // Always render all tickets on initial load
        console.log('✓ Loading tickets SUCCESS, total count:', allTickets.length);
        
        if (allTickets.length === 0) {
            const tbody = document.getElementById('tickets-table-body');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="10" class="text-center py-5 text-muted"><i class="fas fa-inbox me-2"></i>No tickets available</td></tr>';
            }
            const countEl = document.getElementById('ticket-count');
            if(countEl) countEl.innerText = 'No tickets';
            return;
        }
        
        // If preserving filters (during refresh), apply current filters
        // Otherwise render all tickets
        if (preserveFilters) {
            filterTickets();
        } else {
            renderTicketsTable(allTickets);
            
            // Update count text
            const countEl = document.getElementById('ticket-count');
            if(countEl) countEl.innerText = `Showing ${allTickets.length} ticket${allTickets.length !== 1 ? 's' : ''}`;
        }
        
        console.log('✓ Tickets table rendered successfully');
    } catch (e) {
        console.error("Error loading tickets:", e);
        const tbody = document.getElementById('tickets-table-body');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center py-5 text-danger"><i class="fas fa-exclamation-triangle me-2"></i>Error: ' + e.message + '</td></tr>';
        }
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

function renderTicketsTable(tickets) {
    const tbody = document.getElementById('tickets-table-body');
    
    if (!tbody) {
        console.error('❌ Tickets table body element (#tickets-table-body) not found!');
        return;
    }
    
    console.log('→ Rendering tickets table, ticket count:', tickets ? tickets.length : 'null/undefined');
    
    if (!tickets || tickets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center py-5 text-muted">No tickets found</td></tr>';
        console.log('→ No tickets to display');
        return;
    }

    const rows = tickets.map(t => {
        const displayStatus = normalizeStatus(t.status);
        const statusColor = getStatusColor(t.status);
        const statusIcon = getStatusIcon(t.status);
        const riskColor = getRiskColor(t.risk_level);
        const customer = t.customer_name != null ? String(t.customer_name) : '—';
        const description = t.description != null ? String(t.description) : '—';

        return `
        <tr>
            <td class="ps-3 text-dark">${escapeHtml(t.ticket_id_form) || '—'}</td>
            <td class="fw-bold jo-number-pink">#${escapeHtml(t.ticket_id)}</td>
            <td class="text-muted small">${escapeHtml(t.account_number) || '—'}</td>
            <td class="text-muted small">${escapeHtml(t.date_created)}</td>
            <td class="fw-medium ticket-cell-customer" title="${escapeAttr(customer)}">${escapeHtml(customer)}</td>
            <td><span class="ticket-issue" title="${escapeAttr(description)}">${escapeHtml(description)}</span></td>
            <td>
                <span class="badge bg-${statusColor} text-uppercase" style="letter-spacing: 0.5px; padding: 6px 10px;" title="${escapeAttr(displayStatus)}">
                    <i class="${statusIcon} me-1"></i> ${escapeHtml(displayStatus)}
                </span>
            </td>
            <td><span class="badge bg-${riskColor}" title="${escapeAttr(t.risk_level)}">${escapeHtml(t.risk_level)}</span></td>
            <td><span class="small text-muted"><i class="fas fa-users me-1"></i> ${escapeHtml(t.team) || 'Unassigned'}</span></td>
            <td class="text-end pe-3">
                <button class="btn btn-sm btn-light text-primary border-0 shadow-sm" onclick='editTicket(${JSON.stringify(t)})'>
                    <i class="fas fa-edit"></i> Edit
                </button>
            </td>
        </tr>
    `}).join('');
    
    tbody.innerHTML = rows;
    console.log('✓ Table HTML updated, row count:', tickets.length);
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

function filterTickets() {
    // Ensure allTickets is loaded
    if (!allTickets || allTickets.length === 0) {
        console.warn('No tickets data available to filter');
        const tbody = document.getElementById('tickets-table-body');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center py-5 text-muted">No tickets available</td></tr>';
        }
        return;
    }
    
    const search = document.getElementById('search-input').value.toLowerCase();
    const statusFilter = document.getElementById('filter-status').value;
    const risk = document.getElementById('filter-risk').value;

    const filtered = allTickets.filter(t => {
        const searchable = [
            t.ticket_id_form,
            t.ticket_id,
            t.customer_name,
            t.description,
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

    console.log(`Filtering tickets: ${filtered.length} of ${allTickets.length} match criteria`);

    // Update count text
    const countEl = document.getElementById('ticket-count');
    if(countEl) countEl.innerText = `Showing ${filtered.length} ticket${filtered.length !== 1 ? 's' : ''}`;

    renderTicketsTable(filtered);
}

// Sorting
let sortDirection = 1; // 1 for asc, -1 for desc
function sortTable(column) {
    sortDirection *= -1;
    allTickets.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];
        if (valA == null || valA === '') valA = '';
        if (valB == null || valB === '') valB = '';
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
        const v = t.ticket_id_form != null ? String(t.ticket_id_form).trim() : '';
        if (v.startsWith(prefix)) {
            const num = parseInt(v.slice(prefix.length), 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
        }
    });
    const next = maxNum + 1;
    return prefix + String(next).padStart(5, '0');
}

async function openTicketModal() {
    setTicketFormEditable(true);
    const saveBtn = document.getElementById('ticketModalBtnSave');
    if (saveBtn) saveBtn.style.display = '';
    document.getElementById('ticketForm').reset();
    document.getElementById('ticket_id').value = '';
    document.getElementById('modalTitle').innerText = 'New Ticket';
    if (!allTickets || allTickets.length === 0) await loadTickets();
    const nextTicket = getNextTicketNumber();
    document.getElementById('ticket_id_form').value = nextTicket;
    const displayEl = document.getElementById('display-ticket-number');
    if (displayEl) displayEl.textContent = nextTicket;
    document.querySelector('input[name="date_created"]').valueAsDate = new Date();
    ticketModal.show();
}

function editTicket(ticket) {
    setTicketFormEditable(true);
    document.getElementById('modalTitle').innerText = 'Edit Ticket #' + ticket.ticket_id;
    const form = document.getElementById('ticketForm');
    populateTicketForm(form, ticket);
    const displayEl = document.getElementById('display-ticket-number');
    if (displayEl) displayEl.textContent = ticket.ticket_id_form != null ? ticket.ticket_id_form : '—';
    const saveBtn = document.getElementById('ticketModalBtnSave');
    if (saveBtn) saveBtn.style.display = '';
    ticketModal.show();
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
    if (displayEl) displayEl.textContent = ticket.ticket_id_form != null ? ticket.ticket_id_form : '—';
}

/** Show ticket details in read-only popup (View Ticket modal, modern UI). */
function viewTicket(ticket) {
    document.getElementById('ticketViewModalTitle').innerText = 'View Ticket #' + (ticket.ticket_id || '—');
    const set = function (id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value != null && String(value).trim() !== '' ? String(value).trim() : '—';
    };
    const setDate = function (id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        if (!value) { el.textContent = '—'; return; }
        const d = new Date(value);
        const str = isNaN(d.getTime()) ? '—' : value.split('T')[0];
        el.textContent = str;
    };
    set('tv-ticket_id_form', ticket.ticket_id_form);
    set('tv-ticket_id', ticket.ticket_id);
    setDate('tv-date_created', ticket.date_created);
    set('tv-customer_name', ticket.customer_name);
    set('tv-account_number', ticket.account_number);
    set('tv-address', ticket.address);
    set('tv-description', ticket.description);
    set('tv-status', ticket.status ? normalizeStatus(ticket.status) : '');
    set('tv-risk_level', ticket.risk_level);
    set('tv-team', ticket.team);
    set('tv-technician', ticket.technician);
    setDate('tv-date_started', ticket.date_started);
    setDate('tv-date_completed', ticket.date_completed);
    set('tv-remarks', ticket.remarks);
    ticketViewModal.show();
}

/** Set all ticket form controls enabled or disabled (false = read-only). */
function setTicketFormEditable(editable) {
    const form = document.getElementById('ticketForm');
    if (!form) return;
    form.querySelectorAll('input, select, textarea').forEach(function (el) {
        el.disabled = !editable;
    });
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

async function saveTicket() {
    const form = document.getElementById('ticketForm');
    const dateCreated = (form.elements['date_created'] && form.elements['date_created'].value) ? form.elements['date_created'].value.trim() : '';
    const customer = (form.elements['customer_name'] && form.elements['customer_name'].value) ? form.elements['customer_name'].value.trim() : '';
    const description = (form.elements['description'] && form.elements['description'].value) ? form.elements['description'].value.trim() : '';
    const joNumber = (form.elements['ticket_id'] && form.elements['ticket_id'].value) ? form.elements['ticket_id'].value.trim() : '';
    const isNewTicket = !joNumber || document.getElementById('modalTitle').innerText === 'New Ticket';

    if (!dateCreated || !customer || !description) {
        showToast('Input needed: please fill Date Created, Customer / Unit, and Description.', 'error');
        return;
    }
    if (isNewTicket && !joNumber) {
        showToast('Input needed: please enter JO number.', 'error');
        return;
    }

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    data.isNewTicket = document.getElementById('modalTitle').innerText === 'New Ticket';

    if (API_MODE === 'gas') {
        try {
            const response = await fetch(GAS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            let result;
            const contentType = response.headers.get('Content-Type') || '';
            try {
                result = await response.json();
            } catch (parseErr) {
                const text = await response.text();
                console.error('GAS response not JSON:', response.status, text.slice(0, 200));
                showToast(response.ok ? 'Invalid response from server.' : 'Server error ' + response.status + '. Check deployment.', 'error');
                return;
            }

            if (result.success || result.ticket_id) {
                showToast('Ticket saved successfully.', 'success');
                refreshTicketForm();
                ticketModal.hide();
                loadTickets();
                if (!document.getElementById('dashboard-view').classList.contains('hidden-section')) loadDashboard();
            } else {
                showToast('Error: ' + (result.error || 'Could not save ticket.'), 'error');
            }
        } catch (e) {
            console.error(e);
            const msg = e.message || String(e);
            showToast(msg.includes('Failed to fetch') || msg.includes('NetworkError') ? 'Network error. Check GAS URL and connection.' : 'Error saving ticket: ' + msg, 'error');
        }
    } else {
        const method = data.ticket_id ? 'PUT' : 'POST';
        try {
            const response = await fetch('api/api.php', {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();

            if (result.success || result.ticket_id) {
                showToast('Ticket saved successfully.', 'success');
                refreshTicketForm();
                ticketModal.hide();
                loadTickets();
                if (!document.getElementById('dashboard-view').classList.contains('hidden-section')) loadDashboard();
            } else {
                showToast('Error saving ticket.', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('Error saving ticket.', 'error');
        }
    }
}

// --- Analytics ---
async function loadAnalytics() {
    if (allTickets.length === 0) await loadTickets(); // Ensure data is loaded
    toggleMonthYearDropdowns();
    updateAnalytics(true);
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
    // "This Week": daily buckets for 7 days (Sun–Sat).
    // "This Month" or "Month & Year" with month: daily buckets (days 1–31).
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

    // For "This Week": get week bounds (Sun–Sat) and day index 0..6
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
            const month = parseInt(parts[1], 10); // 1–12
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

    // --- Team Workload (horizontal bar) – not on Dashboard ---
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

    // --- Completed vs Pending (horizontal bar) – not on Dashboard ---
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
        const desc = t.description ? t.description.toLowerCase().trim() : 'unknown';
        issues[desc] = (issues[desc] || 0) + 1;
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

    const teamTickets = allTickets.filter(t => t.team === team);
    window._activeWorkloadTickets = teamTickets;
    window._activeWorkloadSortColumn = window._activeWorkloadSortColumn || '';
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
                                        <th class="border-0">Description</th>
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
                                            <td><div class="text-truncate" style="max-width: 300px;" title="${(t.description || '').replace(/"/g, '&quot;')}">${(t.description || '').replace(/</g, '&lt;')}</div></td>
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
            <td><div class="text-truncate" style="max-width: 300px;" title="${(t.description || '').replace(/"/g, '&quot;')}">${(t.description || '').replace(/</g, '&lt;')}</div></td>
            <td><span class="badge bg-${getStatusColor(t.status)}" title="${(normalizeStatus(t.status) || '').replace(/"/g, '&quot;')}">${normalizeStatus(t.status)}</span></td>
            <td><span class="badge bg-${getRiskColor(t.risk_level)}" title="${(t.risk_level || '').replace(/"/g, '&quot;')}">${t.risk_level}</span></td>
        </tr>
    `).join('') : '<tr><td colspan="4" class="text-center py-4 text-muted">No tickets assigned to this team.</td></tr>';
}
