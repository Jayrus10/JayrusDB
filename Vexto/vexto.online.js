// ─── Vexto - Modo Online ───────────────────────────────────────────────────────
// Este archivo contiene el código para conexión con API (modo online)
// Debe cargarse DESPUÉS de vexto.local.js

// ─── Configuración API ────────────────────────────────────────────────────────────
// URL base de la API (cambiar según tu hosting)
let API_BASE_URL = 'http://jayrus10.atwebpages.com/public/api'
let apiToken = localStorage.getItem('vexto_api_token') || null
let currentUserData = null

// Inicializar modo online
let useOnlineMode = localStorage.getItem('vexto_use_online') === 'true'

// Guardar URL de API personalizada
function saveApiUrl() {
    const url = document.getElementById('loginApiUrl').value.trim()
    if(url) {
        API_BASE_URL = url
        localStorage.setItem('vexto_api_url', url)
    }
}

// ─── Cliente API ────────────────────────────────────────────────────────────────
async function apiRequest(endpoint, method = 'GET', body = null) {
    let url = `${API_BASE_URL}/${endpoint}.php`
    
    // Agregar token como query string (el header Authorization no funciona en este hosting)
    if (apiToken) {
        url += `?token=${apiToken}`
    }
    
    const headers = {
        'Content-Type': 'application/json'
    }
    
    const options = {
        method,
        headers
    }
    
    if (body) {
        options.body = JSON.stringify(body)
    }
    
    try {
        const response = await fetch(url, options)
        const data = await response.json()
        
        if (!response.ok) {
            throw new Error(data.error || 'Error en la solicitud')
        }
        
        return data
    } catch (error) {
        console.error('API Error:', error)
        throw error
    }
}

// ─── API Auth ─────────────────────────────────────────────────────────────────
async function apiLogin(email, password) {
    const data = await apiRequest('auth', 'POST', { action: 'login', email, password })
    if (data.token) {
        apiToken = data.token
        currentUserData = data.usuario
        localStorage.setItem('vexto_api_token', data.token)
        localStorage.setItem('vexto_user_data', JSON.stringify(data.usuario))
    }
    return data
}

async function apiLogout() {
    try {
        await apiRequest('auth', 'POST', { action: 'logout' })
    } catch (e) {
        // Ignorar errores al cerrar sesión
    }
    apiToken = null
    currentUserData = null
    localStorage.removeItem('vexto_api_token')
    localStorage.removeItem('vexto_user_data')
}

async function apiGetUser() {
    return await apiRequest('auth', 'GET', { action: 'me' })
}

// ─── API Productos ────────────────────────────────────────────────────────────
async function apiGetProductos() {
    return await apiRequest('productos', 'GET')
}

async function apiCreateProducto(producto) {
    return await apiRequest('productos', 'POST', producto)
}

async function apiUpdateProducto(producto) {
    return await apiRequest('productos', 'PUT', producto)
}

async function apiDeleteProducto(id) {
    return await apiRequest('productos', 'DELETE', { id })
}

// ─── API Clientes ──────────────────────────────────────────────────────────────
async function apiGetClientes() {
    return await apiRequest('clientes', 'GET')
}

async function apiCreateCliente(cliente) {
    return await apiRequest('clientes', 'POST', cliente)
}

async function apiUpdateCliente(cliente) {
    return await apiRequest('clientes', 'PUT', cliente)
}

async function apiDeleteCliente(id) {
    return await apiRequest('clientes', 'DELETE', { id })
}

// ─── API Proveedores ─────────────────────────────────────────────────────────
async function apiGetProveedores() {
    return await apiRequest('proveedores', 'GET')
}

async function apiCreateProveedor(proveedor) {
    return await apiRequest('proveedores', 'POST', proveedor)
}

async function apiUpdateProveedor(proveedor) {
    return await apiRequest('proveedores', 'PUT', proveedor)
}

async function apiDeleteProveedor(id) {
    return await apiRequest('proveedores', 'DELETE', { id })
}

// ─── API Ventas ──────────────────────────────────────────────────────────────
async function apiGetVentas() {
    return await apiRequest('ventas', 'GET')
}

async function apiGetVentasHoy() {
    return await apiRequest('ventas', 'GET', { action: 'hoy' })
}

async function apiCreateVenta(venta) {
    return await apiRequest('ventas', 'POST', venta)
}

async function apiDeleteVenta(id) {
    return await apiRequest('ventas', 'DELETE', { id })
}

// ─── API Compras ─────────────────────────────────────────────────────────────
async function apiGetCompras() {
    return await apiRequest('compras', 'GET')
}

async function apiCreateCompra(compra) {
    return await apiRequest('compras', 'POST', compra)
}

async function apiUpdateCompra(compra) {
    return await apiRequest('compras', 'PUT', compra)
}

// ─── API Reportes ─────────────────────────────────────────────────────────────
async function apiGetDashboard() {
    return await apiRequest('reportes', 'GET', { action: 'dashboard' })
}

