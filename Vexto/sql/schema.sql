-- ============================================================
-- VEXTO - Schema MySQL Multi-Tenant SaaS
-- Versión 1.0
-- Ejecutar en orden. Un solo servidor, múltiples negocios.
-- ============================================================

CREATE DATABASE IF NOT EXISTS 4668931_jayrus CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE 4668931_jayrus;

-- ─────────────────────────────────────────────
-- TENANTS (negocios clientes de la plataforma)
-- ─────────────────────────────────────────────
CREATE TABLE tenants (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(120) NOT NULL,               -- "Tienda El Sol"
    slug          VARCHAR(60)  NOT NULL UNIQUE,        -- "tienda-el-sol" (para URLs futuras)
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    is_active     TINYINT(1)   DEFAULT 1               -- 0 = bloqueado por admin
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- LICENCIAS (plan por tenant)
-- ─────────────────────────────────────────────
CREATE TABLE licenses (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id     INT UNSIGNED NOT NULL,
    plan          ENUM('trial','basic','pro','enterprise') DEFAULT 'trial',
    starts_at     DATE         NOT NULL,
    expires_at    DATE         NOT NULL,
    max_users     TINYINT      DEFAULT 3,              -- empleados máximos permitidos
    notes         TEXT,                                -- notas del admin (pagos, etc.)
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- USUARIOS
-- ─────────────────────────────────────────────
CREATE TABLE users (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id     INT UNSIGNED,                        -- NULL solo para superadmin
    username      VARCHAR(60)  NOT NULL,
    email         VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          ENUM('superadmin','owner','manager','employee') DEFAULT 'employee',
    display_name  VARCHAR(80),
    is_active     TINYINT(1)   DEFAULT 1,
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    last_login    DATETIME,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- CONFIGURACIÓN POR NEGOCIO
-- ─────────────────────────────────────────────
CREATE TABLE settings (
    tenant_id         INT UNSIGNED PRIMARY KEY,
    base_currency     VARCHAR(3)   DEFAULT 'CUP',
    rate_usd          DECIMAL(10,2) DEFAULT 500.00,
    rate_eur          DECIMAL(10,2) DEFAULT 650.00,
    cash_rounding_step INT          DEFAULT 1,
    cash_rounding_dir  VARCHAR(10)  DEFAULT 'round',
    updated_at        DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- NIVELES VIP
-- ─────────────────────────────────────────────
CREATE TABLE vip_levels (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id  INT UNSIGNED NOT NULL,
    name       VARCHAR(60)  NOT NULL,
    percent    DECIMAL(5,2) NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- CLIENTES
-- ─────────────────────────────────────────────
CREATE TABLE customers (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id    INT UNSIGNED NOT NULL,
    name         VARCHAR(120) NOT NULL,
    debt         DECIMAL(12,2) DEFAULT 0.00,
    vip_level_id INT UNSIGNED,                         -- FK a vip_levels
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id)    REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (vip_level_id) REFERENCES vip_levels(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- PROVEEDORES
-- ─────────────────────────────────────────────
CREATE TABLE providers (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id  INT UNSIGNED NOT NULL,
    name       VARCHAR(120) NOT NULL,
    contact    VARCHAR(120),
    phone      VARCHAR(40),
    email      VARCHAR(120),
    location   VARCHAR(200),
    notes      TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- PRODUCTOS
-- ─────────────────────────────────────────────
CREATE TABLE products (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id        INT UNSIGNED NOT NULL,
    name             VARCHAR(150) NOT NULL,
    category         VARCHAR(80)  DEFAULT 'General',
    min_stock        INT          DEFAULT 0,
    current_stock    DECIMAL(10,2) DEFAULT 0,
    total_cost_value DECIMAL(14,2) DEFAULT 0,          -- suma acumulada para calcular avgCost
    avg_cost         DECIMAL(12,4) DEFAULT 0,
    markup           DECIMAL(5,4)  DEFAULT 0.5,        -- 0.5 = 50%
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- DESCUENTOS
-- ─────────────────────────────────────────────
CREATE TABLE discounts (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id    INT UNSIGNED NOT NULL,
    type         ENUM('mayor','especial','cliente','general') NOT NULL,
    percent      DECIMAL(5,2) NOT NULL,
    product_id   INT UNSIGNED,                         -- NULL = todos los productos
    qty_min      INT,                                  -- para type='mayor'
    day_name     VARCHAR(60),                          -- para type='especial'
    client_name  VARCHAR(120),                         -- para type='cliente'
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id)  REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- COMPRAS / LOTES
-- ─────────────────────────────────────────────
CREATE TABLE purchases (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id         INT UNSIGNED NOT NULL,
    product_id        INT UNSIGNED,
    date              DATE         NOT NULL,
    qty               DECIMAL(10,2) NOT NULL,
    unit_cost_cup     DECIMAL(12,4) NOT NULL,          -- siempre en CUP
    prop_exp_cup      DECIMAL(12,4) DEFAULT 0,         -- gastos proporcionales en CUP
    total_exp_cup     DECIMAL(12,4) DEFAULT 0,         -- gastos totales del lote en CUP
    currency_original VARCHAR(3)   DEFAULT 'CUP',
    supplier          VARCHAR(120),
    in_stock          TINYINT(1)   DEFAULT 0,          -- 0=en camino, 1=en almacén
    created_by        INT UNSIGNED,                    -- user_id que lo registró
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id)   REFERENCES tenants(id)  ON DELETE CASCADE,
    FOREIGN KEY (product_id)  REFERENCES products(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by)  REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- VENTAS
-- ─────────────────────────────────────────────
CREATE TABLE sales (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id           INT UNSIGNED NOT NULL,
    product_id          INT UNSIGNED,
    date                DATE         NOT NULL,
    qty                 DECIMAL(10,2) NOT NULL,
    unit_sell_price_cup DECIMAL(12,4) NOT NULL,
    final_price_cup     DECIMAL(12,4) NOT NULL,        -- después de descuento
    discount_percent    DECIMAL(5,4)  DEFAULT 0,
    currency_original   VARCHAR(3)   DEFAULT 'CUP',
    client              VARCHAR(120)  DEFAULT '-',
    customer_id         INT UNSIGNED,                  -- FK a customers (puede ser NULL si no existe)
    on_credit           TINYINT(1)   DEFAULT 0,
    created_by          INT UNSIGNED,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id)   REFERENCES tenants(id)  ON DELETE CASCADE,
    FOREIGN KEY (product_id)  REFERENCES products(id) ON DELETE SET NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by)  REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- PAGOS DE DEUDA
-- ─────────────────────────────────────────────
CREATE TABLE cash_payments (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id         INT UNSIGNED NOT NULL,
    customer_id       INT UNSIGNED,
    client_name       VARCHAR(120),
    amount_cup        DECIMAL(12,4) NOT NULL,
    currency_original VARCHAR(3)   DEFAULT 'CUP',
    date              DATE         NOT NULL,
    created_by        INT UNSIGNED,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id)   REFERENCES tenants(id)   ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by)  REFERENCES users(id)     ON DELETE SET NULL
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- AUDITORÍA
-- ─────────────────────────────────────────────
CREATE TABLE audit_log (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id  INT UNSIGNED NOT NULL,
    user_id    INT UNSIGNED,
    username   VARCHAR(80),                            -- snapshot para historial
    action     TEXT         NOT NULL,
    created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE SET NULL,
    INDEX idx_tenant_date (tenant_id, created_at)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- SUPERADMIN por defecto
-- Cambia el password INMEDIATAMENTE después de instalar
-- password: Admin1234! (bcrypt)
-- ─────────────────────────────────────────────
INSERT INTO users (tenant_id, username, email, password_hash, role, display_name)
VALUES (
    NULL,
    'superadmin',
    'admin@vexto.app',
    '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    'superadmin',
    'Super Administrador'
);

-- ─────────────────────────────────────────────
-- ÍNDICES de rendimiento
-- ─────────────────────────────────────────────
CREATE INDEX idx_products_tenant   ON products(tenant_id);
CREATE INDEX idx_purchases_tenant  ON purchases(tenant_id);
CREATE INDEX idx_sales_tenant      ON sales(tenant_id);
CREATE INDEX idx_sales_date        ON sales(tenant_id, date);
CREATE INDEX idx_customers_tenant  ON customers(tenant_id);
CREATE INDEX idx_providers_tenant  ON providers(tenant_id);
