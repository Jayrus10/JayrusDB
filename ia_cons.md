# Registro de Consistencia del Agente IA - JayrusDB

## Fecha de inicio: 2026-03-01

---

## Tareas Completadas

### 2026-03-01 - Organización del proyecto Vexto/

**Objetivo:** Eliminar archivos de prueba y debugging innecesarios del proyecto Vexto/

**Archivos eliminados de Vexto/api/:**
- `create_negocio.php` - Utilidad de creación de negocios
- `diagnose_token.php` - Diagnóstico de token
- `diagnostic.php` - Diagnóstico general
- `gen_password.php` - Generador de contraseñas
- `gen_token.php` - Generador de tokens
- `insert_user.sql` - Script de inserción de usuario
- `list_productos.php` - Utilidad de listado
- `reset_password.php` - Utilidad de reseteo
- `test_api.php` - Prueba de API
- `test_config.php` - Prueba de configuración
- `test_login.php` - Prueba de login
- `test_simple.php` - Prueba simple
- `test_token.php` - Prueba de token
- `test.php` - Prueba general

**Nota:** El archivo `JayrusDB.code-workspace` no pudo eliminarse porque está protegido contra escritura. De hecho no debe eliminarse.

---

### 2026-03-01 - Corrección de carga de scripts Local/Online

**Problema identificado:**
- El archivo `index.html` cargaba `vexto.local.js` siempre, pero `vexto.online.js` solo se cargaba al iniciar la página si ya existía `vexto_use_online = 'true'` en localStorage
- Cuando el usuario seleccionaba "Online" en el selector de modo, el archivo `vexto.online.js` NO se cargaba
- Esto causaba que el modo online no funcionara correctamente

**Solución implementada:**

1. **Modificado `Vexto/index.html`:**
   - Eliminado el código que cargaba dinámicamente `vexto.online.js` solo al iniciar la página
   - Agregada función `loadOnlineScript()` que carga el script bajo demanda
   - Modificada la función `handleLogin` para cargar el script correcto según el modo seleccionado antes de hacer login

2. **Modificado `Vexto/vexto.local.js`:**
   - Agregada carga dinámica de `vexto.online.js` en la función `setLoginMode()` cuando el usuario selecciona el modo online
   - Esto asegura que cuando el usuario hace clic en "Online", el script se carga inmediatamente

**Funcionamiento correcto:**
- **Modo Local:** Solo se carga `vexto.local.js` (contiene todas las funciones de la app)
- **Modo Online:** Se carga `vexto.local.js` + `vexto.online.js` (el segundo sobrescribe las funciones necesarias para la API)
- La selección de modo determina qué funciones se usan en el login y operación de la app

---

## Estructura Actual del Proyecto Vexto/

### Raíz:
```
Vexto/
├── index.html          # Estructura HTML principal
├── vexto.css           # Estilos CSS
├── vexto.js            # Código JavaScript principal (no usado actualmente)
├── vexto.local.js      # Versión local (localStorage)
├── vexto.online.js     # Versión online (API)
├── DB_UPD.md           # Documentación de actualización a MySQL
├── progreso.md         # Progreso del desarrollo
├── README.md           # Información del proyecto
├── REPORTE_CAMBIOS.md  # Registro de cambios
├── LICENSE             # Licencia MIT
├── Vexto_Logo.svg      # Logo del proyecto
└── JayrusDB.code-workspace  # Archivo de workspace (protegido)
```

### Carpeta api/ (Backend PHP):
```
Vexto/api/
├── auth.php        # Autenticación con JWT
├── clientes.php    # CRUD de clientes
├── compras.php     # CRUD de compras
├── config.php      # Configuración de base de datos
├── database.sql    # Esquema de la base de datos
├── index.php       # Punto de entrada
├── productos.php   # CRUD de productos
├── proveedores.php # CRUD de proveedores
├── reportes.php    # Reportes y dashboard
└── ventas.php      # CRUD de ventas
```

---

## Pendientes del Proyecto

- El archivo `JayrusDB.code-workspace` debería eliminarse manualmente (está protegido contra escritura)
- Revisar si `progreso.md` necesita actualización

---

## Información Importante del Proyecto

- **Frontend:** HTML/JS/CSS con Tailwind CSS y Chart.js
- **Backend:** PHP 8.x con API REST
- **Base de datos:** MySQL (en hosting RunHosting)
- **Autenticación:** JWT
- **Modos:** Local (localStorage) y Online (API)

**Nota importante:** El archivo `vexto.js` ya no se usa. La funcionalidad está dividida en `vexto.local.js` y `vexto.online.js`.

---

## Notas de la Sesión

- Se eliminaron 14 archivos de prueba/debugging de la carpeta api/
- La carpeta api/ ahora contiene solo los archivos funcionales necesarios para el funcionamiento de la aplicación
- El archivo JayrusDB.code-workspace no pudo eliminarse por estar protegido contra escritura
- Se corrigió el sistema de carga de scripts para que el modo online funcione correctamente
- Cuando el usuario selecciona "Online" en el login, el script `vexto.online.js` se carga dinámicamente