async function apiGetGanancias(fechaInicio, fechaFin) {
    return await apiRequest('reportes', 'GET', { action: 'ganancias', fecha_inicio: fechaInicio, fecha_fin: fechaFin })
}

// ─── Cargar datos desde la API ───────────────────────────────────────────────
async function loadDataFromAPI() {
    try {
        // Cargar productos
        const productos = await apiGetProductos()
        data.products = productos.map(p => ({
            id: p.id,
            name: p.nombre,
            category: p.categoria_nombre || '',
            currentStock: parseFloat(p.current_stock) || 0,
            minStock: parseFloat(p.min_stock) || 0,
            avgCost: parseFloat(p.avg_cost) || 0,
            totalCostValue: parseFloat(p.total_cost_value) || 0,
            markup: parseFloat(p.markup) || 30,
            barcode: p.codigo_barras || '',
            description: p.descripcion || ''
        }))
        
        // Cargar clientes
        const clientes = await apiGetClientes()
        data.customers = clientes.map(c => ({
            id: c.id,
            name: c.nombre,
            phone: c.telefono || '',
            email: c.email || '',
            debt: parseFloat(c.deuda_actual) || 0,
            totalSpent: parseFloat(c.total_comprado) || 0,
            vipLevel: c.vip_nombre || ''
        }))
        
        // Cargar proveedores
        const proveedores = await apiGetProveedores()
        data.providers = proveedores.map(p => ({
            id: p.id,
            name: p.nombre,
            contact: p.contacto || '',
            phone: p.telefono || '',
            email: p.email || '',
            address: p.direccion || ''
        }))
        
        // Cargar ventas
        const ventas = await apiGetVentas()
        data.sales = ventas.map(v => ({
            id: v.id,
            date: v.fecha_venta,
            product: v.producto_nombre || '',
            productId: v.producto_id,
            quantity: parseFloat(v.cantidad) || 0,
            unitPrice: parseFloat(v.precio_unitario) || 0,
            finalPrice: parseFloat(v.precio_total) || 0,
            client: v.cliente_nombre || '',
            clientId: v.cliente_id,
            onCredit: v.estado === 'pendiente'
        }))
        
        // Cargar compras
        const compras = await apiGetCompras()
        data.purchases = compras.map(c => ({
            id: c.id,
            date: c.fecha_compra,
            product: c.producto_nombre || '',
            productId: c.producto_id,
            quantity: parseFloat(c.cantidad) || 0,
            unitCost: parseFloat(c.costo_unitario) || 0,
            totalCost: parseFloat(c.costo_total) || 0,
            provider: c.proveedor_nombre || '',
            providerId: c.proveedor_id,
            status: c.estado
        }))
        
    } catch (error) {
        console.error('Error cargando datos:', error)
        showToast('Error al cargar datos desde el servidor', 'error')
    }
}

// ─── Sobrescribir funciones de login ─────────────────────────────────────────
// Login modo online
async function handleLoginOnline() {
    // Guardar URL de API si se proporcionó
    saveApiUrl()
    
    const email = document.getElementById('loginUser').value.trim()
    const password = document.getElementById('loginPassword')?.value || ''
    
    if (!email || !password) {
        showToast('Ingresa email y contraseña', 'error')
        throw new Error('Email y contraseña requeridos')
    }
    
    showLoading()
    
    try {
        const result = await apiLogin(email, password)
        
        if (result.token) {
            // Cargar datos desde la API
            await loadDataFromAPI()
            
            // Mostrar app
            showApp(currentUserData?.nombre || email)
            showToast('¡Bienvenido!', 'success')
        }
    } catch (error) {
        showToast(error.message || 'Error al iniciar sesión', 'error')
        throw error
    } finally {
        hideLoading()
    }
}

// Logout modo online
function logoutOnline(){
    // Modo Online - cerrar sesión en API
    apiLogout()
    
    currentUser = ''
    currentUserData = null
    data = { products:[], purchases:[], sales:[], customers:[], providers:[], discounts:[], audit:[], vipLevels:[], exchangeRates:{USD:500,EUR:650}, baseCurrency:'CUP', businessInfo:{} }
    
    // Animate app exit
    const app = document.getElementById('app')
    app.classList.add('login-exit')
    
    // After app exit, show login with entrance animation
    setTimeout(() => {
        app.classList.add('hidden')
        app.classList.remove('app-entrance')
        
        const loginPage = document.getElementById('loginPage')
        loginPage.classList.remove('hidden')
        loginPage.classList.add('login-page-entrance')
        
        // Reset login card animation
        const loginCard = loginPage.querySelector('.login-card')
        const loginLogo = loginPage.querySelector('.login-logo')
        const loginTitle = loginPage.querySelector('.login-title')
        const loginInput = loginPage.querySelector('.login-input')
        const loginBtn = loginPage.querySelector('.login-btn')
        const loginInfoBtn = loginPage.querySelector('.login-info-btn')
        const loginLinks = loginPage.querySelector('.login-links')
        
        // Force reflow to restart animations
        if(loginCard) {
            loginCard.classList.remove('login-exit')
            loginCard.style.animation = 'none'
            loginCard.offsetHeight // trigger reflow
            loginCard.style.animation = ''
            loginCard.classList.add('login-card')
        }
        
        // Reset animations for other elements
        ;[loginLogo, loginTitle, loginInput, loginBtn, loginInfoBtn, loginLinks].forEach(el => {
            if(el) {
                el.style.animation = 'none'
                el.offsetHeight // trigger reflow
                el.style.animation = ''
            }
        })
        
        document.getElementById('loginUser').value = ''
    }, 450)
}

