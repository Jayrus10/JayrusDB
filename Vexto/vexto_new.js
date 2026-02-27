// ─── Configuración de la API ──────────────────────────────────────────────────
// Cambia esta URL por la de tu servidor cuando lo despliegues.
// En desarrollo local puedes usar: http://localhost/vexto/api
const API_BASE = '/api';

// ─── Estado global ────────────────────────────────────────────────────────────
let cashRoundingStep = 1
let cashRoundingDir  = 'round'
let currentUser      = ''     // display_name del usuario
let currentUserId    = null
let currentRole      = ''     // 'owner' | 'manager' | 'employee' | 'superadmin'
let currentTenantId  = null
let authToken        = null   // JWT

// Todos los datos del negocio viven aquí (igual que antes)
let data = {
    products:[], purchases:[], sales:[], customers:[], providers:[],
    discounts:[], audit:[], vipLevels:[], cashPayments:[],
    exchangeRates:{USD:500, EUR:650}, baseCurrency:'CUP'
}

// ─── API: llamadas HTTP ───────────────────────────────────────────────────────
async function api(resource, action, method = 'GET', body = null, extraParams = '') {
    const url = `${API_BASE}/data.php?resource=${resource}&action=${action}${extraParams}`
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        }
    }
    if (body && method !== 'GET') opts.body = JSON.stringify(body)

    try {
        const res = await fetch(url, opts)
        const json = await res.json()
        if (!json.ok) {
            // 401/402 = token expirado o licencia caducada → logout automático
            if (res.status === 401 || res.status === 402) {
                showToast(json.error || 'Sesión expirada', 'error')
                setTimeout(logout, 2000)
                return null
            }
            showToast(json.error || 'Error desconocido', 'error')
            return null
        }
        return json.data
    } catch (e) {
        showToast('Sin conexión con el servidor', 'error')
        return null
    }
}

async function apiAuth(action, method = 'POST', body = null) {
    const url = `${API_BASE}/auth.php?action=${action}`
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        }
    }
    if (body) opts.body = JSON.stringify(body)
    try {
        const res = await fetch(url, opts)
        return await res.json()
    } catch (e) {
        return { ok: false, error: 'Sin conexión' }
    }
}

