<?php
// api/ventas.php - CRUD de ventas
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
        if ($action === 'hoy') {
            getVentasHoy($negocioId);
        } else {
            getVentas($negocioId);
        }
        break;
    case 'POST':
        createVenta($negocioId);
        break;
    case 'DELETE':
        deleteVenta($negocioId);
        break;
    default:
        http_response_code(404);
        echo json_encode(['error' => 'Endpoint no encontrado']);
}

/**
 * GET - Listar ventas
 */
function getVentas($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'ventas:ver')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para ver ventas']);
        return;
    }
    
    $pdo = getDB();
    
    $stmt = $pdo->prepare('
        SELECT v.*, p.nombre as producto_nombre, c.nombre as cliente_nombre
        FROM ventas v
        LEFT JOIN productos p ON v.producto_id = p.id
        LEFT JOIN clientes c ON v.cliente_id = c.id
        WHERE v.negocio_id = ?
        ORDER BY v.fecha_venta DESC, v.created_at DESC
    ');
    $stmt->execute([$negocioId]);
    $ventas = $stmt->fetchAll();
    
    // Si es employee, ocultar costos
    if ($usuario['rol'] === 'employee') {
        $ventas = array_map(function($v) {
            unset($v['costo_producto'], $v['ganancia']);
            return $v;
        }, $ventas);
    }
    
    echo json_encode($ventas);
}

/**
 * GET - Ventas de hoy
 */
function getVentasHoy($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'ventas:ver')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para ver ventas']);
        return;
    }
    
    $pdo = getDB();
    
    $stmt = $pdo->prepare('
        SELECT v.*, p.nombre as producto_nombre, c.nombre as cliente_nombre
        FROM ventas v
        LEFT JOIN productos p ON v.producto_id = p.id
        LEFT JOIN clientes c ON v.cliente_id = c.id
        WHERE v.negocio_id = ? AND v.fecha_venta = CURDATE()
        ORDER BY v.created_at DESC
    ');
    $stmt->execute([$negocioId]);
    $ventas = $stmt->fetchAll();
    
    // Calcular totales del día
    $totalVentas = 0;
    $totalGanancia = 0;
    $totalEfectivo = 0;
    $totalDeuda = 0;
    
    foreach ($ventas as $v) {
        $totalVentas += floatval($v['precio_total']);
        $totalGanancia += floatval($v['ganancia']);
        if ($v['estado'] === 'pagado') {
            $totalEfectivo += floatval($v['precio_total']);
        } else {
            $totalDeuda += floatval($v['precio_total']);
        }
    }
    
    echo json_encode([
        'ventas' => $ventas,
        'totales' => [
            'ventas' => $totalVentas,
            'ganancia' => $totalGanancia,
            'efectivo' => $totalEfectivo,
            'deuda' => $totalDeuda
        ]
    ]);
}

/**
 * POST - Crear venta
 */
