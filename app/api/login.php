<?php
declare(strict_types=1);

require_once __DIR__ . '/../private/auth.php';
require_once __DIR__ . '/../private/helpers.php';
require_once __DIR__ . '/../private/config.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    respond(['authed' => is_logged_in()]);
}

if ($method === 'POST') {
    $data = json_body();
    $password = (string) ($data['password'] ?? '');

    if ($password === '' || !password_verify($password, APP_PASSWORD_HASH)) {
        respond_error('Incorrect password', 401);
    }

    $_SESSION['gw_authed'] = true;
    respond(['ok' => true]);
}

if ($method === 'DELETE') {
    $_SESSION = [];
    session_destroy();
    respond(['ok' => true]);
}

respond_error('Method not allowed', 405);
