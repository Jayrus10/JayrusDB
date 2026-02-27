<?php
// ─── Panel Superadmin ─────────────────────────────────────────────────────────
// TODOS los endpoints aquí requieren rol superadmin.
//
// GET  /api/admin.php?action=stats
// GET  /api/admin.php?action=tenants
// GET  /api/admin.php?action=tenant&id=X
// POST /api/admin.php?action=create_tenant
// POST /api/admin.php?action=toggle_tenant&id=X
// POST /api/admin.php?action=set_license
// GET  /api/admin.php?action=users
// POST /api/admin.php?action=reset_user_password

require_once __DIR__ . '/_helpers/cors.php';
require_once __DIR__ . '/_helpers/db.php';
require_once __DIR__ . '/_helpers/response.php';
require_once __DIR__ . '/_helpers/auth_helper.php';

$user   = requireAuth(['superadmin']);
$db     = getDB();
$action = $_GET['action'] ?? '';
$body   = json_decode(file_get_contents('php://input'), true) ?? [];
$method = $_SERVER['REQUEST_METHOD'];

switch ($action) {

    // ── Estadísticas globales ─────────────────────────────────────────────────
    case 'stats':
        $stmt = $db->query('SELECT COUNT(*) AS total FROM tenants');
        $totalTenants = (int)$stmt->fetch()['total'];

        $stmt = $db->query('SELECT COUNT(*) AS total FROM tenants WHERE is_active = 1');
        $activeTenants = (int)$stmt->fetch()['total'];

        $stmt = $db->query(
            'SELECT COUNT(*) AS total FROM licenses
             WHERE expires_at >= CURDATE()'
        );
        $activeLicenses = (int)$stmt->fetch()['total'];

        $stmt = $db->query(
            'SELECT COUNT(*) AS total FROM licenses
             WHERE expires_at < CURDATE()'
        );
        $expiredLicenses = (int)$stmt->fetch()['total'];

        $stmt = $db->query('SELECT COUNT(*) AS total FROM users WHERE role != "superadmin"');
        $totalUsers = (int)$stmt->fetch()['total'];

        $stmt = $db->query('SELECT COUNT(*) AS total FROM sales WHERE date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)');
        $salesLast30 = (int)$stmt->fetch()['total'];

        ok([
            'tenants'          => $totalTenants,
            'active_tenants'   => $activeTenants,
            'active_licenses'  => $activeLicenses,
            'expired_licenses' => $expiredLicenses,
            'total_users'      => $totalUsers,
            'sales_last_30d'   => $salesLast30,
        ]);

    // ── Lista de negocios ─────────────────────────────────────────────────────
    case 'tenants':
        $stmt = $db->query(
            'SELECT t.*,
                    l.plan, l.expires_at, l.max_users,
                    DATEDIFF(l.expires_at, CURDATE()) AS days_left,
                    (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS user_count,
                    (SELECT COUNT(*) FROM sales s WHERE s.tenant_id = t.id) AS sale_count,
                    (SELECT u.email FROM users u WHERE u.tenant_id = t.id AND u.role = "owner" LIMIT 1) AS owner_email
             FROM tenants t
             LEFT JOIN licenses l ON l.tenant_id = t.id
             ORDER BY t.created_at DESC'
        );
        ok($stmt->fetchAll());

    // ── Detalle de un negocio ─────────────────────────────────────────────────
    case 'tenant':
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) fail('ID requerido');

        $stmt = $db->prepare('SELECT * FROM tenants WHERE id = ?');
        $stmt->execute([$id]);
        $tenant = $stmt->fetch();
        if (!$tenant) notFound();

        $stmt = $db->prepare(
            'SELECT id, display_name, email, role, is_active, last_login, created_at
             FROM users WHERE tenant_id = ? ORDER BY role, display_name'
        );
        $stmt->execute([$id]);
        $tenant['users'] = $stmt->fetchAll();

        $stmt = $db->prepare(
            'SELECT * FROM licenses WHERE tenant_id = ? ORDER BY created_at DESC'
        );
        $stmt->execute([$id]);
        $tenant['licenses'] = $stmt->fetchAll();

        $stmt = $db->prepare('SELECT COUNT(*) AS cnt FROM products WHERE tenant_id = ?');
        $stmt->execute([$id]);
        $tenant['product_count'] = (int)$stmt->fetch()['cnt'];

        $stmt = $db->prepare('SELECT COUNT(*) AS cnt FROM sales WHERE tenant_id = ?');
        $stmt->execute([$id]);
        $tenant['sale_count'] = (int)$stmt->fetch()['cnt'];

        ok($tenant);

    // ── Crear nuevo negocio (desde admin, sin self-registration) ─────────────
    case 'create_tenant':
        if ($method !== 'POST') fail('Método no permitido', 405);

        $bizName      = trim($body['business_name'] ?? '');
        $ownerName    = trim($body['owner_name']    ?? '');
        $ownerEmail   = trim($body['owner_email']   ?? '');
        $ownerPass    = trim($body['owner_password'] ?? '');
        $plan         = $body['plan']         ?? 'basic';
        $days         = (int)($body['days']   ?? 30);
        $maxUsers     = (int)($body['max_users'] ?? 3);
        $notes        = trim($body['notes']   ?? '');

        if (!$bizName || !$ownerEmail || !$ownerPass || !$ownerName) fail('Todos los campos son requeridos');
        if (!filter_var($ownerEmail, FILTER_VALIDATE_EMAIL)) fail('Email inválido');
        if (strlen($ownerPass) < 8) fail('Contraseña mínima 8 caracteres');

        // Email único
        $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
        $stmt->execute([$ownerEmail]);
        if ($stmt->fetch()) fail('Ya existe una cuenta con ese email');

        // Slug único
        $slug = strtolower(preg_replace('/[^a-z0-9]+/i', '-', $bizName));
        $slug = trim($slug, '-');
        $base = $slug; $i = 1;
        while (true) {
            $stmt = $db->prepare('SELECT id FROM tenants WHERE slug = ?');
            $stmt->execute([$slug]);
            if (!$stmt->fetch()) break;
            $slug = $base . '-' . $i++;
        }

        $db->beginTransaction();
        try {
            $db->prepare('INSERT INTO tenants (name, slug) VALUES (?,?)')->execute([$bizName, $slug]);
            $tenantId = (int)$db->lastInsertId();

            $db->prepare(
                'INSERT INTO licenses (tenant_id, plan, starts_at, expires_at, max_users, notes)
                 VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL ? DAY), ?, ?)'
            )->execute([$tenantId, $plan, $days, $maxUsers, $notes]);

            $db->prepare('INSERT INTO settings (tenant_id) VALUES (?)')->execute([$tenantId]);

            $hash = password_hash($ownerPass, PASSWORD_BCRYPT);
            $db->prepare(
                'INSERT INTO users (tenant_id, username, email, password_hash, role, display_name)
                 VALUES (?,?,?,?,"owner",?)'
            )->execute([$tenantId, explode('@',$ownerEmail)[0], $ownerEmail, $hash, $ownerName]);

            $db->commit();
            ok([
                'tenant_id'  => $tenantId,
                'slug'       => $slug,
                'expires_at' => date('Y-m-d', strtotime("+$days days")),
            ], "Negocio \"$bizName\" creado correctamente");
        } catch (Exception $e) {
            $db->rollBack();
            fail('Error: ' . $e->getMessage());
        }

    // ── Activar / desactivar negocio ──────────────────────────────────────────
    case 'toggle_tenant':
        $id = (int)($_GET['id'] ?? $body['id'] ?? 0);
        if (!$id) fail('ID requerido');
        $stmt = $db->prepare('SELECT id, is_active, name FROM tenants WHERE id = ?');
        $stmt->execute([$id]);
        $tenant = $stmt->fetch();
        if (!$tenant) notFound();
        $new = $tenant['is_active'] ? 0 : 1;
        $db->prepare('UPDATE tenants SET is_active = ? WHERE id = ?')->execute([$new, $id]);
        ok(['is_active' => $new], $new ? 'Negocio activado' : 'Negocio desactivado');

    // ── Gestionar licencia ────────────────────────────────────────────────────
    case 'set_license':
        if ($method !== 'POST') fail('Método no permitido', 405);
        $tenantId   = (int)($body['tenant_id'] ?? 0);
        $plan       = $body['plan']       ?? 'basic';
        $expiresAt  = $body['expires_at'] ?? '';
        $maxUsers   = (int)($body['max_users'] ?? 3);
        $notes      = trim($body['notes'] ?? '');

        if (!$tenantId || !$expiresAt) fail('tenant_id y expires_at son requeridos');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $expiresAt)) fail('Fecha inválida (YYYY-MM-DD)');

        // Actualizar o crear licencia
        $stmt = $db->prepare('SELECT id FROM licenses WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1');
        $stmt->execute([$tenantId]);
        $existing = $stmt->fetch();

        if ($existing) {
            $db->prepare(
                'UPDATE licenses SET plan=?, expires_at=?, max_users=?, notes=? WHERE id=?'
            )->execute([$plan, $expiresAt, $maxUsers, $notes, $existing['id']]);
        } else {
            $db->prepare(
                'INSERT INTO licenses (tenant_id, plan, starts_at, expires_at, max_users, notes)
                 VALUES (?,?,CURDATE(),?,?,?)'
            )->execute([$tenantId, $plan, $expiresAt, $maxUsers, $notes]);
        }

        ok(null, 'Licencia actualizada');

    // ── Lista de todos los usuarios ───────────────────────────────────────────
    case 'users':
        $stmt = $db->query(
            'SELECT u.id, u.display_name, u.email, u.role, u.is_active, u.last_login, u.created_at,
                    t.name AS tenant_name, t.id AS tenant_id
             FROM users u
             LEFT JOIN tenants t ON t.id = u.tenant_id
             WHERE u.role != "superadmin"
             ORDER BY t.name, u.role, u.display_name'
        );
        ok($stmt->fetchAll());

    // ── Resetear contraseña de usuario ────────────────────────────────────────
    case 'reset_user_password':
        if ($method !== 'POST') fail('Método no permitido', 405);
        $userId  = (int)($body['user_id']      ?? 0);
        $newPass = trim($body['new_password']  ?? '');
        if (!$userId || strlen($newPass) < 8) fail('user_id y contraseña (min 8 chars) requeridos');

        $stmt = $db->prepare('SELECT id FROM users WHERE id = ? AND role != "superadmin"');
        $stmt->execute([$userId]);
        if (!$stmt->fetch()) notFound('Usuario no encontrado');

        $db->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
           ->execute([password_hash($newPass, PASSWORD_BCRYPT), $userId]);
        ok(null, 'Contraseña reseteada');

    // ── Eliminar negocio (PELIGROSO — con todas sus datos) ───────────────────
    case 'delete_tenant':
        if ($method !== 'DELETE') fail('Método no permitido', 405);
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) fail('ID requerido');
        $stmt = $db->prepare('SELECT name FROM tenants WHERE id = ?');
        $stmt->execute([$id]);
        $t = $stmt->fetch();
        if (!$t) notFound();

        // ON DELETE CASCADE se encarga de todo por las FK
        $db->prepare('DELETE FROM tenants WHERE id = ?')->execute([$id]);
        ok(null, "Negocio \"{$t['name']}\" eliminado permanentemente");

    default:
        fail('Acción no reconocida', 404);
}
