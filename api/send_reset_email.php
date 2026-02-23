<?php
/**
 * Send password-reset email via Gmail SMTP (PHPMailer).
 * Requires: composer require phpmailer/phpmailer, and api/mail_config.php from mail_config.php.example.
 */

/**
 * Return the full login URL for use in emails. Uses mail_config base_url if set, else auto-detects.
 */
function getMailLoginUrl() {
    $configPath = __DIR__ . DIRECTORY_SEPARATOR . 'mail_config.php';
    if (is_file($configPath)) {
        $config = require $configPath;
        if (!empty($config['base_url'])) {
            return rtrim($config['base_url'], '/') . '/login.php';
        }
    }
    $proto = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $path = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/\\');
    return $proto . '://' . $host . ($path ? $path . '/' : '') . 'login.php';
}

/**
 * @param string $toEmail Recipient email
 * @param string $username Username (for the message)
 * @param string $resetLink Full URL to reset_password.php?token=...
 * @param string|null $displayName Display name for "Hello [name]," (defaults to username)
 * @return array{ sent: bool, error: string }
 */
function sendPasswordResetEmail($toEmail, $username, $resetLink, $displayName = null) {
    $configPath = __DIR__ . DIRECTORY_SEPARATOR . 'mail_config.php';
    $autoload = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';

    if (!is_file($configPath)) {
        return ['sent' => false, 'error' => 'api/mail_config.php not found. Copy api/mail_config.php.example to api/mail_config.php and set your SMTP credentials.'];
    }
    if (!is_file($autoload)) {
        return ['sent' => false, 'error' => 'Composer vendor folder missing. Run: composer install'];
    }

    $config = require $configPath;
    if (empty($config['smtp_user']) || empty($config['smtp_password'])) {
        return ['sent' => false, 'error' => 'smtp_user and smtp_password must be set in api/mail_config.php (use your email and Gmail App Password or other SMTP password).'];
    }

    require_once $autoload;

    $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host       = $config['smtp_host'] ?? 'smtp.gmail.com';
        $mail->SMTPAuth   = true;
        $mail->Username   = $config['smtp_user'];
        $mail->Password   = $config['smtp_password'];
        $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = (int) ($config['smtp_port'] ?? 587);

        $mail->setFrom($config['smtp_user'], $config['from_name'] ?? 'SATC Repair Ticket');
        $mail->addAddress($toEmail, $displayName ?? $username);
        $mail->Subject = 'Password reset - SATC - Surf2Sawa';
        $mail->isHTML(true);
        $mail->Body    = emailTemplateReset($resetLink, $config['from_name'] ?? 'SATC - SURF2SAWA', $displayName ?? $username);
        $mail->AltBody = "Hello " . ($displayName ?? $username) . ",\n\nYou requested a password reset. Click the link below to set a new password (valid for 1 hour):\n\n" . $resetLink . "\n\nIf you did not request this, ignore this email.\n";

        $mail->send();
        return ['sent' => true, 'error' => ''];
    } catch (\PHPMailer\PHPMailer\Exception $e) {
        return ['sent' => false, 'error' => 'SMTP failed: ' . $e->getMessage() . '. Check api/mail_config.php (e.g. Gmail needs an App Password, not your normal password).'];
    }
}

/**
 * Send new user credentials email (PHPMailer + SMTP). No external API required.
 *
 * @param string $toEmail New user's email
 * @param string $displayName Display name for the message
 * @param string $tempPassword The generated temporary password (plaintext, sent only here)
 * @param string $loginUrl Full URL to login.php
 * @return array{ sent: bool, error: string }
 */