function createVenta($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'ventas:crear')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para crear ventas']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    $productoId = $input['producto_id'] ?? null;
    $clienteId = $input['cliente_id'] ?? null;
    $cantidad = floatval($input['cantidad'] ?? 0);
    $precioUnitario = floatval($input['precio_unitario'] ?? 0);
    $descuentoAplicado = floatval($input['descuento_aplicado'] ?? 0);
    $moneda = $input['moneda'] ?? 'CUP';
    $estado = $input['estado'] ?? 'pagado';
    
    if (!$productoId || $cantidad <= 0 || $precioUnitario <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Producto, cantidad y precio son requeridos']);
        return;
    }
    
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
    
    // Verificar stock disponible
    if (floatval($producto['current_stock']) < $cantidad) {
        http_response_code(400);
        echo json_encode(['error' => 'Stock insuficiente']);
        return;
    }
    
    // Calcular totales
    $precioTotal = $cantidad * $precioUnitario;
    $descuentoMonto = ($precioTotal * $descuentoAplicado) / 100;
    $precioFinal = $precioTotal - $descuentoMonto;
    $costoProducto = floatval($producto['avg_cost']) * $cantidad;
    $ganancia = $precioFinal - $costoProducto;
    
    // Iniciar transacción
    $pdo->beginTransaction();
    
    try {
        // Crear venta
        $stmt = $pdo->prepare('
            INSERT INTO ventas (negocio_id, producto_id, cliente_id, vendedor_id, cantidad, precio_unitario, precio_total, costo_producto, ganancia, descuento_aplicado, moneda, estado, fecha_venta)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())
        ');
        $stmt->execute([
            $negocioId, $productoId, $clienteId, $usuario['userId'],
            $cantidad, $precioUnitario, $precioFinal, $costoProducto, $ganancia,
            $descuentoAplicado, $moneda, $estado
        ]);
        
        $ventaId = $pdo->lastInsertId();
        
        // Actualizar stock del producto
        $nuevoStock = floatval($producto['current_stock']) - $cantidad;
        $stmt = $pdo->prepare('UPDATE productos SET current_stock = ? WHERE id = ?');
        $stmt->execute([$nuevoStock, $productoId]);
        
        // Actualizar deuda del cliente si es a crédito
        if ($clienteId && $estado === 'pendiente') {
            $stmt = $pdo->prepare('UPDATE clientes SET deuda_actual = deuda_actual + ?, total_comprado = total_comprado + ? WHERE id = ?');
            $stmt->execute([$precioFinal, $precioFinal, $clienteId]);
        } elseif ($clienteId) {
            // Si está pagado, aumentar total comprado
            $stmt = $pdo->prepare('UPDATE clientes SET total_comprado = total_comprado + ? WHERE id = ?');
            $stmt->execute([$precioFinal, $clienteId]);
        }
        
        $pdo->commit();
        
        echo json_encode(['id' => $ventaId, 'mensaje' => 'Venta creada']);
        
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Error al crear venta']);
    }
}

/**
 * DELETE - Eliminar/anular venta
 */
function deleteVenta($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'ventas:eliminar')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para eliminar ventas']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $ventaId = $input['id'] ?? null;
    
    if (!$ventaId) {
        http_response_code(400);
        echo json_encode(['error' => 'ID de venta requerido']);
        return;
    }
    
    $pdo = getDB();
    
    // Obtener venta
    $stmt = $pdo->prepare('SELECT * FROM ventas WHERE id = ? AND negocio_id = ?');
    $stmt->execute([$ventaId, $negocioId]);
    $venta = $stmt->fetch();
    
    if (!$venta) {
        http_response_code(404);
        echo json_encode(['error' => 'Venta no encontrada']);
        return;
    }
    
    // Iniciar transacción
    $pdo->beginTransaction();
    
    try {
        // Restaurar stock
        $stmt = $pdo->prepare('SELECT current_stock FROM productos WHERE id = ?');
        $stmt->execute([$venta['producto_id']]);
        $producto = $stmt->fetch();
        
        $nuevoStock = floatval($producto['current_stock']) + floatval($venta['cantidad']);
        $stmt = $pdo->prepare('UPDATE productos SET current_stock = ? WHERE id = ?');
        $stmt->execute([$nuevoStock, $venta['producto_id']]);
        
        // Restaurar deuda del cliente si aplica
        if ($venta['cliente_id'] && $venta['estado'] === 'pendiente') {
            $stmt = $pdo->prepare('UPDATE clientes SET deuda_actual = MAX(0, deuda_actual - ?) WHERE id = ?');
            $stmt->execute([$venta['precio_total'], $venta['cliente_id']]);
        }
        
        // Marcar venta como cancelada
        $stmt = $pdo->prepare('UPDATE ventas SET estado = ? WHERE id = ?');
        $stmt->execute(['cancelado', $ventaId]);
        
        $pdo->commit();
        
        echo json_encode(['mensaje' => 'Venta cancelada']);
        
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Error al cancelar venta']);
    }
}
