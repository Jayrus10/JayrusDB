┌─────────────────────────────────────────────────────────────┐
│  FRONTEND                             │
│  index.html · vexto.css · vexto.js                         │
│  + admin.html (panel superadmin — URL separada)            │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS + JWT token
┌────────────────────────▼────────────────────────────────────┐
│  BACKEND PHP                                                │
│  api/                                                       │
│  ├── auth.php        login, logout, refresh token          │
│  ├── data.php        CRUD unificado (todo el negocio)      │
│  ├── admin.php       superadmin: licencias, negocios       │
│  └── _helpers/                                             │
│      ├── db.php      conexión MySQL PDO                    │
│      ├── auth.php    validar JWT, permisos                 │
│      └── response.php  formato JSON estándar              │
└────────────────────────┬────────────────────────────────────┘
                         │ PDO / SQL
┌────────────────────────▼────────────────────────────────────┐
│  MySQL                                                      │
│  ├── tenants          negocios registrados                 │
│  ├── users            usuarios con rol y tenant_id         │
│  ├── licenses         planes, fechas de expiración        │
│  ├── products         con tenant_id                        │
│  ├── purchases        con tenant_id                        │
│  ├── sales            con tenant_id                        │
│  ├── customers        con tenant_id                        │
│  ├── providers        con tenant_id                        │
│  ├── discounts        con tenant_id                        │
│  ├── vip_levels       con tenant_id                        │
│  ├── cash_payments    con tenant_id                        │
│  ├── audit_log        con tenant_id + user_id              │
│  └── settings         con tenant_id                        │
└─────────────────────────────────────────────────────────────┘


Roles del sistema
Rol          Quién es           Qué puede hacer

superadmin   Tú                 Todo: crear negocios, gestionar licencias, ver estadísticas globales

owner        Dueño del negocio  Todo dentro de su negocio: empleados, ajustes, reportes completos

manager      Gerente            Compras, ventas, clientes, proveedores. Sin ajustes ni reportes financieros

employee     Vendedor/cajero    Solo ventas y consultar stock. Sin ver costos ni reportes


Modelo de datos central

superadmin
    │
    ├── negocio_1 (tenant)
    │       ├── owner: juan@correo.com
    │       ├── plan: pro | expira: 2026-03-01
    │       ├── empleado: maria (rol: vendedor)
    │       ├── empleado: pedro (rol: cajero)
    │       ├── productos, ventas, compras... (aislados)
    │
    ├── negocio_2 (tenant)
    │       ├── owner: ana@correo.com
    │       └── ...
    │
    └── negocio_3 ...


Primer login del superadmin:

Email: admin@vexto.app
Password: Admin1234!
Cámbialo inmediatamente desde el panel.