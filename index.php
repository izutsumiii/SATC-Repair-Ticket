<?php
require_once __DIR__ . '/api/auth.php';
requireLogin();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>SATC Repair Ticketing System</title>
    <!-- Favicon: company logo -->
    <link rel="icon" type="image/png" href="logo.png">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <link href="assets/css/style.css" rel="stylesheet">
    <!-- Chart.js: use versioned build to avoid console source-map 404 from default npm bundle -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
</head>
<body>
<div id="toast-container" class="toast-container"></div>

<div class="container-fluid">
    <div class="row">
        <!-- Sidebar -->
        <nav class="col-md-3 col-lg-2 d-md-block sidebar collapse show" id="sidebar">
            <div class="sidebar-inner pt-1 px-2">
                <h4 class="px-2 pb-2 border-bottom d-flex flex-column align-items-center gap-1 sidebar-header">
                    <img src="s2s.png" alt="Logo" class="sidebar-logo">
                </h4>
                <ul class="nav flex-column sidebar-nav">
                    <li class="nav-item">
                        <a class="nav-link active" onclick="showTab('dashboard')">
                            <i class="fas fa-home"></i>
                            <span class="nav-text">Dashboard</span>
                            <span class="badge bg-danger rounded-pill ms-2" id="new-tickets-badge" style="display: none;">0</span>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" onclick="showTab('clusters')">
                            <i class="fas fa-map-marker-alt"></i>
                            <span class="nav-text">Clusters</span>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" onclick="showTab('analytics')">
                            <i class="fas fa-chart-line"></i>
                            <span class="nav-text">Analytics</span>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" onclick="showTab('tickets')">
                            <i class="fas fa-ticket-alt"></i>
                            <span class="nav-text">Tickets</span>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" onclick="showTab('teams')">
                            <i class="fas fa-users"></i>
                            <span class="nav-text">Repair Teams</span>
                        </a>
                    </li>
                    <?php if (($_SESSION['role'] ?? '') === 'programmer'): ?>
                    <li class="nav-item">
                        <a class="nav-link" onclick="showTab('users')">
                            <i class="fas fa-user-cog"></i>
                            <span class="nav-text">Manage users</span>
                        </a>
                    </li>
                    <?php endif; ?>
                </ul>
                <!-- User + Logout: all styles from assets/css/style.css (sidebar-user, sidebar-logout-btn) -->
                <div class="sidebar-user">
                    <div class="sidebar-user-info">
                        <span class="sidebar-user-icon"><i class="fas fa-user-circle" aria-hidden="true"></i></span>
                        <div class="sidebar-user-text">
                            <span class="sidebar-user-label">Logged in as</span>
                            <span class="sidebar-user-name"><?php echo htmlspecialchars($_SESSION['display_name'] ?? $_SESSION['username'] ?? 'User'); ?></span>
                            <span class="sidebar-user-role"><?php
                            $roleLabels = ['programmer' => 'System Administrator', 'company_owner' => 'Admin', 'staff' => 'Staff', 'maintenance_provider' => 'System Administrator'];
                            echo htmlspecialchars($roleLabels[$_SESSION['role'] ?? ''] ?? 'User');
                            ?></span>
                        </div>
                    </div>
                    <button type="button" class="sidebar-logout-btn" data-bs-toggle="modal" data-bs-target="#logoutConfirmModal" aria-label="Log out">
                        <i class="fas fa-sign-out-alt" aria-hidden="true"></i>
                        <span class="sidebar-logout-text">Logout</span>
                    </button>
                </div>
            </div>
        </nav>

        <!-- Logout confirmation modal (site-styled, responsive) -->
        <div class="modal fade" id="logoutConfirmModal" tabindex="-1" aria-labelledby="logoutConfirmModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content logout-confirm-modal">
                    <div class="modal-header logout-confirm-modal-header">
                        <h5 class="modal-title" id="logoutConfirmModalLabel"><i class="fas fa-sign-out-alt me-2"></i>Log out</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body logout-confirm-modal-body">
                        <p class="mb-0">Are you sure you want to log out?</p>
                    </div>
                    <div class="modal-footer logout-confirm-modal-footer">
                        <button type="button" class="btn btn-secondary logout-confirm-cancel" data-bs-dismiss="modal">Cancel</button>
                        <a href="api/auth.php?logout=1" class="btn btn-primary logout-confirm-ok" id="logoutConfirmOk">Log out</a>
                    </div>
                </div>
            </div>
        </div>

        <!-- Delete user confirmation modal (Admin / System Administrator; site-styled) -->
        <div class="modal fade" id="deleteUserConfirmModal" tabindex="-1" aria-labelledby="deleteUserConfirmModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content delete-user-confirm-modal">
                    <div class="modal-header delete-user-confirm-modal-header">
                        <h5 class="modal-title" id="deleteUserConfirmModalLabel"><i class="fas fa-user-times me-2"></i>Delete user</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body delete-user-confirm-modal-body">
                        <p class="mb-0">Delete user <strong id="deleteUserConfirmName"></strong>? They will no longer be able to log in.</p>
                    </div>
                    <div class="modal-footer delete-user-confirm-modal-footer">
                        <button type="button" class="btn btn-secondary delete-user-confirm-cancel" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-danger delete-user-confirm-ok" id="deleteUserConfirmBtn">Delete user</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Sidebar Toggle Button (overlaps main content) -->
        <button class="sidebar-toggle" id="sidebarToggle" onclick="toggleSidebar()" title="Toggle Sidebar">
            <i class="fas fa-chevron-left"></i>
        </button>

        <!-- Main Content -->
        <main class="col-md-9 ms-sm-auto col-lg-10 px-md-4 py-4">
            
            <!-- Dashboard Tab -->
            <div id="dashboard-view">
                <div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom gap-2">
                    <h1 class="h2 mb-0">Dashboard</h1>
                    <div class="d-flex flex-nowrap align-items-center gap-2 dashboard-filters">
                        <select class="form-select form-select-sm shadow-sm" id="dashboard-region" onchange="updateDashboard()">
                            <option value="">All Regions</option>
                            <option value="bukidnon">Bukidnon</option>
                            <option value="davao_city">Davao City</option>
                            <option value="davao_del_sur">Davao Del Sur</option>
                            <option value="davao_del_norte">Davao del Norte</option>
                            <option value="cotabato">Cotabato</option>
                            <option value="cdo">CDO</option>
                            <option value="misamis_oriental">Misamis Oriental</option>
                        </select>
                        <select class="form-select form-select-sm shadow-sm" id="dashboard-month" onchange="updateDashboard()">
                            <option value="">Month</option>
                            <option value="1">January</option>
                            <option value="2">February</option>
                            <option value="3">March</option>
                            <option value="4">April</option>
                            <option value="5">May</option>
                            <option value="6">June</option>
                            <option value="7">July</option>
                            <option value="8">August</option>
                            <option value="9">September</option>
                            <option value="10">October</option>
                            <option value="11">November</option>
                            <option value="12">December</option>
                        </select>
                        <select class="form-select form-select-sm shadow-sm" id="dashboard-year" onchange="updateDashboard()">
                            <option value="">Year</option>
                            <?php
                            $currentYear = (int)date('Y');
                            $startYear = $currentYear - 10;
                            $endYear = $currentYear + 10;
                            for ($y = $endYear; $y >= $startYear; $y--) {
                                echo '<option value="' . $y . '"' . ($y === $currentYear ? ' selected' : '') . '>' . $y . '</option>';
                            }
                            ?>
                        </select>
                    </div>
                </div>

                <div class="row g-4 mb-4" id="summary-cards">
                    <!-- Cards injected via JS -->
                    <div class="col-12 section-loader"><div class="loader"></div><p>Loading Data. Please Wait...</p></div>
                </div>

                <div class="row g-4">
                    <div class="col-lg-6 mb-4">
                        <div class="card border-0 shadow-sm h-100 overflow-hidden">
                            <div class="card-header bg-transparent border-0 pt-4 px-4 pb-0 d-flex justify-content-between align-items-center">
                                <div>
                                    <h5 class="fw-bold mb-1">Status Distribution</h5>
                                    <p class="text-muted small mb-0">Live breakdown of ticket statuses</p>
                                </div>
                                <div class="icon-shape bg-light text-primary rounded-circle p-2">
                                    <i class="fas fa-chart-pie fa-lg"></i>
                                </div>
                            </div>
                            <div class="card-body p-4 position-relative">
                                <div class="chart-container" style="position: relative; height: 300px; width: 100%; display: flex; justify-content: center;">
                                    <canvas id="statusChart"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-6 mb-4">
                        <div class="card border-0 shadow-sm h-100 overflow-hidden">
                            <div class="card-header bg-transparent border-0 pt-4 px-4 pb-0 d-flex justify-content-between align-items-center">
                                <div>
                                    <h5 class="fw-bold mb-1">Risk Analysis</h5>
                                    <p class="text-muted small mb-0">Tickets categorized by risk level</p>
                                </div>
                                <div class="icon-shape bg-light text-danger rounded-circle p-2">
                                    <i class="fas fa-shield-alt fa-lg"></i>
                                </div>
                            </div>
                            <div class="card-body p-4 position-relative">
                                <div class="chart-container" style="position: relative; height: 300px; width: 100%; display: flex; justify-content: center;">
                                    <canvas id="riskChart"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Clusters Tab -->
            <div id="clusters-view" class="hidden-section">
                <div class="d-flex justify-content-between align-items-center pt-3 pb-2 mb-3 border-bottom">
                    <h1 class="h2 mb-0">Clusters</h1>
                </div>

                <div class="d-flex flex-wrap align-items-center gap-3 mb-4">
                    <div class="d-flex flex-wrap gap-3 flex-grow-1" id="clusters-summary-cards">
                        <!-- Injected via JS -->
                        <div class="section-loader"><div class="loader"></div><p>Loading Data. Please Wait...</p></div>
                    </div>
                    <div class="d-flex flex-nowrap align-items-center gap-2">
                        <select class="form-select form-select-sm shadow-sm" id="clusters-region" style="min-width: 160px;" onchange="updateClusters()">
                            <option value="">Select Region</option>
                            <option value="bukidnon">Bukidnon</option>
                            <option value="davao_city">Davao City</option>
                            <option value="davao_del_sur">Davao Del Sur</option>
                            <option value="davao_del_norte">Davao del Norte</option>
                            <option value="cotabato">Cotabato</option>
                            <option value="cdo">CDO</option>
                            <option value="misamis_oriental">Misamis Oriental</option>
                        </select>
                        <select class="form-select form-select-sm shadow-sm" id="clusters-month" onchange="updateClusters()">
                            <option value="">Month</option>
                            <option value="1">January</option>
                            <option value="2">February</option>
                            <option value="3">March</option>
                            <option value="4">April</option>
                            <option value="5">May</option>
                            <option value="6">June</option>
                            <option value="7">July</option>
                            <option value="8">August</option>
                            <option value="9">September</option>
                            <option value="10">October</option>
                            <option value="11">November</option>
                            <option value="12">December</option>
                        </select>
                        <select class="form-select form-select-sm shadow-sm" id="clusters-year" onchange="updateClusters()">
                            <option value="">Year</option>
                            <?php
                            $currentYear = (int)date('Y');
                            $startYear = $currentYear - 10;
                            $endYear = $currentYear + 10;
                            for ($y = $endYear; $y >= $startYear; $y--) {
                                echo '<option value="' . $y . '"' . ($y === $currentYear ? ' selected' : '') . '>' . $y . '</option>';
                            }
                            ?>
                        </select>
                    </div>
                </div>

                <div class="row g-4">
                    <div class="col-12">
                        <div class="card border-0 shadow-sm h-100 overflow-hidden">
                            <div class="card-header bg-white border-0 pt-4 px-4 pb-3">
                                <div>
                                    <h5 class="fw-bold mb-1"><i class="fas fa-map-marked-alt me-2 text-primary"></i>Locations by Region</h5>
                                    <p class="text-muted small mb-0">Click on any location to view pending tickets</p>
                                </div>
                            </div>
                            <div class="card-body p-0">
                                <div id="clusters-region-list" class="clusters-modern-list">
                                    <!-- Injected via JS -->
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Analytics Tab -->
            <div id="analytics-view" class="hidden-section">
                <div class="d-flex justify-content-between flex-wrap align-items-flex-start pt-3 pb-2 mb-3 border-bottom gap-3">
                    <h1 class="h2 mb-0">Data Analytics</h1>
                    <div class="analytics-controls-wrap d-flex flex-wrap gap-2 align-items-center">
                        <div class="d-flex flex-nowrap gap-2 align-items-center">
                            <select class="form-select form-select-sm shadow-sm analytics-select" id="analytics-region" style="min-width: 160px;" onchange="updateAnalytics()" title="Filter by region">
                                <option value="">All Regions</option>
                                <option value="bukidnon">Bukidnon</option>
                                <option value="davao_city">Davao City</option>
                                <option value="davao_del_sur">Davao Del Sur</option>
                                <option value="davao_del_norte">Davao del Norte</option>
                                <option value="cotabato">Cotabato</option>
                                <option value="cdo">CDO</option>
                                <option value="misamis_oriental">Misamis Oriental</option>
                            </select>
                            <select class="form-select form-select-sm shadow-sm analytics-select" id="analytics-filter" onchange="toggleMonthYearDropdowns(); updateAnalytics();">
                                <option value="all">All Time</option>
                                <option value="year">This Year</option>
                                <option value="month">This Month</option>
                                <option value="week">This Week</option>
                                <option value="monthyear">Month & Year</option>
                                <option value="custom">Custom Date Range</option>
                            </select>
                            <div class="d-none" id="analytics-monthyear-group" style="display: flex; gap: 0.5rem;">
                                <select class="form-select form-select-sm shadow-sm analytics-select" id="analytics-month" onchange="updateAnalytics()">
                                    <option value="">Month</option>
                                    <option value="1">January</option>
                                    <option value="2">February</option>
                                    <option value="3">March</option>
                                    <option value="4">April</option>
                                    <option value="5">May</option>
                                    <option value="6">June</option>
                                    <option value="7">July</option>
                                    <option value="8">August</option>
                                    <option value="9">September</option>
                                    <option value="10">October</option>
                                    <option value="11">November</option>
                                    <option value="12">December</option>
                                </select>
                                <select class="form-select form-select-sm shadow-sm analytics-select" id="analytics-year" onchange="updateAnalytics()">
                                    <option value="">Year</option>
                                    <?php
                                    $currentYear = (int)date('Y');
                                    $startYear = $currentYear - 10;
                                    $endYear = $currentYear + 10;
                                    for ($y = $endYear; $y >= $startYear; $y--) {
                                        echo '<option value="' . $y . '"' . ($y === $currentYear ? ' selected' : '') . '>' . $y . '</option>';
                                    }
                                    ?>
                                </select>
                            </div>
                        </div>
                        <div class="d-none analytics-custom-row" id="analytics-custom-group" style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.25rem;">
                            <div class="analytics-custom-inner">
                                <input type="date" class="form-control form-control-sm shadow-sm analytics-custom-date" id="analytics-date-from" onchange="updateAnalytics()" placeholder="From">
                                <span class="text-muted small">to</span>
                                <input type="date" class="form-control form-control-sm shadow-sm analytics-custom-date" id="analytics-date-to" onchange="updateAnalytics()" placeholder="To">
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="row g-4 mb-4" id="analytics-summary-cards">
                    <div class="col-6 col-lg-3">
                        <div class="card summary-card bg-primary text-white h-100 shadow-sm">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div class="me-3">
                                        <div class="text-white-50 small text-uppercase fw-bold">Avg. Repair Time</div>
                                        <div class="fs-2 fw-bold" id="stat-avg-time">-- Days</div>
                                    </div>
                                    <i class="fas fa-clock card-icon"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-6 col-lg-3">
                        <div class="card summary-card bg-success text-white h-100 shadow-sm">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div class="me-3">
                                        <div class="text-white-50 small text-uppercase fw-bold">Completion Rate</div>
                                        <div class="fs-2 fw-bold" id="stat-completion-rate">--%</div>
                                    </div>
                                    <i class="fas fa-check-circle card-icon"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-6 col-lg-3">
                        <div class="card summary-card bg-warning text-white h-100 shadow-sm">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div class="me-3">
                                        <div class="text-white-50 small text-uppercase fw-bold">Pending Rate</div>
                                        <div class="fs-2 fw-bold" id="stat-pending-rate">--%</div>
                                    </div>
                                    <i class="fas fa-hourglass-half card-icon"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-6 col-lg-3">
                        <div class="card summary-card bg-info text-white h-100 shadow-sm">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div class="me-3">
                                        <div class="text-white-50 small text-uppercase fw-bold">Total Logged</div>
                                        <div class="fs-2 fw-bold" id="stat-total-analytics">--</div>
                                    </div>
                                    <i class="fas fa-clipboard-list card-icon"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="row g-4">
                    <div class="col-lg-8">
                        <div class="card shadow-sm h-100">
                            <div class="card-header bg-white border-0 py-3">
                                <h5 class="mb-0 fw-bold text-dark">Repair Volume Trends</h5>
                            </div>
                            <div class="card-body" style="height: 300px;"> <!-- Fixed height for smaller chart -->
                                <canvas id="trendChart"></canvas>
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-4">
                        <div class="card shadow-sm h-100 top-issues-card">
                            <div class="card-header top-issues-card-header">
                                <h5 class="mb-0 fw-bold">Top Issues</h5>
                                <span class="top-issues-subtitle">By ticket count</span>
                            </div>
                            <div class="card-body top-issues-card-body">
                                <ul class="top-issues-list" id="top-issues-list">
                                    <li class="top-issues-empty section-loader"><div class="loader"></div><p>Loading Data. Please Wait...</p></li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="row g-4 mt-0">
                    <div class="col-lg-6">
                        <div class="card shadow-sm h-100">
                            <div class="card-header bg-white border-0 py-3">
                                <h5 class="mb-0 fw-bold text-dark">Team Workload</h5>
                                <p class="text-muted small mb-0 mt-1">Tickets per team</p>
                            </div>
                            <div class="card-body" style="height: 280px;">
                                <canvas id="teamWorkloadChart"></canvas>
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-6">
                        <div class="card shadow-sm h-100">
                            <div class="card-header bg-white border-0 py-3">
                                <h5 class="mb-0 fw-bold text-dark">Completed vs Pending</h5>
                                <p class="text-muted small mb-0 mt-1">Ticket completion overview</p>
                            </div>
                            <div class="card-body" style="height: 280px;">
                                <canvas id="completionPendingChart"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Tickets Tab -->
            <div id="tickets-view" class="hidden-section">
                <div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                    <h1 class="h2">Tickets</h1>
                    <?php if (($_SESSION['role'] ?? '') !== 'staff'): ?>
                    <button class="btn btn-primary shadow-sm" onclick="openTicketModal()">
                        <i class="fas fa-plus me-2"></i> New Ticket
                    </button>
                    <?php endif; ?>
                </div>

                <div class="card shadow-sm border-0">
                    <div class="card-body p-4">
                        <div class="row g-3 mb-4">
                            <div class="col-md-4">
                                <div class="input-group">
                                    <span class="input-group-text bg-white border-end-0"><i class="fas fa-search text-muted"></i></span>
                                    <input type="text" class="form-control border-start-0 ps-0" id="search-input" placeholder="Search by ID, Customer, Issue, Contact..." onkeyup="filterTickets()">
                                </div>
                            </div>
                            <div class="col-md-3">
                                <select class="form-select" id="filter-status" onchange="filterTickets()">
                                    <option value="">All Status</option>
                                    <option value="Pending">Pending</option>
                                    <option value="Reschedule">Reschedule</option>
                                    <option value="On Hold">On Hold</option>
                                    <option value="For Pull Out">For Pull Out</option>
                                    <option value="For Dispatch">For Dispatch</option>
                                    <option value="Dispatched">Dispatched</option>
                                    <option value="Done Repair">Done Repair</option>
                                   
                                </select>
                            </div>
                            <div class="col-md-3">
                                <select class="form-select" id="filter-risk" onchange="filterTickets()">
                                    <option value="">All Risks</option>
                                    <option value="High Risk">High Risk</option>
                                    <option value="Moderate Risk">Moderate Risk</option>
                                    <option value="Low Risk">Low Risk</option>
                                    <option value="Unknown Risk">Unknown Risk</option>
                                </select>
                            </div>
                            <div class="col-md-2 text-end">
                                <span class="text-muted small align-middle" id="ticket-count">Showing all tickets</span>
                            </div>
                        </div>

                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <p class="text-muted small d-md-none mb-0" aria-hidden="true"><i class="fas fa-arrows-alt-h me-1"></i> Swipe left to see more columns</p>
                            <div class="ms-auto d-flex gap-2 align-items-center">
                                <span id="viber-selection-count" class="text-muted small align-middle me-2" style="min-width: 7rem; display: none;">0 tickets selected</span>
                                <button class="btn btn-sm btn-outline-secondary" onclick="clearAllSelections()" id="clear-selection-btn" style="display: none;">
                                    <i class="fas fa-times me-1"></i> Clear Selection
                                </button>
                                <button class="btn btn-sm btn-success" onclick="sendSelectedTicketsViaViber()" id="viber-export-btn" disabled>
                                    <i class="fas fa-copy me-1"></i> Copy for Viber
                                </button>
                            </div>
                        </div>
                        <div class="tickets-table-wrapper table-responsive">
                            <table class="table table-hover align-middle mb-0 tickets-responsive" id="tickets-table">
                                <colgroup>
                                    <col style="width: 35px;">
                                    <col style="width: 115px;">
                                    <col style="width: 110px;">
                                    <col style="width: 95px;">
                                    <col style="width: 85px;">
                                    <col style="width: 110px;">
                                    <col style="width: 140px;">
                                    <col style="width: 95px;">
                                    <col style="width: 80px;">
                                    <col style="width: 90px;">
                                    <col style="width: 95px;">
                                    <col id="col-second-dispatch" style="width: 95px; display: none;">
                                    <col id="col-third-dispatch" style="width: 95px; display: none;">
                                    <col style="width: 70px;">
                                </colgroup>
                                <thead class="position-sticky top-0" style="z-index: 10;">
                                    <tr>
                                        <th class="border-0 rounded-start shadow-sm th-checkbox"></th>
                                        <th onclick="sortTable('ticket_id_form')" class="border-0 shadow-sm text-start th-ticket-num">Ticket # <i class="fas fa-sort small ms-1"></i></th>
                                        <th onclick="sortTable('ticket_id')" class="border-0 shadow-sm text-start th-jo-num">JO # <i class="fas fa-sort small ms-1"></i></th>
                                        <th onclick="sortTable('contact_num')" class="border-0 shadow-sm text-start th-account th-contact">Contact <i class="fas fa-sort small ms-1"></i></th>
                                        <th onclick="sortTable('date_created')" class="border-0 shadow-sm text-start th-date">Date <i class="fas fa-sort small ms-1"></i></th>
                                        <th class="border-0 shadow-sm text-start th-customer">Customer</th>
                                        <th class="border-0 shadow-sm text-start th-issue">Issue</th>
                                        <th class="border-0 shadow-sm text-start th-status">Status</th>
                                        <th class="border-0 shadow-sm text-start th-risk">Risk</th>
                                        <th class="border-0 shadow-sm text-start th-team">Team</th>
                                        <th onclick="sortTable('first_dispatch')" class="border-0 shadow-sm text-start th-first-dispatch">1st Dispatch <i class="fas fa-sort small ms-1"></i></th>
                                        <th id="th-second-dispatch" onclick="sortTable('date_second_dispatch')" class="border-0 shadow-sm text-start th-second-dispatch d-none">2nd Dispatch <i class="fas fa-sort small ms-1"></i></th>
                                        <th id="th-third-dispatch" onclick="sortTable('date_third_dispatch')" class="border-0 shadow-sm text-start th-third-dispatch d-none">3rd Dispatch <i class="fas fa-sort small ms-1"></i></th>
                                        <th class="border-0 rounded-end shadow-sm text-start th-actions">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="tickets-table-body" class="border-top-0">
                                    <!-- Rows injected via JS -->
                                </tbody>
                            </table>
                        </div>
                        
                        <!-- Pagination (Placeholder for future implementation if needed) -->
                        <div class="d-flex justify-content-center mt-4">
                            <!-- Pagination could go here -->
                        </div>
                    </div>
                </div>
            </div>

            <!-- Teams Tab -->
            <div id="teams-view" class="hidden-section">
                <div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                    <h1 class="h2">Repair Teams</h1>
                </div>
                
                <div class="row mb-4">
                    <div class="col-md-4 mx-auto">
                        <label class="form-label text-muted small text-uppercase fw-bold ls-1 mb-2 text-center w-100">Select Team</label>
                        <div class="input-group shadow-sm" style="border-radius: 50px; overflow: hidden; border: 1px solid #e0e0e0;">
                            <span class="input-group-text bg-white border-0 ps-3 pe-2">
                                <i class="fas fa-users team-select-icon"></i>
                            </span>
                            <select class="form-select border-0 ps-0 text-center" id="team-select" onchange="loadTeamDetails()" style="cursor: pointer; font-weight: 500; color: #444; text-align-last: center; font-size: 0.95rem;">
                                <option value="">Choose a Repair Team...</option>
                                <!-- Options populated dynamically -->
                            </select>
                        </div>
                    </div>
                </div>

                <div id="team-details">
                    <div class="text-center py-5 text-muted">
                        <i class="fas fa-users-cog fa-4x mb-3 opacity-25"></i>
                        <h5>No Team Selected</h5>
                        <p>Please select a repair team from the dropdown above to view their workload and performance metrics.</p>
                    </div>
                </div>
            </div>

            <?php if (in_array($_SESSION['role'] ?? '', ['programmer', 'company_owner'], true)): ?>
            <!-- Manage users (Admin and System Administrator) – same layout as Tickets -->
            <div id="users-view" class="hidden-section">
                <div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                    <h1 class="h2 mb-0">Manage users</h1>
                    <button type="button" class="btn btn-primary shadow-sm" data-bs-toggle="modal" data-bs-target="#addUserModal">
                        <i class="fas fa-user-plus me-2"></i> Add user
                    </button>
                </div>

                <div class="card shadow-sm border-0">
                    <div class="card-body p-4">
                        <p class="text-muted small mb-3">Add and edit user accounts. New users receive login details by email.</p>
                        <div class="users-table-wrapper table-responsive">
                            <table class="table table-hover align-middle mb-0" id="users-table">
                                <thead>
                                    <tr>
                                        <th>Email</th>
                                        <th>Display name</th>
                                        <th>Role</th>
                                        <th>Date</th>
                                        <th class="users-actions-th">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="users-table-body">
                                    <tr><td colspan="5" class="text-muted text-center py-4">Loading…</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Add user modal -->
            <div class="modal fade" id="addUserModal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered app-modal-dialog">
                    <div class="modal-content app-modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Add user</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="addUserForm">
                                <p class="text-muted small mb-3">A random password will be generated and sent to the user's email.</p>
                                <div class="mb-3">
                                    <label class="form-label">Email (login)</label>
                                    <input type="email" class="form-control" name="email" required placeholder="user@example.com">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Display name</label>
                                    <input type="text" class="form-control" name="display_name" placeholder="Full name or label">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Role</label>
                                    <select class="form-select" name="role">
                                        <option value="staff">Staff</option>
                                        <option value="company_owner">Admin</option>
                                        <option value="programmer">System Administrator</option>
                                        <option value="maintenance_provider">System Administrator</option>
                                    </select>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="addUserSubmit">Add user</button>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Edit user modal -->
            <div class="modal fade" id="editUserModal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered app-modal-dialog">
                    <div class="modal-content app-modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Edit user</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="editUserForm">
                                <input type="hidden" name="username" id="editUserUsername">
                                <div class="mb-3">
                                    <label class="form-label">Email (login)</label>
                                    <input type="email" class="form-control" name="email" id="editUserEmail" required placeholder="user@example.com">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Display name / label</label>
                                    <input type="text" class="form-control" name="display_name" id="editUserDisplayName" placeholder="Full name or label">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Role</label>
                                    <select class="form-select" name="role" id="editUserRole">
                                        <option value="staff">Staff</option>
                                        <option value="company_owner">Company Owner</option>
                                        <option value="programmer">Programmer</option>
                                        <option value="maintenance_provider">Maintenance Provider</option>
                                    </select>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="editUserSubmit">Save changes</button>
                        </div>
                    </div>
                </div>
            </div>
            <?php endif; ?>

        </main>
    </div>

    <!-- System Footer (matches company branding) -->
    <footer class="system-footer">
        <div class="footer-inner">
            <div class="footer-left">
                <div class="footer-logo" aria-hidden="true"><span class="logo-line">SA</span><span class="logo-line">TC</span></div>
                <div class="footer-tagline">
                    <span class="footer-company">SASUMAN ANG</span>
                    <span class="footer-slogan">TRADING CORPORATION</span>
                </div>
            </div>
            <div class="footer-right">
                <h3 class="footer-title">SASUMAN ANG</h3>
                <p class="footer-subtitle">Trading Corporation</p>
                <hr class="footer-divider">
                <p class="footer-address">
                    PRK.26, MUSLIM VILLAGE, TIMES BEACH, MATINA<br>
                    <span class="footer-address-line2">APLAYA ROAD, BUCANA, TALOMO, DAVAO CITY</span>
                </p>
                <p class="footer-tin">TIN: 010-796-514-000</p>
            </div>
        </div>
    </footer>
