<?php
// api/config.php

// Desactivar mostra de errores
error_reporting(0);
ini_set('display_errors', 0);

// Headers para API
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Configuración base de datos (RunHosting)
define('DB_HOST', 'fdb1031.runhosting.com');
define('DB_NAME', '4668931_jayrus');
define('DB_USER', '4668931_jayrus');
define('DB_PASS', 'G0nz@l3z*');

// JWT Secret
define('JWT_SECRET', 'vexto_jayrus_2024_secreto');

// Conexión PDO singleton
function getDB() {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Error de conexión a la base de datos']);
            exit;
        }
    }
    return $pdo;
}

/**
 * Obtener usuario del token JWT
 */
function getUsuarioFromToken() {
    // Primero intentar con getallheaders()
    $authHeader = null;
    
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? null;
    }
    
    // Fallback a $_SERVER
    if (!$authHeader) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null;
    }
    
    // Fallback: aceptar token como parámetro GET
    if (!$authHeader && isset($_GET['token'])) {
        $authHeader = 'Bearer ' . $_GET['token'];
    }
    
    if (!$authHeader) {
        return null;
    }
    
    $token = str_replace('Bearer ', '', $authHeader);
    
    if (empty($token)) {
        return null;
    }
    
    // Decodificar JWT (formato simplificado: payload.signature)
    $parts = explode('.', $token);
    if (count($parts) !== 2) {
        return null;
    }
    
    $payload = json_decode(base64_decode($parts[0]), true);
    
    if (!$payload || !isset($payload['exp']) || $payload['exp'] < time()) {
        return null;
    }
    
    // Verificar firma
    $signature = hash_hmac('sha256', $parts[0], JWT_SECRET);
    if ($signature !== $parts[1]) {
        return null;
    }
    
    return $payload;
}

/**
 * Verificar si el usuario tiene un permiso específico
 */
function tienePermiso($usuario, $permiso) {
    if (!$usuario) {
        return false;
    }
    
    $permisos = $usuario['permisos'] ?? [];
    
    // Superadmin tiene todos los permisos
    if ($usuario['rol'] === 'superadmin') {
        return true;
    }
    
    // Verificar permiso específico o wildcard
    foreach ($permisos as $p) {
        if ($p === '*') {
            return true;
        }
        if ($p === $permiso) {
            return true;
        }
        // Verificar patrones como "productos:*"
        $parts = explode(':', $p);
        if (count($parts) === 2 && $parts[0] === explode(':', $permiso)[0] && $parts[1] === '*') {
            return true;
        }
    }
    
    return false;
}

/**
 * Obtener permisos por rol
 */
function getPermisosPorRol($rol) {
    $permisos = [
        'superadmin' => ['*'],
        'owner' => ['negocio:*', 'productos:*', 'ventas:*', 'compras:*', 'clientes:*', 'proveedores:*', 'reportes:financieros', 'empleados:gestionar', 'descuentos:*', 'vip:*'],
        'manager' => ['productos:ver', 'productos:crear', 'ventas:*', 'compras:*', 'clientes:*', 'proveedores:*', 'reportes:ventas', 'descuentos:ver', 'descuentos:crear'],
        'employee' => ['productos:ver_stock', 'ventas:crear', 'clientes:ver', 'pagos:registrar']
    ];
    return $permisos[$rol] ?? [];
}

/**
 * Generar token JWT
 */
function generateToken($usuario) {
    $payload = [
        'userId' => $usuario['id'],
        'email' => $usuario['email'],
        'nombre' => $usuario['nombre'],
        'rol' => $usuario['rol'],
        'negocioId' => $usuario['negocio_id'] ?? null,
        'permisos' => getPermisosPorRol($usuario['rol']),
        'iat' => time(),
        'exp' => time() + (24 * 60 * 60) // 24 horas
    ];
    
    $payloadBase64 = base64_encode(json_encode($payload));
    $signature = hash_hmac('sha256', $payloadBase64, JWT_SECRET);
    
    return $payloadBase64 . '.' . $signature;
}

/**
 * Responder con error
 */
function responderError($mensaje, $codigo = 400) {
    http_response_code($codigo);
    echo json_encode(['error' => $mensaje]);
    exit;
}

/**
 * Responder con éxito
 */
function responderOk($data) {
    echo json_encode($data);
    exit;
}
