<?php
/**
 * One-time setup: creates the users database and seeds three test accounts.
 * Run this once, then delete or restrict access to this file.
 *
 * Login is by EMAIL + password. Roles: Programmer (full + can create users), Company Owner (full), Staff (view-only).
 */
require_once __DIR__ . '/api/db_users.php';

$pdo = getUsersPdo();
$count = (int) $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();

// Test user credentials (same as in SQL / docs)
$testUsers = [
    ['programmer', 'programmer@example.com', 'programmer123', 'programmer', 'Programmer'],
    ['owner', 'owner@example.com', 'owner123', 'company_owner', 'Company Owner'],
    ['staff', 'staff@example.com', 'staff123', 'staff', 'Staff'],
];

if ($count === 0) {
    foreach ($testUsers as $u) {
        createUserDb($pdo, $u[0], $u[1], password_hash($u[2], PASSWORD_DEFAULT), $u[3], $u[4]);
    }
}

header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Users database ready</title>
    <style>body{font-family:sans-serif;max-width:560px;margin:2rem auto;padding:0 1rem;} code{background:#eee;padding:.2em .4em;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #ddd;padding:.5rem .75rem;text-align:left;} th{background:#f5f5f5;} a{color:#ff4081;} .test-details{margin:1rem 0;}</style>
</head>
<body>
    <h1>Users database ready</h1>
    <p>Database and <code>users</code> table are set up. Log in with <strong>email</strong> and <strong>password</strong> (change passwords after first login).</p>

    <h2 class="test-details">Test user details</h2>
    <p>Use these accounts to log in. Recommended: change the password after first login (Forgot password on login page).</p>
    <table>
        <thead>
            <tr><th>Role</th><th>Email (login)</th><th>Password</th></tr>
        </thead>
        <tbody>
            <tr><td>Programmer</td><td><code>programmer@example.com</code></td><td><code>programmer123</code></td></tr>
            <tr><td>Company Owner</td><td><code>owner@example.com</code></td><td><code>owner123</code></td></tr>
            <tr><td>Staff (view-only)</td><td><code>staff@example.com</code></td><td><code>staff123</code></td></tr>
        </tbody>
    </table>

    <p>Programmers can add new users from <strong>Manage users</strong> in the app. New users receive a random password by email. See <a href="docs/ADMIN_SETUP.md">Admin Setup</a> and <a href="docs/USER_MANUAL.md">User Manual</a> for step-by-step guides.</p>
    <p><a href="login.php">Go to Login</a></p>
</body>
</html>