function sendNewUserCredentialsEmail($toEmail, $displayName, $tempPassword, $loginUrl) {
    $configPath = __DIR__ . DIRECTORY_SEPARATOR . 'mail_config.php';
    $autoload = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';

    if (!is_file($configPath)) {
        return ['sent' => false, 'error' => 'api/mail_config.php not found. Copy api/mail_config.php.example to api/mail_config.php and set your SMTP credentials.'];
    }
    if (!is_file($autoload)) {
        return ['sent' => false, 'error' => 'Composer vendor folder missing. Run: composer install'];
    }

    $config = require $configPath;
    if (empty($config['smtp_user']) || empty($config['smtp_password'])) {
        return ['sent' => false, 'error' => 'smtp_user and smtp_password must be set in api/mail_config.php (use your email and Gmail App Password or other SMTP password).'];
    }

    require_once $autoload;

    $name = $displayName ?: $toEmail;
    $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host       = $config['smtp_host'] ?? 'smtp.gmail.com';
        $mail->SMTPAuth   = true;
        $mail->Username   = $config['smtp_user'];
        $mail->Password   = $config['smtp_password'];
        $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = (int) ($config['smtp_port'] ?? 587);

        $mail->setFrom($config['smtp_user'], $config['from_name'] ?? 'SATC Repair Ticket');
        $mail->addAddress($toEmail, $name);
        $mail->Subject = 'Your SATC - Surf2Sawa account';
        $mail->isHTML(true);
        $mail->Body    = emailTemplateNewUser($name, $toEmail, $tempPassword, $loginUrl, $config['from_name'] ?? 'SATC - SURF2SAWA');
        $mail->AltBody = "Hello " . $name . ",\n\nYour account has been created.\n\nLog in at: " . $loginUrl . "\n\nEmail (login): " . $toEmail . "\nTemporary password: " . $tempPassword . "\n\nPlease change your password after first login (use \"Forgot password?\" on the login page if needed).\n";

        $mail->send();
        return ['sent' => true, 'error' => ''];
    } catch (\PHPMailer\PHPMailer\Exception $e) {
        return ['sent' => false, 'error' => 'SMTP failed: ' . $e->getMessage() . '. Check api/mail_config.php (e.g. Gmail needs an App Password, not your normal password).'];
    }
}

/**
 * HTML email template: password reset (site colors: pink #ff4081, yellow #ffc107).
 */
function emailTemplateReset($resetLink, $fromName, $displayName = '') {
    $resetLinkEsc = htmlspecialchars($resetLink, ENT_QUOTES, 'UTF-8');
    $helloName = $displayName !== '' ? htmlspecialchars($displayName, ENT_QUOTES, 'UTF-8') : '';
    $helloLine = $helloName !== '' ? '<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6;">Hello ' . $helloName . ',</p>' : '<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6;">Hello,</p>';
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0; padding:0; font-family: \'Poppins\', sans-serif; background-color: #f5f6fa; color: #333;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f6fa; padding: 24px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width: 520px; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden;">
<tr><td style="background: linear-gradient(135deg, #ff4081 0%, #e91e63 100%); color: #ffffff; padding: 24px 24px 20px; text-align: center;">
<h1 style="margin: 0; font-size: 22px; font-weight: 700;">' . htmlspecialchars($fromName, ENT_QUOTES, 'UTF-8') . '</h1>
<p style="margin: 8px 0 0; font-size: 14px; opacity: 0.95;">Password reset</p>
</td></tr>
<tr><td style="padding: 28px 24px;">' . $helloLine . '
<p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6;">You requested a password reset. Click the button below to set a new password (valid for 1 hour).</p>
<p style="margin: 0 0 24px; text-align: center;">
<a href="' . $resetLinkEsc . '" style="display: inline-block; background: linear-gradient(135deg, #ff4081 0%, #e91e63 100%); color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 12px rgba(255,64,129,0.35);">Reset password</a>
</p>
<p style="margin: 0; font-size: 13px; color: #888;">If you did not request this, ignore this email.</p>
</td></tr>
<tr><td style="padding: 16px 24px; background: #f9f9f9; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center;">SATC - Surf2Sawa</td></tr>
</table>
</td></tr></table>
</body></html>';
}

/**
 * Send "password changed" notification email.
 *
 * @param string $toEmail Recipient email
 * @param string $displayName Display name for "Hello [name],"
 * @return array{ sent: bool, error: string }
 */
function sendPasswordChangedEmail($toEmail, $displayName) {
    $configPath = __DIR__ . DIRECTORY_SEPARATOR . 'mail_config.php';
    $autoload = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';

    if (!is_file($configPath)) {
        return ['sent' => false, 'error' => 'api/mail_config.php not found.'];
    }
    if (!is_file($autoload)) {
        return ['sent' => false, 'error' => 'Composer vendor folder missing. Run: composer install'];
    }

    $config = require $configPath;
    if (empty($config['smtp_user']) || empty($config['smtp_password'])) {
        return ['sent' => false, 'error' => 'smtp_user and smtp_password must be set in api/mail_config.php.'];
    }

    require_once $autoload;

    $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host       = $config['smtp_host'] ?? 'smtp.gmail.com';
        $mail->SMTPAuth   = true;
        $mail->Username   = $config['smtp_user'];
        $mail->Password   = $config['smtp_password'];
        $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = (int) ($config['smtp_port'] ?? 587);

        $mail->setFrom($config['smtp_user'], $config['from_name'] ?? 'SATC Repair Ticket');
        $mail->addAddress($toEmail, $displayName);
        $mail->Subject = 'Your password was changed - SATC - Surf2Sawa';
        $mail->isHTML(true);
        $mail->Body    = emailTemplatePasswordChanged($displayName, $config['from_name'] ?? 'SATC - SURF2SAWA');
        $mail->AltBody = "Hello " . $displayName . ",\n\nYour password was changed successfully. If this wasn't you, please contact support immediately.\n\n— SATC - Surf2Sawa\n";

        $mail->send();
        return ['sent' => true, 'error' => ''];
    } catch (\PHPMailer\PHPMailer\Exception $e) {
        return ['sent' => false, 'error' => 'SMTP failed: ' . $e->getMessage()];
    }
}

