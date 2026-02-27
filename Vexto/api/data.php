<?php
// ─── CRUD unificado del negocio ───────────────────────────────────────────────
// Todas las operaciones sobre datos del negocio pasan por aquí.
//
// Uso: /api/data.php?resource=X&action=Y
//
// Recursos: products | purchases | sales | customers | providers
//           discounts | vip_levels | cash_payments | settings | audit
//
// Acciones: list | get | create | update | delete
// Acciones especiales: mark_received | pay_debt | dashboard | reports

require_once __DIR__ . '/_helpers/cors.php';
require_once __DIR__ . '/_helpers/db.php';
require_once __DIR__ . '/_helpers/response.php';
require_once __DIR__ . '/_helpers/auth_helper.php';

$resource = $_GET['resource'] ?? '';
$action   = $_GET['action']   ?? 'list';
$method   = $_SERVER['REQUEST_METHOD'];
$body     = json_decode(file_get_contents('php://input'), true) ?? [];

// Todos los endpoints requieren autenticación
$user      = requireAuth();
$tenantId  = (int)$user['tenant_id'];
$userId    = (int)$user['id'];
$role      = $user['role'];
$db        = getDB();

// ── Permisos por rol ──────────────────────────────────────────────────────────
// employee: solo puede listar productos, crear ventas, ver su propio dashboard
// manager: todo excepto ajustes de sistema y borrar datos críticos
// owner: todo
// superadmin: todo en cualquier tenant

function canWrite(): bool {
    global $role;
    return in_array($role, ['owner', 'manager', 'superadmin']);
}
function canDelete(): bool {
    global $role;
    return in_array($role, ['owner', 'superadmin']);
}
function canSeeFinancials(): bool {
    global $role;
    return in_array($role, ['owner', 'manager', 'superadmin']);
}

