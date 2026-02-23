<?php
/**
 * User management API. Admin and System Administrator (programmer) can list and create users.
 */
header('Content-Type: application/json');
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db_users.php';

requireLogin();

$role = $_SESSION['role'] ?? '';
if (!in_array($role, ['programmer', 'company_owner'], true)) {
    http_response_code(403);
    echo json_encode(['error' => 'Only Admin or System Administrator can manage users.']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$pdo = getUsersPdo();

if ($method === 'GET') {
    $stmt = $pdo->query("SELECT id, username, email, role, display_name, created_at FROM users ORDER BY username");
    $list = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $list[] = $row;
    }
    echo json_encode($list);
    exit;
}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = isset($input['action']) ? trim($input['action']) : '';

    // Resend credentials: generate new password, update DB, send email
    if ($action === 'resend') {
        require_once __DIR__ . '/send_reset_email.php';
        $username = isset($input['username']) ? trim($input['username']) : '';
        if ($username === '') {
            echo json_encode(['error' => 'Username is required.']);
            exit;
        }
        $user = getUserByUsernameDb($pdo, $username);
        if (!$user) {
            echo json_encode(['error' => 'User not found.']);
            exit;
        }
        if ($role === 'company_owner' && in_array($user['role'] ?? '', ['programmer', 'maintenance_provider'], true)) {
            http_response_code(403);
            echo json_encode(['error' => 'Only System Administrator can manage System Administrator users.']);
            exit;
        }
        $chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
        $tempPassword = '';
        for ($i = 0; $i < 12; $i++) {
            $tempPassword .= $chars[random_int(0, strlen($chars) - 1)];
        }
        updatePasswordDb($pdo, $username, password_hash($tempPassword, PASSWORD_DEFAULT));
        $loginUrl = getMailLoginUrl();
        $result = sendNewUserCredentialsEmail($user['email'], $user['display_name'], $tempPassword, $loginUrl);
        echo json_encode(['success' => true, 'email_sent' => $result['sent'], 'email_error' => $result['error'] ?? '']);
        exit;
    }

    // Create new user
    require_once __DIR__ . '/send_reset_email.php';
    if (!$input || empty($input['email'])) {
        echo json_encode(['error' => 'Email is required.']);
        exit;
    }
    $email = trim($input['email']);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(['error' => 'Please enter a valid email address.']);
        exit;
    }
    $role = isset($input['role']) ? trim($input['role']) : 'staff';
    $displayName = isset($input['display_name']) ? trim($input['display_name']) : '';

    $allowedRoles = ['programmer', 'company_owner', 'staff', 'maintenance_provider'];
    if (!in_array($role, $allowedRoles, true)) {
        $role = 'staff';
    }

    $chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    $tempPassword = '';
    for ($i = 0; $i < 12; $i++) {
        $tempPassword .= $chars[random_int(0, strlen($chars) - 1)];
    }

    $username = isset($input['username']) ? trim($input['username']) : null;
    if ($username === '' || $username === null) {
        $username = str_replace(['@', '.', '+'], ['_', '_', '_'], $email);
        $username = preg_replace('/[^a-z0-9_]/i', '', $username) ?: 'user' . time();
    }

    $passwordHash = password_hash($tempPassword, PASSWORD_DEFAULT);
    $result = createUserDb($pdo, $username, $email, $passwordHash, $role, $displayName ?: $username);
    if ($result === false) {
        echo json_encode(['error' => 'Email or username already exists.']);
        exit;
    }

    $loginUrl = getMailLoginUrl();
    $mailResult = sendNewUserCredentialsEmail($email, $displayName ?: $username, $tempPassword, $loginUrl);

    echo json_encode([
        'success' => true,
        'username' => $result,
        'email_sent' => $mailResult['sent'],
        'email_error' => $mailResult['error'] ?? '',
    ]);
    exit;
}

if ($method === 'PATCH') {
    $input = json_decode(file_get_contents('php://input'), true);
    $username = isset($input['username']) ? trim($input['username']) : '';
    if ($username === '') {
        echo json_encode(['error' => 'Username is required.']);
        exit;
    }
    $user = getUserByUsernameDb($pdo, $username);
    if (!$user) {
        echo json_encode(['error' => 'User not found.']);
        exit;
    }
    // Admin cannot edit System Administrator users; only System Administrator can.
    if ($role === 'company_owner' && in_array($user['role'] ?? '', ['programmer', 'maintenance_provider'], true)) {
        http_response_code(403);
        echo json_encode(['error' => 'Only System Administrator can edit System Administrator users.']);
        exit;
    }
    $allowedRoles = ['programmer', 'company_owner', 'staff', 'maintenance_provider'];
    $email = isset($input['email']) ? trim($input['email']) : null;
    if ($email !== null && $email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(['error' => 'Please enter a valid email address.']);
        exit;
    }
    $displayName = isset($input['display_name']) ? trim($input['display_name']) : null;
    $role = isset($input['role']) ? trim($input['role']) : null;
    if ($role !== null && !in_array($role, $allowedRoles, true)) $role = $user['role'];
    $ok = updateUserDb($pdo, $username, $email, $displayName, $role);
    if (!$ok) {
        echo json_encode(['error' => 'Email is already used by another user.']);
        exit;
    }
    echo json_encode(['success' => true]);
    exit;
}

if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    $username = isset($input['username']) ? trim($input['username']) : '';
    if ($username === '') {
        echo json_encode(['error' => 'Username is required.']);
        exit;
    }
    if ($username === ($_SESSION['username'] ?? '')) {
        echo json_encode(['error' => 'You cannot delete your own account.']);
        exit;
    }
    // Admin cannot delete System Administrator users; only System Administrator can.
    $targetUser = getUserByUsernameDb($pdo, $username);
    if ($targetUser && $role === 'company_owner' && in_array($targetUser['role'] ?? '', ['programmer', 'maintenance_provider'], true)) {
        http_response_code(403);
        echo json_encode(['error' => 'Only System Administrator can delete System Administrator users.']);
        exit;
    }
    if (!deleteUserDb($pdo, $username)) {
        echo json_encode(['error' => 'User not found or could not be deleted.']);
        exit;
    }
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed.']);
