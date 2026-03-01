<?php
// api/productos.php - CRUD de productos
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
        if ($action === 'categorias') {
            getCategorias($negocioId);
        } else {
            getProductos($negocioId);
        }
        break;
    case 'POST':
        if ($action === 'categoria') {
            createCategoria($negocioId);
        } else {
            createProducto($negocioId);
        }
        break;
    case 'PUT':
        updateProducto($negocioId);
        break;
    case 'DELETE':
        deleteProducto($negocioId);
        break;
    default:
        http_response_code(404);
        echo json_encode(['error' => 'Endpoint no encontrado']);
}

/**
 * GET - Listar productos
 */
function getProductos($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'productos:ver')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para ver productos']);
        return;
    }
    
    $pdo = getDB();
    
    $stmt = $pdo->prepare('
        SELECT p.*, c.nombre as categoria_nombre
        FROM productos p
        LEFT JOIN categorias c ON p.categoria_id = c.id
        WHERE p.negocio_id = ? AND p.activo = 1
        ORDER BY p.nombre
    ');
    $stmt->execute([$negocioId]);
    $productos = $stmt->fetchAll();
    
    // Si es employee, ocultar costos
    if ($usuario['rol'] === 'employee') {
        $productos = array_map(function($p) {
            unset($p['avg_cost'], $p['total_cost_value'], $p['markup']);
            return $p;
        }, $productos);
    }
    
    echo json_encode($productos);
}

/**
 * POST - Crear producto
 */
function createProducto($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'productos:crear')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para crear productos']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    $nombre = trim($input['nombre'] ?? '');
    $categoriaId = $input['categoria_id'] ?? null;
    $codigoBarras = $input['codigo_barras'] ?? null;
    $descripcion = $input['descripcion'] ?? '';
    $minStock = floatval($input['min_stock'] ?? 0);
    $markup = floatval($input['markup'] ?? 30);
    
    if (!$nombre) {
        http_response_code(400);
        echo json_encode(['error' => 'El nombre es requerido']);
        return;
    }
    
    $pdo = getDB();
    
    $stmt = $pdo->prepare('
        INSERT INTO productos (negocio_id, nombre, categoria_id, codigo_barras, descripcion, min_stock, markup)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ');
    $stmt->execute([$negocioId, $nombre, $categoriaId, $codigoBarras, $descripcion, $minStock, $markup]);
    
    $productoId = $pdo->lastInsertId();
    
    // Registrar auditoría
    registrarAuditoria($negocioId, $usuario['userId'], 'crear', 'producto', $productoId, null, $input);
    
    echo json_encode(['id' => $productoId, 'mensaje' => 'Producto creado']);
}

/**
 * PUT - Actualizar producto
 */
