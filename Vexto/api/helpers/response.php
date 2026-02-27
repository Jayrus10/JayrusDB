<?php
// ─── Respuestas JSON estandarizadas ──────────────────────────────────────────

function ok(mixed $data = null, string $message = ''): void {
    echo json_encode([
        'ok'      => true,
        'message' => $message,
        'data'    => $data,
    ]);
    exit;
}

function fail(string $error, int $code = 400): void {
    http_response_code($code);
    echo json_encode([
        'ok'    => false,
        'error' => $error,
    ]);
    exit;
}

function notFound(string $msg = 'Not found'): void {
    fail($msg, 404);
}

function unauthorized(string $msg = 'No autorizado'): void {
    fail($msg, 401);
}

function forbidden(string $msg = 'Acceso denegado'): void {
    fail($msg, 403);
}
