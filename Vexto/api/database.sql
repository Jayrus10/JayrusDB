-- =============================================
-- ESTRUCTURA DE BASE DE DATOS MYSQL PARA VEXTO
-- Ejecutar este script en MySQL para crear las tablas
-- =============================================

-- -----------------------------------------------------
-- 1. Tabla principal de usuarios del sistema
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    rol ENUM('superadmin', 'owner', 'manager', 'employee') NOT NULL DEFAULT 'employee',
    negocio_id INT NULL,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_negocio (negocio_id)
);

-- -----------------------------------------------------
-- 2. Tabla de negocios (tenants)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS negocios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    owner_id INT NOT NULL,
    plan ENUM('free', 'basic', 'pro', 'enterprise') DEFAULT 'free',
    fecha_expiracion DATE NULL,
    max_empleados INT DEFAULT 3,
    max_productos INT DEFAULT 500,
    configuraciones JSON,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
    INDEX idx_owner (owner_id)
);

-- -----------------------------------------------------
-- 3. Tabla de niveles VIP (antes de clientes)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS vip_levels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    negocio_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    porcentaje_descuento DECIMAL(5,2) NOT NULL DEFAULT 0,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
    INDEX idx_negocio (negocio_id)
);

-- -----------------------------------------------------
-- 4. Tabla de clientes (referencia vip_levels)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    negocio_id INT NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    telefono VARCHAR(50),
    email VARCHAR(255),
    direccion TEXT,
    vip_level_id INT NULL,
    deuda_actual DECIMAL(12,2) DEFAULT 0,
    total_comprado DECIMAL(12,2) DEFAULT 0,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
    FOREIGN KEY (vip_level_id) REFERENCES vip_levels(id) ON DELETE SET NULL,
    INDEX idx_negocio (negocio_id)
);

-- -----------------------------------------------------
-- 5. Tabla de categorías de productos
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    negocio_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
    INDEX idx_negocio (negocio_id)
);

-- -----------------------------------------------------
-- 6. Tabla de productos
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    negocio_id INT NOT NULL,
    categoria_id INT NULL,
    nombre VARCHAR(255) NOT NULL,
    codigo_barras VARCHAR(100),
    descripcion TEXT,
    current_stock DECIMAL(10,2) DEFAULT 0,
    min_stock DECIMAL(10,2) DEFAULT 0,
    avg_cost DECIMAL(12,2) DEFAULT 0,
    total_cost_value DECIMAL(12,2) DEFAULT 0,
    markup DECIMAL(5,2) DEFAULT 30,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL,
    INDEX idx_negocio (negocio_id),
    INDEX idx_nombre (nombre),
    INDEX idx_codigo (codigo_barras)
);

-- -----------------------------------------------------
-- 7. Tabla de proveedores
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS proveedores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    negocio_id INT NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    contacto VARCHAR(255),
    telefono VARCHAR(50),
    email VARCHAR(255),
    direccion TEXT,
    notas TEXT,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
    INDEX idx_negocio (negocio_id)
);

-- -----------------------------------------------------
-- 8. Tabla de compras (lotes)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS compras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    negocio_id INT NOT NULL,
    producto_id INT NOT NULL,
    proveedor_id INT NULL,
    cantidad DECIMAL(10,2) NOT NULL,
    costo_unitario DECIMAL(12,2) NOT NULL,
    costo_total DECIMAL(12,2) NOT NULL,
    estado ENUM('pendiente', 'recibido', 'cancelado') DEFAULT 'pendiente',
    fecha_compra DATE NOT NULL,
    fecha_recibido DATE NULL,
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
    FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL,
    INDEX idx_negocio (negocio_id),
    INDEX idx_producto (producto_id),
    INDEX idx_estado (estado)
);

-- -----------------------------------------------------
-- 9. Tabla de empleados por negocio
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS empleados (
    id INT AUTO_INCREMENT PRIMARY KEY,
    negocio_id INT NOT NULL,
    usuario_id INT NOT NULL,
    rol ENUM('owner', 'manager', 'employee') NOT NULL,
    permisos JSON,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    UNIQUE KEY uk_negocio_usuario (negocio_id, usuario_id)
);

-- -----------------------------------------------------
-- 10. Tabla de ventas
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS ventas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    negocio_id INT NOT NULL,
    producto_id INT NOT NULL,
    cliente_id INT NULL,
    vendedor_id INT NOT NULL,
    cantidad DECIMAL(10,2) NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    precio_total DECIMAL(12,2) NOT NULL,
    costo_producto DECIMAL(12,2) NOT NULL,
    ganancia DECIMAL(12,2) NOT NULL,
    descuento_aplicado DECIMAL(5,2) DEFAULT 0,
    moneda ENUM('CUP', 'USD', 'EUR') DEFAULT 'CUP',
    estado ENUM('pagado', 'pendiente', 'cancelado') DEFAULT 'pagado',
    fecha_venta DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    FOREIGN KEY (vendedor_id) REFERENCES usuarios(id),
    INDEX idx_negocio (negocio_id),
    INDEX idx_fecha (fecha_venta),
    INDEX idx_cliente (cliente_id)
);

-- -----------------------------------------------------
-- 11. Tabla de pagos de deudas
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS pagos_deudas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    negocio_id INT NOT NULL,
    cliente_id INT NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    metodo_pago ENUM('efectivo', 'transferencia', 'otro') DEFAULT 'efectivo',
    notas TEXT,
    fecha_pago DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    INDEX idx_negocio (negocio_id),
    INDEX idx_cliente (cliente_id)
);

-- -----------------------------------------------------
-- 12. Tabla de descuentos
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS descuentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    negocio_id INT NOT NULL,
    tipo ENUM('porcentaje', 'cantidad_fija') NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    tipo_aplicacion ENUM('general', 'cliente', 'producto', 'categoria') DEFAULT 'general',
    producto_id INT NULL,
    categoria_id INT NULL,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE,
    INDEX idx_negocio (negocio_id)
);

-- -----------------------------------------------------
-- 13. Tabla de configuración del negocio
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS configuraciones_negocio (
    id INT AUTO_INCREMENT PRIMARY KEY,
    negocio_id INT NOT NULL UNIQUE,
    moneda_base ENUM('CUP', 'USD', 'EUR') DEFAULT 'CUP',
    tasa_usd DECIMAL(10,2) DEFAULT 500,
    tasa_eur DECIMAL(10,2) DEFAULT 650,
    redondeo_step INT DEFAULT 1,
    redondeo_direccion ENUM('round', 'ceil', 'floor') DEFAULT 'round',
    info_negocio JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE
);

-- -----------------------------------------------------
-- 14. Tabla de auditoría
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria (
    id INT AUTO_INCREMENT PRIMARY KEY,
    negocio_id INT NOT NULL,
    usuario_id INT NOT NULL,
    accion VARCHAR(255) NOT NULL,
    entidad_tipo VARCHAR(50),
    entidad_id INT,
    datos_anteriores JSON,
    datos_nuevos JSON,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_negocio_fecha (negocio_id, created_at),
    INDEX idx_usuario (usuario_id)
);

-- -----------------------------------------------------
-- 15. Tabla de sesiones activas
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS sesiones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    token VARCHAR(500) NOT NULL UNIQUE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_token (token),
    INDEX idx_expires (expires_at)
);

-- =============================================
-- USUARIO INICIAL (Superadmin)
-- Email: admin@vexto.com
-- Password: admin123
-- =============================================
-- INSERT INTO usuarios (email, password_hash, nombre, rol) 
-- VALUES ('admin@vexto.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Administrador', 'superadmin');
