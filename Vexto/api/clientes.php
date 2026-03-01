<?php
// api/clientes.php - CRUD de clientes
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];

// Leer action del body si es POST, o de GET
if ($method === 'POST' || $method === 'PUT' || $method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? '';
} else {
    $action = $_GET['action'] ?? '';
}

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
        if ($action === 'vip') {
            getVipLevels($negocioId);
        } else {
            getClientes($negocioId);
        }
        break;
    case 'POST':
        if ($action === 'vip') {
            createVipLevel($negocioId);
        } else if ($action === 'pago') {
            registrarPago($negocioId);
        } else {
            createCliente($negocioId);
        }
        break;
    case 'PUT':
        updateCliente($negocioId);
        break;
    case 'DELETE':
        deleteCliente($negocioId);
        break;
    default:
        http_response_code(404);
        echo json_encode(['error' => 'Endpoint no encontrado']);
}

/**
 * GET - Listar clientes
 */
function getClientes($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'clientes:ver')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para ver clientes']);
        return;
    }
    
    $pdo = getDB();
    
    $stmt = $pdo->prepare('
        SELECT c.*, v.nombre as vip_nombre, v.porcentaje_descuento as vip_descuento
        FROM clientes c
        LEFT JOIN vip_levels v ON c.vip_level_id = v.id
        WHERE c.negocio_id = ? AND c.activo = 1
        ORDER BY c.nombre
    ');
    $stmt->execute([$negocioId]);
    $clientes = $stmt->fetchAll();
    
    // Si es employee, ocultar deuda total
    if ($usuario['rol'] === 'employee') {
        $clientes = array_map(function($c) {
            unset($c['deuda_actual'], $c['total_comprado']);
            return $c;
        }, $clientes);
    }
    
    echo json_encode($clientes);
}

/**
 * POST - Crear cliente
 */
function createCliente($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'clientes:crear')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para crear clientes']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    $nombre = trim($input['nombre'] ?? '');
    $telefono = $input['telefono'] ?? null;
    $email = $input['email'] ?? null;
    $direccion = $input['direccion'] ?? null;
    $vipLevelId = $input['vip_level_id'] ?? null;
    
    if (!$nombre) {
        http_response_code(400);
        echo json_encode(['error' => 'El nombre es requerido']);
        return;
    }
    
    $pdo = getDB();
    
    $stmt = $pdo->prepare('
        INSERT INTO clientes (negocio_id, nombre, telefono, email, direccion, vip_level_id)
        VALUES (?, ?, ?, ?, ?, ?)
    ');
    $stmt->execute([$negocioId, $nombre, $telefono, $email, $direccion, $vipLevelId]);
    
    echo json_encode(['id' => $pdo->lastInsertId(), 'mensaje' => 'Cliente creado']);
}

/**
 * PUT - Actualizar cliente
 */
function updateCliente($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'clientes:editar')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para editar clientes']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $clienteId = $input['id'] ?? null;
    
    if (!$clienteId) {
        http_response_code(400);
        echo json_encode(['error' => 'ID de cliente requerido']);
        return;
    }
    
    $pdo = getDB();
    
    // Verificar pertenencia
    $stmt = $pdo->prepare('SELECT * FROM clientes WHERE id = ? AND negocio_id = ?');
    $stmt->execute([$clienteId, $negocioId]);
    if (!$stmt->fetch()) {
        http_response_code(404);
        echo json_encode(['error' => 'Cliente no encontrado']);
        return;
    }
    
    $campos = [];
    $valores = [];
    
    if (isset($input['nombre'])) {
        $campos[] = 'nombre = ?';
        $valores[] = $input['nombre'];
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
    if (isset($input['vip_level_id'])) {
        $campos[] = 'vip_level_id = ?';
        $valores[] = $input['vip_level_id'];
    }
    
    if (empty($campos)) {
        http_response_code(400);
        echo json_encode(['error' => 'No hay campos para actualizar']);
        return;
    }
    
    $valores[] = $clienteId;
    $valores[] = $negocioId;
    
    $sql = 'UPDATE clientes SET ' . implode(', ', $campos) . ' WHERE id = ? AND negocio_id = ?';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($valores);
    
    echo json_encode(['mensaje' => 'Cliente actualizado']);
}

/**
 * DELETE - Eliminar cliente
 */
function deleteCliente($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'clientes:eliminar')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para eliminar clientes']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $clienteId = $input['id'] ?? null;
    
    if (!$clienteId) {
        http_response_code(400);
        echo json_encode(['error' => 'ID de cliente requerido']);
        return;
    }
    
    $pdo = getDB();
    $stmt = $pdo->prepare('UPDATE clientes SET activo = 0 WHERE id = ? AND negocio_id = ?');
    $stmt->execute([$clienteId, $negocioId]);
    
    echo json_encode(['mensaje' => 'Cliente eliminado']);
}

/**
 * GET - Listar niveles VIP
 */
function getVipLevels($negocioId) {
    $pdo = getDB();
    
    $stmt = $pdo->prepare('SELECT * FROM vip_levels WHERE negocio_id = ? AND activo = 1 ORDER BY porcentaje_descuento');
    $stmt->execute([$negocioId]);
    $levels = $stmt->fetchAll();
    
    echo json_encode($levels);
}

/**
 * POST - Crear nivel VIP
 */
function createVipLevel($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'vip:crear')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para crear niveles VIP']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    $nombre = trim($input['nombre'] ?? '');
    $porcentaje = floatval($input['porcentaje_descuento'] ?? 0);
    
    if (!$nombre) {
        http_response_code(400);
        echo json_encode(['error' => 'El nombre es requerido']);
        return;
    }
    
    $pdo = getDB();
    
    $stmt = $pdo->prepare('INSERT INTO vip_levels (negocio_id, nombre, porcentaje_descuento) VALUES (?, ?, ?)');
    $stmt->execute([$negocioId, $nombre, $porcentaje]);
    
    echo json_encode(['id' => $pdo->lastInsertId(), 'mensaje' => 'Nivel VIP creado']);
}

/**
 * POST - Registrar pago de deuda
 */
function registrarPago($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'pagos:registrar')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para registrar pagos']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    $clienteId = $input['cliente_id'] ?? null;
    $monto = floatval($input['monto'] ?? 0);
    $metodoPago = $input['metodo_pago'] ?? 'efectivo';
    $notas = $input['notas'] ?? '';
    
    if (!$clienteId || $monto <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Cliente y monto requeridos']);
        return;
    }
    
    $pdo = getDB();
    
    // Verificar cliente
    $stmt = $pdo->prepare('SELECT * FROM clientes WHERE id = ? AND negocio_id = ?');
    $stmt->execute([$clienteId, $negocioId]);
    $cliente = $stmt->fetch();
    
    if (!$cliente) {
        http_response_code(404);
        echo json_encode(['error' => 'Cliente no encontrado']);
        return;
    }
    
    // Registrar pago
    $stmt = $pdo->prepare('
        INSERT INTO pagos_deudas (negocio_id, cliente_id, monto, metodo_pago, notas, fecha_pago)
        VALUES (?, ?, ?, ?, ?, CURDATE())
    ');
    $stmt->execute([$negocioId, $clienteId, $monto, $metodoPago, $notas]);
    
    // Actualizar deuda del cliente
    $nuevaDeuda = max(0, $cliente['deuda_actual'] - $monto);
    $stmt = $pdo->prepare('UPDATE clientes SET deuda_actual = ? WHERE id = ?');
    $stmt->execute([$nuevaDeuda, $clienteId]);
    
    echo json_encode(['mensaje' => 'Pago registrado']);
}
