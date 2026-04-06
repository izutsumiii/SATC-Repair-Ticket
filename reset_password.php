<?php
session_start();
require_once __DIR__ . '/api/auth.php';
require_once __DIR__ . '/api/db_users.php';

if (isLoggedIn()) {
    header('Location: index.php');
    exit;
}

$dataDir  = __DIR__ . DIRECTORY_SEPARATOR . 'data';
$tokensFile = $dataDir . DIRECTORY_SEPARATOR . 'password_reset_tokens.json';

function loadTokens($tokensFile) {
    if (!is_file($tokensFile)) return [];
    $json = file_get_contents($tokensFile);
    $data = json_decode($json, true);
    return is_array($data) ? $data : [];
}

function ensureDataDir($dataDir) {
    if (!is_dir($dataDir)) {
        mkdir($dataDir, 0755, true);
    }
}

function saveTokens($tokensFile, $data, $dataDir) {
    ensureDataDir($dataDir);
    return file_put_contents($tokensFile, json_encode($data, JSON_PRETTY_PRINT)) !== false;
}

$token = isset($_REQUEST['token']) ? trim($_REQUEST['token']) : '';
$message = '';
$isError = false;
$validToken = false;
$username = null;

if ($token !== '') {
    $tokens = loadTokens($tokensFile);
    if (isset($tokens[$token])) {
        $entry = $tokens[$token];
        $now = time();
        $expiresOk = isset($entry['expires']) && $entry['expires'] >= $now;
        if ($expiresOk) {
            $validToken = true;
            $username = $entry['username'];
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $validToken && $username !== null) {
    $password = $_POST['password'] ?? '';
    $confirm  = $_POST['password_confirm'] ?? '';
    if (strlen($password) < 6) {
        $message = 'Password must be at least 6 characters.';
        $isError = true;
    } elseif ($password !== $confirm) {
        $message = 'Passwords do not match.';
        $isError = true;
    } else {
        $pdo = getUsersPdo();
        if (updatePasswordDb($pdo, $username, password_hash($password, PASSWORD_DEFAULT))) {
            $tokens = loadTokens($tokensFile);
            unset($tokens[$token]);
            saveTokens($tokensFile, $tokens, $dataDir);
            $user = getUserByUsernameDb($pdo, $username);
            if ($user && !empty($user['email'])) {
                require_once __DIR__ . '/api/send_reset_email.php';
                sendPasswordChangedEmail($user['email'], $user['display_name'] ?? $username);
            }
            header('Location: login.php?success=password_reset');
            exit;
        }
        $message = 'Unable to update password. Please try again or request a new link.';
        $isError = true;
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>Set new password — SATC Repair Ticketing System</title>
    <link rel="icon" type="image/png" href="logo.png">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <link href="assets/css/style.css" rel="stylesheet">
    <style>
        .login-page { margin: 0; min-height: 100vh; font-family: 'Poppins', sans-serif; background-image: url('bg-overlayed.png'); background-size: cover; background-position: center; background-repeat: no-repeat; display: flex; align-items: center; justify-content: center; padding: 2rem; position: relative; }
        .login-page-logo { position: absolute; top: 1.25rem; left: 1.25rem; display: block; line-height: 0; }
        .login-page-logo img { height: 40px; width: auto; object-fit: contain; display: block; }
        .login-container { width: 100%; max-width: 420px; display: flex; align-items: center; justify-content: center; }
        .login-card { width: 100%; padding: 2rem; background: rgba(255,255,255,0.95); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.12); border: 1px solid rgba(0,0,0,0.06); }
        .login-title { font-size: 1.35rem; font-weight: 600; color: #333; margin-bottom: 0.5rem; text-align: center; }
        .login-instruction { font-size: 0.8125rem; color: #666; text-align: center; margin-bottom: 1.25rem; line-height: 1.45; }
        .login-alert { font-size: 0.875rem; margin-bottom: 1rem; }
        .login-form .form-label { font-size: 0.8125rem; font-weight: 500; color: #333; }
        .login-form .form-control { font-size: 0.8125rem; padding: 0.4rem 0.5rem; min-height: 2rem; }
        .password-wrap { position: relative; }
        .password-wrap .form-control { padding-right: 2.25rem; }
        .password-toggle { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; padding: 2px; cursor: pointer; color: #6B7280; font-size: 0.875rem; }
        .password-toggle:hover { color: #ff4081; }
        .strength-meter { margin-top: 0.5rem; height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden; }
        .strength-meter-fill { height: 100%; width: 0; border-radius: 2px; transition: width 0.2s ease, background-color 0.2s ease; }
        .strength-meter-fill.weak { width: 25%; background: #ef4444; }
        .strength-meter-fill.fair { width: 50%; background: #f59e0b; }
        .strength-meter-fill.good { width: 75%; background: #22c55e; }
        .strength-meter-fill.strong { width: 100%; background: #16a34a; }
        .strength-text { font-size: 0.75rem; margin-top: 0.25rem; font-weight: 500; }
        .strength-text.weak { color: #ef4444; }
        .strength-text.fair { color: #f59e0b; }
        .strength-text.good { color: #22c55e; }
        .strength-text.strong { color: #16a34a; }
        .login-btn { margin-top: 0.5rem; font-size: 0.875rem; font-weight: 500; padding: 0.45rem 0.9rem; }
        .login-forgot { text-align: center; margin-top: 1rem; }
        .login-forgot a { font-size: 0.875rem; color: #ff4081; text-decoration: none; }
        .login-forgot a:hover { color: #e91e63; text-decoration: underline; }
        @media (max-width: 576px) { .login-page-logo { top: 1rem; left: 1rem; } .login-page-logo img { height: 36px; } }
    </style>
</head>
<body class="login-page">
    <a href="login.php" class="login-page-logo" aria-label="SATC">
        <img src="logo.png" alt="SATC">
    </a>
    <div class="login-container">
        <div class="login-card">
            <h1 class="login-title">Set new password</h1>
            <p class="login-instruction">Choose a strong password below. Use at least 6 characters; mixing letters, numbers and symbols makes it stronger.</p>
                <?php if (!$validToken): ?>
                    <div class="alert alert-danger login-alert">This reset link is invalid or has expired. <a href="forgot_password.php">Request a new link</a>.</div>
                <?php else: ?>
                    <?php if ($message): ?>
                        <div class="alert <?php echo $isError ? 'alert-danger' : 'alert-success'; ?> login-alert"><?php echo htmlspecialchars($message); ?></div>
                    <?php endif; ?>
                    <form method="post" action="reset_password.php?token=<?php echo htmlspecialchars(urlencode($token)); ?>" class="login-form" id="resetPasswordForm">
                        <div class="mb-3">
                            <label for="password" class="form-label">New password</label>
                            <div class="password-wrap">
                                <input type="password" class="form-control" id="password" name="password" required minlength="6" autocomplete="new-password" placeholder="Enter new password">
                                <button type="button" class="password-toggle" id="togglePassword" aria-label="Show password" title="Show password"><i class="fas fa-eye" aria-hidden="true"></i></button>
                            </div>
                            <div class="strength-meter" id="strengthMeter" aria-hidden="true">
                                <div class="strength-meter-fill" id="strengthMeterFill"></div>
                            </div>
                            <div class="strength-text" id="strengthText" aria-live="polite"></div>
                        </div>
                        <div class="mb-3">
                            <label for="password_confirm" class="form-label">Confirm password</label>
                            <div class="password-wrap">
                                <input type="password" class="form-control" id="password_confirm" name="password_confirm" required minlength="6" autocomplete="new-password" placeholder="Confirm new password">
                                <button type="button" class="password-toggle" id="togglePasswordConfirm" aria-label="Show password" title="Show password"><i class="fas fa-eye" aria-hidden="true"></i></button>
                            </div>
                        </div>
                        <button type="submit" class="btn btn-primary w-100 login-btn">Update password</button>
                        <div class="login-forgot">
                            <a href="login.php">Back to sign in</a>
                        </div>
                    </form>
                <?php endif; ?>
        </div>
    </div>
    <?php if ($validToken): ?>
    <script>
        (function() {
            var pwd = document.getElementById('password');
            var pwdConfirm = document.getElementById('password_confirm');
            var togglePwd = document.getElementById('togglePassword');
            var togglePwdConfirm = document.getElementById('togglePasswordConfirm');
            var strengthFill = document.getElementById('strengthMeterFill');
            var strengthText = document.getElementById('strengthText');

            function toggleVisibility(input, toggle) {
                if (!input || !toggle) return;
                var icon = toggle.querySelector('i');
                if (input.type === 'password') {
                    input.type = 'text';
                    icon.classList.remove('fa-eye');
                    icon.classList.add('fa-eye-slash');
                    toggle.setAttribute('aria-label', 'Hide password');
                    toggle.setAttribute('title', 'Hide password');
                } else {
                    input.type = 'password';
                    icon.classList.remove('fa-eye-slash');
                    icon.classList.add('fa-eye');
                    toggle.setAttribute('aria-label', 'Show password');
                    toggle.setAttribute('title', 'Show password');
                }
            }
            if (togglePwd && pwd) togglePwd.addEventListener('click', function() { toggleVisibility(pwd, togglePwd); });
            if (togglePwdConfirm && pwdConfirm) togglePwdConfirm.addEventListener('click', function() { toggleVisibility(pwdConfirm, togglePwdConfirm); });

            function scoreStrength(val) {
                if (!val || val.length < 6) return { level: 'weak', label: 'Too short' };
                var score = 0;
                if (val.length >= 8) score++;
                if (val.length >= 12) score++;
                if (/[a-z]/.test(val) && /[A-Z]/.test(val)) score++;
                if (/\d/.test(val)) score++;
                if (/[^a-zA-Z0-9]/.test(val)) score++;
                if (score <= 1) return { level: 'weak', label: 'Weak' };
                if (score <= 3) return { level: 'fair', label: 'Fair' };
                if (score <= 4) return { level: 'good', label: 'Good' };
                return { level: 'strong', label: 'Strong' };
            }
            function updateStrength() {
                var val = pwd ? pwd.value : '';
                var r = scoreStrength(val);
                strengthFill.className = 'strength-meter-fill ' + (val.length >= 6 ? r.level : '');
                strengthText.className = 'strength-text ' + (val.length >= 6 ? r.level : '');
                strengthText.textContent = val.length === 0 ? '' : (val.length < 6 ? 'Use at least 6 characters' : r.label);
            }
            if (pwd) {
                pwd.addEventListener('input', updateStrength);
                pwd.addEventListener('change', updateStrength);
            }
        })();
    </script>
    <?php endif; ?>
</body>
</html>