/**
 * HTML email template: password changed notification.
 */
function emailTemplatePasswordChanged($displayName, $fromName) {
    $nameEsc = htmlspecialchars($displayName, ENT_QUOTES, 'UTF-8');
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0; padding:0; font-family: \'Poppins\', sans-serif; background-color: #f5f6fa; color: #333;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f6fa; padding: 24px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width: 520px; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden;">
<tr><td style="background: linear-gradient(135deg, #ff4081 0%, #e91e63 100%); color: #ffffff; padding: 24px 24px 20px; text-align: center;">
<h1 style="margin: 0; font-size: 22px; font-weight: 700;">' . htmlspecialchars($fromName, ENT_QUOTES, 'UTF-8') . '</h1>
<p style="margin: 8px 0 0; font-size: 14px; opacity: 0.95;">Password changed</p>
</td></tr>
<tr><td style="padding: 28px 24px;">
<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6;">Hello ' . $nameEsc . ',</p>
<p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6;">Your password was changed successfully.</p>
<p style="margin: 0; font-size: 14px; line-height: 1.6; color: #666;">If this wasn&apos;t you, please contact support immediately.</p>
</td></tr>
<tr><td style="padding: 16px 24px; background: #f9f9f9; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center;">SATC - Surf2Sawa</td></tr>
</table>
</td></tr></table>
</body></html>';
}

/**
 * HTML email template: new user credentials (site colors: pink #ff4081, yellow #ffc107).
 */
function emailTemplateNewUser($name, $email, $tempPassword, $loginUrl, $fromName) {
    $loginUrlEsc = htmlspecialchars($loginUrl, ENT_QUOTES, 'UTF-8');
    $nameEsc = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
    $emailEsc = htmlspecialchars($email, ENT_QUOTES, 'UTF-8');
    $passEsc = htmlspecialchars($tempPassword, ENT_QUOTES, 'UTF-8');
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0; padding:0; font-family: \'Poppins\', sans-serif; background-color: #f5f6fa; color: #333;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f6fa; padding: 24px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width: 520px; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden;">
<tr><td style="background: linear-gradient(135deg, #ff4081 0%, #e91e63 100%); color: #ffffff; padding: 24px 24px 20px; text-align: center;">
<h1 style="margin: 0; font-size: 22px; font-weight: 700;">' . htmlspecialchars($fromName, ENT_QUOTES, 'UTF-8') . '</h1>
<p style="margin: 8px 0 0; font-size: 14px; opacity: 0.95;">Your account is ready</p>
</td></tr>
<tr><td style="padding: 28px 24px;">
<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6;">Hello ' . $nameEsc . ',</p>
<p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6;">Your account has been created. Use the details below to log in.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 20px; background: #fdf2f7; border: 1px solid #ff4081; border-radius: 10px;">
<tr><td style="padding: 16px 20px;">
<p style="margin: 0 0 8px; font-size: 13px; color: #666;">Email (login)</p>
<p style="margin: 0 0 16px; font-size: 15px; font-weight: 600; color: #333;">' . $emailEsc . '</p>
<p style="margin: 0 0 8px; font-size: 13px; color: #666;">Temporary password</p>
<p style="margin: 0; font-size: 15px; font-weight: 600; color: #333; letter-spacing: 0.5px;">' . $passEsc . '</p>
</td></tr></table>
<p style="margin: 0 0 24px; text-align: center;">
<a href="' . $loginUrlEsc . '" style="display: inline-block; background: linear-gradient(135deg, #ff4081 0%, #e91e63 100%); color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 12px rgba(255,64,129,0.35);">Log in</a>
</p>
<p style="margin: 0; font-size: 13px; color: #888;">Please change your password after first login (use &quot;Forgot password?&quot; on the login page if needed).</p>
</td></tr>
<tr><td style="padding: 16px 24px; background: #f9f9f9; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center;">SATC - Surf2Sawa</td></tr>
</table>
</td></tr></table>
</body></html>';
}
