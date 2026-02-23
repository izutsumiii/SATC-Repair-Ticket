<?php
session_start();
require_once __DIR__ . '/api/auth.php';

if (isLoggedIn()) {
    header('Location: index.php');
    exit;
}

$dataDir  = __DIR__ . DIRECTORY_SEPARATOR . 'data';
$tokensFile = $dataDir . DIRECTORY_SEPARATOR . 'password_reset_tokens.json';
// #region agent log
$debugLogPath = __DIR__ . DIRECTORY_SEPARATOR . 'debug-63ea2c.log';
function debugLog($path, $location, $message, $data, $hypothesisId) {
    $payload = ['sessionId' => '63ea2c', 'location' => $location, 'message' => $message, 'data' => $data, 'hypothesisId' => $hypothesisId, 'timestamp' => time()];
    @file_put_contents($path, json_encode($payload) . "\n", FILE_APPEND | LOCK_EX);
}
// #endregion

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

function getBaseUrl() {
    $proto = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $path = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/\\');
    return $proto . '://' . $host . ($path ? $path . '/' : '');
}

$message = '';
$isError = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['email'])) {
    $email = trim($_POST['email'] ?? '');
    if ($email === '') {
        $message = 'Please enter your email address.';
        $isError = true;
    } else {
        $found = findUserByEmail(null, $email);
        if (!$found) {
            $message = 'If an account exists for this email, you will receive a reset link.';
        } else {
            require_once __DIR__ . '/api/send_reset_email.php';
            $token = bin2hex(random_bytes(32));
            $expires = time() + 3600;
            $tokens = loadTokens($tokensFile);
            $tokens[$token] = ['username' => $found['username'], 'expires' => $expires];
            // #region agent log
            debugLog($debugLogPath, 'forgot_password.php:save', 'before save', [
                'tokensFilePath' => $tokensFile,
                'dataDirPath' => $dataDir,
                'fileExistsBefore' => is_file($tokensFile),
                'tokenLength' => strlen($token),
                'tokenPrefix' => substr($token, 0, 6),
                'expires' => $expires,
                'timeNow' => time(),
                'tokensCount' => count($tokens),
            ], 'A');
            // #endregion
            saveTokens($tokensFile, $tokens, $dataDir);
            // #region agent log
            debugLog($debugLogPath, 'forgot_password.php:after_save', 'after save', [
                'fileExistsAfter' => is_file($tokensFile),
                'saveOk' => is_file($tokensFile) && filesize($tokensFile) > 0,
            ], 'D');
            // #endregion
            $baseUrl = getBaseUrl();
            $resetLink = $baseUrl . 'reset_password.php?token=' . urlencode($token);
            $mailResult = sendPasswordResetEmail($found['data']['email'], $found['username'], $resetLink, $found['data']['display_name'] ?? $found['username']);
            if ($mailResult['sent']) {
                header('Location: login.php?reset_link_sent=1');
                exit;
            } else {
                $message = 'Email could not be sent. ' . ($mailResult['error'] ?? 'Check api/mail_config.php and SMTP credentials.');
                $isError = true;
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>Forgot password — SATC Repair Ticketing System</title>
    <link rel="icon" type="image/png" href="logo.png">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="assets/css/style.css" rel="stylesheet">
    <style>
        .login-page { margin: 0; min-height: 100vh; font-family: 'Poppins', sans-serif; background-image: url('bg-overlayed.png'); background-size: cover; background-position: center; background-repeat: no-repeat; display: flex; align-items: center; justify-content: center; padding: 2rem; position: relative; }
        .login-page-logo { position: absolute; top: 1.25rem; left: 1.25rem; display: block; line-height: 0; z-index: 10; }
        .login-page-logo img { height: 40px; width: auto; object-fit: contain; display: block; }
        .send-reset-overlay { position: fixed; inset: 0; background: rgba(255,255,255,0.92); display: none; flex-direction: column; align-items: center; justify-content: center; z-index: 1000; }
        .send-reset-overlay.visible { display: flex; }
        .login-container { width: 100%; max-width: 420px; display: flex; align-items: center; justify-content: center; }
        .login-card { width: 100%; padding: 2rem; background: rgba(255,255,255,0.95); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.12); border: 1px solid rgba(0,0,0,0.06); }
        .login-title { font-size: 1.35rem; font-weight: 600; color: #333; margin-bottom: 0.5rem; text-align: center; }
        .login-instruction { font-size: 0.8125rem; color: #666; text-align: center; margin-bottom: 1.25rem; line-height: 1.45; }
        .login-alert { font-size: 0.875rem; margin-bottom: 1rem; }
        .login-form .form-label { font-size: 0.8125rem; font-weight: 500; color: #333; }
        .login-form .form-control { font-size: 0.8125rem; padding: 0.4rem 0.5rem; min-height: 2rem; }
        .login-btn { margin-top: 0.5rem; font-size: 0.875rem; font-weight: 500; padding: 0.45rem 0.9rem; }
        .login-forgot { text-align: center; margin-top: 1rem; }
        .login-forgot a { font-size: 0.875rem; color: #ff4081; text-decoration: none; }
        .login-forgot a:hover { color: #e91e63; text-decoration: underline; }
        @media (max-width: 576px) { .login-page-logo { top: 1rem; left: 1rem; } .login-page-logo img { height: 36px; } }
    </style>
</head>
<body class="login-page">
    <div class="send-reset-overlay" id="sendResetOverlay" aria-hidden="true">
        <div class="section-loader">
            <div class="loader"></div>
            <p>Sending reset link...</p>
        </div>
    </div>
    <a href="login.php" class="login-page-logo" aria-label="SATC">
        <img src="logo.png" alt="SATC">
    </a>
    <div class="login-container">
        <div class="login-card">
            <h1 class="login-title">Forgot password</h1>
            <p class="login-instruction">Enter your email below and we’ll send you a link to reset your password. The link is valid for 1 hour.</p>
                <?php if ($message): ?>
                    <div class="alert <?php echo $isError ? 'alert-danger' : 'alert-success'; ?> login-alert"><?php echo htmlspecialchars($message); ?></div>
                <?php endif; ?>
                <form method="post" action="forgot_password.php" class="login-form" id="forgotForm">
                    <div class="mb-3">
                        <label for="email" class="form-label">Email address</label>
                        <input type="email" class="form-control" id="email" name="email" required autocomplete="email" value="<?php echo isset($_POST['email']) ? htmlspecialchars($_POST['email']) : ''; ?>">
                    </div>
                    <button type="submit" class="btn btn-primary w-100 login-btn" id="sendResetBtn">Send reset link</button>
                    <div class="login-forgot">
                        <a href="login.php">Back to sign in</a>
                    </div>
                </form>
        </div>
    </div>
    <script>
        (function() {
            var form = document.getElementById('forgotForm');
            var overlay = document.getElementById('sendResetOverlay');
            if (form && overlay) {
                form.addEventListener('submit', function() {
                    overlay.classList.add('visible');
                    overlay.setAttribute('aria-hidden', 'false');
                });
            }
        })();
    </script>
</body>
</html>