</div>

<!-- Ticket Modal -->
<div class="modal fade" id="ticketModal" tabindex="-1">
    <div class="modal-dialog modal-lg modal-dialog-centered ticket-modal-dialog">
        <div class="modal-content app-modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="modalTitle">Ticket</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <form id="ticketForm">
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label class="form-label">Date Created</label>
                            <input type="date" class="form-control" name="date_created" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Customer Name/ Unit</label>
                            <input type="text" class="form-control" name="customer_name" required>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Ticket number</label>
                            <input type="hidden" name="ticket_id_form" id="ticket_id_form">
                            <div class="form-control-plaintext py-2 px-3 bg-light rounded border" id="display-ticket-number">—</div>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">JO number</label>
                            <input type="text" class="form-control" name="ticket_id" id="ticket_id" placeholder="e.g. IP1717251">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Account number</label>
                            <input type="text" class="form-control" name="account_number" placeholder="e.g. 638774869753" inputmode="numeric" pattern="[0-9]*" maxlength="20" oninput="this.value=this.value.replace(/\D/g,'')">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Contact number</label>
                            <input type="text" class="form-control" name="contact_num" placeholder="e.g. 09123456789">
                        </div>
                        <div class="col-12">
                            <label class="form-label">Address</label>
                            <input type="text" class="form-control" name="address" placeholder="e.g. Street, Barangay, City">
                        </div>
                        <input type="hidden" name="issue" id="ticket-form-issue" value="">
                        <div class="col-12">
                            <label class="form-label">Issue</label>
                            <textarea class="form-control" name="description" rows="1" required placeholder="e.g. LOS, FIBER CUT, defective modem"></textarea>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Status</label>
                            <select class="form-select" name="status">                       
                                <option value="Reschedule">Reschedule</option>
                                <option value="On Hold">On Hold</option>
                                <option value="For Pull Out">For Pull Out</option>
                                <option value="For Dispatch">For Dispatch</option>
                                <option value="Dispatched">Dispatched</option>
                                <option value="Done Repair">Done Repair</option>                               
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Risk Level</label>
                            <select class="form-select" name="risk_level">
                                <option value="High Risk">High Risk</option>
                                <option value="Moderate Risk">Moderate Risk</option>
                                <option value="Low Risk">Low Risk</option>
                                <option value="Unknown Risk">Unknown Risk</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Team</label>
                            <select class="form-select" name="team" id="modal-team-select">
                                <option value="">Select Team...</option>
                                <option value="TEAM 1">TEAM 1</option>
                                <option value="TEAM 2">TEAM 2</option>
                                <option value="TEAM 3">TEAM 3</option>
                                <option value="TEAM 4">TEAM 4</option>
                                <option value="TEAM 5">TEAM 5</option>
                                <option value="TEAM 6">TEAM 6</option>
                                <option value="TEAM 7">TEAM 7</option>
                                <option value="TEAM 8">TEAM 8</option>
                                <option value="TEAM 9">TEAM 9</option>
                                <option value="TEAM 10">TEAM 10</option>
                                <option value="TEAM 11">TEAM 11</option>
                                <option value="TEAM 12">TEAM 12</option>
                                <option value="TEAM 13">TEAM 13</option>
                                <option value="TEAM 14">TEAM 14</option>
                                <option value="TEAM 15">TEAM 15</option>
                                <option value="DPR">DPR</option>
                                <option value="METRO">METRO</option>
                                <option value="SUBCON">SUBCON</option>
                                <option value="IKE/MICHAEL">IKE/MICHAEL</option>
                                <option value="ALLEN/JAYV">ALLEN/JAYV</option>
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Technician</label>
                            <input type="text" class="form-control" name="technician">
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Date Started</label>
                            <input type="date" class="form-control" name="date_started">
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">1st Dispatch</label>
                            <input type="date" class="form-control" name="first_dispatch">
                        </div>
                         <div class="col-md-3">
                            <label class="form-label">Date Completed</label>
                            <input type="date" class="form-control" name="date_completed">
                        </div>
                         <div class="col-12">
                            <label class="form-label">Remarks</label>
                            <textarea class="form-control" name="remarks" rows="1"></textarea>
                        </div>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                <?php if (($_SESSION['role'] ?? '') !== 'staff'): ?>
                <button type="button" class="btn btn-primary" id="ticketModalBtnSave" onclick="saveTicket()">Save changes</button>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<!-- View Ticket Modal (read-only, modern layout) -->
