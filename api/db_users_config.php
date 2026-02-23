<?php
/**
 * Users database config. SQLite file in data/ (not web-accessible if server is configured correctly).
 */
$baseDir = dirname(__DIR__);
return [
    'db_path' => $baseDir . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'users.db',
];
