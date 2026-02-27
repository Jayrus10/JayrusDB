<?php
// ─── Autenticación ────────────────────────────────────────────────────────────
// POST /api/auth.php?action=login
// POST /api/auth.php?action=register      (crea negocio nuevo + owner)
// GET  /api/auth.php?action=me            (info del usuario actual)
// POST /api/auth.php?action=change_password
// POST /api/auth.php?action=add_employee  (owner/manager añade empleado)
// GET  /api/auth.php?action=employees     (lista empleados del negocio)
// POST /api/auth.php?action=toggle_employee (activar/desactivar empleado)
// DELETE /api/auth.php?action=delete_employee&id=X

require_once __DIR__ . '/_helpers/cors.php';
require_once __DIR__ . '/_helpers/db.php';
require_once __DIR__ . '/_helpers/response.php';
require_once __DIR__ . '/_helpers/auth_helper.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$body   = json_decode(file_get_contents('php://input'), true) ?? [];

switch ($action) {

    // ── Login ─────────────────────────────────────────────────────────────────
    case 'login':
        if ($method !== 'POST') fail('Método no permitido', 405);

        $email    = trim($body['email']    ?? '');
        $password = trim($body['password'] ?? '');
        if (!$email || !$password) fail('Email y contraseña requeridos');

        $db   = getDB();
        $stmt = $db->prepare(
            'SELECT u.*, t.name AS tenant_name, t.is_active AS tenant_active
             FROM users u
             LEFT JOIN tenants t ON t.id = u.tenant_id
             WHERE u.email = ? LIMIT 1'
        );
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            fail('Credenciales incorrectas');
        }
        if (!$user['is_active']) fail('Cuenta desactivada. Contacta al administrador.');

        // Verificar licencia (no aplica a superadmin)
        if ($user['role'] !== 'superadmin' && $user['tenant_id']) {
            if (!$user['tenant_active']) fail('El negocio está inactivo.');

            $stmt = $db->prepare(
                'SELECT expires_at, plan FROM licenses
                 WHERE tenant_id = ? AND expires_at >= CURDATE()
                 ORDER BY expires_at DESC LIMIT 1'
            );
            $stmt->execute([$user['tenant_id']]);
            $license = $stmt->fetch();
            if (!$license) fail('Licencia expirada. Contacta al administrador de Vexto.', 402);
        }

        // Actualizar last_login
        $db->prepare('UPDATE users SET last_login = NOW() WHERE id = ?')->execute([$user['id']]);

        $token = generateJWT([
            'user_id'   => $user['id'],
            'tenant_id' => $user['tenant_id'],
            'role'      => $user['role'],
        ]);

        ok([
            'token'        => $token,
            'user_id'      => (int)$user['id'],
            'display_name' => $user['display_name'] ?: $user['username'],
            'role'         => $user['role'],
            'tenant_id'    => $user['tenant_id'] ? (int)$user['tenant_id'] : null,
            'tenant_name'  => $user['tenant_name'] ?? null,
        ], 'Bienvenido');

    // ── Registro de nuevo negocio + owner ─────────────────────────────────────
    case 'register':
        if ($method !== 'POST') fail('Método no permitido', 405);

        $bizName  = trim($body['business_name'] ?? '');
        $name     = trim($body['display_name']  ?? '');
        $email    = trim($body['email']          ?? '');
        $password = trim($body['password']       ?? '');

        if (!$bizName || !$email || !$password || !$name) fail('Todos los campos son requeridos');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Email inválido');
        if (strlen($password) < 8) fail('La contraseña debe tener al menos 8 caracteres');

        $db = getDB();

        // Email único
        $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
        $stmt->execute([$email]);
        if ($stmt->fetch()) fail('Ya existe una cuenta con ese email');

        // Crear slug único
        $slug = strtolower(preg_replace('/[^a-z0-9]+/i', '-', $bizName));
        $slug = trim($slug, '-');
        $base = $slug;
        $i = 1;
        while (true) {
            $stmt = $db->prepare('SELECT id FROM tenants WHERE slug = ?');
            $stmt->execute([$slug]);
            if (!$stmt->fetch()) break;
            $slug = $base . '-' . $i++;
        }

        $db->beginTransaction();
        try {
            // 1. Crear tenant
            $db->prepare('INSERT INTO tenants (name, slug) VALUES (?, ?)')->execute([$bizName, $slug]);
            $tenantId = (int)$db->lastInsertId();

            // 2. Licencia trial 14 días
            $db->prepare(
                'INSERT INTO licenses (tenant_id, plan, starts_at, expires_at, max_users)
                 VALUES (?, "trial", CURDATE(), DATE_ADD(CURDATE(), INTERVAL 14 DAY), 2)'
            )->execute([$tenantId]);

            // 3. Configuración por defecto
            $db->prepare(
                'INSERT INTO settings (tenant_id) VALUES (?)'
            )->execute([$tenantId]);

            // 4. Crear usuario owner
            $hash = password_hash($password, PASSWORD_BCRYPT);
            $db->prepare(
                'INSERT INTO users (tenant_id, username, email, password_hash, role, display_name)
                 VALUES (?, ?, ?, ?, "owner", ?)'
            )->execute([$tenantId, explode('@', $email)[0], $email, $hash, $name]);
            $userId = (int)$db->lastInsertId();

            $db->commit();

            $token = generateJWT([
                'user_id'   => $userId,
                'tenant_id' => $tenantId,
                'role'      => 'owner',
            ]);

            ok([
                'token'        => $token,
                'user_id'      => $userId,
                'display_name' => $name,
                'role'         => 'owner',
                'tenant_id'    => $tenantId,
                'tenant_name'  => $bizName,
                'trial_days'   => 14,
            ], 'Negocio registrado. Tienes 14 días de prueba gratuita.');

        } catch (Exception $e) {
            $db->rollBack();
            fail('Error al registrar: ' . $e->getMessage());
        }

    // ── Info del usuario actual ───────────────────────────────────────────────
    case 'me':
        $user = requireAuth();
        $db   = getDB();

        $license = null;
        if ($user['role'] !== 'superadmin' && $user['tenant_id']) {
            $stmt = $db->prepare(
                'SELECT plan, expires_at,
                        DATEDIFF(expires_at, CURDATE()) AS days_left,
                        max_users
                 FROM licenses WHERE tenant_id = ? ORDER BY expires_at DESC LIMIT 1'
            );
            $stmt->execute([$user['tenant_id']]);
            $license = $stmt->fetch();
        }

        ok([
            'user_id'      => (int)$user['id'],
            'display_name' => $user['display_name'],
            'role'         => $user['role'],
            'tenant_id'    => $user['tenant_id'] ? (int)$user['tenant_id'] : null,
            'license'      => $license,
        ]);

    // ── Cambiar contraseña ────────────────────────────────────────────────────
    case 'change_password':
        $user    = requireAuth();
        $current = $body['current_password'] ?? '';
        $new     = $body['new_password']     ?? '';
        if (strlen($new) < 8) fail('La nueva contraseña debe tener al menos 8 caracteres');

        $db   = getDB();
        $stmt = $db->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([$user['id']]);
        $row  = $stmt->fetch();
        if (!password_verify($current, $row['password_hash'])) fail('Contraseña actual incorrecta');

        $db->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
           ->execute([password_hash($new, PASSWORD_BCRYPT), $user['id']]);

        ok(null, 'Contraseña actualizada');

    // ── Agregar empleado (owner/manager) ──────────────────────────────────────
    case 'add_employee':
        $user = requireAuth(['owner', 'manager', 'superadmin']);
        $db   = getDB();

        $empName  = trim($body['display_name'] ?? '');
        $empEmail = trim($body['email']        ?? '');
        $empPass  = trim($body['password']     ?? '');
        $empRole  = trim($body['role']         ?? 'employee');

        if (!$empName || !$empEmail || !$empPass) fail('Nombre, email y contraseña son requeridos');
        if (!in_array($empRole, ['manager', 'employee'])) fail('Rol inválido');
        if (!filter_var($empEmail, FILTER_VALIDATE_EMAIL)) fail('Email inválido');
        if (strlen($empPass) < 8) fail('La contraseña debe tener al menos 8 caracteres');

        $tenantId = (int)$user['tenant_id'];

        // Verificar límite de usuarios por licencia
        $stmt = $db->prepare('SELECT max_users FROM licenses WHERE tenant_id = ? ORDER BY expires_at DESC LIMIT 1');
        $stmt->execute([$tenantId]);
        $lic  = $stmt->fetch();
        $max  = $lic ? (int)$lic['max_users'] : 2;

        $stmt = $db->prepare('SELECT COUNT(*) AS cnt FROM users WHERE tenant_id = ? AND is_active = 1');
        $stmt->execute([$tenantId]);
        $cnt  = (int)$stmt->fetch()['cnt'];
        if ($cnt >= $max) fail("Tu plan permite máximo $max usuarios activos. Actualiza tu licencia.");

        // Email único
        $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
        $stmt->execute([$empEmail]);
        if ($stmt->fetch()) fail('Ya existe una cuenta con ese email');

        $hash = password_hash($empPass, PASSWORD_BCRYPT);
        $db->prepare(
            'INSERT INTO users (tenant_id, username, email, password_hash, role, display_name)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$tenantId, explode('@', $empEmail)[0], $empEmail, $hash, $empRole, $empName]);

        ok(['id' => (int)$db->lastInsertId()], 'Empleado agregado');

    // ── Lista empleados del negocio ───────────────────────────────────────────
    case 'employees':
        $user = requireAuth(['owner', 'manager', 'superadmin']);
        $db   = getDB();

        $stmt = $db->prepare(
            'SELECT id, display_name, email, role, is_active, created_at, last_login
             FROM users WHERE tenant_id = ? ORDER BY role, display_name'
        );
        $stmt->execute([$user['tenant_id']]);
        ok($stmt->fetchAll());

    // ── Activar / desactivar empleado ─────────────────────────────────────────
    case 'toggle_employee':
        $user  = requireAuth(['owner', 'superadmin']);
        $empId = (int)($body['id'] ?? 0);
        if (!$empId) fail('ID requerido');

        $db   = getDB();
        // Solo puede modificar empleados de su propio negocio
        $stmt = $db->prepare('SELECT id, is_active, role FROM users WHERE id = ? AND tenant_id = ?');
        $stmt->execute([$empId, $user['tenant_id']]);
        $emp  = $stmt->fetch();
        if (!$emp) notFound('Empleado no encontrado');
        if ($emp['role'] === 'owner') forbidden('No puedes desactivar al owner');

        $new = $emp['is_active'] ? 0 : 1;
        $db->prepare('UPDATE users SET is_active = ? WHERE id = ?')->execute([$new, $empId]);
        ok(['is_active' => $new], $new ? 'Empleado activado' : 'Empleado desactivado');

    // ── Eliminar empleado ─────────────────────────────────────────────────────
    case 'delete_employee':
        $user  = requireAuth(['owner', 'superadmin']);
        $empId = (int)($_GET['id'] ?? 0);
        if (!$empId) fail('ID requerido');

        $db   = getDB();
        $stmt = $db->prepare('SELECT role FROM users WHERE id = ? AND tenant_id = ?');
        $stmt->execute([$empId, $user['tenant_id']]);
        $emp  = $stmt->fetch();
        if (!$emp) notFound();
        if ($emp['role'] === 'owner') forbidden('No puedes eliminar al owner');

        $db->prepare('DELETE FROM users WHERE id = ?')->execute([$empId]);
        ok(null, 'Empleado eliminado');

    default:
        fail('Acción no reconocida', 404);
}
