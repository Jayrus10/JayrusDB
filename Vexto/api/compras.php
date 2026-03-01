<?php
// api/compras.php - CRUD de compras/lotes
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];

// Leer action del body si es POST/PUT/DELETE, o de GET para GET
if ($method === 'GET') {
    $action = $_GET['action'] ?? '';
} else {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? '';
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
        getCompras($negocioId);
        break;
    case 'POST':
        createCompra($negocioId);
        break;
    case 'PUT':
        updateCompra($negocioId);
        break;
    case 'DELETE':
        deleteCompra($negocioId);
        break;
    default:
        http_response_code(404);
        echo json_encode(['error' => 'Endpoint no encontrado']);
}

/**
 * GET - Listar compras
 */
function getCompras($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'compras:ver')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para ver compras']);
        return;
    }
    
    $pdo = getDB();
    
    $stmt = $pdo->prepare('
        SELECT c.*, p.nombre as producto_nombre, pr.nombre as proveedor_nombre
        FROM compras c
        LEFT JOIN productos p ON c.producto_id = p.id
        LEFT JOIN proveedores pr ON c.proveedor_id = pr.id
        WHERE c.negocio_id = ?
        ORDER BY c.fecha_compra DESC, c.created_at DESC
    ');
    $stmt->execute([$negocioId]);
    $compras = $stmt->fetchAll();
    
    // Si es employee, ocultar costos
    if ($usuario['rol'] === 'employee') {
        $compras = array_map(function($c) {
            unset($c['costo_unitario'], $c['costo_total']);
            return $c;
        }, $compras);
    }
    
    echo json_encode($compras);
}

/**
 * POST - Crear compra
 */
function createCompra($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'compras:crear')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para crear compras']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    $productoId = $input['producto_id'] ?? null;
    $proveedorId = $input['proveedor_id'] ?? null;
    $cantidad = floatval($input['cantidad'] ?? 0);
    $costoUnitario = floatval($input['costo_unitario'] ?? 0);
    $estado = $input['estado'] ?? 'pendiente';
    $notas = $input['notas'] ?? '';
    
    if (!$productoId || $cantidad <= 0 || $costoUnitario <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Producto, cantidad y costo son requeridos']);
        return;
    }
    
    $costoTotal = $cantidad * $costoUnitario;
    $fechaRecibo = $estado === 'recibido' ? 'CURDATE()' : 'NULL';
    
    $pdo = getDB();
    
    // Verificar producto
    $stmt = $pdo->prepare('SELECT * FROM productos WHERE id = ? AND negocio_id = ? AND activo = 1');
    $stmt->execute([$productoId, $negocioId]);
    $producto = $stmt->fetch();
    
    if (!$producto) {
        http_response_code(404);
        echo json_encode(['error' => 'Producto no encontrado']);
        return;
    }
    
    // Iniciar transacción
    $pdo->beginTransaction();
    
    try {
        // Crear compra
        $stmt = $pdo->prepare('
            INSERT INTO compras (negocio_id, producto_id, proveedor_id, cantidad, costo_unitario, costo_total, estado, fecha_compra, notas)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), ?)
        ');
        $stmt->execute([
            $negocioId, $productoId, $proveedorId, $cantidad, $costoUnitario, $costoTotal, $estado, $notas
        ]);
        
        $compraId = $pdo->lastInsertId();
        
        // Si está recibida, actualizar stock y costo promedio
        if ($estado === 'recibido') {
            $stockActual = floatval($producto['current_stock']);
            $costoActual = floatval($producto['avg_cost']);
            
            // Calcular nuevo costo promedio ponderado
            $nuevoStock = $stockActual + $cantidad;
            $nuevoCostoPromedio = (($stockActual * $costoActual) + ($cantidad * $costoUnitario)) / $nuevoStock;
            
            $stmt = $pdo->prepare('
                UPDATE productos 
                SET current_stock = ?, avg_cost = ?, total_cost_value = ? * ?
                WHERE id = ?
            ');
            $stmt->execute([$nuevoStock, $nuevoCostoPromedio, $nuevoStock, $nuevoCostoPromedio, $productoId]);
        }
        
        $pdo->commit();
        
        echo json_encode(['id' => $compraId, 'mensaje' => 'Compra creada']);
        
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Error al crear compra']);
    }
}

/**
 * PUT - Actualizar compra
 */