function updateProducto($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'productos:editar')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para editar productos']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $productoId = $input['id'] ?? null;
    
    if (!$productoId) {
        http_response_code(400);
        echo json_encode(['error' => 'ID de producto requerido']);
        return;
    }
    
    // Verificar que el producto pertenece al negocio
    $pdo = getDB();
    $stmt = $pdo->prepare('SELECT * FROM productos WHERE id = ? AND negocio_id = ?');
    $stmt->execute([$productoId, $negocioId]);
    $productoActual = $stmt->fetch();
    
    if (!$productoActual) {
        http_response_code(404);
        echo json_encode(['error' => 'Producto no encontrado']);
        return;
    }
    
    // Actualizar campos
    $campos = [];
    $valores = [];
    
    if (isset($input['nombre'])) {
        $campos[] = 'nombre = ?';
        $valores[] = $input['nombre'];
    }
    if (isset($input['categoria_id'])) {
        $campos[] = 'categoria_id = ?';
        $valores[] = $input['categoria_id'];
    }
    if (isset($input['codigo_barras'])) {
        $campos[] = 'codigo_barras = ?';
        $valores[] = $input['codigo_barras'];
    }
    if (isset($input['descripcion'])) {
        $campos[] = 'descripcion = ?';
        $valores[] = $input['descripcion'];
    }
    if (isset($input['min_stock'])) {
        $campos[] = 'min_stock = ?';
        $valores[] = floatval($input['min_stock']);
    }
    if (isset($input['markup'])) {
        $campos[] = 'markup = ?';
        $valores[] = floatval($input['markup']);
    }
    if (isset($input['current_stock'])) {
        $campos[] = 'current_stock = ?';
        $valores[] = floatval($input['current_stock']);
    }
    if (isset($input['avg_cost'])) {
        $campos[] = 'avg_cost = ?';
        $valores[] = floatval($input['avg_cost']);
    }
    
    if (empty($campos)) {
        http_response_code(400);
        echo json_encode(['error' => 'No hay campos para actualizar']);
        return;
    }
    
    $valores[] = $productoId;
    $valores[] = $negocioId;
    
    $sql = 'UPDATE productos SET ' . implode(', ', $campos) . ' WHERE id = ? AND negocio_id = ?';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($valores);
    
    // Actualizar total_cost_value
    $stmt = $pdo->prepare('UPDATE productos SET total_cost_value = current_stock * avg_cost WHERE id = ?');
    $stmt->execute([$productoId]);
    
    // Registrar auditoría
    registrarAuditoria($negocioId, $usuario['userId'], 'actualizar', 'producto', $productoId, $productoActual, $input);
    
    echo json_encode(['mensaje' => 'Producto actualizado']);
}

/**
 * DELETE - Eliminar producto (soft delete)
 */
function deleteProducto($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'productos:eliminar')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para eliminar productos']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $productoId = $input['id'] ?? null;
    
    if (!$productoId) {
        http_response_code(400);
        echo json_encode(['error' => 'ID de producto requerido']);
        return;
    }
    
    $pdo = getDB();
    
    // Soft delete
    $stmt = $pdo->prepare('UPDATE productos SET activo = 0 WHERE id = ? AND negocio_id = ?');
    $stmt->execute([$productoId, $negocioId]);
    
    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['error' => 'Producto no encontrado']);
        return;
    }
    
    // Registrar auditoría
    registrarAuditoria($negocioId, $usuario['userId'], 'eliminar', 'producto', $productoId, null, null);
    
    echo json_encode(['mensaje' => 'Producto eliminado']);
}

/**
 * GET - Listar categorías
 */
function getCategorias($negocioId) {
    $pdo = getDB();
    
    $stmt = $pdo->prepare('SELECT * FROM categorias WHERE negocio_id = ? AND activo = 1 ORDER BY nombre');
    $stmt->execute([$negocioId]);
    $categorias = $stmt->fetchAll();
    
    echo json_encode($categorias);
}

/**
 * POST - Crear categoría
 */
function createCategoria($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'productos:crear')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para crear categorías']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    $nombre = trim($input['nombre'] ?? '');
    $descripcion = $input['descripcion'] ?? '';
    
    if (!$nombre) {
        http_response_code(400);
        echo json_encode(['error' => 'El nombre es requerido']);
        return;
    }
    
    $pdo = getDB();
    
    $stmt = $pdo->prepare('INSERT INTO categorias (negocio_id, nombre, descripcion) VALUES (?, ?, ?)');
    $stmt->execute([$negocioId, $nombre, $descripcion]);
    
    echo json_encode(['id' => $pdo->lastInsertId(), 'mensaje' => 'Categoría creada']);
}

/**
 * Función auxiliar para registrar auditoría
 */
function registrarAuditoria($negocioId, $usuarioId, $accion, $entidadTipo, $entidadId, $datosAnteriores, $datosNuevos) {
    $pdo = getDB();
    
    $stmt = $pdo->prepare('
        INSERT INTO auditoria (negocio_id, usuario_id, accion, entidad_tipo, entidad_id, datos_anteriores, datos_nuevos)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ');
    $stmt->execute([
        $negocioId,
        $usuarioId,
        $accion,
        $entidadTipo,
        $entidadId,
        $datosAnteriores ? json_encode($datosAnteriores) : null,
        $datosNuevos ? json_encode($datosNuevos) : null
    ]);
}