// ─── Toast de notificaciones ──────────────────────────────────────────────────
function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer')
    if (!container) {
        container = document.createElement('div')
        container.id = 'toastContainer'
        container.className = 'fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm'
        document.body.appendChild(container)
    }
    const colors = { info:'bg-zinc-800', success:'bg-emerald-700', error:'bg-red-700', warn:'bg-amber-700' }
    const toast = document.createElement('div')
    toast.className = `${colors[type]||colors.info} text-white text-sm px-4 py-3 rounded-2xl shadow-lg
                       flex items-center gap-2 opacity-0 transition-opacity duration-300`
    const icons = { info:'ℹ️', success:'✅', error:'❌', warn:'⚠️' }
    toast.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${message}</span>`
    container.appendChild(toast)
    requestAnimationFrame(() => { toast.classList.remove('opacity-0') })
    setTimeout(() => {
        toast.classList.add('opacity-0')
        setTimeout(() => toast.remove(), 300)
    }, 3500)
}

// ─── Persistencia: ya no usamos localStorage para datos ──────────────────────
// Solo guardamos el token JWT y la preferencia de redondeo
function saveToken(token) {
    authToken = token
    localStorage.setItem('vexto_token', token)
}
function loadToken() {
    const t = localStorage.getItem('vexto_token')
    if (t) authToken = t
    return !!t
}
function clearToken() {
    authToken = null
    localStorage.removeItem('vexto_token')
}

// ─── Cargar todos los datos del negocio desde la API ─────────────────────────
async function loadAllData() {
    showLoadingOverlay(true)
    try {
        // Carga en paralelo para mayor velocidad
        const [
            settings, products, purchases, sales,
            customers, providers, discounts, vipLevels
        ] = await Promise.all([
            api('settings',  'get'),
            api('products',  'list'),
            api('purchases', 'list'),
            api('sales',     'list'),
            api('customers', 'list'),
            api('providers', 'list'),
            api('discounts', 'list'),
            api('vip_levels','list'),
        ])

        if (settings) {
            data.baseCurrency         = settings.base_currency     || 'CUP'
            data.exchangeRates.USD    = parseFloat(settings.rate_usd) || 500
            data.exchangeRates.EUR    = parseFloat(settings.rate_eur) || 650
            cashRoundingStep          = parseInt(settings.cash_rounding_step) || 1
            cashRoundingDir           = settings.cash_rounding_dir || 'round'
        }

        // Normalizar claves snake_case → camelCase para compatibilidad con el JS existente
        data.products  = (products  || []).map(normalizeProduct)
        data.purchases = (purchases || []).map(normalizePurchase)
        data.sales     = (sales     || []).map(normalizeSale)
        data.customers = (customers || []).map(normalizeCustomer)
        data.providers = providers  || []
        data.discounts = (discounts || []).map(normalizeDiscount)
        data.vipLevels = (vipLevels || []).map(v => ({ id: v.id, name: v.name, percent: parseFloat(v.percent) }))

    } finally {
        showLoadingOverlay(false)
    }
}

// ─── Normalización de respuestas API → formato interno ───────────────────────
// El JS existente usa camelCase, la DB usa snake_case.
function normalizeProduct(p) {
    return {
        id:             parseInt(p.id),
        name:           p.name,
        category:       p.category || 'General',
        minStock:       parseFloat(p.min_stock)        || 0,
        currentStock:   parseFloat(p.current_stock)    || 0,
        totalCostValue: parseFloat(p.total_cost_value) || 0,
        avgCost:        parseFloat(p.avg_cost)         || 0,
        markup:         parseFloat(p.markup)           || 0.5,
    }
}
function normalizePurchase(p) {
    return {
        id:               parseInt(p.id),
        productId:        p.product_id ? parseInt(p.product_id) : null,
        date:             p.date,
        qty:              parseFloat(p.qty),
        unitCostCUP:      parseFloat(p.unit_cost_cup)  || 0,
        propExpCUP:       parseFloat(p.prop_exp_cup)   || 0,
        totalExpCUP:      parseFloat(p.total_exp_cup)  || 0,
        currencyOriginal: p.currency_original || 'CUP',
        supplier:         p.supplier || '',
        inStock:          !!parseInt(p.in_stock),
        product_name:     p.product_name || '',
    }
}
function normalizeSale(s) {
    return {
        id:               parseInt(s.id),
        productId:        s.product_id ? parseInt(s.product_id) : null,
        date:             s.date,
        qty:              parseFloat(s.qty),
        unitSellPriceCUP: parseFloat(s.unit_sell_price_cup) || 0,
        finalPriceCUP:    parseFloat(s.final_price_cup)     || 0,
        discountPercent:  parseFloat(s.discount_percent)    || 0,
        currencyOriginal: s.currency_original || 'CUP',
        client:           s.client || '-',
        onCredit:         !!parseInt(s.on_credit),
        product_name:     s.product_name || '',
        employee_name:    s.employee_name || '',
    }
}
function normalizeCustomer(c) {
    return {
        id:        parseInt(c.id),
        name:      c.name,
        debt:      parseFloat(c.debt) || 0,
        vipLevel:  c.vip_level_id ? String(c.vip_level_id) : '',
        vip_name:  c.vip_name  || '',
        vip_percent: parseFloat(c.vip_percent) || 0,
    }
}
function normalizeDiscount(d) {
    return {
        id:         parseInt(d.id),
        type:       d.type,
        percent:    parseFloat(d.percent),
        productId:  d.product_id ? parseInt(d.product_id) : null,
        qtyMin:     d.qty_min    ? parseInt(d.qty_min)    : null,
        dayName:    d.day_name   || '',
        clientName: d.client_name || '',
    }
}

// ─── Conversión ───────────────────────────────────────────────────────────────
function toCUP(amount, currency){
    if(currency === 'CUP' || !currency) return amount
    const r = data.exchangeRates[currency]
    return r > 0 ? amount * r : amount
}
function fromCUP(cup, currency){
    if(currency === 'CUP' || !currency) return cup
    const r = data.exchangeRates[currency]
    return r > 0 ? cup / r : cup
}

// ─── Redondeo ─────────────────────────────────────────────────────────────────
function roundCash(value){
    value = Number(value) || 0
    const step = Number(cashRoundingStep) || 1
    if(step <= 1) return value
    const dir = cashRoundingDir || 'round'
    if(dir === 'ceil')  return Math.ceil(value  / step) * step
    if(dir === 'floor') return Math.floor(value / step) * step
    return Math.round(value / step) * step
}

// ─── Formato ──────────────────────────────────────────────────────────────────
function fmtCUP(amount){
    amount = Number(amount) || 0
    return amount.toFixed(2) + ' CUP'
}
function fmtInfo(cup, label){
    cup = Number(cup) || 0
    const safeLabel = (label || 'Detalle').replace(/"/g, '&quot;')
    return fmtCUP(cup) +
        ' <button class="text-zinc-500 hover:text-zinc-300 text-xs currency-info-btn" ' +
        'data-value="'+cup+'" data-label="'+safeLabel+'">ℹ️</button>'
}
function showCurrencyInfo(cup, label){
    const c = cup.toFixed(2)
    const u = fromCUP(cup,'USD').toFixed(2)
    const e = fromCUP(cup,'EUR').toFixed(2)
    document.getElementById('currencyInfoTitle').textContent = label || 'Detalle'
    document.getElementById('currencyInfoContent').innerHTML = `
        <div class="bg-zinc-800 rounded-2xl p-4 flex justify-between">
            <span>CUP</span><span class="font-bold text-emerald-400">${c}</span>
        </div>
        <div class="bg-zinc-800 rounded-2xl p-4 flex justify-between">
            <span>USD</span><span class="font-bold text-emerald-400">${u}</span>
        </div>
        <div class="bg-zinc-800 rounded-2xl p-4 flex justify-between">
            <span>EUR</span><span class="font-bold text-emerald-400">${e}</span>
        </div>`
    const modal = document.getElementById('modalCurrencyInfo')
    const box   = document.getElementById('modalCurrencyInfoBox')
    _modalZBase += 10
    modal.style.zIndex = _modalZBase
    modal.classList.remove('hidden')
    setTimeout(() => { modal.classList.remove('opacity-0'); box.classList.remove('scale-95') }, 10)
}
function hideCurrencyInfo(){
    const modal = document.getElementById('modalCurrencyInfo')
    const box   = document.getElementById('modalCurrencyInfoBox')
    modal.classList.add('opacity-0'); box.classList.add('scale-95')
    setTimeout(() => modal.classList.add('hidden'), 300)
}

// ─── Overlay de carga ─────────────────────────────────────────────────────────
function showLoadingOverlay(show) {
    let el = document.getElementById('loadingOverlay')
    if (!el) {
        el = document.createElement('div')
        el.id = 'loadingOverlay'
        el.className = 'fixed inset-0 bg-zinc-950/80 flex items-center justify-center z-[9990]'
        el.innerHTML = '<div class="text-center"><div class="text-4xl mb-3 animate-spin">⚙️</div><div class="text-zinc-400 text-sm">Cargando...</div></div>'
        document.body.appendChild(el)
    }
    el.style.display = show ? 'flex' : 'none'
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function handleLogin(){
    const email    = document.getElementById('loginUser').value.trim()
    const password = document.getElementById('loginPass').value.trim()
    if(!email || !password) return showToast('Email y contraseña requeridos', 'warn')

    const btn = document.querySelector('#loginPage button[onclick="handleLogin()"]')
    if(btn) { btn.disabled = true; btn.textContent = 'Ingresando...' }

    const res = await apiAuth('login', 'POST', { email, password })

    if(btn) { btn.disabled = false; btn.textContent = 'Ingresar' }

    if(!res.ok) return showToast(res.error || 'Error al ingresar', 'error')

    saveToken(res.data.token)
    currentUser     = res.data.display_name
    currentUserId   = res.data.user_id
    currentRole     = res.data.role
    currentTenantId = res.data.tenant_id

    document.getElementById('loginPage').classList.add('hidden')
    document.getElementById('app').classList.remove('hidden')
    document.getElementById('currentUser').textContent = currentUser
    document.getElementById('currentRoleBadge').textContent = roleLabel(currentRole)

    // Aplicar restricciones de UI por rol
    applyRoleUI()

    await loadAllData()
    renderAll()
}

async function handleRegister(){
    const bizName  = document.getElementById('regBusiness').value.trim()
    const name     = document.getElementById('regName').value.trim()
    const email    = document.getElementById('regEmail').value.trim()
    const password = document.getElementById('regPass').value.trim()
    if(!bizName || !name || !email || !password) return showToast('Todos los campos son requeridos', 'warn')

    const res = await apiAuth('register', 'POST', { business_name: bizName, display_name: name, email, password })
    if(!res.ok) return showToast(res.error, 'error')

    saveToken(res.data.token)
    currentUser     = res.data.display_name
    currentRole     = res.data.role
    currentTenantId = res.data.tenant_id

    document.getElementById('loginPage').classList.add('hidden')
    document.getElementById('app').classList.remove('hidden')
    document.getElementById('currentUser').textContent = currentUser
    document.getElementById('currentRoleBadge').textContent = roleLabel(currentRole)

    showToast(res.message, 'success')
    applyRoleUI()
    await loadAllData()
    renderAll()
    showModal('modalSetupRates')
}

function logout(){
    clearToken()
    currentUser = ''; currentRole = ''; currentTenantId = null; authToken = null
    data = { products:[], purchases:[], sales:[], customers:[], providers:[], discounts:[], audit:[], vipLevels:[], cashPayments:[], exchangeRates:{USD:500,EUR:650}, baseCurrency:'CUP' }
    document.getElementById('app').classList.add('hidden')
    document.getElementById('loginPage').classList.remove('hidden')
    document.getElementById('loginUser').value = ''
    if(document.getElementById('loginPass')) document.getElementById('loginPass').value = ''
    showSection('login-form')
}

function roleLabel(role) {
    return { owner:'Propietario', manager:'Gerente', employee:'Empleado', superadmin:'Super Admin' }[role] || role
}

// ─── Restricciones de UI por rol ─────────────────────────────────────────────
function applyRoleUI(){
    // Ocultar secciones según rol
    const navItems = {
        'purchases': ['owner','manager','superadmin'],
        'providers':  ['owner','manager','superadmin'],
        'discounts':  ['owner','manager','superadmin'],
        'reports':    ['owner','manager','superadmin'],
        'settings':   ['owner','superadmin'],
    }
    document.querySelectorAll('[data-section]').forEach(el => {
        const sec = el.dataset.section
        if (navItems[sec] && !navItems[sec].includes(currentRole)) {
            el.style.display = 'none'
        }
    })
}

// ─── Guardar ajustes en la API ────────────────────────────────────────────────
async function saveSetupRates(){
    const usd = parseFloat(document.getElementById('setupRateUSD').value)
    const eur = parseFloat(document.getElementById('setupRateEUR').value)
    if(!usd || usd <= 0) return showToast('Tasa USD inválida', 'warn')
    if(!eur || eur <= 0) return showToast('Tasa EUR inválida', 'warn')

    const res = await api('settings','update','POST',{
        base_currency:'CUP', rate_usd:usd, rate_eur:eur,
        cash_rounding_step:cashRoundingStep, cash_rounding_dir:cashRoundingDir
    })
    if(res === null) return
    data.exchangeRates.USD = usd
    data.exchangeRates.EUR = eur
    hideModal('modalSetupRates')
    renderAll()
    showToast('Tasas configuradas', 'success')
}

// ─── Modales / Nav ────────────────────────────────────────────────────────────
let _modalZBase = 50
function showModal(id){
    const el = document.getElementById(id)
    if(!el) return
    _modalZBase += 10
    el.style.zIndex = _modalZBase
    el.classList.remove('hidden')
}
function hideModal(id){
    const el = document.getElementById(id)
    if(!el) return
    el.classList.add('hidden')
    el.style.zIndex = ''
}
function showWarningModal(){ document.getElementById('warningModal').classList.remove('hidden') }
function hideWarningModal(){ document.getElementById('warningModal').classList.add('hidden') }
function toggleMobileMenu(){ document.querySelector('.app-nav').classList.toggle('mobile-open') }

function showSection(sec){
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'))
    const el = document.getElementById(sec)
    if(el) el.classList.add('active')
    const nav = document.querySelector('.app-nav')
    if(nav && window.innerWidth <= 1023) nav.classList.remove('mobile-open')
    if(sec==='dashboard') renderDashboard()
    if(sec==='products')  renderProducts()
    if(sec==='discounts') renderDiscounts()
    if(sec==='customers') renderCustomers()
    if(sec==='providers') renderProviders()
    if(sec==='purchases') renderPurchases()
    if(sec==='sales')     renderSales()
    if(sec==='reports')   { renderReports(); renderCurrentMonthChart() }
    if(sec==='settings')  renderSettings()
    if(sec==='info')      renderInfo()
}

// ─── Modal de Confirmación ────────────────────────────────────────────────────
function showConfirm(title, message, onConfirm, opts){
    opts = opts||{}
    document.getElementById('confirmTitle').textContent   = title
    document.getElementById('confirmMessage').textContent = message
    document.getElementById('confirmIcon').textContent    = opts.icon || '🗑️'
    const btn = document.getElementById('confirmBtn')
    btn.textContent = opts.label    || 'Eliminar'
    btn.className   = 'flex-1 py-3 rounded-2xl text-sm font-semibold ' + (opts.btnClass || 'bg-red-600 hover:bg-red-500')
    btn.onclick = () => { hideModal('modalConfirm'); onConfirm() }
    showModal('modalConfirm')
}

// ─── Auditoría (se lee de API) ────────────────────────────────────────────────
async function showAudit(){
    const div = document.getElementById('auditLog')
    div.innerHTML = '<div class="text-zinc-500 text-sm">Cargando...</div>'
    showModal('modalAudit')
    const logs = await api('audit','list')
    div.innerHTML = ''
    if(!logs || !logs.length){ div.innerHTML='<div class="text-zinc-500">Sin registros</div>'; return }
    logs.forEach(log => {
        const d = document.createElement('div')
        d.className = 'bg-zinc-800 p-3 rounded-lg border-l-2 border-emerald-600'
        d.innerHTML = '<div class="text-xs text-zinc-400">'+log.created_at+' — '+log.username+'</div>'
                    + '<div class="text-zinc-200">'+log.action+'</div>'
        div.appendChild(d)
    })
}

// ─── Clientes y VIP ───────────────────────────────────────────────────────────
function renderCustomers(){
    const tbody = document.getElementById('customersTable')
    if(!tbody) return
    tbody.innerHTML = ''
    const list = data.customers || []
    if(!list.length){
        tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-zinc-500">No hay clientes registrados</td></tr>'
        return
    }
    list.forEach(c => {
        const vipBadge = c.vip_name
            ? '<span class="text-xs bg-amber-900 text-amber-300 px-2 py-0.5 rounded-full ml-1">⭐ '+c.vip_name+' ('+c.vip_percent+'%)</span>'
            : '<span class="text-xs text-zinc-600">—</span>'
        const custSales    = data.sales.filter(s => s.client === c.name)
        const purchaseCount = custSales.length
        const totalSpent   = custSales.reduce((a,s) => a + s.qty*(s.finalPriceCUP||0), 0)
        const tr = document.createElement('tr')
        tr.className = 'border-b border-zinc-800 hover:bg-zinc-900'
        tr.innerHTML = '<td class="py-4 font-medium">'+c.name+'</td>'
            +'<td>'+vipBadge+'</td>'
            +'<td class="text-zinc-300">'+(purchaseCount > 0 ? purchaseCount+'x' : '<span class="text-zinc-600">0</span>')+'</td>'
            +'<td>'+(totalSpent > 0 ? fmtInfo(totalSpent,'Total gastado') : '<span class="text-zinc-600">—</span>')+'</td>'
            +'<td>'+fmtInfo(c.debt||0,'Deuda')+'</td>'
            +'<td class="flex gap-2 py-4">'
            +(c.debt > 0 ? '<button onclick="showPayDebt('+c.id+')" class="text-emerald-400 hover:text-emerald-300 text-xs px-1.5 py-0.5 rounded bg-emerald-900/40 mr-1">💵 Pagar</button>' : '')
            +'<button onclick="showEditCustomer('+c.id+')" class="text-zinc-400 hover:text-zinc-200 text-sm">✏️</button>'
            +'<button onclick="deleteCustomer('+c.id+')" class="text-red-400 hover:text-red-300 text-sm">🗑️</button>'
            +'</td>'
        tbody.appendChild(tr)
    })
}
function showAddCustomer(){
    const sel = document.getElementById('customerVipLevel')
    sel.innerHTML = '<option value="">Sin nivel VIP</option>'
    data.vipLevels.forEach(v => {
        const o = document.createElement('option')
        o.value = v.id; o.textContent = '⭐ '+v.name+' ('+v.percent+'%)'
        sel.appendChild(o)
    })
    document.getElementById('customerName').value = ''
    document.getElementById('customerId').value   = ''
    document.getElementById('customerVipLevel').value = ''
    showModal('modalCustomer')
}
function showEditCustomer(id){
    const c = data.customers.find(x=>x.id===id)
    if(!c) return
    const sel = document.getElementById('customerVipLevel')
    sel.innerHTML = '<option value="">Sin nivel VIP</option>'
    data.vipLevels.forEach(v => {
        const o = document.createElement('option')
        o.value = v.id; o.textContent = '⭐ '+v.name+' ('+v.percent+'%)'
        sel.appendChild(o)
    })
    document.getElementById('customerName').value      = c.name
    document.getElementById('customerId').value        = c.id
    document.getElementById('customerVipLevel').value  = c.vipLevel || ''
    showModal('modalCustomer')
}
async function saveCustomer(){
    const name  = document.getElementById('customerName').value.trim()
    const idVal = document.getElementById('customerId').value
    const vip   = document.getElementById('customerVipLevel').value
    if(!name) return showToast('Nombre requerido', 'warn')

    if(idVal){
        const res = await api('customers','update','POST',{ id:parseInt(idVal), name, vip_level_id: vip||null })
        if(res === null) return
        const c = data.customers.find(x=>x.id===parseInt(idVal))
        if(c){ c.name=name; c.vipLevel=vip }
    } else {
        const res = await api('customers','create','POST',{ name, vip_level_id: vip||null })
        if(res === null) return
        data.customers.push(normalizeCustomer(res))
    }
    hideModal('modalCustomer'); renderCustomers()
    showToast('Cliente guardado', 'success')
}
async function deleteCustomer(id){
    const c = data.customers.find(x=>x.id===id)
    if(!c) return
    showConfirm('¿Eliminar cliente?', '"'+c.name+'" será eliminado.', async () => {
        const res = await api('customers','delete','DELETE',null,`&id=${id}`)
        if(res === null) return
        data.customers = data.customers.filter(x=>x.id!==id)
        renderCustomers()
        showToast('Cliente eliminado', 'success')
    })
}

// ─── VIP Levels ───────────────────────────────────────────────────────────────
function showManageVipLevels(){
    renderVipLevels()
    document.getElementById('vipLevelName').value    = ''
    document.getElementById('vipLevelPercent').value = ''
    showModal('modalVipLevel')
}
function renderVipLevels(){
    const c = document.getElementById('vipLevelsList')
    c.innerHTML = ''
    if(!data.vipLevels.length){ c.innerHTML='<div class="text-zinc-500 text-sm text-center py-3">No hay niveles creados</div>'; return }
    data.vipLevels.forEach(v => {
        const div = document.createElement('div')
        div.className = 'bg-zinc-800 rounded-2xl px-4 py-3 flex justify-between items-center'
        div.innerHTML = '<div><span class="text-amber-400 font-semibold">⭐ '+v.name+'</span><span class="text-zinc-400 text-xs ml-2">'+v.percent+'% descuento</span></div>'
            +'<button onclick="deleteVipLevel('+v.id+')" class="text-red-400 hover:text-red-300 text-sm">🗑️</button>'
        c.appendChild(div)
    })
}
async function addVipLevel(){
    const name    = document.getElementById('vipLevelName').value.trim()
    const percent = parseFloat(document.getElementById('vipLevelPercent').value)
    if(!name) return showToast('Nombre requerido', 'warn')
    if(!percent || percent <= 0 || percent >= 100) return showToast('Porcentaje inválido (1-99)', 'warn')
    const res = await api('vip_levels','create','POST',{ name, percent })
    if(res === null) return
    data.vipLevels.push({ id: res.id, name, percent })
    document.getElementById('vipLevelName').value    = ''
    document.getElementById('vipLevelPercent').value = ''
    renderVipLevels()
    showToast('Nivel VIP creado', 'success')
}
async function deleteVipLevel(id){
    showConfirm('¿Eliminar nivel VIP?', 'Los clientes con este nivel quedarán sin nivel.', async () => {
        const res = await api('vip_levels','delete','DELETE',null,`&id=${id}`)
        if(res === null) return
        data.vipLevels = data.vipLevels.filter(v=>v.id!==id)
        data.customers.forEach(c=>{ if(c.vipLevel==id) c.vipLevel='' })
        renderVipLevels(); renderCustomers()
    })
}

// ─── Mark as received ─────────────────────────────────────────────────────────
async function markPurchaseReceived(id){
    const p = data.purchases.find(x=>x.id===id)
    if(!p || p.inStock) return
    showConfirm('¿Marcar como recibido?', 'El stock se sumará al inventario ahora.', async () => {
        const res = await api('purchases','mark_received','POST',{ id })
        if(res === null) return
        // Actualizar estado local
        p.inStock = true
        const prod = data.products.find(x=>x.id===p.productId)
        if(prod){
            const finalCost = p.unitCostCUP + (p.qty > 0 ? p.propExpCUP/p.qty : 0)
            prod.currentStock   = (prod.currentStock||0) + p.qty
            prod.totalCostValue = (prod.totalCostValue||0) + p.qty * finalCost
            prod.avgCost        = prod.totalCostValue / prod.currentStock
        }
        renderPurchases(); renderProducts(); renderDashboard()
        showToast('Marcado como recibido', 'success')
    }, {label:'Entregado', btnClass:'bg-emerald-600 hover:bg-emerald-500', icon:'📦'})
}
async function markProductReceived(productId){
    const pending = data.purchases.filter(p=>p.productId===productId && !p.inStock)
    if(!pending.length) return
    const prod = data.products.find(x=>x.id===productId)
    showConfirm('¿Marcar todo como recibido?', pending.length+' envío(s) pendientes de '+(prod?.name||'?')+' se sumarán al stock.', async () => {
        for(const p of pending){
            await api('purchases','mark_received','POST',{ id: p.id })
            p.inStock = true
            if(prod){
                const finalCost = p.unitCostCUP + (p.qty > 0 ? p.propExpCUP/p.qty : 0)
                prod.currentStock   = (prod.currentStock||0) + p.qty
                prod.totalCostValue = (prod.totalCostValue||0) + p.qty * finalCost
                prod.avgCost        = prod.totalCostValue / prod.currentStock
            }
        }
        renderPurchases(); renderProducts(); renderDashboard()
        showToast('Todos los envíos marcados como recibidos', 'success')
    }, {label:'Entregado', btnClass:'bg-emerald-600 hover:bg-emerald-500', icon:'📦'})
}

// ─── Pago de deudas ───────────────────────────────────────────────────────────
function showPayDebt(customerId, clientName){
    let cust = null
    if(customerId) cust = data.customers.find(c=>c.id===customerId)
    else if(clientName) cust = data.customers.find(c=>c.name===clientName)
    if(!cust) return showToast('Cliente no encontrado', 'warn')
    document.getElementById('payDebtCustomerId').value  = cust.id
    document.getElementById('payDebtClientName').value  = cust.name
    document.getElementById('payDebtAmount').value      = ''
    document.getElementById('payDebtCurrency').value    = 'CUP'
    document.getElementById('payDebtInfo').innerHTML    =
        '<div class="flex justify-between"><span class="text-zinc-400">Cliente:</span><span class="font-semibold">'+cust.name+'</span></div>'
        +'<div class="flex justify-between"><span class="text-zinc-400">Deuda total:</span><span class="text-amber-400 font-bold">'+fmtInfo(cust.debt,'Deuda')+'</span></div>'
    showModal('modalPayDebt')
}
function payDebtFull(){
    const custId = parseInt(document.getElementById('payDebtCustomerId').value)
    const cust   = data.customers.find(c=>c.id===custId)
    if(!cust) return
    document.getElementById('payDebtAmount').value   = cust.debt.toFixed(2)
    document.getElementById('payDebtCurrency').value = 'CUP'
}
async function saveDebtPayment(){
    const custId = parseInt(document.getElementById('payDebtCustomerId').value)
    const amount = parseFloat(document.getElementById('payDebtAmount').value)
    const cur    = document.getElementById('payDebtCurrency').value
    if(!amount || amount <= 0) return showToast('Monto inválido', 'warn')

    const res = await api('customers','pay_debt','POST',{ customer_id:custId, amount, currency:cur })
    if(res === null) return

    const cust = data.customers.find(c=>c.id===custId)
    if(cust) cust.debt = res.remaining
    hideModal('modalPayDebt')
    renderCustomers(); renderReports(); renderDashboard()
    showConfirm('✅ Pago registrado',
        (cust?.name||'Cliente')+' pagó '+res.paid_cup.toFixed(2)+' CUP. Deuda restante: '+res.remaining.toFixed(2)+' CUP.',
        ()=>{}, {label:'Aceptar', btnClass:'bg-emerald-600 hover:bg-emerald-500', icon:'✅'})
}

// ─── Sección Información ──────────────────────────────────────────────────────
function renderInfo(){
    const c = document.getElementById('infoContent')
    if(!c) return
    const card = (emoji, title, body) =>
        `<div class="bg-zinc-900 rounded-3xl p-6">
            <div class="flex items-center gap-3 mb-4">
                <span class="text-3xl">${emoji}</span>
                <h3 class="text-lg font-bold text-zinc-100">${title}</h3>
            </div>
            <div class="text-sm text-zinc-300 space-y-3">${body}</div>
        </div>`
    const ex   = (label, val) =>
        `<div class="bg-zinc-800 rounded-2xl px-4 py-3 flex justify-between items-center text-xs">
            <span class="text-zinc-400">${label}</span>
            <span class="text-emerald-400 font-mono font-semibold">${val}</span>
        </div>`
    const p    = s => `<p>${s}</p>`
    const note = s => `<p class="text-zinc-500 text-xs">${s}</p>`

    c.innerHTML = [
      card('📦','Costo promedio ponderado',
        p('Cada compra recalcula el costo promedio: <code class="bg-zinc-800 px-1 rounded">(stock_ant × costo_ant + nuevas × nuevo_costo) ÷ stock_total</code>')
        + ex('10 uds a 100 CUP + 5 uds a 130 CUP','(10×100 + 5×130) ÷ 15 = 110 CUP promedio')
      ),
      card('💰','Precio sugerido',
        p('Fórmula: <code class="bg-zinc-800 px-1 rounded">costo_promedio × (1 + margen/100)</code>')
        + ex('Costo 110 CUP · Margen 50%','110 × 1.5 = 165 CUP')
      ),
      card('💱','Conversión de monedas',
        p('Internamente todo es CUP. USD y EUR se convierten con las tasas configuradas.')
        + ex('Compra 1 USD · Tasa 500','→ 500 CUP en inventario')
        + note('Actualiza las tasas en ⚙️ Ajustes para precios precisos.')
      ),
      card('🚚','Compras: En camino vs En almacén',
        p('"En camino": stock no se suma todavía. "En almacén": stock disponible inmediatamente.')
        + ex('20 uds a 100 CUP (en camino)','Stock sin cambio · 2.000 CUP comprometidos')
      ),
      card('💵','Caja y deudas',
        p('Reportes separa: Cobrado en efectivo vs Deuda pendiente vs Total potencial.')
        + note('Las deudas NO están en caja hasta que registres el pago con 💵.')
      ),
      card('👥','Roles de usuario',
        p('<strong class="text-emerald-400">Propietario</strong>: acceso total. '
        + '<strong class="text-sky-400">Gerente</strong>: compras, ventas, clientes, proveedores. '
        + '<strong class="text-zinc-300">Empleado</strong>: solo ventas y consultar stock.')
        + note('Los empleados no ven costos ni reportes financieros.')
      ),
    ].join('')
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function renderAll(){ renderDashboard(); renderProducts(); renderDiscounts(); renderCustomers(); renderPurchases(); renderSales(); renderReports(); renderSettings() }

function renderDashboard(){
    const stockValue  = data.products.reduce((a,p) => a + (p.currentStock||0)*(p.avgCost||0), 0)
    const transitValue = data.purchases.filter(p=>!p.inStock).reduce((a,p)=>a+p.qty*(p.unitCostCUP||0),0)
    const totalDebt   = data.customers.reduce((a,c)=>a+(c.debt||0),0)
    const today       = new Date().toISOString().slice(0,10)
    const todayProfit = data.sales.filter(s=>s.date===today).reduce((a,s)=>{
        const p = data.products.find(pr=>pr.id===s.productId)
        return a + s.qty*((s.finalPriceCUP||0) - (p?p.avgCost:0))
    }, 0)
    document.getElementById('dashStockValue').innerHTML   = fmtInfo(stockValue+transitValue,'Valor stock (incl. en camino)')
    document.getElementById('dashDebt').innerHTML         = fmtInfo(totalDebt,'Deudores')
    document.getElementById('dashTodayProfit').innerHTML  = fmtInfo(todayProfit,'Ganancia hoy')
    document.getElementById('dashMonthSales').textContent = data.sales.length
}

// ─── Productos ────────────────────────────────────────────────────────────────
let productSortKey = 'name', productSortDir = 1
function sortProducts(key){
    if(productSortKey===key) productSortDir *= -1
    else { productSortKey=key; productSortDir=1 }
    renderProducts()
}
function renderProducts(){
    const search = (document.getElementById('productSearch')?.value||'').toLowerCase().trim()
    ;['name','category','currentStock','avgCost'].forEach(k=>{
        const el = document.getElementById('sort-'+k)
        if(el) el.textContent = k===productSortKey ? (productSortDir===1?'▲':'▼') : ''
    })
    const list = data.products
        .filter(p=>!search||p.name.toLowerCase().includes(search))
        .slice().sort((a,b)=>{
            let av=a[productSortKey]??'', bv=b[productSortKey]??''
            if(typeof av==='string') return av.localeCompare(bv)*productSortDir
            return (av-bv)*productSortDir
        })
    const table = document.querySelector('#products table')
    if(!table) return
    const oldTbody = table.querySelector('tbody')
    if(oldTbody) oldTbody.remove()
    const tbody = document.createElement('tbody')
    tbody.id='productsTable'; tbody.className='text-sm'
    table.appendChild(tbody)
    if(!list.length){
        const tr=document.createElement('tr')
        tr.innerHTML='<td colspan="6" class="py-8 text-center text-zinc-500">Sin resultados</td>'
        tbody.appendChild(tr); return
    }
    list.forEach(p=>{
        const transitPurchases = data.purchases.filter(pu=>pu.productId===p.id&&!pu.inStock)
        const transitQty = transitPurchases.reduce((a,pu)=>a+pu.qty,0)
        const stockClass = p.currentStock<=0 ? 'text-red-400 font-semibold'
            : p.currentStock<(p.minStock||0) ? 'text-amber-400' : 'text-emerald-400'
        const truckHtml = transitQty>0
            ? ' <button onclick="showTransitInfo('+p.id+')" class="text-amber-400 hover:text-amber-300 text-base" title="'+transitQty+' en camino">🚚</button>'
            + ' <button onclick="markProductReceived('+p.id+')" class="text-emerald-400 hover:text-emerald-300 text-xs px-1.5 py-0.5 rounded bg-emerald-900/40">✅ Recibido</button>'
            : ''
        // Costos solo para roles financieros
        const costCell = canSeeFinancials()
            ? '<td>'+fmtInfo(p.avgCost||0,'Costo promedio')+'</td>'
            : '<td class="text-zinc-600 text-xs">—</td>'
        const tr=document.createElement('tr')
        tr.className='border-b border-zinc-800 hover:bg-zinc-900'
        tr.innerHTML='<td class="py-4">'+p.name+truckHtml+'</td>'
            +'<td>'+p.category+'</td>'
            +'<td class="'+stockClass+'">'+(p.currentStock||0)+'</td>'
            +costCell
            +'<td>'+(p.minStock||0)+'</td>'
            +'<td><button onclick="editProduct('+p.id+')" class="text-zinc-400 hover:text-zinc-200 text-sm mr-1">✏️</button>'
            +'<button onclick="deleteProduct('+p.id+')" class="text-red-400 hover:text-red-300 text-sm">🗑️</button></td>'
        tbody.appendChild(tr)
    })
}
function canSeeFinancials(){ return ['owner','manager','superadmin'].includes(currentRole) }

function showAddProduct(){ showModal('modalProduct') }
async function saveProduct(){
    const name   = document.getElementById('prodName').value.trim()
    const cat    = document.getElementById('prodCat').value.trim()
    const min    = parseFloat(document.getElementById('prodMin').value)||0
    const markup = (parseFloat(document.getElementById('prodMarkup').value)||50)/100
    if(!name) return showToast('Nombre requerido', 'warn')
    const res = await api('products','create','POST',{ name, category:cat||'General', min_stock:min, markup })
    if(res===null) return
    data.products.push(normalizeProduct(res))
    hideModal('modalProduct'); renderProducts(); renderDashboard()
    showToast('Producto creado', 'success')
}
function deleteProduct(id){
    showConfirm('¿Eliminar producto?','El historial se conservará.', async()=>{
        const res = await api('products','delete','DELETE',null,`&id=${id}`)
        if(res===null) return
        data.products = data.products.filter(p=>p.id!==id)
        renderProducts(); renderDashboard()
        showToast('Producto eliminado', 'success')
    })
}
function showProductsInfo(){
    const total    = data.products.length
    const sinStock = data.products.filter(p=>(p.currentStock||0)<=0).length
    const bajo     = data.products.filter(p=>(p.currentStock||0)>0&&(p.currentStock||0)<(p.minStock||0)).length
    const ok       = total-sinStock-bajo
    const stockVal = data.products.reduce((a,p)=>a+(p.currentStock||0)*(p.avgCost||0),0)
    document.getElementById('productsInfoContent').innerHTML =
        '<div class="bg-zinc-800 rounded-2xl p-4 flex justify-between items-center"><span class="text-zinc-400">Total de productos</span><span class="font-bold text-white text-lg">'+total+'</span></div>'
        +'<div class="bg-zinc-800 rounded-2xl p-4 flex justify-between items-center"><span class="text-zinc-400">✅ Stock correcto</span><span class="font-bold text-emerald-400 text-lg">'+ok+'</span></div>'
        +'<div class="bg-zinc-800 rounded-2xl p-4 flex justify-between items-center"><span class="text-zinc-400">⚠️ Stock bajo</span><span class="font-bold text-amber-400 text-lg">'+bajo+'</span></div>'
        +'<div class="bg-zinc-800 rounded-2xl p-4 flex justify-between items-center"><span class="text-zinc-400">🔴 Sin stock</span><span class="font-bold text-red-400 text-lg">'+sinStock+'</span></div>'
        +(canSeeFinancials() ? '<div class="bg-zinc-800 rounded-2xl p-4 flex justify-between items-center"><span class="text-zinc-400">💰 Valor total stock</span><span class="font-bold text-emerald-300 text-sm">'+fmtInfo(stockVal,'Valor stock')+'</span></div>' : '')
    showModal('modalProductsInfo')
}
function showTransitInfo(productId){
    const prod = data.products.find(p=>p.id===productId)
    if(!prod) return
    const transitPurchases = data.purchases.filter(p=>p.productId===productId&&!p.inStock)
    let html = '<div class="text-sm font-semibold text-zinc-300 mb-3">'+prod.name+'</div>'
    if(!transitPurchases.length){ html+='<div class="text-zinc-500">No hay stock en camino.</div>' }
    else {
        transitPurchases.forEach(p=>{
            const totalCUP = p.qty*(p.unitCostCUP||0)
            html+='<div class="bg-zinc-800 rounded-2xl p-3 space-y-1">'
                +'<div class="flex justify-between"><span class="text-zinc-400">Fecha:</span><span>'+p.date+'</span></div>'
                +'<div class="flex justify-between"><span class="text-zinc-400">Cantidad:</span><span class="text-amber-400 font-semibold">'+p.qty+'</span></div>'
                +'<div class="flex justify-between"><span class="text-zinc-400">Proveedor:</span><span>'+(p.supplier||'-')+'</span></div>'
                +(canSeeFinancials() ? '<div class="flex justify-between"><span class="text-zinc-400">Costo total:</span><span>'+fmtInfo(totalCUP,'Costo en camino')+'</span></div>' : '')
                +'</div>'
        })
        const totalQty = transitPurchases.reduce((a,p)=>a+p.qty,0)
        html+='<div class="mt-2 text-center text-sm text-amber-400 font-semibold">🚚 Total en camino: '+totalQty+' unidades</div>'
    }
    document.getElementById('transitInfoContent').innerHTML = html
    showModal('modalTransitInfo')
}

// ─── Descuentos ───────────────────────────────────────────────────────────────
function showAddDiscount(){
    const sel = document.getElementById('discountProduct')
    sel.innerHTML = '<option value="">Todos los productos</option>'
    data.products.forEach(p=>{ const o=document.createElement('option'); o.value=p.id; o.textContent=p.name; sel.appendChild(o) })
    document.getElementById('discountType').value    = 'mayor'
    document.getElementById('discountPercent').value = ''
    updateDiscountFields()
    showModal('modalDiscount')
}
function updateDiscountFields(){
    const type = document.getElementById('discountType').value
    const f    = document.getElementById('discountFields')
    f.innerHTML = ''
    if(type==='mayor')   f.innerHTML='<div class="mb-3"><label class="text-xs text-zinc-400 block mb-1">Cantidad mínima</label><input id="discountQtyMin" type="number" placeholder="ej: 50" class="block w-full bg-zinc-800 border-0 rounded-2xl px-4 py-3 text-sm" min="1"></div>'
    else if(type==='especial') f.innerHTML='<div class="mb-3"><label class="text-xs text-zinc-400 block mb-1">Día especial</label><input id="discountDay" type="text" placeholder="ej: Viernes" class="block w-full bg-zinc-800 border-0 rounded-2xl px-4 py-3 text-sm"></div>'
    else if(type==='cliente')  f.innerHTML='<div class="mb-3"><label class="text-xs text-zinc-400 block mb-1">Nombre cliente</label><input id="discountClient" type="text" placeholder="Cliente" class="block w-full bg-zinc-800 border-0 rounded-2xl px-4 py-3 text-sm"></div>'
}
async function saveDiscount(){
    const type      = document.getElementById('discountType').value
    const percent   = parseFloat(document.getElementById('discountPercent').value)
    const productId = document.getElementById('discountProduct').value ? parseInt(document.getElementById('discountProduct').value) : null
    if(!percent||percent<=0||percent>=100) return showToast('Porcentaje inválido', 'warn')
    let d = { type, percent, product_id: productId }
    if(type==='mayor')    { d.qty_min=parseInt(document.getElementById('discountQtyMin').value); if(!d.qty_min) return showToast('Cantidad mínima requerida','warn') }
    else if(type==='especial'){ d.day_name=document.getElementById('discountDay').value.trim(); if(!d.day_name) return showToast('Nombre del evento requerido','warn') }
    else if(type==='cliente') { d.client_name=document.getElementById('discountClient').value.trim(); if(!d.client_name) return showToast('Nombre del cliente requerido','warn') }
    const res = await api('discounts','create','POST',d)
    if(res===null) return
    data.discounts.push({ id:res.id, type, percent, productId, qtyMin:d.qty_min||null, dayName:d.day_name||'', clientName:d.client_name||'' })
    hideModal('modalDiscount'); renderDiscounts()
    showToast('Descuento creado', 'success')
}
function renderDiscounts(){
    const c = document.getElementById('discountsContainer')
    c.innerHTML = ''
    if(!data.discounts||!data.discounts.length){ c.innerHTML='<div class="col-span-full text-center py-12 text-zinc-500">No hay descuentos</div>'; return }
    data.discounts.forEach(d=>{
        let desc='',aplica='',emoji=''
        if(d.type==='mayor')   { desc='Al por mayor'; aplica='Cant. >= '+d.qtyMin; emoji='📦' }
        else if(d.type==='especial'){ desc='Día especial'; aplica=d.dayName; emoji='📅' }
        else if(d.type==='cliente') { desc='Cliente'; aplica=d.clientName; emoji='👤' }
        else if(d.type==='general') { desc='General'; aplica='Para todos'; emoji='🎁' }
        const prod = d.productId ? (data.products.find(p=>p.id===d.productId)?.name||'?') : 'Todos'
        const card = document.createElement('div')
        card.className='bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-emerald-600 transition'
        card.innerHTML='<div class="flex justify-between items-start mb-3"><div><div class="text-2xl font-bold text-emerald-400">'+d.percent+'%</div><div class="text-xs text-zinc-500">'+emoji+' '+desc+'</div></div><button onclick="deleteDiscount('+d.id+')" class="text-red-400 hover:text-red-300">🗑️</button></div><div class="space-y-2 text-sm"><div><span class="text-zinc-500">Condición:</span> <span class="text-zinc-200">'+aplica+'</span></div><div><span class="text-zinc-500">Aplica a:</span> <span class="text-emerald-300">'+prod+'</span></div></div>'
        c.appendChild(card)
    })
}
async function deleteDiscount(id){
    showConfirm('¿Eliminar descuento?','Esta acción no se puede deshacer.',async()=>{
        const res = await api('discounts','delete','DELETE',null,`&id=${id}`)
        if(res===null) return
        data.discounts = data.discounts.filter(d=>d.id!==id)
        renderDiscounts()
        showToast('Descuento eliminado', 'success')
    })
}

// ─── Compras ──────────────────────────────────────────────────────────────────
function updateShippingLabel(){
    const inStock = document.getElementById('purchaseInStock').checked
    document.getElementById('purchaseShippingLabel').textContent = inStock
        ? '✅ En almacén — stock disponible de inmediato'
        : '🚚 En camino — aún no llegó al almacén'
}
function showAddPurchase(){
    populateProvidersDatalist()
    document.getElementById('purchaseDate').value    = new Date().toISOString().slice(0,10)
    document.getElementById('purchaseSupp').value    = ''
    document.getElementById('purchaseInStock').checked = false
    updateShippingLabel()
    document.getElementById('purchaseLinesList').innerHTML = '<div class="text-zinc-500 text-sm px-1">Haz clic en "+ Agregar producto"</div>'
    document.getElementById('expensesList').innerHTML = ''
    showModal('modalPurchase')
}
function addPurchaseLine(){
    const list = document.getElementById('purchaseLinesList')
    const ph   = list.querySelector('.text-zinc-500')
    if(ph) ph.remove()
    const lineId = 'line_'+Date.now()+'_'+Math.floor(Math.random()*1000)
    const div  = document.createElement('div')
    div.className='bg-zinc-700 p-2 md:p-3 rounded-xl'; div.dataset.lineId=lineId
    const prods = data.products.map(p=>'<option value="'+p.id+'">'+p.name+'</option>').join('')
    const currs = ['CUP','USD','EUR'].map(c=>'<option value="'+c+'"'+(c===data.baseCurrency?' selected':'')+'>'+c+'</option>').join('')
    div.innerHTML='<div class="grid grid-cols-12 gap-1 items-center">'
        +'<select class="col-span-4 bg-zinc-800 border-0 rounded-lg px-2 py-1 text-xs purchase-prod" onchange="updatePurchaseLine(\''+lineId+'\')"><option value="">Producto…</option>'+prods+'</select>'
        +'<input type="number" placeholder="Cant." class="col-span-2 bg-zinc-800 border-0 rounded-lg px-2 py-1 text-xs purchase-qty" oninput="updatePurchaseLine(\''+lineId+'\')"> '
        +'<input type="number" placeholder="Precio" class="col-span-2 bg-zinc-800 border-0 rounded-lg px-2 py-1 text-xs purchase-unit" oninput="updatePurchaseLine(\''+lineId+'\')"> '
        +'<select class="col-span-2 bg-zinc-800 border-0 rounded-lg px-1 py-1 text-xs purchase-currency" onchange="updatePurchaseLine(\''+lineId+'\')">'+currs+'</select>'
        +'<span class="col-span-1 text-right text-zinc-400 text-xs purchase-subtotal">-</span>'
        +'<button type="button" onclick="this.closest(\'[data-line-id]\').remove()" class="text-zinc-500 hover:text-red-400 text-lg leading-none">×</button>'
        +'</div>'
    list.appendChild(div)
}
function updatePurchaseLine(lineId){
    const div = document.querySelector('[data-line-id="'+lineId+'"]')
    if(!div) return
    const qty  = parseFloat(div.querySelector('.purchase-qty').value)||0
    const unit = parseFloat(div.querySelector('.purchase-unit').value)||0
    const cur  = div.querySelector('.purchase-currency').value
    const sub  = fromCUP(toCUP(qty*unit,cur),data.baseCurrency)
    div.querySelector('.purchase-subtotal').textContent = sub>0 ? sub.toFixed(2)+' '+data.baseCurrency : '-'
}
function addExpenseLine(){
    const div = document.createElement('div')
    div.className='flex gap-2 expense-row'
    const currs = ['CUP','USD','EUR'].map(c=>'<option value="'+c+'"'+(c===data.baseCurrency?' selected':'')+'>'+c+'</option>').join('')
    div.innerHTML='<input placeholder="Descripción" class="flex-1 bg-zinc-800 border-0 rounded-2xl px-3 py-2 text-xs expense-desc">'
        +'<input type="number" placeholder="Monto" class="w-20 bg-zinc-800 border-0 rounded-2xl px-3 py-2 text-xs expense-amount">'
        +'<select class="bg-zinc-800 border-0 rounded-2xl px-2 py-2 text-xs expense-currency">'+currs+'</select>'
        +'<span class="text-zinc-500 cursor-pointer text-lg" onclick="this.parentElement.remove()">×</span>'
    document.getElementById('expensesList').appendChild(div)
}
async function savePurchase(){
    const date     = document.getElementById('purchaseDate').value
    const supplier = document.getElementById('purchaseSupp').value.trim()
    const inStock  = document.getElementById('purchaseInStock').checked
    const lineDivs = document.querySelectorAll('#purchaseLinesList [data-line-id]')
    if(!lineDivs.length) return showToast('Agrega al menos un producto', 'warn')
    const lines = []
    for(const div of lineDivs){
        const productId = parseInt(div.querySelector('.purchase-prod').value)
        const qty       = parseFloat(div.querySelector('.purchase-qty').value)
        const unit      = parseFloat(div.querySelector('.purchase-unit').value)
        const currency  = div.querySelector('.purchase-currency').value
        if(!productId||!qty||!unit){ showToast('Completa todos los campos de cada producto', 'warn'); return }
        lines.push({ product_id:productId, qty, unit_cost:unit, currency })
    }
    const expenses = []
    document.querySelectorAll('#expensesList .expense-row').forEach(row=>{
        const amount = parseFloat(row.querySelector('.expense-amount').value)
        const cur    = row.querySelector('.expense-currency').value
        if(amount>0) expenses.push({ amount, currency:cur })
    })
    const res = await api('purchases','create','POST',{ date, supplier, in_stock:inStock, lines, expenses })
    if(res===null) return
    // Recargar compras y productos desde API para tener estado consistente
    const [newPurchases, newProducts] = await Promise.all([
        api('purchases','list'),
        api('products','list'),
    ])
    if(newPurchases) data.purchases = newPurchases.map(normalizePurchase)
    if(newProducts)  data.products  = newProducts.map(normalizeProduct)
    hideModal('modalPurchase'); renderPurchases(); renderProducts(); renderDashboard()
    showToast('Compra registrada', 'success')
}
function renderPurchases(){
    const tbody = document.getElementById('purchasesTable')
    if(!tbody) return
    tbody.innerHTML=''
    if(!data.purchases.length){
        tbody.innerHTML='<tr><td colspan="7" class="py-8 text-center text-zinc-500">No hay compras registradas</td></tr>'; return
    }
    data.purchases.forEach(p=>{
        const prod    = data.products.find(pr=>pr.id===p.productId)
        const costCUP = p.unitCostCUP||0
        const statusHtml = p.inStock
            ? '<span class="text-xs text-emerald-400">✅ Almacén</span>'
            : '<span class="text-xs text-amber-400">🚚 En camino</span>'
        const tr = document.createElement('tr')
        tr.className='border-b border-zinc-800 hover:bg-zinc-900'
        tr.innerHTML='<td class="py-4">'+p.date+'</td>'
            +'<td>'+(prod?prod.name:p.product_name||'?')+'</td>'
            +'<td>'+p.qty+'</td>'
            +(canSeeFinancials() ? '<td>'+fmtInfo(costCUP,'Costo unitario')+'</td>' : '<td>—</td>')
            +'<td>'+(p.supplier||'-')+'</td>'
            +'<td>'+statusHtml+'</td>'
            +'<td>'
            +(p.inStock?'':'<button onclick="markPurchaseReceived('+p.id+')" class="text-emerald-400 hover:text-emerald-300 text-xs mr-2 px-1.5 py-0.5 rounded bg-emerald-900/40">✅</button>')
            +'<button onclick="showPurchaseInfo('+p.id+')" class="text-zinc-400 hover:text-zinc-200 text-sm mr-2">ℹ️</button>'
            +'<button onclick="deletePurchase('+p.id+')" class="text-red-400 hover:text-red-300 text-sm">🗑️</button>'
            +'</td>'
        tbody.appendChild(tr)
    })
}
function showPurchaseInfo(id){
    const p    = data.purchases.find(x=>x.id===id)
    if(!p) return
    const prod = data.products.find(pr=>pr.id===p.productId)
    const sub  = p.qty*(p.unitCostCUP||0)
    const total = sub+(p.propExpCUP||0)
    document.getElementById('purchaseInfoContent').innerHTML=
        '<div><span class="text-zinc-500">Fecha:</span> <span class="text-zinc-200">'+p.date+'</span></div>'
        +'<div><span class="text-zinc-500">Producto:</span> <span class="text-emerald-300 font-medium">'+(prod?prod.name:p.product_name||'?')+'</span></div>'
        +'<div><span class="text-zinc-500">Cantidad:</span> <span class="text-zinc-200">'+p.qty+'</span></div>'
        +(canSeeFinancials() ?
          '<div><span class="text-zinc-500">Costo unitario:</span> <span class="text-emerald-300">'+fmtInfo(p.unitCostCUP,'Costo unitario')+'</span></div>'
          +'<div><span class="text-zinc-500">Subtotal:</span> <span>'+fmtInfo(sub,'Subtotal')+'</span></div>'
          +'<div><span class="text-zinc-500">Gastos proporcionales:</span> <span>'+fmtInfo(p.propExpCUP,'G.prop')+'</span></div>'
          +'<div class="text-lg font-bold mt-2">Total: <span class="text-emerald-400">'+fmtInfo(total,'Total')+'</span></div>'
        : '')
        +'<div class="text-sm text-zinc-500 mt-2">Proveedor: '+(p.supplier||'-')+'</div>'
    showModal('modalPurchaseInfo')
}
async function deletePurchase(id){
    showConfirm('¿Eliminar compra?','El stock será ajustado.',async()=>{
        const res = await api('purchases','delete','DELETE',null,`&id=${id}`)
        if(res===null) return
        const p    = data.purchases.find(x=>x.id===id)
        const prod = p ? data.products.find(x=>x.id===p.productId) : null
        if(prod && p?.inStock){
            const finalCost = (p.unitCostCUP||0)+(p.qty>0?(p.propExpCUP||0)/p.qty:0)
            prod.currentStock   -= p.qty
            prod.totalCostValue -= p.qty*finalCost
            if(prod.currentStock>0) prod.avgCost=prod.totalCostValue/prod.currentStock
            else { prod.avgCost=0; prod.totalCostValue=0; prod.currentStock=0 }
        }
        data.purchases = data.purchases.filter(x=>x.id!==id)
        renderPurchases(); renderProducts(); renderDashboard()
        showToast('Compra eliminada', 'success')
    })
}

// ─── Ventas ───────────────────────────────────────────────────────────────────
function updateSuggestedPrice(){
    const prodId = parseInt(document.getElementById('saleProd').value)
    const prod   = data.products.find(p=>p.id===prodId)
    const cur    = document.getElementById('saleCurrency').value
    if(prod && prod.avgCost>0){
        const markup   = prod.markup||0.5
        const rawCUP   = prod.avgCost*(1+markup)
        const sugCUP   = roundCash(rawCUP)
        const sugLabel = cashRoundingStep>1
            ? fmtInfo(sugCUP,'Precio sugerido')+' <span class="text-zinc-600 text-xs">(redondeado de '+rawCUP.toFixed(2)+')</span>'
            : fmtInfo(sugCUP,'Precio sugerido')
        document.getElementById('suggestedPriceDisplay').innerHTML = sugLabel
        document.getElementById('salePrice').value = fromCUP(sugCUP,cur).toFixed(2)
    } else {
        document.getElementById('suggestedPriceDisplay').textContent='-'
        document.getElementById('salePrice').value=''
    }
}
let _suggHighlight = -1
function filterClientSuggestions(val){
    const ul = document.getElementById('clientSuggestions')
    const q  = val.trim().toLowerCase()
    if(!q){ ul.classList.add('hidden'); return }
    const matches = (data.customers||[]).filter(c=>c.name.toLowerCase().includes(q)).slice(0,8)
    if(!matches.length){ ul.classList.add('hidden'); return }
    ul.innerHTML=''; _suggHighlight=-1
    matches.forEach(c=>{
        const li=document.createElement('li')
        li.className='px-4 py-2 cursor-pointer hover:bg-zinc-700 text-sm flex justify-between items-center'
        const badge = c.vip_name ? '<span class="text-xs text-amber-400">⭐ '+c.vip_name+'</span>' : ''
        li.innerHTML='<span>'+c.name+'</span>'+badge
        li.onmousedown=()=>{ document.getElementById('saleClient').value=c.name; ul.classList.add('hidden'); updateSuggestedPrice() }
        ul.appendChild(li)
    })
    ul.classList.remove('hidden')
}
function handleClientKey(e){
    const ul=document.getElementById('clientSuggestions')
    const items=ul.querySelectorAll('li')
    if(ul.classList.contains('hidden')||!items.length) return
    if(e.key==='ArrowDown'){e.preventDefault();_suggHighlight=Math.min(_suggHighlight+1,items.length-1);items.forEach((li,i)=>li.classList.toggle('bg-zinc-700',i===_suggHighlight))}
    else if(e.key==='ArrowUp'){e.preventDefault();_suggHighlight=Math.max(_suggHighlight-1,0);items.forEach((li,i)=>li.classList.toggle('bg-zinc-700',i===_suggHighlight))}
    else if(e.key==='Enter'&&_suggHighlight>=0){e.preventDefault();items[_suggHighlight].onmousedown()}
    else if(e.key==='Escape'){ul.classList.add('hidden')}
}
function hideSuggestions(){ const ul=document.getElementById('clientSuggestions'); if(ul) ul.classList.add('hidden') }

function showQuickSale(){
    const sel=document.getElementById('saleProd')
    sel.innerHTML='<option value="">Selecciona producto</option>'
    data.products.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name+' (Stock: '+(p.currentStock||0)+')';sel.appendChild(o)})
    document.getElementById('saleQty').value=''; document.getElementById('salePrice').value=''
    document.getElementById('saleClient').value=''; document.getElementById('saleCredit').checked=false
    document.getElementById('suggestedPriceDisplay').textContent='-'
    document.getElementById('saleCurrency').value=data.baseCurrency
    showModal('modalSale')
}
function getApplicableDiscount(qty, clientName, productId){
    if(!data.discounts) return 0
    let max=0
    data.discounts.forEach(d=>{
        const ok = !d.productId||d.productId===productId
        if(!ok) return
        if(d.type==='mayor'&&qty>=d.qtyMin)                                          max=Math.max(max,d.percent)
        else if(d.type==='cliente'&&clientName&&clientName.toLowerCase().includes((d.clientName||'').toLowerCase())) max=Math.max(max,d.percent)
        else if(d.type==='general')                                                  max=Math.max(max,d.percent)
    })
    if(clientName&&data.customers&&data.vipLevels){
        const cust=data.customers.find(c=>c.name.toLowerCase()===clientName.toLowerCase())
        if(cust&&cust.vipLevel){
            const level=data.vipLevels.find(v=>v.id==cust.vipLevel)
            if(level) max=Math.max(max,level.percent)
        }
    }
    return max/100
}
async function saveSale(){
    const productId = parseInt(document.getElementById('saleProd').value)
    const qty       = parseFloat(document.getElementById('saleQty').value)
    const price     = parseFloat(document.getElementById('salePrice').value)
    const cur       = document.getElementById('saleCurrency').value
    const client    = document.getElementById('saleClient').value.trim()
    const credit    = document.getElementById('saleCredit').checked
    if(!productId||!qty||!price) return showToast('Campos requeridos', 'warn')
    const prod = data.products.find(p=>p.id===productId)
    if(!prod||(prod.currentStock||0)<qty) return showToast('Stock insuficiente', 'warn')

    const res = await api('sales','create','POST',{
        product_id: productId, qty, price, currency: cur,
        client: client||'-', on_credit: credit
    })
    if(res===null) return

    // Actualizar estado local
    const unitCUP = toCUP(price, cur)
    const discPct = getApplicableDiscount(qty, client, productId)
    const finalCUP = unitCUP*(1-discPct)
    prod.currentStock -= qty
    data.sales.push({
        id: res.id, productId, date: new Date().toISOString().slice(0,10),
        qty, unitSellPriceCUP: unitCUP, finalPriceCUP: finalCUP,
        discountPercent: discPct, currencyOriginal: cur,
        client: client||'-', onCredit: credit
    })
    if(client){
        let cust = data.customers.find(c=>c.name===client)
        if(!cust){ cust={id:Date.now(),name:client,debt:0,vipLevel:'',vip_name:'',vip_percent:0}; data.customers.push(cust) }
        if(credit) cust.debt=(cust.debt||0)+qty*finalCUP
    }
    hideModal('modalSale'); renderSales(); renderCustomers(); renderDashboard()
    showToast('Venta registrada', 'success')
}
function renderSales(){
    const tbody=document.getElementById('salesTable')
    tbody.innerHTML=''
    data.sales.forEach(s=>{
        const prod=data.products.find(pr=>pr.id===s.productId)
        const priceCUP=s.finalPriceCUP||s.unitSellPriceCUP||0
        const hasDiscount=s.discountPercent&&s.discountPercent>0
        const priceHtml = canSeeFinancials()
            ? (hasDiscount
                ? '<span class="text-emerald-400">'+fmtInfo(priceCUP,'Precio final')+'</span> <span class="text-xs text-zinc-500">(-'+(s.discountPercent*100).toFixed(0)+'%)</span>'
                : fmtInfo(priceCUP,'Precio venta'))
            : priceCUP.toFixed(2)+' CUP'
        const tr=document.createElement('tr')
        tr.className='border-b border-zinc-800 hover:bg-zinc-900'
        const payBtn=(s.onCredit&&s.client&&s.client!=='-')
            ? '<button onclick="showPayDebt(null,\''+s.client+'\')" class="text-emerald-400 hover:text-emerald-300 text-xs mr-1 px-1.5 py-0.5 rounded bg-emerald-900/40">💵</button>'
            : ''
        const employeeBadge = s.employee_name
            ? '<span class="text-xs text-zinc-500 ml-1">('+s.employee_name+')</span>' : ''
        tr.innerHTML='<td class="py-4">'+s.date+'</td><td>'+(prod?prod.name:s.product_name||'?')+'</td><td>'+s.qty+'</td><td>'+priceHtml+'</td><td>'+(s.onCredit?'💳 ':'')+s.client+employeeBadge+'</td><td>'+payBtn+'<button onclick="deleteSale('+s.id+')" class="text-red-400 hover:text-red-300 text-sm">🗑️</button></td>'
        tbody.appendChild(tr)
    })
}
async function deleteSale(id){
    showConfirm('¿Eliminar venta?','El stock será devuelto al inventario.',async()=>{
        const res=await api('sales','delete','DELETE',null,`&id=${id}`)
        if(res===null) return
        const s=data.sales.find(x=>x.id===id)
        const prod=s?data.products.find(p=>p.id===s.productId):null
        if(prod&&s) prod.currentStock+=s.qty
        if(s?.onCredit&&s.client&&s.client!=='-'){
            const cust=data.customers.find(c=>c.name===s.client)
            if(cust){ cust.debt-=s.qty*(s.finalPriceCUP||0); if(cust.debt<0) cust.debt=0 }
        }
        data.sales=data.sales.filter(x=>x.id!==id)
        renderSales(); renderDashboard()
        showToast('Venta eliminada', 'success')
    })
}

// ─── Reportes ─────────────────────────────────────────────────────────────────
function renderReports(){
    let revenue=0,cost=0,cashSales=0
    data.sales.forEach(s=>{
        const prod=data.products.find(p=>p.id===s.productId)
        const priceCUP=s.finalPriceCUP||0
        revenue+=s.qty*priceCUP; cost+=s.qty*(prod?prod.avgCost:0)
        if(!s.onCredit) cashSales+=s.qty*priceCUP
    })
    const debtPaid=(data.cashPayments||[]).reduce((a,p)=>a+p.amountCUP,0)
    const cash=cashSales+debtPaid
    const pending=data.customers.reduce((a,c)=>a+(c.debt||0),0)
    document.getElementById('totalProfit').innerHTML      = fmtInfo(revenue-cost,'Ganancia neta')
    document.getElementById('totalCOGS').innerHTML        = fmtInfo(cost,'Costo mercancía vendida')
    document.getElementById('totalCash').innerHTML        = fmtInfo(cash,'Cobrado en efectivo')
    document.getElementById('totalPendingDebt').innerHTML = fmtInfo(pending,'Deuda pendiente')
    document.getElementById('totalIfAllPaid').innerHTML   = fmtInfo(cash+pending,'Total si todo se cobra')
    const debtors=data.customers.filter(c=>(c.debt||0)>0)
    const list=document.getElementById('debtBreakdownList')
    if(debtors.length){
        list.innerHTML=debtors.map(c=>'<div class="flex justify-between text-sm"><span class="text-zinc-300">'+c.name+'</span><span class="text-amber-400">'+fmtInfo(c.debt,"Deuda de "+c.name)+'</span></div>').join('')
    } else {
        list.innerHTML='<div class="text-zinc-500 text-sm">Sin deudas pendientes ✅</div>'
    }
}
function toggleDebtBreakdown(){
    document.getElementById('debtBreakdown').classList.toggle('hidden')
}

// ─── Ajustes ──────────────────────────────────────────────────────────────────
function renderSettings(){
    document.getElementById('baseCurrencySelect').value      = data.baseCurrency
    document.getElementById('rateUSD').value                 = data.exchangeRates.USD
    document.getElementById('rateEUR').value                 = data.exchangeRates.EUR
    document.getElementById('cashRoundingStepInput').value   = cashRoundingStep
    document.getElementById('cashRoundingDirInput').value    = cashRoundingDir
}
async function updateBaseCurrency(){
    data.baseCurrency=document.getElementById('baseCurrencySelect').value
    await saveSettings(); renderAll()
}
async function saveRates(){
    const usd=parseFloat(document.getElementById('rateUSD').value)
    const eur=parseFloat(document.getElementById('rateEUR').value)
    if(usd>0) data.exchangeRates.USD=usd
    if(eur>0) data.exchangeRates.EUR=eur
    await saveSettings(); renderAll()
    showToast('Tasas guardadas', 'success')
}
async function saveCashRoundingStep(){
    cashRoundingStep=Number(document.getElementById('cashRoundingStepInput').value)||1
    await saveSettings(); renderAll()
}
async function saveCashRoundingDir(){
    cashRoundingDir=document.getElementById('cashRoundingDirInput').value||'round'
    await saveSettings(); renderAll()
}
async function saveSettings(){
    await api('settings','update','POST',{
        base_currency:       data.baseCurrency,
        rate_usd:            data.exchangeRates.USD,
        rate_eur:            data.exchangeRates.EUR,
        cash_rounding_step:  cashRoundingStep,
        cash_rounding_dir:   cashRoundingDir,
    })
}

// ─── Proveedores ──────────────────────────────────────────────────────────────
function renderProviders(){
    const tbody=document.getElementById('providersTable')
    if(!tbody) return
    tbody.innerHTML=''
    if(!data.providers.length){
        tbody.innerHTML='<tr><td colspan="6" class="py-8 text-center text-zinc-500">No hay proveedores registrados</td></tr>'; return
    }
    data.providers.forEach(p=>{
        const tr=document.createElement('tr')
        tr.className='border-b border-zinc-800 hover:bg-zinc-900'
        tr.innerHTML='<td class="py-4 font-medium">'+p.name+'</td>'
            +'<td>'+(p.contact||'-')+'</td>'+'<td>'+(p.phone||'-')+'</td>'
            +'<td>'+(p.email||'-')+'</td>'+'<td>'+(p.location||'-')+'</td>'
            +'<td class="flex gap-2 py-4">'
            +'<button onclick="showEditProvider('+p.id+')" class="text-zinc-400 hover:text-zinc-200 text-sm">✏️</button>'
            +'<button onclick="deleteProvider('+p.id+')" class="text-red-400 hover:text-red-300 text-sm">🗑️</button>'
            +'</td>'
        tbody.appendChild(tr)
    })
}
function showAddProvider(){
    ['providerName','providerContact','providerPhone','providerEmail','providerLocation','providerNotes'].forEach(id=>{ document.getElementById(id).value='' })
    document.getElementById('providerId').value=''
    showModal('modalProvider')
}
function showEditProvider(id){
    const p=data.providers.find(x=>x.id===id); if(!p) return
    document.getElementById('providerName').value     = p.name
    document.getElementById('providerContact').value  = p.contact||''
    document.getElementById('providerPhone').value    = p.phone||''
    document.getElementById('providerEmail').value    = p.email||''
    document.getElementById('providerLocation').value = p.location||''
    document.getElementById('providerNotes').value    = p.notes||''
    document.getElementById('providerId').value       = p.id
    showModal('modalProvider')
}
async function saveProvider(){
    const name    =document.getElementById('providerName').value.trim()
    const contact =document.getElementById('providerContact').value.trim()
    const phone   =document.getElementById('providerPhone').value.trim()
    const email   =document.getElementById('providerEmail').value.trim()
    const location=document.getElementById('providerLocation').value.trim()
    const notes   =document.getElementById('providerNotes').value.trim()
    const idVal   =document.getElementById('providerId').value
    if(!name) return showToast('Nombre requerido','warn')
    const body={name,contact,phone,email,location,notes}
    if(idVal){
        const res=await api('providers','update','POST',{...body,id:parseInt(idVal)})
        if(res===null) return
        const p=data.providers.find(x=>x.id===parseInt(idVal))
        if(p) Object.assign(p,body)
    } else {
        const res=await api('providers','create','POST',body)
        if(res===null) return
        data.providers.push(res)
    }
    hideModal('modalProvider'); renderProviders()
    showToast('Proveedor guardado','success')
}
async function deleteProvider(id){
    const p=data.providers.find(x=>x.id===id); if(!p) return
    showConfirm('¿Eliminar proveedor?','"'+p.name+'" será eliminado.',async()=>{
        const res=await api('providers','delete','DELETE',null,`&id=${id}`)
        if(res===null) return
        data.providers=data.providers.filter(x=>x.id!==id)
        renderProviders()
        showToast('Proveedor eliminado','success')
    })
}
function populateProvidersDatalist(){
    const list=document.getElementById('providersList'); if(!list) return
    list.innerHTML=''
    data.providers.forEach(p=>{ const o=document.createElement('option'); o.value=p.name; list.appendChild(o) })
}

// ─── Export / Import ──────────────────────────────────────────────────────────
function exportData(){
    const a=document.createElement('a')
    a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}))
    a.download='vexto_backup_'+currentUser+'_'+new Date().toISOString().slice(0,10)+'.json'
    a.click()
    showToast('Backup descargado','success')
}

// ─── Chart ────────────────────────────────────────────────────────────────────
let currentMonthChart=null
function renderCurrentMonthChart(){
    const canvas=document.getElementById('currentMonthChart'); if(!canvas) return
    const now=new Date(), month=now.getMonth(), year=now.getFullYear()
    const daysInMonth=new Date(year,month+1,0).getDate()
    const sales=Array(daysInMonth).fill(0), purchases=Array(daysInMonth).fill(0)
    data.sales.forEach(s=>{
        const d=new Date(s.date)
        if(d.getMonth()===month&&d.getFullYear()===year) sales[d.getDate()-1]+=(s.qty*s.finalPriceCUP)||0
    })
    data.purchases.forEach(p=>{
        const d=new Date(p.date)
        if(d.getMonth()===month&&d.getFullYear()===year) purchases[d.getDate()-1]+=(p.qty*p.unitCostCUP)||0
    })
    if(currentMonthChart) currentMonthChart.destroy()
    currentMonthChart=new Chart(canvas,{
        type:'bar',
        data:{labels:Array.from({length:daysInMonth},(_,i)=>(i+1).toString()),
              datasets:[{label:'Ventas',data:sales},{label:'Compras',data:purchases}]},
        options:{responsive:true,
            plugins:{legend:{labels:{color:'#fff'}}},
            scales:{x:{ticks:{color:'#aaa'}},y:{ticks:{color:'#aaa'}}}}
    })
}

// ─── Reset DB (ahora borra en servidor) ───────────────────────────────────────
function showResetDatabaseConfirm(){
    showConfirm('Eliminar base de datos','Se borrarán TODOS los datos permanentemente.',
        confirmResetDatabase,
        {label:'Eliminar todo',btnClass:'bg-red-600 hover:bg-red-500',icon:'⚠️'}
    )
}
async function confirmResetDatabase(){
    // En la arquitectura server-side no borramos desde el cliente.
    // Esta operación la hace el superadmin desde el panel de admin.
    showConfirm('Acción no disponible',
        'El borrado de datos se realiza desde el panel de administración. Contacta al superadmin.',
        ()=>{},{label:'Entendido',btnClass:'bg-zinc-700 hover:bg-zinc-600',icon:'ℹ️'}
    )
}

// ─── Auto-login con token guardado ────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    if(!loadToken()) return  // no hay token, mostrar login

    // Verificar token válido
    const res = await apiAuth('me','GET')
    if(!res || !res.ok){
        clearToken()
        return  // token expirado, mostrar login
    }

    currentUser     = res.data.display_name
    currentUserId   = res.data.user_id
    currentRole     = res.data.role
    currentTenantId = res.data.tenant_id

    document.getElementById('loginPage').classList.add('hidden')
    document.getElementById('app').classList.remove('hidden')
    document.getElementById('currentUser').textContent = currentUser
    document.getElementById('currentRoleBadge').textContent = roleLabel(currentRole)

    // Mostrar aviso si la licencia vence pronto
    const lic = res.data.license
    if(lic && parseInt(lic.days_left) <= 7 && parseInt(lic.days_left) >= 0){
        showToast(`⚠️ Tu licencia vence en ${lic.days_left} día(s)`, 'warn')
    }

    applyRoleUI()
    await loadAllData()
    renderAll()
})

document.addEventListener('click', function(e){
    if(e.target.classList.contains('currency-info-btn')){
        const cup   = parseFloat(e.target.dataset.value)
        const label = e.target.dataset.label
        showCurrencyInfo(cup, label)
    }
})
