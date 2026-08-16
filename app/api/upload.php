<?php
declare(strict_types=1);

require_once __DIR__ . '/../../private/db.php';
require_once __DIR__ . '/../../private/auth.php';
require_once __DIR__ . '/../../private/helpers.php';

require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond_error('Method not allowed', 405);
}

$npcId = require_int($_POST, 'npc_id');

if (!isset($_FILES['art']) || $_FILES['art']['error'] !== UPLOAD_ERR_OK) {
    respond_error('No image uploaded');
}

$allowed = [
    'image/png' => 'png', 
    'image/jpeg' => 'jpg', 
    'image/webp' => 'webp', 
    'image/gif' => 'gif'
    ];
$mime = mime_content_type($_FILES['art']['tmp_name']);
if (!isset($allowed[$mime])) {
    respond_error('Unsupported image type');
}

if ($_FILES['art']['size'] > 5 * 1024 * 1024) {
    respond_error('Image too large (5MB max)');
}

$uploadDir = __DIR__ . '/../uploads';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

$filename = 'npc_' . $npcId . '_' . time() . '.' . $allowed[$mime];
$destination = $uploadDir . '/' . $filename;

if (!move_uploaded_file($_FILES['art']['tmp_name'], $destination)) {
    respond_error('Failed to save image', 500);
}

$publicPath = 'uploads/' . $filename;

$stmt = $pdo->prepare('UPDATE npc SET art = ? WHERE id = ?');
$stmt->execute([$publicPath, $npcId]);

respond(['art' => $publicPath]);
