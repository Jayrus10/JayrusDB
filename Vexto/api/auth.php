<?php
// api/auth.php - Endpoints de autenticación
error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];

// Leer action del body si es POST, o de GET
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? '';
} else {
    $action = $_GET['action'] ?? '';
}

// Routing básico
switch ($action) {
    case 'login':
        handleLogin();
        break;
    case 'register':
        handleRegister();
        break;
    case 'me':
        handleMe();
        break;
    case 'logout':
        handleLogout();
        break;
    default:
        http_response_code(404);
        echo json_encode(['error' => 'Endpoint no encontrado']);
}

/**
 * POST /api/auth.php?action=login
 * Iniciar sesión
 */
function handleLogin() {
    global $method;
    
    if ($method !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Método no permitido']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    $email = trim($input['email'] ?? '');
    $password = $input['password'] ?? '';
    
    if (!$email || !$password) {
        http_response_code(400);
        echo json_encode(['error' => 'Email y contraseña son requeridos']);
        return;
    }
    
    $pdo = getDB();
    
    // Buscar usuario
    $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1');
    $stmt->execute([$email]);
    $usuario = $stmt->fetch();
    
    if (!$usuario || !password_verify($password, $usuario['password_hash'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Credenciales inválidas']);
        return;
    }
    
    // Obtener información del negocio si existe
    $negocio = null;
    if ($usuario['negocio_id']) {
        $stmt = $pdo->prepare('SELECT * FROM negocios WHERE id = ? AND activo = 1');
        $stmt->execute([$usuario['negocio_id']]);
        $negocio = $stmt->fetch();
    }
    
    // Generar token JWT
    $token = generateToken($usuario);
    
    // Guardar sesión
    $stmt = $pdo->prepare('INSERT INTO sesiones (usuario_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY))');
    $stmt->execute([$usuario['id'], $token]);
    
    echo json_encode([
        'token' => $token,
        'usuario' => [
            'id' => $usuario['id'],
            'email' => $usuario['email'],
            'nombre' => $usuario['nombre'],
            'rol' => $usuario['rol'],
            'negocio_id' => $usuario['negocio_id']
        ],
        'negocio' => $negocio,
        'permisos' => getPermisosPorRol($usuario['rol'])
    ]);
}

/**
 * POST /api/auth.php?action=register
 * Registrar nuevo usuario
 */
function handleRegister() {
    global $method;
    
    if ($method !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Método no permitido']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    $email = trim($input['email'] ?? '');
    $password = $input['password'] ?? '';
    $nombre = trim($input['nombre'] ?? '');
    $rol = $input['rol'] ?? 'employee';
    $negocioId = $input['negocio_id'] ?? null;
    
    // Validaciones
    if (!$email || !$password || !$nombre) {
        http_response_code(400);
        echo json_encode(['error' => 'Email, contraseña y nombre son requeridos']);
        return;
    }
    
    if (strlen($password) < 6) {
        http_response_code(400);
        echo json_encode(['error' => 'La contraseña debe tener al menos 6 caracteres']);
        return;
    }
    
    // Validar rol
    $rolesValidos = ['superadmin', 'owner', 'manager', 'employee'];
    if (!in_array($rol, $rolesValidos)) {
        $rol = 'employee';
    }
    
    $pdo = getDB();
    
    // Verificar si email ya existe
    $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE email = ?');
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        http_response_code(400);
        echo json_encode(['error' => 'El email ya está registrado']);
        return;
    }
    
    // Hash de contraseña
    $passwordHash = password_hash($password, PASSWORD_BCRYPT);
    
    // Crear usuario
    $stmt = $pdo->prepare('INSERT INTO usuarios (email, password_hash, nombre, rol, negocio_id) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$email, $passwordHash, $nombre, $rol, $negocioId]);
    
    $userId = $pdo->lastInsertId();
    
    // Si es owner, crear negocio automáticamente
    if ($rol === 'owner' && $negocioId === null) {
        $stmt = $pdo->prepare('INSERT INTO negocios (nombre, owner_id) VALUES (?, ?)');
        $stmt->execute([$nombre . '\'s Negocio', $userId]);
        $negocioId = $pdo->lastInsertId();
        
        $stmt = $pdo->prepare('UPDATE usuarios SET negocio_id = ? WHERE id = ?');
        $stmt->execute([$negocioId, $userId]);
        
        // Crear configuración default del negocio
        $stmt = $pdo->prepare('INSERT INTO configuraciones_negocio (negocio_id) VALUES (?)');
        $stmt->execute([$negocioId]);
    }
    
    // Obtener usuario creado
    $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE id = ?');
    $stmt->execute([$userId]);
    $usuario = $stmt->fetch();
    
    // Generar token
    $token = generateToken($usuario);
    
    // Guardar sesión
    $stmt = $pdo->prepare('INSERT INTO sesiones (usuario_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY))');
    $stmt->execute([$userId, $token]);
    
    echo json_encode([
        'token' => $token,
        'usuario' => [
            'id' => $usuario['id'],
            'email' => $usuario['email'],
            'nombre' => $usuario['nombre'],
            'rol' => $usuario['rol'],
            'negocio_id' => $usuario['negocio_id']
        ],
        'permisos' => getPermisosPorRol($usuario['rol'])
    ]);
}

/**
 * GET /api/auth.php?action=me
 * Obtener usuario actual
 */
function handleMe() {
    $usuario = getUsuarioFromToken();
    
    if (!$usuario) {
        http_response_code(401);
        echo json_encode(['error' => 'No autorizado']);
        return;
    }
    
    $pdo = getDB();
    
    // Obtener datos completos del usuario
    $stmt = $pdo->prepare('SELECT id, email, nombre, rol, negocio_id, activo FROM usuarios WHERE id = ?');
    $stmt->execute([$usuario['userId']]);
    $usuarioData = $stmt->fetch();
    
    if (!$usuarioData) {
        http_response_code(404);
        echo json_encode(['error' => 'Usuario no encontrado']);
        return;
    }
    
    // Obtener negocio si existe
    $negocio = null;
    if ($usuarioData['negocio_id']) {
        $stmt = $pdo->prepare('SELECT * FROM negocios WHERE id = ?');
        $stmt->execute([$usuarioData['negocio_id']]);
        $negocio = $stmt->fetch();
    }
    
    echo json_encode([
        'usuario' => $usuarioData,
        'negocio' => $negocio,
        'permisos' => getPermisosPorRol($usuarioData['rol'])
    ]);
}

/**
 * POST /api/auth.php?action=logout
 * Cerrar sesión
 */
function handleLogout() {
    $usuario = getUsuarioFromToken();
    
    if ($usuario) {
        $headers = getallheaders();
        $authHeader = $headers['Authorization'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        $token = str_replace('Bearer ', '', $authHeader);
        
        if ($token) {
            $pdo = getDB();
            $stmt = $pdo->prepare('DELETE FROM sesiones WHERE token = ?');
            $stmt->execute([$token]);
        }
    }
    
    echo json_encode(['mensaje' => 'Sesión cerrada']);
}
?>