<div class="modal fade" id="ticketViewModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered ticket-view-modal-dialog">
        <div class="modal-content ticket-view-modal-content app-modal-content">
            <div class="modal-header ticket-view-modal-header">
                <div class="d-flex flex-wrap align-items-center gap-2 flex-grow-1">
                    <h5 class="modal-title mb-0" id="ticketViewModalTitle">View Ticket</h5>
                    <span class="ticket-view-team-indicator" id="ticketViewModalTeamIndicator" aria-hidden="true"></span>
                </div>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body ticket-view-modal-body">
                <div class="ticket-view-grid">
                    <section class="ticket-view-section">
                        <h6 class="ticket-view-section-title">Ticket info</h6>
                        <div class="ticket-view-row"><span class="ticket-view-label">Ticket number</span><span class="ticket-view-value" id="tv-ticket_id_form">—</span></div>
                        <div class="ticket-view-row"><span class="ticket-view-label">JO number</span><span class="ticket-view-value ticket-view-value-accent" id="tv-ticket_id">—</span></div>
                        <div class="ticket-view-row"><span class="ticket-view-label">Date created</span><span class="ticket-view-value" id="tv-date_created">—</span></div>
                    </section>
                    <section class="ticket-view-section">
                        <h6 class="ticket-view-section-title">Customer</h6>
                        <div class="ticket-view-row"><span class="ticket-view-label">Customer Name/ Unit</span><span class="ticket-view-value" id="tv-customer_name">—</span></div>
                        <div class="ticket-view-row"><span class="ticket-view-label">Account number</span><span class="ticket-view-value" id="tv-account_number">—</span></div>
                        <div class="ticket-view-row"><span class="ticket-view-label">Contact number</span><span class="ticket-view-value" id="tv-contact_num">—</span></div>
                        <div class="ticket-view-row"><span class="ticket-view-label">Address</span><span class="ticket-view-value" id="tv-address">—</span></div>
                        <div class="ticket-view-row"><span class="ticket-view-label">Cluster</span><span class="ticket-view-value" id="tv-cluster">—</span></div>
                        <div class="ticket-view-row"><span class="ticket-view-label">Municipality</span><span class="ticket-view-value" id="tv-municipality">—</span></div>
                        <div class="ticket-view-row"><span class="ticket-view-label">LongLat</span><span class="ticket-view-value" id="tv-longlat">—</span></div>
                    </section>
                    <section class="ticket-view-section ticket-view-section-full">
                        <h6 class="ticket-view-section-title">Issue</h6>
                        <div class="ticket-view-value-block" id="tv-issue">—</div>
                    </section>
                    <section class="ticket-view-section ticket-view-section-full">
                        <h6 class="ticket-view-section-title">Description / details</h6>
                        <div class="ticket-view-value-block" id="tv-description">—</div>
                    </section>
                    <section class="ticket-view-section">
                        <h6 class="ticket-view-section-title">Status & assignment</h6>
                        <div class="ticket-view-row"><span class="ticket-view-label">Status</span><span class="ticket-view-value" id="tv-status">—</span></div>
                        <div class="ticket-view-row"><span class="ticket-view-label">Risk level</span><span class="ticket-view-value" id="tv-risk_level">—</span></div>
                        <div class="ticket-view-row"><span class="ticket-view-label">Team</span><span class="ticket-view-value" id="tv-team">—</span></div>
                        <div class="ticket-view-row"><span class="ticket-view-label">Technician</span><span class="ticket-view-value" id="tv-technician">—</span></div>
                    </section>
                    <section class="ticket-view-section">
                        <h6 class="ticket-view-section-title">Dates</h6>
                        <div class="ticket-view-row"><span class="ticket-view-label">Date started</span><span class="ticket-view-value" id="tv-date_started">—</span></div>
                        <div class="ticket-view-row"><span class="ticket-view-label">1st Dispatch</span><span class="ticket-view-value" id="tv-first_dispatch">—</span></div>
                        <div class="ticket-view-row"><span class="ticket-view-label">Date completed</span><span class="ticket-view-value" id="tv-date_completed">—</span></div>
                    </section>
                    <section class="ticket-view-section ticket-view-section-full">
                        <h6 class="ticket-view-section-title">Remarks</h6>
                        <div class="ticket-view-value-block" id="tv-remarks">—</div>
                    </section>
                </div>
            </div>
            <div class="modal-footer ticket-view-modal-footer">
                <button type="button" class="btn btn-outline-danger" id="btn-generate-receipt" onclick="downloadTicketReceiptPdf()">
                    <i class="fas fa-file-pdf me-1"></i> Generate receipt
                </button>
                <button type="button" class="btn btn-success" onclick="sendCurrentTicketViaViber()">
                    <i class="fas fa-copy me-1"></i> Copy for Viber
                </button>
                <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" crossorigin="anonymous"></script>