// ─── Sobrescribir función logout principal ────────────────────────────────────
function logout(){
    const isOnlineMode = localStorage.getItem('vexto_use_online') === 'true'
    
    if (isOnlineMode && apiToken) {
        // Modo Online - cerrar sesión en API
        logoutOnline()
    } else {
        // Modo Local
        saveData()
        
        currentUser = ''
        data = { products:[], purchases:[], sales:[], customers:[], providers:[], discounts:[], audit:[], vipLevels:[], exchangeRates:{USD:500,EUR:650}, baseCurrency:'CUP', businessInfo:{} }
        
        // Animate app exit
        const app = document.getElementById('app')
        app.classList.add('login-exit')
        
        // After app exit, show login with entrance animation
        setTimeout(() => {
            app.classList.add('hidden')
            app.classList.remove('app-entrance')
            
            const loginPage = document.getElementById('loginPage')
            loginPage.classList.remove('hidden')
            loginPage.classList.add('login-page-entrance')
            
            // Reset login card animation
            const loginCard = loginPage.querySelector('.login-card')
            const loginLogo = loginPage.querySelector('.login-logo')
            const loginTitle = loginPage.querySelector('.login-title')
            const loginInput = loginPage.querySelector('.login-input')
            const loginBtn = loginPage.querySelector('.login-btn')
            const loginInfoBtn = loginPage.querySelector('.login-info-btn')
            const loginLinks = loginPage.querySelector('.login-links')
            
            // Force reflow to restart animations
            if(loginCard) {
                loginCard.classList.remove('login-exit')
                loginCard.style.animation = 'none'
                loginCard.offsetHeight // trigger reflow
                loginCard.style.animation = ''
                loginCard.classList.add('login-card')
            }
            
            // Reset animations for other elements
            ;[loginLogo, loginTitle, loginInput, loginBtn, loginInfoBtn, loginLinks].forEach(el => {
                if(el) {
                    el.style.animation = 'none'
                    el.offsetHeight // trigger reflow
                    el.style.animation = ''
                }
            })
            
            document.getElementById('loginUser').value = ''
        }, 450)
    }
}

// ─── Sincronización de productos con API ────────────────────────────────────
async function syncProductToAPI(producto, id) {
    if (!apiToken) {
        throw new Error('No hay sesión activa')
    }
    
    if (id) {
        // Actualizar producto existente
        producto.id = id
        return await apiUpdateProducto(producto)
    } else {
        // Crear nuevo producto
        return await apiCreateProducto(producto)
    }
}

async function deleteProductFromAPI(id) {
    if (!apiToken) {
        throw new Error('No hay sesión activa')
    }
    
    return await apiDeleteProducto(id)
}

// ─── Sincronización de clientes con API ─────────────────────────────────────
async function syncClienteToAPI(cliente, id) {
    if (!apiToken) {
        throw new Error('No hay sesión activa')
    }
    
    if (id) {
        cliente.id = id
        return await apiUpdateCliente(cliente)
    } else {
        return await apiCreateCliente(cliente)
    }
}

async function deleteClienteFromAPI(id) {
    if (!apiToken) {
        throw new Error('No hay sesión activa')
    }
    
    return await apiDeleteCliente(id)
}

// ─── Sincronización de proveedores con API ──────────────────────────────────
async function syncProveedorToAPI(proveedor, id) {
    if (!apiToken) {
        throw new Error('No hay sesión activa')
    }
    
    if (id) {
        proveedor.id = id
        return await apiUpdateProveedor(proveedor)
    } else {
        return await apiCreateProveedor(proveedor)
    }
}

async function deleteProveedorFromAPI(id) {
    if (!apiToken) {
        throw new Error('No hay sesión activa')
    }
    
    return await apiDeleteProveedor(id)
}

// ─── Sincronización de ventas con API ───────────────────────────────────────
async function syncVentaToAPI(venta) {
    if (!apiToken) {
        throw new Error('No hay sesión activa')
    }
    
    return await apiCreateVenta(venta)
}

async function deleteVentaFromAPI(id) {
    if (!apiToken) {
        throw new Error('No hay sesión activa')
    }
    
    return await apiDeleteVenta(id)
}

// ─── Sincronización de compras con API ─────────────────────────────────────
async function syncCompraToAPI(compra, id) {
    if (!apiToken) {
        throw new Error('No hay sesión activa')
    }
    
    if (id) {
        compra.id = id
        return await apiUpdateCompra(compra)
    } else {
        return await apiCreateCompra(compra)
    }
}

// ─── Fin del archivo online ─────────────────────────────────────────────────
