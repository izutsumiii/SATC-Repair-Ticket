<?php
/**
 * Merge api/mail_config.php (optional, gitignored) with SATC_* environment variables.
 * Env vars override file values so production can set secrets only on the server.
 */

/**
 * @param string $name Environment variable name
 * @return string|null Trimmed value or null if unset/empty
 */
function satc_mail_env($name) {
    $raw = getenv($name);
    if ($raw === false || $raw === '') {
        $raw = $_SERVER[$name] ?? $_ENV[$name] ?? false;
    }
    if ($raw === false || $raw === '') {
        return null;
    }
    $t = trim((string) $raw);
    return $t === '' ? null : $t;
}

/**
 * Load merged mail configuration (SMTP + base_url for links).
 *
 * @return array{smtp_host?:string,smtp_port?:int,smtp_user?:string,smtp_password?:string,from_name?:string,base_url?:string}
 */
function satc_load_mail_config() {
    $defaults = [
        'smtp_host'     => 'smtp.gmail.com',
        'smtp_port'     => 587,
        'smtp_user'     => '',
        'smtp_password' => '',
        'from_name'     => '',
        'base_url'      => '',
    ];

    $configPath = __DIR__ . DIRECTORY_SEPARATOR . 'mail_config.php';
    $merged = $defaults;
    if (is_file($configPath)) {
        $fileConfig = require $configPath;
        if (is_array($fileConfig)) {
            foreach ($fileConfig as $k => $v) {
                if (!array_key_exists($k, $merged)) {
                    continue;
                }
                if ($k === 'smtp_port') {
                    $iv = (int) $v;
                    if ($iv > 0) {
                        $merged['smtp_port'] = $iv;
                    }
                    continue;
                }
                if ($k === 'smtp_password') {
                    if ($v !== null && $v !== '') {
                        $merged['smtp_password'] = is_string($v) ? $v : (string) $v;
                    }
                    continue;
                }
                $s = is_string($v) ? trim($v) : trim((string) $v);
                if ($s !== '') {
                    $merged[$k] = $s;
                }
            }
        }
    }

    $h = satc_mail_env('SATC_SMTP_HOST');
    if ($h !== null) {
        $merged['smtp_host'] = $h;
    }
    $p = satc_mail_env('SATC_SMTP_PORT');
    if ($p !== null) {
        $merged['smtp_port'] = (int) $p;
    }
    $u = satc_mail_env('SATC_SMTP_USER');
    if ($u !== null) {
        $merged['smtp_user'] = $u;
    }
    $pw = satc_mail_env('SATC_SMTP_PASSWORD');
    if ($pw !== null) {
        $merged['smtp_password'] = $pw;
    }
    $fn = satc_mail_env('SATC_MAIL_FROM_NAME');
    if ($fn !== null) {
        $merged['from_name'] = $fn;
    }
    $bu = satc_mail_env('SATC_MAIL_BASE_URL');
    if ($bu !== null) {
        $merged['base_url'] = $bu;
    }

    return $merged;
}

/**
 * True when SMTP user and password are set (file and/or env).
 */
function satc_mail_config_is_complete(array $c) {
    $user = isset($c['smtp_user']) ? trim((string) $c['smtp_user']) : '';
    $pass = isset($c['smtp_password']) ? (string) $c['smtp_password'] : '';
    return $user !== '' && $pass !== '';
}

/**
 * User-facing message when SMTP is not configured.
 */
function satc_mail_smtp_not_configured_message() {
    return 'SMTP is not configured. Set smtp_user and smtp_password in api/mail_config.php (see docs/SATC_GUIDE.md, Section B.4), or set environment variables SATC_SMTP_USER and SATC_SMTP_PASSWORD on the server (e.g. hosting panel).';
}