<script>window.USER_ROLE = <?php echo json_encode($_SESSION['role'] ?? ''); ?>;</script>
<?php
    // Cache-bust frontend JS so all users load the latest GAS_URL + field mappings.
    $appJsVersion = @filemtime(__DIR__ . '/assets/js/app.js');
    $receiptJsVersion = @filemtime(__DIR__ . '/assets/js/receipt-pdf.js');
?>
<script src="assets/js/receipt-pdf.js?v=<?=$receiptJsVersion?>"></script>
<script src="assets/js/app.js?v=<?=$appJsVersion?>"></script>
<script>
// Fallback so testGasConnection() works in console even if app.js fails to load
(function () {
    if (typeof window.testGasConnection !== 'function') {
        window.testGasConnection = async function () {
            var url = window.GAS_URL || 'https://script.google.com/macros/s/AKfycbzZfA1WhgUvRtVxjerGwcRqTWZrTUvyzvIlmH9GQl3RmoArGAzeeimHyv_VntVY6MeHsQ/exec';
            console.log('Testing GAS URL:', url);
            try {
                var r = await fetch(url, { method: 'GET' });
                console.log('Status:', r.status, r.statusText);
                var text = await r.text();
                console.log('Response (first 300 chars):', text.slice(0, 300));
                if (r.ok) console.log('OK – GAS URL is reachable.');
                else console.warn('GAS returned error status. Check your script and deployment.');
            } catch (e) {
                console.error('Connection failed:', e.message);
                console.error('Common causes: wrong URL, GAS not set to "Anyone", or opening page from file://');
            }
        };
    }
})();
</script>
</body>
</html>

