<?php
declare(strict_types=1);

require_once __DIR__ . '/../../private/db.php';
require_once __DIR__ . '/../../private/auth.php';
require_once __DIR__ . '/../../private/helpers.php';

require_login();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    if (isset($_GET['id'])) {
        $stmt = $pdo->prepare('SELECT * FROM location WHERE id = ?');
        $stmt->execute([(int) $_GET['id']]);
        $row = $stmt->fetch();
        if (!$row) {
            respond_error('Location not found', 404);
        }
        respond($row);
    }

    $stmt = $pdo->query('SELECT * FROM location ORDER BY name');
    respond($stmt->fetchAll());
}

if ($method === 'POST') {
    $data = json_body();
    $name = require_string($data, 'name');
    $x = (int) ($data['x'] ?? 0);
    $y = (int) ($data['y'] ?? 0);
    $size = (int) ($data['size'] ?? 0);

    $stmt = $pdo->prepare('INSERT INTO location (name, x, y, size) VALUES (?, ?, ?, ?)');
    $stmt->execute([$name, $x, $y, $size]);

    $stmt = $pdo->prepare('SELECT * FROM location WHERE id = ?');
    $stmt->execute([(int) $pdo->lastInsertId()]);
    respond($stmt->fetch(), 201);
}

if ($method === 'PUT') {
    $id = require_int($_GET, 'id');
    $data = json_body();
    $name = require_string($data, 'name');
    $x = (int) ($data['x'] ?? 0);
    $y = (int) ($data['y'] ?? 0);
    $size = (int) ($data['size'] ?? 0);

    $stmt = $pdo->prepare('UPDATE location SET name = ?, x = ?, y = ?, size = ? WHERE id = ?');
    $stmt->execute([$name, $x, $y, $size, $id]);

    $stmt = $pdo->prepare('SELECT * FROM location WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        respond_error('Location not found', 404);
    }
    respond($row);
}

if ($method === 'DELETE') {
    $id = require_int($_GET, 'id');
    $stmt = $pdo->prepare('DELETE FROM location WHERE id = ?');
    $stmt->execute([$id]);
    respond(['ok' => true]);
}

respond_error('Method not allowed', 405);
