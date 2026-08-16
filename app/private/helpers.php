<?php
declare(strict_types=1);

function json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function respond($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function respond_error(string $message, int $status = 400): void
{
    respond(['error' => $message], $status);
}

function require_int(array $data, string $key): int
{
    if (!isset($data[$key]) || !is_numeric($data[$key])) {
        respond_error("Missing or invalid field: {$key}");
    }
    return (int) $data[$key];
}

function require_string(array $data, string $key): string
{
    if (!isset($data[$key]) || trim((string) $data[$key]) === '') {
        respond_error("Missing field: {$key}");
    }
    return trim((string) $data[$key]);
}
