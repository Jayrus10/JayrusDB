# Vexto - Gestor de Inventario, Compras y Ventas

**Versión:** 1.0.10 Beta

Vexto es un sistema de gestión de inventario, compras y ventas diseñado para pequeños negocios. Permite gestionar productos, clientes, proveedores, descuentos y generar reportes de ventas.

---

## Características Principales

### 📦 Gestión de Productos
- Registro de productos con nombre, categoría, stock, precio de costo y precio de venta
- Control de stock mínimo con alertas
- Seguimiento de costo promedio automático
- Historial de compras por producto

### 👥 Gestión de Clientes
- Registro de clientes con niveles VIP
- Sistema de descuentos por cliente, cantidad o generales
- Control de deudas (fiado)
- Historial de compras por cliente

### 🏭 Gestión de Proveedores
- Registro de proveedores
- Seguimiento de compras y pedidos en camino
- Historial de compras por proveedor

### 💰 Ventas
- Venta rápida con cálculo automático de descuentos
- Sistema de fiado (crédito)
- Soporte multi-moneda (CUP, USD, EUR)
- Impresión de tickets

### 🛒 Compras
- Registro de compras/lotes
- Seguimiento de pedidos en camino
- Cálculo automático de costo promedio

### 📈 Reportes
- Ganancia neta total
- Costo de mercancía vendida (COGS)
- Deudas pendientes
- Gráfico de ventas del mes

---

## Funcionalidades Avanzadas

### Gastos en Ventas
Al realizar una venta, puedes agregar **gastos adicionales** como costos de envío o logística. Estos gastos:
- Se restan del total de la venta para calcular la ganancia real
- Se muestran en rojo en la tabla de ventas
- Se incluyen en el detalle de la venta al hacer clic

### Cálculo de Ganancia en Tiempo Real
Al registrar una venta, el sistema muestra:
- **Subtotal**: Cantidad × Precio unitario
- **Ganancia/Pérdida**: Se calcula automáticamente restando el costo del producto y los gastos del ingreso
  - Verde: Ganancia positiva
  - Rojo: Pérdida (precio menor al costo)

### Sistema de Descuentos
- **Por cantidad**: Descuento automático al comprar más de X unidades
- **Por cliente**: Descuento específico para un cliente
- **General**: Descuento aplicable a todos
- **VIP**: Descuento según nivel del cliente

### Monedas y Tasas de Cambio
- Moneda principal configurable (CUP, USD, EUR)
- Tasas de cambio informales configurables
- Conversión automática entre monedas

---

## Instalación

1. Descarga los archivos del proyecto
2. Abre `index.html` en un navegador web
3. Ingresa tu nombre de usuario para comenzar

**Nota:** Los datos se almacenan localmente en el navegador. Se recomienda exportar los datos periódicamente.

---

## Estructura de Archivos

```
Vexto/
├── index.html    # Estructura HTML de la aplicación
├── vexto.js      # Lógica JavaScript
├── vexto.css     # Estilos CSS
├── logo.png      # Logo del proyecto
└── README.md     # Este archivo
```

---

## Atajos de Teclado

- **Ctrl+N**: Nuevo producto
- **Ctrl+S**: Guardar (en modales)
- **Ctrl+F**: Buscar
- **Esc**: Cerrar modales

---

## Notas Importantes

- ⚠️ **Versión Beta**: Esta es una versión de prueba
- 💾 **Datos temporales**: Los datos se almacenan en el navegador. Si borras la caché, se perderán.
- 🔄 **Sin sincronización**: Los datos no se sincronizan entre dispositivos
- 📤 **Respaldo**: Exporta tus datos regularmente

---

## Créditos

Desarrollado por Jayrus
- [GitHub](https://github.com/Jayrus10/JayrusDB)
- [Soporte](https://t.me/mrjayrus)
