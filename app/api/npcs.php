<?php
declare(strict_types=1);

require_once __DIR__ . '/../../private/db.php';
require_once __DIR__ . '/../../private/auth.php';
require_once __DIR__ . '/../../private/helpers.php';

require_login();

$method = $_SERVER['REQUEST_METHOD'];

const TRAIT_FIELDS = ['disposition', 'openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];

if ($method === 'GET') {
    if (isset($_GET['id'])) {
        $stmt = $pdo->prepare('SELECT * FROM npc WHERE id = ?');
        $stmt->execute([(int) $_GET['id']]);
        $row = $stmt->fetch();
        if (!$row) {
            respond_error('NPC not found', 404);
        }
        respond($row);
    }

    if (isset($_GET['location_id'])) {
        $stmt = $pdo->prepare('SELECT * FROM npc WHERE location_id = ? ORDER BY name');
        $stmt->execute([(int) $_GET['location_id']]);
        respond($stmt->fetchAll());
    }

    respond_error('location_id or id is required', 400);
}

if ($method === 'POST') {
    $data = json_body();
    $locationId = require_int($data, 'location_id');
    $name = require_string($data, 'name');
    $description = trim((string) ($data['description'] ?? ''));

    $traits = [];
    foreach (TRAIT_FIELDS as $field) {
        $traits[$field] = isset($data[$field]) ? (int) $data[$field] : ($field === 'disposition' ? 0 : 5);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO npc (location_id, name, description, disposition, openness, conscientiousness, extraversion, agreeableness, neuroticism)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $locationId, $name, $description,
        $traits['disposition'], $traits['openness'], $traits['conscientiousness'],
        $traits['extraversion'], $traits['agreeableness'], $traits['neuroticism'],
    ]);

    $stmt = $pdo->prepare('SELECT * FROM npc WHERE id = ?');
    $stmt->execute([(int) $pdo->lastInsertId()]);
    respond($stmt->fetch(), 201);
}

if ($method === 'PUT') {
    $id = require_int($_GET, 'id');
    $data = json_body();
    $name = require_string($data, 'name');
    $description = trim((string) ($data['description'] ?? ''));

    $traits = [];
    foreach (TRAIT_FIELDS as $field) {
        $traits[$field] = isset($data[$field]) ? (int) $data[$field] : ($field === 'disposition' ? 0 : 5);
    }

    $stmt = $pdo->prepare(
        'UPDATE npc SET name = ?, description = ?, disposition = ?, openness = ?, conscientiousness = ?, extraversion = ?, agreeableness = ?, neuroticism = ?
         WHERE id = ?'
    );
    $stmt->execute([
        $name, $description,
        $traits['disposition'], $traits['openness'], $traits['conscientiousness'],
        $traits['extraversion'], $traits['agreeableness'], $traits['neuroticism'],
        $id,
    ]);

    $stmt = $pdo->prepare('SELECT * FROM npc WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        respond_error('NPC not found', 404);
    }
    respond($row);
}

if ($method === 'DELETE') {
    $id = require_int($_GET, 'id');
    $stmt = $pdo->prepare('DELETE FROM npc WHERE id = ?');
    $stmt->execute([$id]);
    respond(['ok' => true]);
}

respond_error('Method not allowed', 405);
