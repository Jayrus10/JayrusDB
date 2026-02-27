<?php
// ─── Conexión MySQL PDO ───────────────────────────────────────────────────────
// Edita SOLO este archivo con tus credenciales reales.
// NUNCA subas este archivo a GitHub ni lo expongas públicamente.

define('DB_HOST', 'fdb1031.runhosting.com');
define('DB_NAME', '4668931_jayrus');
define('DB_USER', '4668931_jayrus');   // usuario MySQL (no root en producción)
define('DB_PASS', '11064490*');
define('DB_CHARSET', 'utf8mb4');

// Clave secreta para firmar JWT — mínimo 32 caracteres aleatorios
// Genera una en: https://generate-secret.vercel.app/64
define('JWT_SECRET', 'bd4e8ca0683ef2deb25cfec320e61c034865928069953998470a8bd2ced8ff33');
define('JWT_EXPIRY', 86400); // 24 horas en segundos

function getDB(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    } catch (PDOException $e) {
        // No exponemos detalles del error en producción
        http_response_code(503);
        echo json_encode(['ok' => false, 'error' => 'Database unavailable']);
        exit;
    }

    return $pdo;
}
