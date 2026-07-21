<?php
declare(strict_types=1);

require_once __DIR__ . '/../../private/db.php';
require_once __DIR__ . '/../../private/auth.php';
require_once __DIR__ . '/../../private/helpers.php';

require_login();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    if (isset($_GET['id'])) {
        $stmt = $pdo->prepare('SELECT * FROM response WHERE id = ?');
        $stmt->execute([(int) $_GET['id']]);
        $row = $stmt->fetch();
        if (!$row) {
            respond_error('Response not found', 404);
        }
        respond($row);
    }

    if (isset($_GET['npc_id'])) {
        $stmt = $pdo->prepare('SELECT * FROM response WHERE npc_id = ? ORDER BY id');
        $stmt->execute([(int) $_GET['npc_id']]);
        respond($stmt->fetchAll());
    }

    respond_error('npc_id or id is required', 400);
}

if ($method === 'POST') {
    $data = json_body();
    $npcId = require_int($data, 'npc_id');
    $call = require_string($data, 'call');
    $response = require_string($data, 'response');
    $effect = trim((string) ($data['effect'] ?? ''));

    $stmt = $pdo->prepare('INSERT INTO response (npc_id, `call`, response, effect) VALUES (?, ?, ?, ?)');
    $stmt->execute([$npcId, $call, $response, $effect]);

    $stmt = $pdo->prepare('SELECT * FROM response WHERE id = ?');
    $stmt->execute([(int) $pdo->lastInsertId()]);
    respond($stmt->fetch(), 201);
}

if ($method === 'PUT') {
    $id = require_int($_GET, 'id');
    $data = json_body();
    $call = require_string($data, 'call');
    $response = require_string($data, 'response');
    $effect = trim((string) ($data['effect'] ?? ''));

    $stmt = $pdo->prepare('UPDATE response SET `call` = ?, response = ?, effect = ? WHERE id = ?');
    $stmt->execute([$call, $response, $effect, $id]);

    $stmt = $pdo->prepare('SELECT * FROM response WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        respond_error('Response not found', 404);
    }
    respond($row);
}

if ($method === 'DELETE') {
    $id = require_int($_GET, 'id');
    $stmt = $pdo->prepare('DELETE FROM response WHERE id = ?');
    $stmt->execute([$id]);
    respond(['ok' => true]);
}

respond_error('Method not allowed', 405);
