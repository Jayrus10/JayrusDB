<?php
// api/index.php - Punto de entrada principal de la API
require_once 'config.php';

$requestUri = $_SERVER['REQUEST_URI'];
$requestMethod = $_SERVER['REQUEST_METHOD'];

// Extraer el endpoint
$path = parse_url($requestUri, PHP_URL_PATH);
$path = str_replace('/api/', '', $path);
$path = explode('/', $path);
$endpoint = $path[0] ?? '';

// Routing básico
switch ($endpoint) {
    case 'auth':
        require_once 'auth.php';
        break;
        
    case 'productos':
        require_once 'productos.php';
        break;
        
    case 'clientes':
        require_once 'clientes.php';
        break;
        
    case 'proveedores':
        require_once 'proveedores.php';
        break;
        
    case 'ventas':
        require_once 'ventas.php';
        break;
        
    case 'compras':
        require_once 'compras.php';
        break;
        
    case 'reportes':
        require_once 'reportes.php';
        break;
        
    case '':
    case 'index':
        // Info de la API
        echo json_encode([
            'nombre' => 'Vexto API',
            'version' => '1.0.0',
            'endpoints' => [
                'auth' => [
                    'GET /api/auth.php?action=me' => 'Obtener usuario actual',
                    'POST /api/auth.php?action=login' => 'Iniciar sesión',
                    'POST /api/auth.php?action=register' => 'Registrar usuario',
                    'POST /api/auth.php?action=logout' => 'Cerrar sesión'
                ],
                'productos' => [
                    'GET' => 'Listar productos',
                    'POST' => 'Crear producto',
                    'PUT' => 'Actualizar producto',
                    'DELETE' => 'Eliminar producto'
                ],
                'clientes' => [
                    'GET' => 'Listar clientes',
                    'POST' => 'Crear cliente',
                    'PUT' => 'Actualizar cliente',
                    'DELETE' => 'Eliminar cliente'
                ],
                'proveedores' => [
                    'GET' => 'Listar proveedores',
                    'POST' => 'Crear proveedor',
                    'PUT' => 'Actualizar proveedor',
                    'DELETE' => 'Eliminar proveedor'
                ],
                'ventas' => [
                    'GET' => 'Listar ventas',
                    'GET ?action=hoy' => 'Ventas de hoy',
                    'POST' => 'Crear venta',
                    'DELETE' => 'Cancelar venta'
                ],
                'compras' => [
                    'GET' => 'Listar compras',
                    'POST' => 'Crear compra',
                    'PUT' => 'Actualizar compra',
                    'DELETE' => 'Eliminar compra'
                ],
                'reportes' => [
                    'GET ?action=dashboard' => 'Dashboard stats',
                    'GET ?action=ganancias' => 'Reporte de ganancias',
                    'GET ?action=ventas' => 'Reporte de ventas'
                ]
            ]
        ]);
        break;
        
    default:
        http_response_code(404);
        echo json_encode(['error' => 'Endpoint no encontrado']);
}