function updateCompra($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'compras:editar')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para editar compras']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $compraId = $input['id'] ?? null;
    
    if (!$compraId) {
        http_response_code(400);
        echo json_encode(['error' => 'ID de compra requerido']);
        return;
    }
    
    $pdo = getDB();
    
    // Obtener compra actual
    $stmt = $pdo->prepare('SELECT * FROM compras WHERE id = ? AND negocio_id = ?');
    $stmt->execute([$compraId, $negocioId]);
    $compraActual = $stmt->fetch();
    
    if (!$compraActual) {
        http_response_code(404);
        echo json_encode(['error' => 'Compra no encontrada']);
        return;
    }
    
    $estadoAnterior = $compraActual['estado'];
    $estadoNuevo = $input['estado'] ?? $estadoAnterior;
    
    // Iniciar transacción
    $pdo->beginTransaction();
    
    try {
        // Actualizar campos
        $campos = [];
        $valores = [];
        
        if (isset($input['proveedor_id'])) {
            $campos[] = 'proveedor_id = ?';
            $valores[] = $input['proveedor_id'];
        }
        if (isset($input['notas'])) {
            $campos[] = 'notas = ?';
            $valores[] = $input['notas'];
        }
        if (isset($input['estado'])) {
            $campos[] = 'estado = ?';
            $valores[] = $input['estado'];
        }
        
        // Si cambia a recibido, actualizar stock
        if ($estadoAnterior !== 'recibido' && $estadoNuevo === 'recibido') {
            $campos[] = 'fecha_recibido = CURDATE()';
            
            // Obtener producto
            $stmt = $pdo->prepare('SELECT * FROM productos WHERE id = ?');
            $stmt->execute([$compraActual['producto_id']]);
            $producto = $stmt->fetch();
            
            $cantidad = floatval($compraActual['cantidad']);
            $costoUnitario = floatval($compraActual['costo_unitario']);
            
            $stockActual = floatval($producto['current_stock']);
            $costoActual = floatval($producto['avg_cost']);
            
            // Calcular nuevo costo promedio
            $nuevoStock = $stockActual + $cantidad;
            $nuevoCostoPromedio = (($stockActual * $costoActual) + ($cantidad * $costoUnitario)) / $nuevoStock;
            
            $stmt = $pdo->prepare('
                UPDATE productos 
                SET current_stock = ?, avg_cost = ?, total_cost_value = ? * ?
                WHERE id = ?
            ');
            $stmt->execute([$nuevoStock, $nuevoCostoPromedio, $nuevoStock, $nuevoCostoPromedio, $compraActual['producto_id']]);
        }
        
        if (empty($campos)) {
            http_response_code(400);
            echo json_encode(['error' => 'No hay campos para actualizar']);
            return;
        }
        
        $valores[] = $compraId;
        $valores[] = $negocioId;
        
        $sql = 'UPDATE compras SET ' . implode(', ', $campos) . ' WHERE id = ? AND negocio_id = ?';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($valores);
        
        $pdo->commit();
        
        echo json_encode(['mensaje' => 'Compra actualizada']);
        
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Error al actualizar compra']);
    }
}

/**
 * DELETE - Eliminar compra
 */
function deleteCompra($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'compras:eliminar')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para eliminar compras']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $compraId = $input['id'] ?? null;
    
    if (!$compraId) {
        http_response_code(400);
        echo json_encode(['error' => 'ID de compra requerido']);
        return;
    }
    
    $pdo = getDB();
    
    // Obtener compra
    $stmt = $pdo->prepare('SELECT * FROM compras WHERE id = ? AND negocio_id = ?');
    $stmt->execute([$compraId, $negocioId]);
    $compra = $stmt->fetch();
    
    if (!$compra) {
        http_response_code(404);
        echo json_encode(['error' => 'Compra no encontrada']);
        return;
    }
    
    // Solo eliminar si está pendiente
    if ($compra['estado'] !== 'pendiente') {
        http_response_code(400);
        echo json_encode(['error' => 'Solo se pueden eliminar compras pendientes']);
        return;
    }
    
    $stmt = $pdo->prepare('DELETE FROM compras WHERE id = ? AND negocio_id = ?');
    $stmt->execute([$compraId, $negocioId]);
    
    echo json_encode(['mensaje' => 'Compra eliminada']);
}
