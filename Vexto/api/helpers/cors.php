<?php
// ─── CORS + JSON headers ──────────────────────────────────────────────────────
// Inclúyelo al inicio de TODOS los archivos de la API.

// En producción cambia * por tu dominio real: https://tudominio.com
$allowed_origin = $_SERVER['HTTP_ORIGIN'] ?? '*';

header('Access-Control-Allow-Origin: ' . $allowed_origin);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

// Las peticiones OPTIONS son preflight de CORS — responder vacío y salir
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