// ── Helper: obtener entidad o 404 ────────────────────────────────────────────
function fetchOne(PDO $db, string $table, int $id, int $tenantId): ?array {
    $stmt = $db->prepare("SELECT * FROM $table WHERE id = ? AND tenant_id = ?");
    $stmt->execute([$id, $tenantId]);
    return $stmt->fetch() ?: null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────────────────────────────────────
switch ($resource) {

    // ══════════════════════════════════════════════════════════════════════════
    case 'products':
    // ══════════════════════════════════════════════════════════════════════════
        switch ($action) {
            case 'list':
                $stmt = $db->prepare('SELECT * FROM products WHERE tenant_id = ? ORDER BY name');
                $stmt->execute([$tenantId]);
                $products = $stmt->fetchAll();

                // Para employees, ocultamos avg_cost (no deben ver costos)
                if ($role === 'employee') {
                    $products = array_map(function($p) {
                        unset($p['avg_cost'], $p['total_cost_value']);
                        return $p;
                    }, $products);
                }
                ok($products);

            case 'create':
                if (!canWrite()) forbidden();
                $name     = trim($body['name']     ?? '');
                $category = trim($body['category'] ?? 'General');
                $minStock = (float)($body['min_stock'] ?? 0);
                $markup   = (float)($body['markup']   ?? 0.5);
                if (!$name) fail('Nombre requerido');

                $stmt = $db->prepare(
                    'INSERT INTO products (tenant_id, name, category, min_stock, markup)
                     VALUES (?, ?, ?, ?, ?)'
                );
                $stmt->execute([$tenantId, $name, $category, $minStock, $markup]);
                $id = (int)$db->lastInsertId();
                addAuditLog($db, $tenantId, $userId, $user['display_name'], "PRODUCTO CREADO: $name");
                ok(fetchOne($db, 'products', $id, $tenantId), 'Producto creado');

            case 'update':
                if (!canWrite()) forbidden();
                $id   = (int)($body['id'] ?? 0);
                $prod = fetchOne($db, 'products', $id, $tenantId);
                if (!$prod) notFound();

                $name     = trim($body['name']      ?? $prod['name']);
                $category = trim($body['category']  ?? $prod['category']);
                $minStock = (float)($body['min_stock'] ?? $prod['min_stock']);
                $markup   = (float)($body['markup']   ?? $prod['markup']);

                $db->prepare(
                    'UPDATE products SET name=?, category=?, min_stock=?, markup=? WHERE id=? AND tenant_id=?'
                )->execute([$name, $category, $minStock, $markup, $id, $tenantId]);
                addAuditLog($db, $tenantId, $userId, $user['display_name'], "PRODUCTO EDITADO: $name");
                ok(fetchOne($db, 'products', $id, $tenantId), 'Producto actualizado');

            case 'delete':
                if (!canDelete()) forbidden();
                $id   = (int)($_GET['id'] ?? 0);
                $prod = fetchOne($db, 'products', $id, $tenantId);
                if (!$prod) notFound();
                $db->prepare('DELETE FROM products WHERE id = ? AND tenant_id = ?')->execute([$id, $tenantId]);
                addAuditLog($db, $tenantId, $userId, $user['display_name'], "PRODUCTO ELIMINADO: {$prod['name']}");
                ok(null, 'Producto eliminado');

            default: fail('Acción no válida');
        }

    // ══════════════════════════════════════════════════════════════════════════
    case 'purchases':
    // ══════════════════════════════════════════════════════════════════════════
        if ($role === 'employee') forbidden('Sin acceso a compras');

        switch ($action) {
            case 'list':
                $stmt = $db->prepare(
                    'SELECT p.*, pr.name AS product_name
                     FROM purchases p
                     LEFT JOIN products pr ON pr.id = p.product_id
                     WHERE p.tenant_id = ? ORDER BY p.date DESC, p.id DESC'
                );
                $stmt->execute([$tenantId]);
                ok($stmt->fetchAll());

            case 'create':
                if (!canWrite()) forbidden();
                // Espera un array de líneas: [{product_id, qty, unit_cost_cup, currency_original, ...}]
                $date       = $body['date']     ?? date('Y-m-d');
                $supplier   = trim($body['supplier'] ?? '');
                $inStock    = (int)(bool)($body['in_stock'] ?? false);
                $lines      = $body['lines']    ?? [];
                $expenses   = $body['expenses'] ?? [];

                if (empty($lines)) fail('Debes agregar al menos un producto');

                // Calcular gastos totales del lote en CUP
                $totalExpCUP = 0;
                foreach ($expenses as $exp) {
                    $totalExpCUP += convertToCUP((float)$exp['amount'], $exp['currency'], $tenantId, $db);
                }

                // Suma de subtotales para prorratear gastos
                $totalBase = 0;
                foreach ($lines as $line) {
                    $qty  = (float)$line['qty']       ?? 0;
                    $unit = (float)$line['unit_cost']  ?? 0;
                    $cur  = $line['currency']          ?? 'CUP';
                    $totalBase += $qty * convertToCUP($unit, $cur, $tenantId, $db);
                }

                $created = [];
                $db->beginTransaction();
                try {
                    foreach ($lines as $line) {
                        $productId  = (int)$line['product_id'];
                        $qty        = (float)$line['qty'];
                        $unitOrig   = (float)$line['unit_cost'];
                        $cur        = $line['currency'] ?? 'CUP';
                        $unitCUP    = convertToCUP($unitOrig, $cur, $tenantId, $db);
                        $subCUP     = $qty * $unitCUP;

                        // Prorratear gastos proporcional al subtotal de esta línea
                        $propExpCUP = $totalBase > 0 ? ($subCUP / $totalBase) * $totalExpCUP : 0;

                        $db->prepare(
                            'INSERT INTO purchases
                             (tenant_id, product_id, date, qty, unit_cost_cup, prop_exp_cup,
                              total_exp_cup, currency_original, supplier, in_stock, created_by)
                             VALUES (?,?,?,?,?,?,?,?,?,?,?)'
                        )->execute([
                            $tenantId, $productId, $date, $qty, $unitCUP, $propExpCUP,
                            $totalExpCUP, $cur, $supplier, $inStock, $userId
                        ]);
                        $purchaseId = (int)$db->lastInsertId();

                        // Si llega en stock, actualizar producto
                        if ($inStock) {
                            updateProductCost($db, $productId, $tenantId, $qty, $unitCUP + ($qty > 0 ? $propExpCUP/$qty : 0));
                        }

                        $created[] = $purchaseId;
                    }
                    $db->commit();
                } catch (Exception $e) {
                    $db->rollBack();
                    fail('Error al guardar compra: ' . $e->getMessage());
                }

                addAuditLog($db, $tenantId, $userId, $user['display_name'],
                    'COMPRA: ' . count($lines) . ' producto(s), proveedor=' . ($supplier ?: '-'));
                ok(['ids' => $created], 'Compra registrada');

            case 'mark_received':
                if (!canWrite()) forbidden();
                $id  = (int)($_GET['id'] ?? $body['id'] ?? 0);
                $row = fetchOne($db, 'purchases', $id, $tenantId);
                if (!$row) notFound();
                if ($row['in_stock']) fail('Ya está marcado como recibido');

                $unitCUP  = (float)$row['unit_cost_cup'];
                $propCUP  = (float)$row['prop_exp_cup'];
                $qty      = (float)$row['qty'];
                $finalCostCUP = $unitCUP + ($qty > 0 ? $propCUP / $qty : 0);

                $db->prepare('UPDATE purchases SET in_stock = 1 WHERE id = ? AND tenant_id = ?')
                   ->execute([$id, $tenantId]);
                updateProductCost($db, (int)$row['product_id'], $tenantId, $qty, $finalCostCUP);

                $prod = fetchOne($db, 'products', (int)$row['product_id'], $tenantId);
                addAuditLog($db, $tenantId, $userId, $user['display_name'],
                    'RECIBIDO: ' . ($prod['name'] ?? '?') . " x$qty de " . ($row['supplier'] ?: '-'));
                ok(null, 'Marcado como recibido');

            case 'delete':
                if (!canDelete()) forbidden();
                $id  = (int)($_GET['id'] ?? 0);
                $row = fetchOne($db, 'purchases', $id, $tenantId);
                if (!$row) notFound();

                // Revertir stock solo si estaba en almacén
                if ($row['in_stock'] && $row['product_id']) {
                    revertProductCost($db, (int)$row['product_id'], $tenantId,
                        (float)$row['qty'],
                        (float)$row['unit_cost_cup'] + ((float)$row['qty'] > 0 ? (float)$row['prop_exp_cup']/(float)$row['qty'] : 0)
                    );
                }

                $db->prepare('DELETE FROM purchases WHERE id = ? AND tenant_id = ?')->execute([$id, $tenantId]);
                addAuditLog($db, $tenantId, $userId, $user['display_name'],
                    "COMPRA ELIMINADA: ID $id, qty={$row['qty']}");
                ok(null, 'Compra eliminada');

            default: fail('Acción no válida');
        }

    // ══════════════════════════════════════════════════════════════════════════
    case 'sales':
    // ══════════════════════════════════════════════════════════════════════════
        switch ($action) {
            case 'list':
                if (!canSeeFinancials()) {
                    // Employees ven solo sus propias ventas del día
                    $stmt = $db->prepare(
                        'SELECT s.id, s.date, s.qty, s.client, s.on_credit,
                                pr.name AS product_name
                         FROM sales s
                         LEFT JOIN products pr ON pr.id = s.product_id
                         WHERE s.tenant_id = ? AND s.created_by = ? AND s.date = CURDATE()
                         ORDER BY s.id DESC'
                    );
                    $stmt->execute([$tenantId, $userId]);
                } else {
                    $stmt = $db->prepare(
                        'SELECT s.*, pr.name AS product_name, u.display_name AS employee_name
                         FROM sales s
                         LEFT JOIN products pr ON pr.id = s.product_id
                         LEFT JOIN users u ON u.id = s.created_by
                         WHERE s.tenant_id = ? ORDER BY s.date DESC, s.id DESC'
                    );
                    $stmt->execute([$tenantId]);
                }
                ok($stmt->fetchAll());

            case 'create':
                $productId = (int)($body['product_id'] ?? 0);
                $qty       = (float)($body['qty']       ?? 0);
                $price     = (float)($body['price']     ?? 0);
                $cur       = $body['currency']           ?? 'CUP';
                $client    = trim($body['client']        ?? '-');
                $onCredit  = (int)(bool)($body['on_credit'] ?? false);

                if (!$productId || !$qty || !$price) fail('Campos requeridos');

                $prod = fetchOne($db, 'products', $productId, $tenantId);
                if (!$prod) fail('Producto no encontrado');
                if ((float)$prod['current_stock'] < $qty) fail('Stock insuficiente');

                $unitSellCUP = convertToCUP($price, $cur, $tenantId, $db);

                // Calcular descuento
                $discountPct = getApplicableDiscount($db, $tenantId, $qty, $client, $productId);
                $finalCUP    = $unitSellCUP * (1 - $discountPct);

                $db->beginTransaction();
                try {
                    // Insertar venta
                    $customerId = null;
                    if ($client && $client !== '-') {
                        $stmt = $db->prepare('SELECT id FROM customers WHERE tenant_id=? AND name=? LIMIT 1');
                        $stmt->execute([$tenantId, $client]);
                        $cust = $stmt->fetch();
                        if ($cust) {
                            $customerId = (int)$cust['id'];
                        } else {
                            // Auto-registrar cliente
                            $db->prepare('INSERT INTO customers (tenant_id, name) VALUES (?,?)')->execute([$tenantId, $client]);
                            $customerId = (int)$db->lastInsertId();
                        }
                        if ($onCredit) {
                            $debtAmount = $qty * $finalCUP;
                            $db->prepare('UPDATE customers SET debt = debt + ? WHERE id = ?')
                               ->execute([$debtAmount, $customerId]);
                        }
                    }

                    $db->prepare(
                        'INSERT INTO sales
                         (tenant_id, product_id, date, qty, unit_sell_price_cup, final_price_cup,
                          discount_percent, currency_original, client, customer_id, on_credit, created_by)
                         VALUES (?,?,CURDATE(),?,?,?,?,?,?,?,?,?)'
                    )->execute([
                        $tenantId, $productId, $qty, $unitSellCUP, $finalCUP,
                        $discountPct, $cur, $client, $customerId, $onCredit, $userId
                    ]);
                    $saleId = (int)$db->lastInsertId();

                    // Descontar stock
                    $db->prepare('UPDATE products SET current_stock = current_stock - ? WHERE id = ? AND tenant_id = ?')
                       ->execute([$qty, $productId, $tenantId]);

                    $db->commit();
                } catch (Exception $e) {
                    $db->rollBack();
                    fail('Error al guardar venta: ' . $e->getMessage());
                }

                $dto = $discountPct > 0 ? ' (dto ' . round($discountPct*100) . '%)' : '';
                addAuditLog($db, $tenantId, $userId, $user['display_name'],
                    "VENTA: {$prod['name']} x$qty a " . number_format($finalCUP,2) . " CUP$dto");
                ok(['id' => $saleId], 'Venta registrada');

            case 'delete':
                if (!canDelete()) forbidden();
                $id  = (int)($_GET['id'] ?? 0);
                $row = $db->prepare('SELECT * FROM sales WHERE id=? AND tenant_id=?');
                $row->execute([$id, $tenantId]);
                $sale = $row->fetch();
                if (!$sale) notFound();

                $db->beginTransaction();
                try {
                    // Devolver stock
                    $db->prepare('UPDATE products SET current_stock = current_stock + ? WHERE id = ? AND tenant_id = ?')
                       ->execute([$sale['qty'], $sale['product_id'], $tenantId]);

                    // Revertir deuda si era a crédito
                    if ($sale['on_credit'] && $sale['customer_id']) {
                        $debt = (float)$sale['qty'] * (float)$sale['final_price_cup'];
                        $db->prepare('UPDATE customers SET debt = GREATEST(0, debt - ?) WHERE id = ?')
                           ->execute([$debt, $sale['customer_id']]);
                    }

                    $db->prepare('DELETE FROM sales WHERE id = ? AND tenant_id = ?')->execute([$id, $tenantId]);
                    $db->commit();
                } catch (Exception $e) {
                    $db->rollBack();
                    fail('Error: ' . $e->getMessage());
                }

                addAuditLog($db, $tenantId, $userId, $user['display_name'],
                    "VENTA ELIMINADA: ID $id, qty={$sale['qty']}");
                ok(null, 'Venta eliminada');

            default: fail('Acción no válida');
        }

    // ══════════════════════════════════════════════════════════════════════════
    case 'customers':
    // ══════════════════════════════════════════════════════════════════════════
        switch ($action) {
            case 'list':
                $stmt = $db->prepare(
                    'SELECT c.*, v.name AS vip_name, v.percent AS vip_percent
                     FROM customers c
                     LEFT JOIN vip_levels v ON v.id = c.vip_level_id
                     WHERE c.tenant_id = ? ORDER BY c.name'
                );
                $stmt->execute([$tenantId]);
                ok($stmt->fetchAll());

            case 'create':
                if (!canWrite()) forbidden();
                $name   = trim($body['name']         ?? '');
                $vipId  = $body['vip_level_id']      ?? null;
                if (!$name) fail('Nombre requerido');
                $db->prepare('INSERT INTO customers (tenant_id, name, vip_level_id) VALUES (?,?,?)')
                   ->execute([$tenantId, $name, $vipId ?: null]);
                $id = (int)$db->lastInsertId();
                addAuditLog($db, $tenantId, $userId, $user['display_name'], "CLIENTE: $name");
                ok(fetchOne($db, 'customers', $id, $tenantId), 'Cliente creado');

            case 'update':
                if (!canWrite()) forbidden();
                $id    = (int)($body['id'] ?? 0);
                $cust  = fetchOne($db, 'customers', $id, $tenantId);
                if (!$cust) notFound();
                $name  = trim($body['name']        ?? $cust['name']);
                $vipId = $body['vip_level_id']     ?? $cust['vip_level_id'];
                $db->prepare('UPDATE customers SET name=?, vip_level_id=? WHERE id=? AND tenant_id=?')
                   ->execute([$name, $vipId ?: null, $id, $tenantId]);
                addAuditLog($db, $tenantId, $userId, $user['display_name'], "CLIENTE EDITADO: $name");
                ok(null, 'Cliente actualizado');

            case 'delete':
                if (!canDelete()) forbidden();
                $id   = (int)($_GET['id'] ?? 0);
                $cust = fetchOne($db, 'customers', $id, $tenantId);
                if (!$cust) notFound();
                $db->prepare('DELETE FROM customers WHERE id=? AND tenant_id=?')->execute([$id, $tenantId]);
                addAuditLog($db, $tenantId, $userId, $user['display_name'], "CLIENTE ELIMINADO: {$cust['name']}");
                ok(null, 'Cliente eliminado');

            case 'pay_debt':
                if (!canWrite()) forbidden();
                $custId    = (int)($body['customer_id'] ?? 0);
                $amount    = (float)($body['amount']    ?? 0);
                $cur       = $body['currency']          ?? 'CUP';
                if (!$custId || !$amount) fail('Campos requeridos');

                $cust = fetchOne($db, 'customers', $custId, $tenantId);
                if (!$cust) notFound();

                $amountCUP = convertToCUP($amount, $cur, $tenantId, $db);
                $paid      = min($amountCUP, (float)$cust['debt']);

                $db->beginTransaction();
                try {
                    $db->prepare('UPDATE customers SET debt = GREATEST(0, debt - ?) WHERE id = ?')
                       ->execute([$paid, $custId]);
                    $db->prepare(
                        'INSERT INTO cash_payments (tenant_id, customer_id, client_name, amount_cup, currency_original, date, created_by)
                         VALUES (?,?,?,?,?,CURDATE(),?)'
                    )->execute([$tenantId, $custId, $cust['name'], $paid, $cur, $userId]);
                    $db->commit();
                } catch (Exception $e) {
                    $db->rollBack();
                    fail('Error: ' . $e->getMessage());
                }

                $remaining = max(0, (float)$cust['debt'] - $paid);
                addAuditLog($db, $tenantId, $userId, $user['display_name'],
                    "PAGO DEUDA: {$cust['name']} pagó " . number_format($paid,2) . " CUP. Restante: " . number_format($remaining,2));
                ok(['paid_cup' => $paid, 'remaining' => $remaining], 'Pago registrado');

            default: fail('Acción no válida');
        }

    // ══════════════════════════════════════════════════════════════════════════
    case 'providers':
    // ══════════════════════════════════════════════════════════════════════════
        if ($role === 'employee') forbidden('Sin acceso a proveedores');

        switch ($action) {
            case 'list':
                $stmt = $db->prepare('SELECT * FROM providers WHERE tenant_id = ? ORDER BY name');
                $stmt->execute([$tenantId]);
                ok($stmt->fetchAll());

            case 'create':
                if (!canWrite()) forbidden();
                $name = trim($body['name'] ?? '');
                if (!$name) fail('Nombre requerido');
                $db->prepare(
                    'INSERT INTO providers (tenant_id, name, contact, phone, email, location, notes)
                     VALUES (?,?,?,?,?,?,?)'
                )->execute([
                    $tenantId, $name,
                    $body['contact']  ?? '', $body['phone']   ?? '',
                    $body['email']    ?? '', $body['location'] ?? '',
                    $body['notes']    ?? ''
                ]);
                $id = (int)$db->lastInsertId();
                addAuditLog($db, $tenantId, $userId, $user['display_name'], "PROVEEDOR: $name");
                ok(fetchOne($db, 'providers', $id, $tenantId), 'Proveedor creado');

            case 'update':
                if (!canWrite()) forbidden();
                $id   = (int)($body['id'] ?? 0);
                $prov = fetchOne($db, 'providers', $id, $tenantId);
                if (!$prov) notFound();
                $name = trim($body['name'] ?? $prov['name']);
                $db->prepare(
                    'UPDATE providers SET name=?, contact=?, phone=?, email=?, location=?, notes=?
                     WHERE id=? AND tenant_id=?'
                )->execute([
                    $name,
                    $body['contact']  ?? $prov['contact'],  $body['phone']   ?? $prov['phone'],
                    $body['email']    ?? $prov['email'],     $body['location'] ?? $prov['location'],
                    $body['notes']    ?? $prov['notes'],     $id, $tenantId
                ]);
                addAuditLog($db, $tenantId, $userId, $user['display_name'], "PROVEEDOR EDITADO: $name");
                ok(null, 'Proveedor actualizado');

            case 'delete':
                if (!canDelete()) forbidden();
                $id   = (int)($_GET['id'] ?? 0);
                $prov = fetchOne($db, 'providers', $id, $tenantId);
                if (!$prov) notFound();
                $db->prepare('DELETE FROM providers WHERE id=? AND tenant_id=?')->execute([$id, $tenantId]);
                addAuditLog($db, $tenantId, $userId, $user['display_name'], "PROVEEDOR ELIMINADO: {$prov['name']}");
                ok(null, 'Proveedor eliminado');

            default: fail('Acción no válida');
        }

    // ══════════════════════════════════════════════════════════════════════════
    case 'discounts':
    // ══════════════════════════════════════════════════════════════════════════
        if ($role === 'employee') forbidden();
        switch ($action) {
            case 'list':
                $stmt = $db->prepare('SELECT * FROM discounts WHERE tenant_id = ? ORDER BY id');
                $stmt->execute([$tenantId]);
                ok($stmt->fetchAll());
            case 'create':
                if (!canWrite()) forbidden();
                $type    = $body['type']    ?? '';
                $percent = (float)($body['percent'] ?? 0);
                $prodId  = $body['product_id'] ? (int)$body['product_id'] : null;
                if (!in_array($type, ['mayor','especial','cliente','general'])) fail('Tipo inválido');
                if ($percent <= 0 || $percent >= 100) fail('Porcentaje inválido');
                $db->prepare(
                    'INSERT INTO discounts (tenant_id, type, percent, product_id, qty_min, day_name, client_name)
                     VALUES (?,?,?,?,?,?,?)'
                )->execute([
                    $tenantId, $type, $percent, $prodId,
                    $body['qty_min']     ?? null,
                    $body['day_name']    ?? null,
                    $body['client_name'] ?? null
                ]);
                addAuditLog($db, $tenantId, $userId, $user['display_name'], "DESCUENTO: $type $percent%");
                ok(['id' => (int)$db->lastInsertId()], 'Descuento creado');
            case 'delete':
                if (!canDelete()) forbidden();
                $id = (int)($_GET['id'] ?? 0);
                $db->prepare('DELETE FROM discounts WHERE id=? AND tenant_id=?')->execute([$id, $tenantId]);
                addAuditLog($db, $tenantId, $userId, $user['display_name'], "DESCUENTO ELIMINADO: ID $id");
                ok(null, 'Descuento eliminado');
            default: fail('Acción no válida');
        }

    // ══════════════════════════════════════════════════════════════════════════
    case 'vip_levels':
    // ══════════════════════════════════════════════════════════════════════════
        if ($role === 'employee') forbidden();
        switch ($action) {
            case 'list':
                $stmt = $db->prepare('SELECT * FROM vip_levels WHERE tenant_id = ?');
                $stmt->execute([$tenantId]);
                ok($stmt->fetchAll());
            case 'create':
                if (!canWrite()) forbidden();
                $name    = trim($body['name']    ?? '');
                $percent = (float)($body['percent'] ?? 0);
                if (!$name || $percent <= 0 || $percent >= 100) fail('Datos inválidos');
                $db->prepare('INSERT INTO vip_levels (tenant_id, name, percent) VALUES (?,?,?)')
                   ->execute([$tenantId, $name, $percent]);
                addAuditLog($db, $tenantId, $userId, $user['display_name'], "NIVEL VIP: $name $percent%");
                ok(['id' => (int)$db->lastInsertId()], 'Nivel VIP creado');
            case 'delete':
                if (!canDelete()) forbidden();
                $id = (int)($_GET['id'] ?? 0);
                $db->prepare('UPDATE customers SET vip_level_id=NULL WHERE vip_level_id=? AND tenant_id=?')
                   ->execute([$id, $tenantId]);
                $db->prepare('DELETE FROM vip_levels WHERE id=? AND tenant_id=?')->execute([$id, $tenantId]);
                ok(null, 'Nivel VIP eliminado');
            default: fail('Acción no válida');
        }

    // ══════════════════════════════════════════════════════════════════════════
    case 'settings':
    // ══════════════════════════════════════════════════════════════════════════
        if ($role === 'employee') forbidden();
        switch ($action) {
            case 'get':
                $stmt = $db->prepare('SELECT * FROM settings WHERE tenant_id = ?');
                $stmt->execute([$tenantId]);
                $s = $stmt->fetch();
                if (!$s) { // Crear configuración por defecto si no existe
                    $db->prepare('INSERT INTO settings (tenant_id) VALUES (?)')->execute([$tenantId]);
                    $stmt->execute([$tenantId]);
                    $s = $stmt->fetch();
                }
                ok($s);
            case 'update':
                if (!canWrite()) forbidden();
                $db->prepare(
                    'UPDATE settings SET base_currency=?, rate_usd=?, rate_eur=?,
                     cash_rounding_step=?, cash_rounding_dir=?
                     WHERE tenant_id=?'
                )->execute([
                    $body['base_currency']     ?? 'CUP',
                    (float)($body['rate_usd']  ?? 500),
                    (float)($body['rate_eur']  ?? 650),
                    (int)($body['cash_rounding_step'] ?? 1),
                    $body['cash_rounding_dir'] ?? 'round',
                    $tenantId
                ]);
                addAuditLog($db, $tenantId, $userId, $user['display_name'],
                    "AJUSTES: USD={$body['rate_usd']}, EUR={$body['rate_eur']}");
                ok(null, 'Ajustes guardados');
            default: fail('Acción no válida');
        }

    // ══════════════════════════════════════════════════════════════════════════
    case 'audit':
    // ══════════════════════════════════════════════════════════════════════════
        if (!canSeeFinancials()) forbidden();
        $stmt = $db->prepare(
            'SELECT * FROM audit_log WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 500'
        );
        $stmt->execute([$tenantId]);
        ok($stmt->fetchAll());

    // ══════════════════════════════════════════════════════════════════════════
    case 'dashboard':
    // ══════════════════════════════════════════════════════════════════════════
        // Todos pueden ver el dashboard (employees ven versión simplificada)
        $stmt = $db->prepare(
            'SELECT COALESCE(SUM(current_stock * avg_cost),0) AS stock_value FROM products WHERE tenant_id=?'
        );
        $stmt->execute([$tenantId]);
        $stockValue = (float)$stmt->fetch()['stock_value'];

        $stmt = $db->prepare(
            'SELECT COALESCE(SUM(qty * unit_cost_cup),0) AS transit FROM purchases WHERE tenant_id=? AND in_stock=0'
        );
        $stmt->execute([$tenantId]);
        $transitValue = (float)$stmt->fetch()['transit'];

        $stmt = $db->prepare('SELECT COALESCE(SUM(debt),0) AS total_debt FROM customers WHERE tenant_id=?');
        $stmt->execute([$tenantId]);
        $totalDebt = (float)$stmt->fetch()['total_debt'];

        $stmt = $db->prepare(
            'SELECT COALESCE(SUM(qty * (final_price_cup - 0)),0) AS today_revenue,
                    COALESCE(SUM(qty),0) AS today_qty
             FROM sales WHERE tenant_id=? AND date=CURDATE()'
        );
        $stmt->execute([$tenantId]);
        $today = $stmt->fetch();

        $result = [
            'stock_value'   => $stockValue + $transitValue,
            'total_debt'    => $totalDebt,
            'total_sales'   => (int)$db->prepare('SELECT COUNT(*) FROM sales WHERE tenant_id=?')
                                         ->execute([$tenantId]) ? 0 : 0, // se llena abajo
            'today_qty'     => (float)$today['today_qty'],
        ];

        // Total ventas
        $stmt = $db->prepare('SELECT COUNT(*) AS cnt FROM sales WHERE tenant_id=?');
        $stmt->execute([$tenantId]);
        $result['total_sales'] = (int)$stmt->fetch()['cnt'];

        if (canSeeFinancials()) {
            // Ganancia de hoy (necesita cruzar con avg_cost)
            $stmt = $db->prepare(
                'SELECT s.qty, s.final_price_cup, p.avg_cost
                 FROM sales s LEFT JOIN products p ON p.id = s.product_id
                 WHERE s.tenant_id=? AND s.date=CURDATE()'
            );
            $stmt->execute([$tenantId]);
            $todayProfit = 0;
            foreach ($stmt->fetchAll() as $row) {
                $todayProfit += $row['qty'] * ($row['final_price_cup'] - ($row['avg_cost'] ?? 0));
            }
            $result['today_profit'] = $todayProfit;
            $result['stock_value']  = $stockValue;
            $result['transit_value'] = $transitValue;
        }

        ok($result);

    // ══════════════════════════════════════════════════════════════════════════
    case 'reports':
    // ══════════════════════════════════════════════════════════════════════════
        if (!canSeeFinancials()) forbidden('Sin acceso a reportes');

        $stmt = $db->prepare(
            'SELECT s.qty, s.final_price_cup, s.on_credit, p.avg_cost
             FROM sales s LEFT JOIN products p ON p.id = s.product_id
             WHERE s.tenant_id=?'
        );
        $stmt->execute([$tenantId]);

        $revenue = 0; $cost = 0; $cashSales = 0;
        foreach ($stmt->fetchAll() as $row) {
            $price    = (float)$row['final_price_cup'];
            $qty      = (float)$row['qty'];
            $avgCost  = (float)($row['avg_cost'] ?? 0);
            $revenue += $qty * $price;
            $cost    += $qty * $avgCost;
            if (!$row['on_credit']) $cashSales += $qty * $price;
        }

        $stmt = $db->prepare('SELECT COALESCE(SUM(amount_cup),0) AS paid FROM cash_payments WHERE tenant_id=?');
        $stmt->execute([$tenantId]);
        $debtPaid = (float)$stmt->fetch()['paid'];

        $stmt = $db->prepare('SELECT COALESCE(SUM(debt),0) AS pending FROM customers WHERE tenant_id=?');
        $stmt->execute([$tenantId]);
        $pending = (float)$stmt->fetch()['pending'];

        $cash = $cashSales + $debtPaid;

        // Desglose por cliente
        $stmt = $db->prepare(
            'SELECT name, debt FROM customers WHERE tenant_id=? AND debt > 0 ORDER BY debt DESC'
        );
        $stmt->execute([$tenantId]);
        $debtors = $stmt->fetchAll();

        // Chart: ventas y compras del mes actual por día
        $stmt = $db->prepare(
            'SELECT DAY(date) AS day, SUM(qty * final_price_cup) AS total
             FROM sales WHERE tenant_id=? AND MONTH(date)=MONTH(CURDATE()) AND YEAR(date)=YEAR(CURDATE())
             GROUP BY DAY(date)'
        );
        $stmt->execute([$tenantId]);
        $salesByDay = [];
        foreach ($stmt->fetchAll() as $row) $salesByDay[(int)$row['day']] = (float)$row['total'];

        $stmt = $db->prepare(
            'SELECT DAY(date) AS day, SUM(qty * unit_cost_cup) AS total
             FROM purchases WHERE tenant_id=? AND MONTH(date)=MONTH(CURDATE()) AND YEAR(date)=YEAR(CURDATE())
             GROUP BY DAY(date)'
        );
        $stmt->execute([$tenantId]);
        $purchByDay = [];
        foreach ($stmt->fetchAll() as $row) $purchByDay[(int)$row['day']] = (float)$row['total'];

        ok([
            'revenue'    => $revenue,
            'cost'       => $cost,
            'profit'     => $revenue - $cost,
            'cash'       => $cash,
            'pending'    => $pending,
            'if_all_paid'=> $cash + $pending,
            'debtors'    => $debtors,
            'chart'      => ['sales' => $salesByDay, 'purchases' => $purchByDay],
        ]);

    default:
        fail('Recurso no reconocido', 404);
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIONES AUXILIARES
// ─────────────────────────────────────────────────────────────────────────────

function convertToCUP(float $amount, string $currency, int $tenantId, PDO $db): float {
    if ($currency === 'CUP') return $amount;
    $stmt = $db->prepare('SELECT rate_usd, rate_eur FROM settings WHERE tenant_id=?');
    $stmt->execute([$tenantId]);
    $s = $stmt->fetch();
    if (!$s) return $amount;
    if ($currency === 'USD') return $amount * (float)$s['rate_usd'];
    if ($currency === 'EUR') return $amount * (float)$s['rate_eur'];
    return $amount;
}

function updateProductCost(PDO $db, int $productId, int $tenantId, float $qty, float $costPerUnit): void {
    $stmt = $db->prepare('SELECT current_stock, total_cost_value FROM products WHERE id=? AND tenant_id=?');
    $stmt->execute([$productId, $tenantId]);
    $prod = $stmt->fetch();
    if (!$prod) return;

    $newStock     = (float)$prod['current_stock'] + $qty;
    $newTotal     = (float)$prod['total_cost_value'] + $qty * $costPerUnit;
    $newAvgCost   = $newStock > 0 ? $newTotal / $newStock : 0;

    $db->prepare(
        'UPDATE products SET current_stock=?, total_cost_value=?, avg_cost=? WHERE id=? AND tenant_id=?'
    )->execute([$newStock, $newTotal, $newAvgCost, $productId, $tenantId]);
}

function revertProductCost(PDO $db, int $productId, int $tenantId, float $qty, float $costPerUnit): void {
    $stmt = $db->prepare('SELECT current_stock, total_cost_value FROM products WHERE id=? AND tenant_id=?');
    $stmt->execute([$productId, $tenantId]);
    $prod = $stmt->fetch();
    if (!$prod) return;

    $newStock   = max(0, (float)$prod['current_stock'] - $qty);
    $newTotal   = max(0, (float)$prod['total_cost_value'] - $qty * $costPerUnit);
    $newAvgCost = $newStock > 0 ? $newTotal / $newStock : 0;

    $db->prepare(
        'UPDATE products SET current_stock=?, total_cost_value=?, avg_cost=? WHERE id=? AND tenant_id=?'
    )->execute([$newStock, $newTotal, $newAvgCost, $productId, $tenantId]);
}

function getApplicableDiscount(PDO $db, int $tenantId, float $qty, string $client, int $productId): float {
    $stmt = $db->prepare(
        'SELECT type, percent, qty_min, day_name, client_name, product_id
         FROM discounts WHERE tenant_id=? AND (product_id IS NULL OR product_id=?)'
    );
    $stmt->execute([$tenantId, $productId]);
    $max = 0;
    foreach ($stmt->fetchAll() as $d) {
        $pct = (float)$d['percent'];
        if ($d['type'] === 'mayor'   && $qty >= (int)$d['qty_min'])                                     $max = max($max, $pct);
        if ($d['type'] === 'cliente' && $client && stripos($client, $d['client_name']) !== false)        $max = max($max, $pct);
        if ($d['type'] === 'general')                                                                    $max = max($max, $pct);
    }
    // VIP
    if ($client) {
        $stmt = $db->prepare(
            'SELECT v.percent FROM customers c
             JOIN vip_levels v ON v.id = c.vip_level_id
             WHERE c.tenant_id=? AND LOWER(c.name)=LOWER(?) LIMIT 1'
        );
        $stmt->execute([$tenantId, $client]);
        $vip = $stmt->fetch();
        if ($vip) $max = max($max, (float)$vip['percent']);
    }
    return $max / 100;
}

function addAuditLog(PDO $db, int $tenantId, int $userId, string $username, string $action): void {
    $db->prepare(
        'INSERT INTO audit_log (tenant_id, user_id, username, action) VALUES (?,?,?,?)'
    )->execute([$tenantId, $userId, $username, $action]);
}
