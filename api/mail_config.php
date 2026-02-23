<?php
/**
 * SMTP config for sending emails (login details, password reset, etc.).
 * Sending account: heyllama11@gmail.com (single address for all system emails).
 * See docs/ADMIN_SETUP.md for how to create the Gmail App Password and mail setup.
 *
 * base_url: Full URL to your app root (with trailing slash), used for login/reset links in emails.
 * Example: 'https://yourdomain.com/satc/' or 'http://localhost/SATC%20REPAIR%20TICKET/'
 * Leave empty to auto-detect from the current request.
 */
return [
    'smtp_host'     => 'smtp.gmail.com',
    'smtp_port'     => 587,
    'smtp_user'     => 'heyllama11@gmail.com',
    'smtp_password' => 'wihxabegrednspvi',
    'from_name'     => 'SATC - SURF2SAWA',
    'base_url'      => '', // Set to your real site URL for correct links in emails (e.g. https://yourdomain.com/satc/)
];
