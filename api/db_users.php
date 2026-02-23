<?php
/**
 * Users database (SQLite). Table: users (id, username, email UNIQUE, password_hash, role, display_name, created_at).
 */
$config = require __DIR__ . '/db_users_config.php';
$path = $config['db_path'];
$dir = dirname($path);
if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
}
$pdo = new PDO('sqlite:' . $path, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

// Create table if not exists
$pdo->exec("
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    )
");

/**
 * Get all users as array keyed by username (same shape as old users.php for compatibility).
 */
function getUsersFromDb($pdo) {
    $stmt = $pdo->query("SELECT username, email, password_hash, role, display_name FROM users ORDER BY username");
    $users = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $users[$row['username']] = [
            'password_hash' => $row['password_hash'],
            'role' => $row['role'],
            'display_name' => $row['display_name'],
            'email' => $row['email'],
        ];
    }
    return $users;
}

/**
 * Find user by email. Returns ['username' => ..., 'data' => ...] or null.
 */
function findUserByEmailDb($pdo, $email) {
    $email = trim(strtolower($email));
    if ($email === '') return null;
    $stmt = $pdo->prepare("SELECT username, email, password_hash, role, display_name FROM users WHERE LOWER(TRIM(email)) = ?");
    $stmt->execute([$email]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) return null;
    return [
        'username' => $row['username'],
        'data' => [
            'password_hash' => $row['password_hash'],
            'role' => $row['role'],
            'display_name' => $row['display_name'],
            'email' => $row['email'],
        ],
    ];
}

/**
 * Create a new user. Returns username on success, false on duplicate email/username.
 */
function createUserDb($pdo, $username, $email, $passwordHash, $role, $displayName) {
    $stmt = $pdo->prepare("INSERT INTO users (username, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)");
    try {
        $stmt->execute([
            trim($username),
            trim(strtolower($email)),
            $passwordHash,
            $role,
            trim($displayName) ?: $username,
        ]);
        return trim($username);
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'UNIQUE') !== false) return false;
        throw $e;
    }
}

/**
 * Update password for a user (by username).
 */
function updatePasswordDb($pdo, $username, $passwordHash) {
    $stmt = $pdo->prepare("UPDATE users SET password_hash = ? WHERE username = ?");
    $stmt->execute([$passwordHash, $username]);
    return $stmt->rowCount() > 0;
}

/**
 * Update user profile (email, display_name, role) by username.
 * Returns true on success, false if new email is already taken by another user.
 */
function updateUserDb($pdo, $username, $email = null, $displayName = null, $role = null) {
    $email = $email !== null ? trim(strtolower($email)) : null;
    if ($email !== null) {
        $stmt = $pdo->prepare("SELECT username FROM users WHERE LOWER(TRIM(email)) = ? AND username != ?");
        $stmt->execute([$email, $username]);
        if ($stmt->fetch()) return false;
    }
    $updates = [];
    $params = [];
    if ($email !== null) { $updates[] = 'email = ?'; $params[] = $email; }
    if ($displayName !== null) { $updates[] = 'display_name = ?'; $params[] = trim($displayName); }
    if ($role !== null) { $updates[] = 'role = ?'; $params[] = trim($role); }
    if (empty($updates)) return true;
    $params[] = $username;
    $sql = "UPDATE users SET " . implode(', ', $updates) . " WHERE username = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return true;
}

/**
 * Delete a user by username. Returns true if a row was deleted.
 */
function deleteUserDb($pdo, $username) {
    $stmt = $pdo->prepare("DELETE FROM users WHERE username = ?");
    $stmt->execute([$username]);
    return $stmt->rowCount() > 0;
}

/**
 * Get a single user by username (for edit form).
 */
function getUserByUsernameDb($pdo, $username) {
    $stmt = $pdo->prepare("SELECT id, username, email, role, display_name FROM users WHERE username = ?");
    $stmt->execute([$username]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

/**
 * Get PDO instance (for use in api/users.php etc).
 */
function getUsersPdo() {
    global $pdo;
    return $pdo;
}
