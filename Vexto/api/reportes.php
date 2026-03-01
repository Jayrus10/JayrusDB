<?php
// api/reportes.php - Endpoints de reportes
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// Verificar autenticación
$usuario = getUsuarioFromToken();
if (!$usuario) {
    http_response_code(401);
    echo json_encode(['error' => 'No autorizado']);
    exit;
}

$negocioId = $usuario['negocioId'];

// Solo GET para reportes
if ($method !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido']);
    exit;
}

switch ($action) {
    case 'dashboard':
        getDashboard($negocioId);
        break;
    case 'ganancias':
        getGanancias($negocioId);
        break;
    case 'ventas':
        getReporteVentas($negocioId);
        break;
    default:
        getDashboard($negocioId);
}

/**
 * GET - Dashboard stats
 */
function getDashboard($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'ventas:ver')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso']);
        return;
    }
    
    $pdo = getDB();
    
    // 1. Valor del stock
    $stmt = $pdo->prepare('SELECT COALESCE(SUM(current_stock * avg_cost), 0) as valor_stock FROM productos WHERE negocio_id = ? AND activo = 1');
    $stmt->execute([$negocioId]);
    $valorStock = floatval($stmt->fetch()['valor_stock']);
    
    // 2. Total deudores
    $stmt = $pdo->prepare('SELECT COALESCE(SUM(deuda_actual), 0) as total_deuda FROM clientes WHERE negocio_id = ? AND activo = 1');
    $stmt->execute([$negocioId]);
    $totalDeuda = floatval($stmt->fetch()['total_deuda']);
    
    // 3. Ganancias de hoy
    $stmt = $pdo->prepare('SELECT COALESCE(SUM(ganancia), 0) as ganancia_hoy FROM ventas WHERE negocio_id = ? AND fecha_venta = CURDATE() AND estado != "cancelado"');
    $stmt->execute([$negocioId]);
    $gananciaHoy = floatval($stmt->fetch()['ganancia_hoy']);
    
    // 4. Ventas del mes
    $stmt = $pdo->prepare('SELECT COALESCE(SUM(precio_total), 0) as ventas_mes FROM ventas WHERE negocio_id = ? AND MONTH(fecha_venta) = MONTH(CURDATE()) AND YEAR(fecha_venta) = YEAR(CURDATE()) AND estado != "cancelado"');
    $stmt->execute([$negocioId]);
    $ventasMes = floatval($stmt->fetch()['ventas_mes']);
    
    // 5. Ventas de esta semana
    $stmt = $pdo->prepare('SELECT COALESCE(SUM(precio_total), 0) as ventas_semana, COUNT(*) as cantidad FROM ventas WHERE negocio_id = ? AND YEARWEEK(fecha_venta) = YEARWEEK(CURDATE()) AND estado != "cancelado"');
    $stmt->execute([$negocioId]);
    $ventasSemana = floatval($stmt->fetch()['ventas_semana']);
    $cantidadSemana = intval($stmt->fetch()['cantidad']);
    
    // 6. Ventas semana anterior
    $stmt = $pdo->prepare('SELECT COALESCE(SUM(precio_total), 0) as ventas_semana_ant, COUNT(*) as cantidad FROM ventas WHERE negocio_id = ? AND YEARWEEK(fecha_venta) = YEARWEEK(CURDATE() - INTERVAL 1 WEEK) AND estado != "cancelado"');
    $stmt->execute([$negocioId]);
    $ventasSemanaAnt = floatval($stmt->fetch()['ventas_semana_ant']);
    $cantidadSemanaAnt = intval($stmt->fetch()['cantidad']);
    
    // 7. Compras en camino (pendientes)
    $stmt = $pdo->prepare('SELECT COUNT(*) as cantidad, COALESCE(SUM(costo_total), 0) as valor FROM compras WHERE negocio_id = ? AND estado = "pendiente"');
    $stmt->execute([$negocioId]);
    $comprasPendientes = $stmt->fetch();
    
    // 8. Top productos del mes
    $stmt = $pdo->prepare('
        SELECT p.nombre, SUM(v.cantidad) as cantidad_vendida
        FROM ventas v
        JOIN productos p ON v.producto_id = p.id
        WHERE v.negocio_id = ? AND MONTH(v.fecha_venta) = MONTH(CURDATE()) AND YEAR(v.fecha_venta) = YEAR(CURDATE()) AND v.estado != "cancelado"
        GROUP BY p.id
        ORDER BY cantidad_vendida DESC
        LIMIT 5
    ');
    $stmt->execute([$negocioId]);
    $topProductos = $stmt->fetchAll();
    
    // 9. Clientes con deuda mayor a 1 semana
    $stmt = $pdo->prepare('
        SELECT c.nombre, c.deuda_actual, MAX(v.fecha_venta) as ultima_compra
        FROM clientes c
        JOIN ventas v ON c.id = v.cliente_id
        WHERE c.negocio_id = ? AND c.deuda_actual > 0 AND v.estado = "pendiente"
        GROUP BY c.id
        HAVING DATEDIFF(CURDATE(), ultima_compra) > 7
        ORDER BY c.deuda_actual DESC
    ');
    $stmt->execute([$negocioId]);
    $deudores = $stmt->fetchAll();
    
    // 10. Productos con stock bajo
    $stmt = $pdo->prepare('SELECT nombre, current_stock, min_stock FROM productos WHERE negocio_id = ? AND activo = 1 AND current_stock <= min_stock ORDER BY current_stock');
    $stmt->execute([$negocioId]);
    $stockBajo = $stmt->fetchAll();
    
    // Calcular comparación semanal
    $comparacionSemanal = '';
    if ($ventasSemanaAnt > 0) {
        $diferencia = (($ventasSemana - $ventasSemanaAnt) / $ventasSemanaAnt) * 100;
        $comparacionSemanal = $diferencia >= 0 ? '+' . round($diferencia, 1) . '%' : round($diferencia, 1) . '%';
    }
    
    echo json_encode([
        'valor_stock' => $valorStock,
        'total_deuda' => $totalDeuda,
        'ganancia_hoy' => $gananciaHoy,
        'ventas_mes' => $ventasMes,
        'ventas_semana' => $ventasSemana,
        'cantidad_semana' => $cantidadSemana,
        'ventas_semana_anterior' => $ventasSemanaAnt,
        'cantidad_semana_anterior' => $cantidadSemanaAnt,
        'comparacion_semanal' => $comparacionSemanal,
        'compras_pendientes' => [
            'cantidad' => intval($comprasPendientes['cantidad']),
            'valor' => floatval($comprasPendientes['valor'])
        ],
        'top_productos' => $topProductos,
        'deudores' => $deudores,
        'stock_bajo' => $stockBajo
    ]);
}

/**
 * GET - Reporte de ganancias
 */
function getGanancias($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'reportes:financieros')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para ver reportes financieros']);
        return;
    }
    
    $pdo = getDB();
    
    // Obtener período
    $fechaInicio = $_GET['fecha_inicio'] ?? date('Y-m-01');
    $fechaFin = $_GET['fecha_fin'] ?? date('Y-m-d');
    
    // Ganancias netas
    $stmt = $pdo->prepare('
        SELECT COALESCE(SUM(ganancia), 0) as ganancia_neta, 
               COALESCE(SUM(costo_producto), 0) as costo_mercancia
        FROM ventas 
        WHERE negocio_id = ? AND fecha_venta BETWEEN ? AND ? AND estado != "cancelado"
    ');
    $stmt->execute([$negocioId, $fechaInicio, $fechaFin]);
    $financieros = $stmt->fetch();
    
    // Total cobrado en efectivo
    $stmt = $pdo->prepare('
        SELECT COALESCE(SUM(precio_total), 0) as efectivo
        FROM ventas 
        WHERE negocio_id = ? AND fecha_venta BETWEEN ? AND ? AND estado = "pagado"
    ');
    $stmt->execute([$negocioId, $fechaInicio, $fechaFin]);
    $efectivo = floatval($stmt->fetch()['efectivo']);
    
    // Deuda pendiente
    $stmt = $pdo->prepare('
        SELECT COALESCE(SUM(precio_total), 0) as deuda
        FROM ventas 
        WHERE negocio_id = ? AND fecha_venta BETWEEN ? AND ? AND estado = "pendiente"
    ');
    $stmt->execute([$negocioId, $fechaInicio, $fechaFin]);
    $deuda = floatval($stmt->fetch()['deuda']);
    
    // Detalle por cliente
    $stmt = $pdo->prepare('
        SELECT c.nombre, COALESCE(SUM(v.precio_total), 0) as total, COALESCE(SUM(CASE WHEN v.estado = "pendiente" THEN v.precio_total ELSE 0 END), 0) as pendiente
        FROM clientes c
        LEFT JOIN ventas v ON c.id = v.cliente_id AND v.fecha_venta BETWEEN ? AND ? AND v.estado != "cancelado"
        WHERE c.negocio_id = ? AND c.deuda_actual > 0
        GROUP BY c.id
        ORDER BY pendiente DESC
    ');
    $stmt->execute([$fechaInicio, $fechaFin, $negocioId]);
    $detalleDeudas = $stmt->fetchAll();
    
    echo json_encode([
        'fecha_inicio' => $fechaInicio,
        'fecha_fin' => $fechaFin,
        'ganancia_neta' => floatval($financieros['ganancia_neta']),
        'costo_mercancia' => floatval($financieros['costo_mercancia']),
        'total_efectivo' => $efectivo,
        'total_deuda' => $deuda,
        'total_si_todo_pagado' => $efectivo + $deuda,
        'detalle_deudas' => $detalleDeudas
    ]);
}

/**
 * GET - Reporte de ventas
 */
function getReporteVentas($negocioId) {
    global $usuario;
    
    if (!tienePermiso($usuario, 'reportes:ventas')) {
        http_response_code(403);
        echo json_encode(['error' => 'Sin permiso para ver reportes de ventas']);
        return;
    }
    
    $pdo = getDB();
    
    // Ventas por día del mes actual
    $stmt = $pdo->prepare('
        SELECT fecha_venta, SUM(precio_total) as total, COUNT(*) as cantidad
        FROM ventas
        WHERE negocio_id = ? AND MONTH(fecha_venta) = MONTH(CURDATE()) AND YEAR(fecha_venta) = YEAR(CURDATE()) AND estado != "cancelado"
        GROUP BY fecha_venta
        ORDER BY fecha_venta
    ');
    $stmt->execute([$negocioId]);
    $ventasDiarias = $stmt->fetchAll();
    
    // Ventas por producto
    $stmt = $pdo->prepare('
        SELECT p.nombre, SUM(v.cantidad) as cantidad, SUM(v.precio_total) as total, SUM(v.ganancia) as ganancia
        FROM ventas v
        JOIN productos p ON v.producto_id = p.id
        WHERE v.negocio_id = ? AND MONTH(v.fecha_venta) = MONTH(CURDATE()) AND YEAR(v.fecha_venta) = YEAR(CURDATE()) AND v.estado != "cancelado"
        GROUP BY p.id
        ORDER BY total DESC
    ');
    $stmt->execute([$negocioId]);
    $ventasPorProducto = $stmt->fetchAll();
    
    // Resumen del mes
    $stmt = $pdo->prepare('
        SELECT 
            COALESCE(SUM(precio_total), 0) as total,
            COALESCE(SUM(ganancia), 0) as ganancia,
            COUNT(*) as cantidad
        FROM ventas
        WHERE negocio_id = ? AND MONTH(fecha_venta) = MONTH(CURDATE()) AND YEAR(fecha_venta) = YEAR(CURDATE()) AND estado != "cancelado"
    ');
    $stmt->execute([$negocioId]);
    $resumenMes = $stmt->fetch();
    
    echo json_encode([
        'ventas_diarias' => $ventasDiarias,
        'ventas_por_producto' => $ventasPorProducto,
        'resumen_mes' => [
            'total' => floatval($resumenMes['total']),
            'ganancia' => floatval($resumenMes['ganancia']),
            'cantidad' => intval($resumenMes['cantidad'])
        ]
    ]);
}
