<?php
/**
 * Server-side proxy to Google Apps Script /exec.
 * The browser calls same-origin PHP (session cookie works); PHP forwards to Google with cURL.
 * Fixes: CORS, some redirect/POST issues, and cached responses when calling script.google.com from the browser.
 */
require_once __DIR__ . '/auth.php';
requireLogin();

// Release session lock before slow cURL. Otherwise other tabs/requests (same PHP session) stay "Pending" in DevTools.
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

$config = require __DIR__ . '/config.php';
$gasUrl = isset($config['gas_webapp_url']) ? trim((string) $config['gas_webapp_url']) : '';

header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');

if ($gasUrl === '') {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Set gas_webapp_url in api/config.php to your Apps Script /exec URL.']);
    exit;
}

$parsed = parse_url($gasUrl);
if ($parsed === false || empty($parsed['scheme']) || strtolower($parsed['scheme']) !== 'https'
    || empty($parsed['host']) || stripos($parsed['host'], 'script.google.com') === false) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'error' => 'gas_webapp_url in api/config.php must be a single https://script.google.com/macros/s/.../exec URL (no typos, no pasted duplicates).',
    ]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$sep = strpos($gasUrl, '?') !== false ? '&' : '?';
$forwardUrl = $gasUrl . $sep . '_cb=' . time();

/**
 * @param string $url
 * @param string $method GET|POST
 * @param string|null $rawBody for POST
 * @return array{0:int,1:string} [http_code, body]
 */
function gas_proxy_forward($url, $method, $rawBody = null) {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 10,
            CURLOPT_CONNECTTIMEOUT => 25,
            CURLOPT_TIMEOUT => 90,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        ];
        if (defined('CURL_IPRESOLVE_V4')) {
            $opts[CURLOPT_IPRESOLVE] = CURL_IPRESOLVE_V4;
        }
        if ($method === 'POST') {
            $opts[CURLOPT_POST] = true;
            $opts[CURLOPT_POSTFIELDS] = $rawBody !== null ? $rawBody : '';
            $opts[CURLOPT_HTTPHEADER] = ['Content-Type: text/plain'];
        } else {
            $opts[CURLOPT_HTTPGET] = true;
        }
        curl_setopt_array($ch, $opts);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($body === false) {
            return [502, json_encode(['error' => 'GAS proxy (curl): ' . $err])];
        }
        return [$code ?: 502, $body];
    }

    if ($method === 'POST') {
        $ctx = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: text/plain\r\n",
                'content' => $rawBody !== null ? $rawBody : '',
                'timeout' => 120,
                'ignore_errors' => true,
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
            ],
        ]);
    } else {
        $ctx = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 120,
                'ignore_errors' => true,
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
            ],
        ]);
    }
    $body = @file_get_contents($url, false, $ctx);
    if ($body === false) {
        return [502, json_encode(['error' => 'GAS proxy: enable php-curl or allow_url_fopen for HTTPS.'])];
    }
    $code = 200;
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
        $code = (int) $m[1];
    }
    return [$code, $body];
}

if ($method === 'POST') {
    $body = file_get_contents('php://input');
    list($code, $out) = gas_proxy_forward($forwardUrl, 'POST', $body);
    http_response_code($code >= 100 && $code < 600 ? $code : 502);
    header('Content-Type: application/json; charset=utf-8');
    echo $out;
    exit;
}

if ($method === 'GET') {
    list($code, $out) = gas_proxy_forward($forwardUrl, 'GET');
    http_response_code($code >= 100 && $code < 600 ? $code : 502);
    header('Content-Type: application/json; charset=utf-8');
    echo $out;
    exit;
}

http_response_code(405);
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['error' => 'Method not allowed']);
