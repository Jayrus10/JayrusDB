# ÉLUME — Tienda de Ropa 🛍️

Aplicación web de tienda de ropa construida con **Python + Flask**.

---

## 🚀 Instalación

```bash
# 1. Instalar dependencias
pip install -r requirements.txt

# 2. Ejecutar la aplicación
python app.py
```

Abre tu navegador en: **http://localhost:5000**

---

## 🔑 Cuentas de acceso

| Rol | Usuario | Contraseña |
|-----|---------|------------|
| 👤 Usuario | `usuario` | `user123` |
| ⚙️ Admin | `admin` | `admin123` |

---

## ✨ Funcionalidades

### Usuario (cliente)
- Ver catálogo de productos con precios
- Filtrar productos por categoría
- Dar ❤️ like / unlike a productos
- Modo oscuro / modo claro

### Administrador
- Todo lo del usuario, más:
- ✏️ Editar nombre, precio, descripción, categoría e imagen de cada producto
- ➕ Agregar nuevos productos
- 🗑️ Eliminar productos
- Ver estadísticas (total productos, likes, precio promedio, etc.)

---

## 📁 Estructura del proyecto

```
tienda/
├── app.py              # Servidor Flask (Python)
├── data.json           # Base de datos (generado automáticamente)
├── requirements.txt    # Dependencias
└── templates/
    ├── base.html       # Plantilla base con nav y dark mode
    ├── index.html      # Tienda pública
    ├── login.html      # Inicio de sesión
    └── admin.html      # Panel de administración
```

---

## 🛠️ Tecnologías

- **Backend**: Python 3 + Flask
- **Frontend**: HTML5, CSS3, JavaScript vanilla
- **Datos**: JSON (sin base de datos externa)
- **Fuentes**: Playfair Display + DM Sans (Google Fonts)
