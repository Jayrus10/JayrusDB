<?php
// api/proveedores.php - CRUD de proveedores
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];

// Verificar autenticación
$usuario = getUsuarioFromToken();
if (!$usuario) {
    http_response_code(401);
    echo json_encode(['error' => 'No autorizado']);
    exit;
}

$negocioId = $usuario['negocioId'];

// Routing
switch ($method) {
    case 'GET':
        getProveedores($negocioId);
        break;
    case 'POST':
        createProveedor($negocioId);
        break;
    case 'PUT':
        updateProveedor($negocioId);
        break;
    case 'DELETE':
        deleteProveedor($negocioId);
        break;
    default:
        http_response_code(404);
        echo json_encode(['error' => 'Endpoint no encontrado']);
}

/**
 * GET - Listar proveedores
 */
function getProveedores($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'proveedores:ver')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para ver proveedores']);
        return;
    }
    
    $pdo = getDB();
    
    $stmt = $pdo->prepare('
        SELECT * FROM proveedores 
        WHERE negocio_id = ? AND activo = 1 
        ORDER BY nombre
    ');
    $stmt->execute([$negocioId]);
    $proveedores = $stmt->fetchAll();
    
    echo json_encode($proveedores);
}

/**
 * POST - Crear proveedor
 */
function createProveedor($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'proveedores:crear')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para crear proveedores']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    $nombre = trim($input['nombre'] ?? '');
    $contacto = $input['contacto'] ?? null;
    $telefono = $input['telefono'] ?? null;
    $email = $input['email'] ?? null;
    $direccion = $input['direccion'] ?? null;
    $notas = $input['notas'] ?? null;
    
    if (!$nombre) {
        http_response_code(400);
        echo json_encode(['error' => 'El nombre es requerido']);
        return;
    }
    
    $pdo = getDB();
    
    $stmt = $pdo->prepare('
        INSERT INTO proveedores (negocio_id, nombre, contacto, telefono, email, direccion, notas)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ');
    $stmt->execute([$negocioId, $nombre, $contacto, $telefono, $email, $direccion, $notas]);
    
    echo json_encode(['id' => $pdo->lastInsertId(), 'mensaje' => 'Proveedor creado']);
}

/**
 * PUT - Actualizar proveedor
 */
function updateProveedor($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'proveedores:editar')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para editar proveedores']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $proveedorId = $input['id'] ?? null;
    
    if (!$proveedorId) {
        http_response_code(400);
        echo json_encode(['error' => 'ID de proveedor requerido']);
        return;
    }
    
    $pdo = getDB();
    
    // Verificar pertenencia
    $stmt = $pdo->prepare('SELECT id FROM proveedores WHERE id = ? AND negocio_id = ?');
    $stmt->execute([$proveedorId, $negocioId]);
    if (!$stmt->fetch()) {
        http_response_code(404);
        echo json_encode(['error' => 'Proveedor no encontrado']);
        return;
    }
    
    $campos = [];
    $valores = [];
    
    if (isset($input['nombre'])) {
        $campos[] = 'nombre = ?';
        $valores[] = $input['nombre'];
    }
    if (isset($input['contacto'])) {
        $campos[] = 'contacto = ?';
        $valores[] = $input['contacto'];
    }
    if (isset($input['telefono'])) {
        $campos[] = 'telefono = ?';
        $valores[] = $input['telefono'];
    }
    if (isset($input['email'])) {
        $campos[] = 'email = ?';
        $valores[] = $input['email'];
    }
    if (isset($input['direccion'])) {
        $campos[] = 'direccion = ?';
        $valores[] = $input['direccion'];
    }
    if (isset($input['notas'])) {
        $campos[] = 'notas = ?';
        $valores[] = $input['notas'];
    }
    
    if (empty($campos)) {
        http_response_code(400);
        echo json_encode(['error' => 'No hay campos para actualizar']);
        return;
    }
    
    $valores[] = $proveedorId;
    $valores[] = $negocioId;
    
    $sql = 'UPDATE proveedores SET ' . implode(', ', $campos) . ' WHERE id = ? AND negocio_id = ?';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($valores);
    
    echo json_encode(['mensaje' => 'Proveedor actualizado']);
}

/**
 * DELETE - Eliminar proveedor
 */
function deleteProveedor($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'proveedores:eliminar')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para eliminar proveedores']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $proveedorId = $input['id'] ?? null;
    
    if (!$proveedorId) {
        http_response_code(400);
        echo json_encode(['error' => 'ID de proveedor requerido']);
        return;
    }
    
    $pdo = getDB();
    $stmt = $pdo->prepare('UPDATE proveedores SET activo = 0 WHERE id = ? AND negocio_id = ?');
    $stmt->execute([$proveedorId, $negocioId]);
    
    echo json_encode(['mensaje' => 'Proveedor eliminado']);
}
