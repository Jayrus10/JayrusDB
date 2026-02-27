<?php
// ─── JWT sin librería externa (HS256) ────────────────────────────────────────
// Implementación mínima y segura. No requiere composer.

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/response.php';

// ── Generación ────────────────────────────────────────────────────────────────
function generateJWT(array $payload): string {
    $header  = base64UrlEncode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload['iat'] = time();
    $payload['exp'] = time() + JWT_EXPIRY;
    $body    = base64UrlEncode(json_encode($payload));
    $sig     = base64UrlEncode(hash_hmac('sha256', "$header.$body", JWT_SECRET, true));
    return "$header.$body.$sig";
}

// ── Validación ────────────────────────────────────────────────────────────────
function validateJWT(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;

    [$header, $body, $sig] = $parts;
    $expected = base64UrlEncode(hash_hmac('sha256', "$header.$body", JWT_SECRET, true));

    // Comparación segura contra timing attacks
    if (!hash_equals($expected, $sig)) return null;

    $payload = json_decode(base64UrlDecode($body), true);
    if (!$payload || $payload['exp'] < time()) return null;

    return $payload;
}

// ── Extraer token del header Authorization ────────────────────────────────────
function getBearerToken(): ?string {
    $headers = getallheaders();
    $auth    = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (preg_match('/Bearer\s+(.+)$/i', $auth, $m)) return $m[1];
    return null;
}

// ── Middleware: requiere JWT válido, devuelve payload ─────────────────────────
// Si $roles es un array, el usuario debe tener uno de esos roles.
function requireAuth(array $roles = []): array {
    $token = getBearerToken();
    if (!$token) unauthorized('Token no proporcionado');

    $payload = validateJWT($token);
    if (!$payload) unauthorized('Token inválido o expirado');

    // Verificar que el usuario sigue activo en DB
    $db   = getDB();
    $stmt = $db->prepare('SELECT id, tenant_id, role, display_name, is_active FROM users WHERE id = ?');
    $stmt->execute([$payload['user_id']]);
    $user = $stmt->fetch();

    if (!$user || !$user['is_active']) unauthorized('Usuario inactivo o no encontrado');

    // Verificar licencia activa (excepto superadmin)
    if ($user['role'] !== 'superadmin' && $user['tenant_id']) {
        $stmt = $db->prepare(
            'SELECT l.id FROM licenses l
             JOIN tenants t ON t.id = l.tenant_id
             WHERE l.tenant_id = ? AND l.expires_at >= CURDATE() AND t.is_active = 1
             LIMIT 1'
        );
        $stmt->execute([$user['tenant_id']]);
        if (!$stmt->fetch()) {
            fail('Licencia expirada o negocio inactivo. Contacta al administrador.', 402);
        }
    }

    // Verificar rol permitido
    if (!empty($roles) && !in_array($user['role'], $roles)) {
        forbidden('Tu rol no tiene permiso para esta acción');
    }

    return $user;
}

// ── Helpers base64url ────────────────────────────────────────────────────────
function base64UrlEncode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64UrlDecode(string $data): string {
    return base64_decode(strtr($data, '-_', '+/'));
}
