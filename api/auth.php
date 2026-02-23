<?php
/**
 * Authentication: login, logout, session check.
 * Users and roles are stored in SQLite database (data/users.db).
 */
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/db_users.php';

/**
 * Get list of users (username => ['password_hash' => ..., 'role' => ..., 'display_name' => ..., 'email' => ...])
 */
function getUsers() {
    return getUsersFromDb(getUsersPdo());
}

/**
 * Find user by email. Returns ['username' => ..., 'data' => ...] or null.
 */
function findUserByEmail($users, $email) {
    return findUserByEmailDb(getUsersPdo(), $email);
}

/**
 * Verify credentials by email + password and optionally set session.
 */
function login($email, $password, $setSession = true) {
    $found = findUserByEmailDb(getUsersPdo(), $email);
    if ($found === null) {
        return false;
    }
    $username = $found['username'];
    $user = $found['data'];
    if (!password_verify($password, $user['password_hash'])) {
        return false;
    }
    if ($setSession) {
        $_SESSION['logged_in'] = true;
        $_SESSION['username'] = $username;
        $_SESSION['role'] = $user['role'];
        $_SESSION['display_name'] = isset($user['display_name']) ? $user['display_name'] : $username;
    }
    return true;
}

/**
 * Check if current request is logged in.
 */
function isLoggedIn() {
    return !empty($_SESSION['logged_in']) && !empty($_SESSION['username']);
}

/** Base path from project root (e.g. empty or /SATC%20REPAIR%20TICKET) for redirects when this file is in api/ */
function authBasePath() {
    $script = $_SERVER['SCRIPT_NAME'] ?? '';
    $dir = dirname($script);
    return (strpos($dir, 'api') !== false && basename($dir) === 'api') ? dirname($dir) : '';
}

/**
 * Require login: redirect to login.php if not logged in.
 */
function requireLogin() {
    if (!isLoggedIn()) {
        $base = authBasePath();
        header('Location: ' . ($base ? $base . '/' : '') . 'login.php');
        exit;
    }
}

/**
 * Logout and redirect to login.
 */
function logout() {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
    $base = authBasePath();
    header('Location: ' . ($base ? $base . '/' : '') . 'login.php');
    exit;
}

// Handle logout
if (isset($_GET['logout'])) {
    logout();
}

// Handle login (POST from login form – email + password)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['email'], $_POST['password'])) {
    if (login($_POST['email'], $_POST['password'])) {
        $base = authBasePath();
        header('Location: ' . ($base ? $base . '/' : '') . 'index.php');
        exit;
    }
    $base = authBasePath();
    header('Location: ' . ($base ? $base . '/' : '') . 'login.php?error=1');
    exit;
}
