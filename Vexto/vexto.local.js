// ─── Vexto - Modo Local ─────────────────────────────────────────────────────────
// Este archivo contiene el código base que funciona sin conexión (localStorage)
// Para modo online, usa vexto.online.js

// ─── Estado global ────────────────────────────────────────────────────────────
let APP_VERSION = '1.1.8'  // Versión de la aplicación
let cashRoundingStep = 1    // múltiplo mínimo de billete
let cashRoundingDir  = 'round'  // 'ceil' | 'floor' | 'round'
let currentUser = ''
let data = { products:[], purchases:[], sales:[], customers:[], providers:[], discounts:[], audit:[], vipLevels:[], exchangeRates:{USD:500,EUR:650}, baseCurrency:'CUP', businessInfo:{} }
let nextId = 1

// ─── Hide Initial Loader ─────────────────────────────────────────────────────────
window.addEventListener('load', function() {
    setTimeout(function() {
        const loader = document.getElementById('initialLoader')
        if(loader) {
            loader.style.opacity = '0'
            loader.style.pointerEvents = 'none'
            setTimeout(function() {
                loader.style.display = 'none'
            }, 500)
        }
    }, 1200)  // Wait for loader animation to complete
})

// ─── Toast Notifications ─────────────────────────────────────────────────────────
function showToast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toastContainer')
    if (!container) return
    
    const toast = document.createElement('div')
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    }
    const bgColors = {
        success: 'bg-emerald-900/90 border-emerald-600',
        error: 'bg-red-900/90 border-red-600',
        warning: 'bg-amber-900/90 border-amber-600',
        info: 'bg-sky-900/90 border-sky-600'
    }
    
    toast.className = `${bgColors[type]} border rounded-xl px-4 py-3 shadow-lg flex items-center gap-3 min-w-[280px] max-w-sm animate-slideIn text-sm`
    toast.innerHTML = `
        <span class="text-xl">${icons[type]}</span>
        <span class="text-white flex-1">${message}</span>
        <button onclick="this.parentElement.remove()" class="text-zinc-400 hover:text-white text-lg leading-none">&times;</button>
    `
    
    container.appendChild(toast)
    
    setTimeout(() => {
        toast.style.opacity = '0'
        toast.style.transform = 'translateX(100%)'
        toast.style.transition = 'all 0.3s ease'
        setTimeout(() => toast.remove(), 300)
    }, duration)
}

// Replace alert with toast
function notify(msg, type = 'success') {
    showToast(msg, type)
}

// ─── Loading Spinner ───────────────────────────────────────────────────────────
function showLoading() {
    const spinner = document.getElementById('loadingSpinner')
    if(spinner) spinner.classList.remove('hidden')
}

function hideLoading() {
    const spinner = document.getElementById('loadingSpinner')
    if(spinner) spinner.classList.add('hidden')
}

// ─── Notifications Panel ─────────────────────────────────────────────────────────
function showNotificationsPanel() {
    const lowStockDiv = document.getElementById('notificationsLowStock')
    const zeroStockDiv = document.getElementById('notificationsZeroStock')
    const debtorsDiv = document.getElementById('notificationsDebtors')
    
    // Low stock products (below minimum but not zero)
    const lowStockProducts = data.products.filter(p => 
        (p.currentStock||0) > 0 && (p.currentStock||0) < (p.minStock||0)
    )
    
    // Zero stock products
    const zeroStockProducts = data.products.filter(p => (p.currentStock||0) <= 0)
    
    // Debtors with debt older than 1 week
    const today = new Date()
    const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    
    const oldDebtors = (data.customers || []).filter(c => {
        if(!c.debt || c.debt <= 0) return false
        // Check if there's any sale on credit older than 1 week
        const clientSales = data.sales.filter(s => 
            s.client === c.name && 
            s.onCredit && 
            new Date(s.date) < oneWeekAgo
        )
        return clientSales.length > 0
    })
    
    // Render low stock
    if(lowStockProducts.length === 0) {
        lowStockDiv.innerHTML = '<div class="text-zinc-500 text-sm">No hay productos con stock bajo</div>'
    } else {
        lowStockDiv.innerHTML = lowStockProducts.map(p => `
            <div class="bg-zinc-800 rounded-xl p-3 flex justify-between items-center">
                <span class="text-white">${p.name}</span>
                <span class="text-amber-400 font-bold">${p.currentStock} / ${p.minStock}</span>
            </div>
        `).join('')
    }
    
    // Render zero stock
    if(zeroStockProducts.length === 0) {
        zeroStockDiv.innerHTML = '<div class="text-zinc-500 text-sm">No hay productos sin stock</div>'
    } else {
        zeroStockDiv.innerHTML = zeroStockProducts.map(p => `
            <div class="bg-zinc-800 rounded-xl p-3 flex justify-between items-center">
                <span class="text-white">${p.name}</span>
                <span class="text-red-400 font-bold">0</span>
            </div>
        `).join('')
    }
    
    // Render debtors
    if(oldDebtors.length === 0) {
        debtorsDiv.innerHTML = '<div class="text-zinc-500 text-sm">No hay deudores con más de 1 semana</div>'
    } else {
        debtorsDiv.innerHTML = oldDebtors.map(c => `
            <div class="bg-zinc-800 rounded-xl p-3 flex justify-between items-center cursor-pointer hover:bg-zinc-700" onclick="showPayDebt(${c.id})">
                <span class="text-white">${c.name}</span>
                <span class="text-amber-400 font-bold">${fmtInfo(c.debt,'Deuda')}</span>
            </div>
        `).join('')
    }
    
    showModal('notificationsPanel')
}

function hideNotificationsPanel() {
    hideModal('notificationsPanel')
}

// ─── Persistencia ─────────────────────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
    // Close modals with Escape
    if(e.key === 'Escape') {
        const visibleModals = document.querySelectorAll('#toastContainer ~ .fixed:not(.hidden)')
        if(visibleModals.length === 0) return
        for(let modal of visibleModals) {
            if(!modal.id || modal.id === 'toastContainer') continue
            // Find the close button or hide directly
            const closeBtn = modal.querySelector('button[onclick*="hideModal"]') || modal.querySelector('button[class*="text-red"]')
            if(closeBtn && closeBtn.onclick) {
                closeBtn.onclick()
            } else {
                modal.classList.add('hidden')
            }
            e.preventDefault()
            return
        }
    }
    
    // Ctrl+N - New product
    if(e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        const app = document.getElementById('app')
        if(app && !app.classList.contains('hidden')) {
            showSection('products')
            showAddProduct()
        }
    }
    
    // Ctrl+S - Save (works in modals)
    if(e.ctrlKey && e.key === 's') {
        e.preventDefault()
        // Trigger save if in a modal - try common save buttons
        const saveBtn = document.querySelector('.fixed:not(.hidden) button.bg-emerald-600:not([onclick*="hide"])')
        if(saveBtn && saveBtn.onclick) {
            saveBtn.onclick()
        }
    }
    
    // Ctrl+F - Focus search (in sections)
    if(e.ctrlKey && e.key === 'f') {
        e.preventDefault()
        const activeSection = document.querySelector('.section.active')
        if(activeSection) {
            const searchInput = activeSection.querySelector('input[placeholder*="Buscar"]') || activeSection.querySelector('input[id*="Search"]')
            if(searchInput) {
                searchInput.focus()
                searchInput.select()
            }
        }
    }
})

function saveData(){
    if(currentUser) localStorage.setItem('tienda_' + currentUser, JSON.stringify(data))
}
function loadData(){
    if(!currentUser) return
    const saved = localStorage.getItem('tienda_' + currentUser)
    if(!saved) return
    const d = JSON.parse(saved)
    // Migración automática v1→v2 (v1 tenía exchangeRate, no exchangeRates)
    if(!d.exchangeRates){
        const oldRate = parseFloat(d.exchangeRate) || 500
        d.exchangeRates = { USD: oldRate, EUR: 650 }
        d.baseCurrency  = 'CUP'
        ;(d.products  || []).forEach(p => { p.avgCost = (p.avgCost||0)*oldRate; p.totalCostValue = (p.totalCostValue||0)*oldRate })
        ;(d.purchases || []).forEach(p => { p.unitCostCUP = (p.unitCost||0)*oldRate; p.propExpCUP = (p.proportionalExpense||0)*oldRate; p.totalExpCUP = (p.totalExpenses||0)*oldRate })
        ;(d.sales     || []).forEach(s => { s.unitSellPriceCUP = (s.unitSellPrice||0)*oldRate; s.finalPriceCUP = ((s.finalPrice||s.unitSellPrice)||0)*oldRate })
        ;(d.customers || []).forEach(c => { c.debt = (c.debt||0)*oldRate })
    }
    // Garantías mínimas
    if(!d.exchangeRates.USD || d.exchangeRates.USD <= 0) d.exchangeRates.USD = 500
    if(!d.exchangeRates.EUR || d.exchangeRates.EUR <= 0) d.exchangeRates.EUR = 650
    if(!d.baseCurrency) d.baseCurrency = 'CUP'
    if(!d.audit)     d.audit     = []
    if(!d.discounts) d.discounts = []
    if(!d.customers) d.customers = []
    if(!d.vipLevels) d.vipLevels = []
    if(!d.cashPayments) d.cashPayments = []
    if(!d.providers) d.providers = [] // New in v2.1
    if(!d.businessInfo) d.businessInfo = {} // New in v2.2
    data = d
    saveData()
    nextId = Math.max(1, ...[...data.products,...data.purchases,...data.sales,...data.customers,...data.providers,...data.discounts].map(x=>x.id||0)) + 1
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
    if(step <= 1) return value  // sin redondeo
    const dir = cashRoundingDir || 'round'
    if(dir === 'ceil')  return Math.ceil(value  / step) * step
    if(dir === 'floor') return Math.floor(value / step) * step
    return Math.round(value / step) * step
}

// ─── Formato CUP ───────────────────────────────
function fmtCUP(amount){
    amount = Number(amount) || 0
    return amount.toFixed(2) + ' CUP'
}

// ─── Formato según moneda base ───────────────────────────────
function fmtBaseCurrency(amount){
    amount = Number(amount) || 0
    const currency = data.baseCurrency || 'CUP'
    if(currency === 'CUP'){
        return amount.toFixed(2) + ' CUP'
    } else {
        const converted = fromCUP(amount, currency)
        return converted.toFixed(2) + ' ' + currency
    }
}

// ─── Formato número simple ───────────────────────────────
function fmtNum(num){
    num = Number(num) || 0
    return num.toLocaleString('es-ES', {minimumFractionDigits: 0, maximumFractionDigits: 0})
}

// ─── Formato: muestra en moneda base + botón ℹ️ ───────────────────────────────
function fmtInfo(cup, label){
    cup = Number(cup) || 0
    const safeLabel = (label || 'Detalle').replace(/"/g, '"')

    return fmtBaseCurrency(cup) + 
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
            <span>CUP</span>
            <span class="font-bold text-emerald-400">${c}</span>
        </div>
        <div class="bg-zinc-800 rounded-2xl p-4 flex justify-between">
            <span>USD</span>
            <span class="font-bold text-emerald-400">${u}</span>
        </div>
        <div class="bg-zinc-800 rounded-2xl p-4 flex justify-between">
            <span>EUR</span>
            <span class="font-bold text-emerald-400">${e}</span>
        </div>
    `

    const modal = document.getElementById('modalCurrencyInfo')
    const box   = document.getElementById('modalCurrencyInfoBox')

    _modalZBase += 10
    modal.style.zIndex = _modalZBase
    modal.classList.remove('hidden')

    setTimeout(() => {
        modal.classList.remove('opacity-0')
        box.classList.remove('scale-95')
    }, 10)
}

function hideCurrencyInfo(){
    const modal = document.getElementById('modalCurrencyInfo')
    const box   = document.getElementById('modalCurrencyInfoBox')

    modal.classList.add('opacity-0')
    box.classList.add('scale-95')

    setTimeout(() => {
        modal.classList.add('hidden')
    }, 300)
}

// ─── Modal helpers ─────────────────────────────────────────────────────────────
let _modalZBase = 1000
function showModal(id){
    const modal = document.getElementById(id)
    if(!modal) return
    _modalZBase += 10
    modal.style.zIndex = _modalZBase
    modal.classList.remove('hidden')
    modal.classList.remove('opacity-0')
    
    // Focus first input
    const firstInput = modal.querySelector('input:not([type="hidden"]):not([disabled])')
    if(firstInput) setTimeout(() => firstInput.focus(), 100)
}
function hideModal(id){
    const modal = document.getElementById(id)
    if(modal) {
        modal.classList.add('hidden')
    }
}

// ─── Confirm dialog ──────────────────────────────────────────────────────────
function showConfirm(title, message, onConfirm, options = {}) {
    const modal = document.getElementById('modalConfirm')
    const titleEl = modal.querySelector('h3')
    const messageEl = modal.querySelector('.text-zinc-300')
    const confirmBtn = modal.querySelector('.bg-red-600') || modal.querySelector('button:first-of-type')
    
    titleEl.textContent = title
    messageEl.innerHTML = message
    
    // Customize button if options provided
    if(options.label) {
        confirmBtn.textContent = options.label
        confirmBtn.className = options.btnClass || 'bg-emerald-600 hover:bg-emerald-500'
        confirmBtn.innerHTML = (options.icon || '✅') + ' ' + options.label
    }
    
    // Store original onclick
    const originalOnclick = confirmBtn.onclick
    
    confirmBtn.onclick = function() {
        onConfirm()
        // Reset button
        confirmBtn.onclick = originalOnclick
    }
    
    showModal('modalConfirm')
}

// ─── Render All ────────────────────────────────────────────────────────────────
function renderAll(){
    renderDashboard()
    renderProducts()
    renderDiscounts()
    renderCustomers()
    renderProviders()
    renderPurchases()
    renderSales()
    renderReports()
    renderSettings()
    renderInfo()
    
    // Update low stock badge
    const lowStockCount = data.products.filter(p => (p.currentStock||0) < (p.minStock||0)).length
    const badge = document.getElementById('lowStockBadge')
    const countEl = document.getElementById('lowStockCount')
    if(badge && countEl){
        if(lowStockCount > 0){
            badge.classList.remove('hidden')
            countEl.textContent = lowStockCount
        } else {
            badge.classList.add('hidden')
        }
    }
}

// ─── Sections ─────────────────────────────────────────────────────────────────
function showSection(id){
    // Hide all sections
    document.querySelectorAll('.section').forEach(el => {
        el.classList.remove('active')
    })
    
    // Show selected section
    const section = document.getElementById(id)
    if(section){
        section.classList.add('active')
    }
    
    // Close mobile menu
    document.querySelector('.app-nav')?.classList.remove('mobile-open')
}

// ─── Login Local ─────────────────────────────────────────────────────────────
function handleLoginLocal() {
    const user = document.getElementById('loginUser').value.trim()
    if(!user) return alert('Ingresa tu nombre')
    
    // Ensure we have a clean data object for the new user
    currentUser = user
    
    const isNew = !localStorage.getItem('tienda_' + user)
    if(isNew){
        // Create new user data from default
        data = { products:[], purchases:[], sales:[], customers:[], providers:[], discounts:[], audit:[], vipLevels:[], exchangeRates:{USD:500,EUR:650}, baseCurrency:'CUP', businessInfo:{} }
        saveData()
    }
    
    localStorage.setItem('tienda_lastUser', user)
    loadData()
    
    // Animate login exit
    const loginPage = document.getElementById('loginPage')
    const loginCard = loginPage.querySelector('.login-card')
    if(loginCard) {
        loginCard.classList.add('login-exit')
    }
    
    // After login animation, show app with entrance animation
    setTimeout(() => {
        loginPage.classList.add('hidden')
        const app = document.getElementById('app')
        app.classList.remove('hidden')
        app.classList.add('app-entrance')
        
        // Add staggered animations to app sections
        const header = app.querySelector('.bg-zinc-900.border-b')
        const nav = app.querySelector('.app-nav')
        const content = app.querySelector('.app-content')
        
        if(header) header.classList.add('header-entrance')
        if(nav) {
            setTimeout(() => nav.classList.add('nav-entrance'), 100)
        }
        if(content) {
            setTimeout(() => content.classList.add('content-entrance'), 200)
        }
        
        document.getElementById('currentUser').textContent = user
        renderAll()
        if(isNew) showModal('modalSetupRates')
    }, 450)
}

function showApp(userName) {
    const loginPage = document.getElementById('loginPage')
    const loginCard = loginPage.querySelector('.login-card')
    if(loginCard) {
        loginCard.classList.add('login-exit')
    }
    
    setTimeout(() => {
        loginPage.classList.add('hidden')
        const app = document.getElementById('app')
        app.classList.remove('hidden')
        app.classList.add('app-entrance')
        
        const header = app.querySelector('.bg-zinc-900.border-b')
        const nav = app.querySelector('.app-nav')
        const content = app.querySelector('.app-content')
        
        if(header) header.classList.add('header-entrance')
        if(nav) {
            setTimeout(() => nav.classList.add('nav-entrance'), 100)
        }
        if(content) {
            setTimeout(() => content.classList.add('content-entrance'), 200)
        }
        
        document.getElementById('currentUser').textContent = userName
        renderAll()
    }, 450)
}

function setLoginMode(mode) {
    const btnLocal = document.getElementById('btnModeLocal')
    const btnOnline = document.getElementById('btnModeOnline')
    const passwordContainer = document.getElementById('loginPasswordContainer')
    const apiUrlContainer = document.getElementById('loginApiUrlContainer')
    const userInput = document.getElementById('loginUser')
    
    if (!btnLocal || !btnOnline) return // Elementos no existen todavía
    
    // Si ya hay un usuario logueado, hacer logout primero
    const app = document.getElementById('app')
    if (app && !app.classList.contains('hidden')) {
        // Usuario está logueado, hacer logout primero
        const currentMode = localStorage.getItem('vexto_use_online')
        if (currentMode === 'true' && mode === 'local') {
            // Cambiar de online a local
            logout()
        } else if (currentMode === 'false' && mode === 'online') {
            // Cambiar de local a online
            logout()
        }
    }
    
    if (mode === 'online') {
        // Modo online
        localStorage.setItem('vexto_use_online', 'true')
        
        btnLocal.classList.remove('bg-emerald-600', 'text-white')
        btnLocal.classList.add('bg-zinc-700', 'text-zinc-300')
        btnOnline.classList.remove('bg-zinc-700', 'text-zinc-300')
        btnOnline.classList.add('bg-emerald-600', 'text-white')
        
        passwordContainer.classList.remove('hidden')
        apiUrlContainer.classList.remove('hidden')
        
        userInput.placeholder = 'Tu email'
        
        // Cargar dinámicamente el script de online si no está cargado
        if (typeof apiLogin !== 'function') {
            var onlineScript = document.createElement('script');
            onlineScript.src = 'vexto.online.js';
            document.head.appendChild(onlineScript);
        }
    } else {
        // Modo local
        localStorage.setItem('vexto_use_online', 'false')
        
        btnOnline.classList.remove('bg-emerald-600', 'text-white')
        btnOnline.classList.add('bg-zinc-700', 'text-zinc-300')
        btnLocal.classList.remove('bg-zinc-700', 'text-zinc-300')
        btnLocal.classList.add('bg-emerald-600', 'text-white')
        
        passwordContainer.classList.add('hidden')
        apiUrlContainer.classList.add('hidden')
        
        userInput.placeholder = 'Tu nombre'
    }
}

// Inicializar modo de login cuando carga la página
window.addEventListener('load', function() {
    setTimeout(function() {
        const isOnlineMode = localStorage.getItem('vexto_use_online') === 'true'
        setLoginMode(isOnlineMode ? 'online' : 'local')
        
        // Cargar URL de API guardada
        const savedApiUrl = localStorage.getItem('vexto_api_url')
        if (savedApiUrl && typeof API_BASE_URL !== 'undefined') {
            API_BASE_URL = savedApiUrl
            const apiUrlInput = document.getElementById('loginApiUrl')
            if (apiUrlInput) apiUrlInput.value = savedApiUrl
        }
    }, 100)
})

function logout(){
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

// ─── Handle Login - Selector de modo ─────────────────────────────────────────
async function handleLogin() {
    // Determinar si es modo online o local
    const isOnlineMode = localStorage.getItem('vexto_use_online') === 'true'
    
    if (isOnlineMode && typeof apiLogin === 'function') {
        // Modo Online - verificar si existe la función API
        try {
            await handleLoginOnline()
        } catch (error) {
            // Si hay error, fallback a modo local
            console.warn('Modo online no disponible, usando modo local:', error)
            handleLoginLocal()
        }
    } else {
        // Modo Local - Usar localStorage (código original)
        handleLoginLocal()
    }
}

// Función placeholder para login online (se sobrescribe en vexto.online.js)
async function handleLoginOnline() {
    throw new Error('Funciones de API no disponibles. Carga vexto.online.js para modo online.')
}

// ─── Save / Setup functions ─────────────────────────────────────────────────
function saveSetupRates(){
    const usd = parseFloat(document.getElementById('setupRateUSD').value)
    const eur = parseFloat(document.getElementById('setupRateEUR').value)
    if(!usd || usd <= 0) return alert('Tasa USD inválida')
    if(!eur || eur <= 0) return alert('Tasa EUR inválida')
    data.exchangeRates.USD = usd
    data.exchangeRates.EUR = eur
    saveData()
    document.getElementById('modalSetupRates').classList.add('hidden')
    renderAll()
    addAudit('AJUSTES: tasas iniciales USD='+usd+' EUR='+eur)
    // Show business info modal
    // Limpiar campos de tarjetas para una nueva configuración
    renderBusinessCardFields([])
    showModal('modalSetupBusiness')
}

function saveBusinessInfo(fromSettings = false){
    const name = document.getElementById('businessName').value.trim()
    if(!name) return alert('El nombre del negocio es obligatorio')
    
    // Recoger las tarjetas de banco
    const cardInputs = document.querySelectorAll('#businessCardsContainer input[type="text"]')
    const cards = []
    cardInputs.forEach(input => {
        const val = input.value.trim()
        if(val) cards.push(val)
    })
    
    data.businessInfo = {
        name: name,
        address: document.getElementById('businessAddress').value.trim(),
        phone: document.getElementById('businessPhone').value.trim(),
        email: document.getElementById('businessEmail').value.trim(),
        nit: document.getElementById('businessNit').value.trim(),
        message: document.getElementById('businessMessage').value.trim(),
        cards: cards
    }
    saveData()
    hideModal('modalSetupBusiness')
    addAudit('INFO NEGOCIO: ' + name)
    
    // If from settings, stay on settings; otherwise go to info
    if(fromSettings) {
        showToast('Información del negocio guardada', 'success')
    } else {
        showSection('info')
    }
}

function skipBusinessInfo(){
    hideModal('modalSetupBusiness')
    showSection('info')
}

function showEditBusinessInfo(){
    const bi = data.businessInfo || {}
    document.getElementById('businessName').value = bi.name || ''
    document.getElementById('businessAddress').value = bi.address || ''
    document.getElementById('businessPhone').value = bi.phone || ''
    document.getElementById('businessEmail').value = bi.email || ''
    document.getElementById('businessNit').value = bi.nit || ''
    document.getElementById('businessMessage').value = bi.message || ''
    
    // Cargar tarjetas de banco
    renderBusinessCardFields(bi.cards || [])
    
    showModal('modalSetupBusiness')
    // Override the save function temporarily to use the settings version
    document.querySelector('#modalSetupBusiness button[onclick="saveBusinessInfo()"]').onclick = function() { saveBusinessInfo(true) }
}

// ─── Tarjetas de Banco del Negocio ───────────────────────────────────────────────
function renderBusinessCardFields(cards = []){
    const container = document.getElementById('businessCardsContainer')
    const addBtn = document.getElementById('addBusinessCardBtn')
    if(!container) return
    
    container.innerHTML = ''
    
    // Renderizar las tarjetas existentes
    cards.forEach((card, index) => {
        addBusinessCardField(card)
    })
    
    // Mostrar u ocultar el botón de agregar según la cantidad
    updateAddCardButton()
}

function addBusinessCardField(value = ''){
    const container = document.getElementById('businessCardsContainer')
    const addBtn = document.getElementById('addBusinessCardBtn')
    if(!container) return
    
    const currentCards = container.querySelectorAll('input[type="text"]').length
    if(currentCards >= 3) {
        showToast('Máximo 3 tarjetas permitidas', 'error')
        return
    }
    
    const div = document.createElement('div')
    div.className = 'flex items-center gap-2'
    div.innerHTML = `
        <input type="text" 
            placeholder="ej: 1234 5678 9012 3456" 
            class="flex-1 bg-zinc-800 rounded-xl px-4 py-2 text-sm font-mono"
            maxlength="19"
            oninput="formatCardNumber(this)">
        <button type="button" onclick="removeBusinessCardField(this)" class="text-red-400 hover:text-red-300 px-2 py-1">
            ✕
        </button>
    `
    container.appendChild(div)
    
    // Si hay un valor, establecerlo
    if(value) {
        const input = div.querySelector('input')
        input.value = value
    }
    
    updateAddCardButton()
}

function removeBusinessCardField(btn){
    const container = document.getElementById('businessCardsContainer')
    if(!container) return
    
    const div = btn.parentElement
    div.remove()
    
    updateAddCardButton()
}

function updateAddCardButton(){
    const container = document.getElementById('businessCardsContainer')
    const addBtn = document.getElementById('addBusinessCardBtn')
    if(!container || !addBtn) return
    
    const currentCards = container.querySelectorAll('input[type="text"]').length
    if(currentCards >= 3) {
        addBtn.classList.add('hidden')
    } else {
        addBtn.classList.remove('hidden')
    }
}

function formatCardNumber(input){
    let value = input.value.replace(/\s/g, '').replace(/\D/g, '')
    let formatted = ''
    for(let i = 0; i < value.length && i < 16; i++) {
        if(i > 0 && i % 4 === 0) formatted += ' '
        formatted += value[i]
    }
    input.value = formatted
}

function showBusinessCardsInfo(){
    const bi = data.businessInfo || {}
    const cards = bi.cards || []
    
    if(cards.length === 0) {
        showToast('No hay tarjetas de banco establecidas. Ve a Ajustes > Información del negocio para agregar.', 'info', 5000)
        return
    }
    
    let html = '<div class="text-sm">'
    html += '<div class="text-zinc-400 mb-3">💳 Tarjetas de banco establecidas:</div>'
    cards.forEach((card, index) => {
        html += `<div class="bg-zinc-800 rounded-xl p-3 mb-2">`
        html += `<div class="font-mono text-lg">${card}</div>`
        html += `</div>`
    })
    html += '</div>'
    
    document.getElementById('currencyInfoContent').innerHTML = html
    document.getElementById('currencyInfoTitle').textContent = '💳 Tarjetas de Banco'
    
    // Usar la lógica correcta del modal con animación
    const modal = document.getElementById('modalCurrencyInfo')
    const box   = document.getElementById('modalCurrencyInfoBox')

    _modalZBase += 10
    modal.style.zIndex = _modalZBase
    modal.classList.remove('hidden')

    setTimeout(() => {
        modal.classList.remove('opacity-0')
        box.classList.remove('scale-95')
    }, 10)
}

// ─── Mobile menu ─────────────────────────────────────────────────────────────
function toggleMobileMenu(){
    document.querySelector('.app-nav')?.classList.toggle('mobile-open')
}

// ─── Warning Modal ────────────────────────────────────────────────────────────
function showWarningModal(){
    showModal('warningModal')
}
function hideWarningModal(){
    hideModal('warningModal')
}

// ─── DASHBOARD ──────────────────────────────────────────────────────────────
function renderDashboard(){
    const totalValue = data.products.reduce((a,p)=>a+((p.currentStock||0)*(p.avgCost||0)),0)
    document.getElementById('dashStockValue').innerHTML = fmtInfo(totalValue,'Valor stock')
    
    const totalDebt = data.customers.reduce((a,c)=>a+(c.debt||0),0)
    document.getElementById('dashDebt').innerHTML = fmtInfo(totalDebt,'Total deudores')
    
    // Today's profit
    const today = new Date().toISOString().slice(0,10)
    let todayRevenue = 0, todayCost = 0
    data.sales.forEach(s=>{
        if(s.date === today && !s.onCredit){
            const prod = data.products.find(p=>p.id===s.productId)
            const price = s.finalPriceCUP || s.unitSellPriceCUP || 0
            todayRevenue += s.qty * price
            todayCost += s.qty * (prod ? prod.avgCost : 0)
        }
    })
    document.getElementById('dashTodayProfit').innerHTML = fmtInfo(todayRevenue - todayCost,'Ganancia hoy')
    
    // This month sales
    const month = new Date().toISOString().slice(0,7)
    let monthSales = 0
    data.sales.forEach(s=>{
        if(s.date.slice(0,7) === month){
            const price = s.finalPriceCUP || s.unitSellPriceCUP || 0
            monthSales += s.qty * price
        }
    })
    document.getElementById('dashMonthSales').innerHTML = fmtInfo(monthSales,'Ventas del mes')
    
    // Weekly comparison
    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay())
    const startOfPrevWeek = new Date(startOfWeek)
    startOfPrevWeek.setDate(startOfWeek.getDate() - 7)
    
    let weekSales = 0, prevWeekSales = 0
    data.sales.forEach(s=>{
        const d = new Date(s.date)
        if(d >= startOfWeek){
            weekSales += (s.finalPriceCUP || s.unitSellPriceCUP || 0) * s.qty
        } else if(d >= startOfPrevWeek && d < startOfWeek){
            prevWeekSales += (s.finalPriceCUP || s.unitSellPriceCUP || 0) * s.qty
        }
    })
    
    const maxWeek = Math.max(weekSales, prevWeekSales, 1)
    document.getElementById('weekSalesBar').style.height = (weekSales/maxWeek*100)+'%'
    document.getElementById('prevWeekSalesBar').style.height = (prevWeekSales/maxWeek*100)+'%'
    document.getElementById('weekSalesCount').textContent = fmtNum(weekSales)
    document.getElementById('prevWeekSalesCount').textContent = fmtNum(prevWeekSales)
    
    const diff = weekSales - prevWeekSales
    const diffPct = prevWeekSales > 0 ? ((diff/prevWeekSales)*100).toFixed(1) : (weekSales > 0 ? '100' : '0')
    const diffIcon = diff >= 0 ? '📈' : '📉'
    const diffClass = diff >= 0 ? 'text-emerald-400' : 'text-red-400'
    document.getElementById('weekComparison').innerHTML = `<span class="${diffClass}">${diffIcon} ${diffPct}%</span> vs semana anterior`
    
    // In transit purchases
    const inTransit = data.purchases.filter(p => p.status === 'en_camino' || p.status === 'transito')
    document.getElementById('inTransitCount').textContent = inTransit.length
    const transitValue = inTransit.reduce((a,p)=>a+(p.totalCostCUP||p.totalCost||0),0)
    document.getElementById('inTransitValue').innerHTML = fmtInfo(transitValue,'Valor en camino')
    document.getElementById('inTransitList').innerHTML = inTransit.slice(0,3).map(p => 
        `<div class="text-xs text-zinc-400 flex justify-between"><span>${p.product||'?'}</span><span>${fmtCUP(p.totalCostCUP||p.totalCost||0)}</span></div>`
    ).join('')
    
    // Top products
    const topProducts = {}
    data.sales.forEach(s=>{
        if(s.date.slice(0,7) === month){
            topProducts[s.productId] = (topProducts[s.productId]||0) + s.qty
        }
    })
    const sorted = Object.entries(topProducts).sort((a,b)=>b[1]-a[1]).slice(0,5)
    const topList = document.getElementById('topProductsList')
    if(sorted.length === 0){
        topList.innerHTML = '<div class="text-zinc-500 text-sm text-center py-4">Sin ventas este mes</div>'
    } else {
        topList.innerHTML = sorted.map(([pid,qty])=>{
            const prod = data.products.find(p=>p.id==pid)
            return `<div class="flex justify-between items-center"><span class="text-zinc-300">${prod?prod.name:'?'}</span><span class="text-emerald-400 font-bold">${qty}</span></div>`
        }).join('')
    }
}

function showDailyReport(){
    showModal('modalDailyReport')
    // Render daily report content
    const now = new Date()
    const today = now.toISOString().slice(0,10)
    let salesHTML = '<div class="text-sm text-zinc-400 mb-4">Ventas de hoy:</div>'
    
    const todaySales = data.sales.filter(s => s.date === today)
    if(todaySales.length === 0) {
        salesHTML += '<div class="text-zinc-500 text-center py-4">Sin ventas hoy</div>'
    } else {
        todaySales.forEach(s => {
            const prod = data.products.find(p => p.id === s.productId)
            const price = s.finalPriceCUP || s.unitSellPriceCUP || 0
            salesHTML += `<div class="bg-zinc-800 rounded-xl p-3 mb-2 flex justify-between">
                <span>${prod ? prod.name : '?'} x${s.qty}</span>
                <span class="text-emerald-400">${fmtCUP(s.qty * price)}</span>
            </div>`
        })
    }
    
    // Calculate totals
    let revenue = 0, cost = 0
    todaySales.forEach(s => {
        const prod = data.products.find(p => p.id === s.productId)
        const price = s.finalPriceCUP || s.unitSellPriceCUP || 0
        revenue += s.qty * price
        cost += s.qty * (prod ? prod.avgCost : 0)
    })
    
    salesHTML += `<div class="border-t border-zinc-700 pt-3 mt-3">
        <div class="flex justify-between text-sm"><span class="text-zinc-400">Ingreso:</span><span class="text-emerald-400">${fmtCUP(revenue)}</span></div>
        <div class="flex justify-between text-sm"><span class="text-zinc-400">Costo:</span><span class="text-red-400">-${fmtCUP(cost)}</span></div>
        <div class="flex justify-between text-lg font-bold mt-2"><span>Ganancia:</span><span class="text-emerald-400">${fmtCUP(revenue - cost)}</span></div>
    </div>`
    
    document.getElementById('dailyReportContent').innerHTML = salesHTML
}

// ─── PRODUCTOS ────────────────────────────────────────────────────────────────
function renderProducts(){
    const tbody = document.getElementById('productsTable')
    if(!tbody) return
    tbody.innerHTML = ''
    
    const search = (document.getElementById('productSearch')?.value || '').toLowerCase().trim()
    const list = (data.products || [])
        .filter(p => !search || 
            (p.name && p.name.toLowerCase().includes(search)) ||
            (p.category && p.category.toLowerCase().includes(search)))
        .sort((a,b) => (a.name||'').localeCompare(b.name||''))
    
    if(!list.length){
        tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-zinc-500">' + (search ? 'Sin resultados' : 'No hay productos') + '</td></tr>'
        return
    }
    
    list.forEach(p => {
        const tr = document.createElement('tr')
        tr.className = 'border-b border-zinc-800 hover:bg-zinc-900'
        
        const stockClass = (p.currentStock||0) <= 0 ? 'text-red-400' : ((p.currentStock||0) < (p.minStock||0) ? 'text-amber-400' : 'text-emerald-400')
        
        tr.innerHTML = `
            <td class="py-4 font-medium">${p.name}</td>
            <td>${p.category || '-'}</td>
            <td class="${stockClass} font-bold">${p.currentStock || 0}</td>
            <td>${fmtInfo(p.avgCost||0,'Costo promedio')}</td>
            <td>${p.minStock || 0}</td>
            <td class="flex gap-2 py-4">
                <button onclick="showEditProduct(${p.id})" class="text-zinc-400 hover:text-zinc-200 text-sm">✏️</button>
                <button onclick="deleteProduct(${p.id})" class="text-red-400 hover:text-red-300 text-sm">🗑️</button>
            </td>
        `
        tbody.appendChild(tr)
    })
}

let currentSortProducts = { field: 'name', asc: true }
function sortProducts(field){
    const sort = currentSortProducts
    if(sort.field === field){
        sort.asc = !sort.asc
    } else {
        sort.field = field
        sort.asc = true
    }
    document.querySelectorAll('#productsTable th span').forEach(s => s.textContent = '')
    document.getElementById('sort-'+field).textContent = sort.asc ? '▲' : '▼'
    
    data.products.sort((a,b) => {
        let valA = a[field], valB = b[field]
        if(field === 'currentStock' || field === 'avgCost'){
            valA = Number(valA)||0; valB = Number(valB)||0
        } else {
            valA = String(valA||'').toLowerCase()
            valB = String(valB||'').toLowerCase()
        }
        if(valA < valB) return sort.asc ? -1 : 1
        if(valA > valB) return sort.asc ? 1 : -1
        return 0
    })
    renderProducts()
}

function showProductsInfo(){
    const totalProducts = data.products.length
    const totalStock = data.products.reduce((a,p)=>a+(p.currentStock||0),0)
    const totalValue = data.products.reduce((a,p)=>a+((p.currentStock||0)*(p.avgCost||0)),0)
    const lowStock = data.products.filter(p => (p.currentStock||0) > 0 && (p.currentStock||0) < (p.minStock||0)).length
    const outOfStock = data.products.filter(p => (p.currentStock||0) <= 0).length
    
    const html = `
        <div class="bg-zinc-800 rounded-2xl p-4 flex justify-between">
            <span>Total productos</span>
            <span class="font-bold text-emerald-400">${totalProducts}</span>
        </div>
        <div class="bg-zinc-800 rounded-2xl p-4 flex justify-between">
            <span>Total unidades</span>
            <span class="font-bold text-emerald-400">${totalStock}</span>
        </div>
        <div class="bg-zinc-800 rounded-2xl p-4 flex justify-between">
            <span>Valor inventario</span>
            <span class="font-bold text-emerald-400">${fmtCUP(totalValue)}</span>
        </div>
        <div class="bg-zinc-800 rounded-2xl p-4 flex justify-between">
            <span>Stock bajo</span>
            <span class="font-bold text-amber-400">${lowStock}</span>
        </div>
        <div class="bg-zinc-800 rounded-2xl p-4 flex justify-between">
            <span>Sin stock</span>
            <span class="font-bold text-red-400">${outOfStock}</span>
        </div>
    `
    
    document.getElementById('currencyInfoContent').innerHTML = html
    document.getElementById('currencyInfoTitle').textContent = '📦 Resumen de Inventario'
    
    const modal = document.getElementById('modalCurrencyInfo')
    const box   = document.getElementById('modalCurrencyInfoBox')
    _modalZBase += 10
    modal.style.zIndex = _modalZBase
    modal.classList.remove('hidden')
    setTimeout(() => {
        modal.classList.remove('opacity-0')
        box.classList.remove('scale-95')
    }, 10)
}

function showAddProduct(){ 
    // Reset form
    document.getElementById('prodName').value = ''
    document.getElementById('prodCat').value = ''
    document.getElementById('prodMin').value = ''
    document.getElementById('prodMarkup').value = '30'
    document.getElementById('prodBarcode').value = ''
    document.getElementById('prodDesc').value = ''
    document.getElementById('prodId').value = ''
    
    showModal('modalProduct') 
}

function showEditProduct(id){
    const p = data.products.find(x=>x.id===id)
    if(!p) return
    
    document.getElementById('prodName').value = p.name || ''
    document.getElementById('prodCat').value = p.category || ''
    document.getElementById('prodMin').value = p.minStock || ''
    document.getElementById('prodMarkup').value = ((p.markup||30))
    document.getElementById('prodBarcode').value = p.barcode || ''
    document.getElementById('prodDesc').value = p.description || ''
    document.getElementById('prodId').value = p.id
    
    showModal('modalProduct')
}

function saveProduct(){
    const name   = document.getElementById('prodName').value.trim()
    const cat    = document.getElementById('prodCat').value.trim()
    const min    = parseFloat(document.getElementById('prodMin').value) || 0
    const markup = (parseFloat(document.getElementById('prodMarkup').value) || 50) / 100
    const idVal  = document.getElementById('prodId').value
    
    if(!name) return alert('Nombre requerido')
    
    // Check if online mode and try to sync
    const isOnlineMode = localStorage.getItem('vexto_use_online') === 'true'
    if(isOnlineMode && typeof syncProductToAPI === 'function') {
        // Try online sync first
        syncProductToAPI({ nombre: name, categoria: cat, min_stock: min, markup: markup * 100, codigo_barras: document.getElementById('prodBarcode').value, descripcion: document.getElementById('prodDesc').value }, idVal)
            .then(() => {
                // Reload from API
                if(typeof loadDataFromAPI === 'function') {
                    return loadDataFromAPI()
                }
            })
            .then(() => {
                hideModal('modalProduct'); renderProducts(); renderDashboard()
            })
            .catch(e => {
                console.warn('Online sync failed, saving locally:', e)
                saveProductLocal(idVal, name, cat, min, markup)
            })
    } else {
        // Local only mode
        saveProductLocal(idVal, name, cat, min, markup)
    }
}

function saveProductLocal(idVal, name, cat, min, markup) {
    const producto = {
        id: idVal ? parseInt(idVal) : nextId++,
        name: name,
        category: cat,
        currentStock: idVal ? (data.products.find(p => p.id === parseInt(idVal))?.currentStock || 0) : 0,
        minStock: min,
        avgCost: idVal ? (data.products.find(p => p.id === parseInt(idVal))?.avgCost || 0) : 0,
        totalCostValue: idVal ? (data.products.find(p => p.id === parseInt(idVal))?.totalCostValue || 0) : 0,
        markup: markup * 100,
        barcode: document.getElementById('prodBarcode').value,
        description: document.getElementById('prodDesc').value
    }
    
    if(idVal){
        const idx = data.products.findIndex(p => p.id === parseInt(idVal))
        if(idx >= 0) data.products[idx] = producto
    } else {
        data.products.push(producto)
    }
    
    saveData()
    hideModal('modalProduct')
    renderProducts()
    renderDashboard()
    addAudit(idVal ? 'PRODUCTO EDITADO: '+name : 'PRODUCTO: '+name)
}

// Placeholder for online sync (overridden in vexto.online.js)
function syncProductToAPI(producto, id) {
    throw new Error('Online sync not available. Load vexto.online.js for online mode.')
}

function deleteProduct(id){
    const p = data.products.find(x=>x.id===id)
    if(!p) return
    showConfirm('¿Eliminar producto?', `"${p.name}" será eliminado.`, () => {
        // Check if online mode
        const isOnlineMode = localStorage.getItem('vexto_use_online') === 'true'
        if(isOnlineMode && typeof deleteProductFromAPI === 'function') {
            deleteProductFromAPI(id)
                .then(() => loadDataFromAPI())
                .catch(e => {
                    console.warn('Online delete failed, deleting locally:', e)
                    deleteProductLocal(id, p.name)
                })
        } else {
            deleteProductLocal(id, p.name)
        }
    })
}

function deleteProductLocal(id, name) {
    data.products = data.products.filter(x=>x.id!==id)
    saveData()
    renderProducts()
    renderDashboard()
    addAudit('PRODUCTO ELIMINADO: '+name)
}

// Placeholder for online delete (overridden in vexto.online.js)
function deleteProductFromAPI(id) {
    throw new Error('Online delete not available. Load vexto.online.js for online mode.')
}

// ─── Descuentos ───────────────────────────────────────────────────────────────
function showAddDiscount(){
    const sel = document.getElementById('discountProduct')
    sel.innerHTML = '<option value="">Todos los productos</option>'
    data.products.forEach(p => { const o=document.createElement('option'); o.value=p.id; o.textContent=p.name; sel.appendChild(o) })
    document.getElementById('discountType').value = 'mayor'
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
function saveDiscount(){
    const type      = document.getElementById('discountType').value
    const percent   = parseFloat(document.getElementById('discountPercent').value)
    const productId = document.getElementById('discountProduct').value ? parseInt(document.getElementById('discountProduct').value) : null
    if(!percent || percent<=0 || percent>=100) return alert('Porcentaje inválido')
    let d = {id:nextId++, type, percent, productId}
    if(type==='mayor')  { d.qtyMin=parseInt(document.getElementById('discountQtyMin').value); if(!d.qtyMin) return alert('Cantidad mínima requerida') }
    else if(type==='especial'){ d.dayName=document.getElementById('discountDay').value.trim(); if(!d.dayName) return alert('Nombre del evento requerido') }
    else if(type==='cliente') { d.clientName=document.getElementById('discountClient').value.trim(); if(!d.clientName) return alert('Nombre del cliente requerido') }
    data.discounts.push(d)
    saveData()
    addAudit('DESCUENTO: '+type+' '+percent+'%')
    hideModal('modalDiscount'); renderDiscounts()
}
function renderDiscounts(){
    const c = document.getElementById('discountsContainer')
    c.innerHTML = ''
    if(!data.discounts || !data.discounts.length){ c.innerHTML='<div class="col-span-full text-center py-12 text-zinc-500">No hay descuentos</div>'; return }
    data.discounts.forEach(d => {
        let desc='', aplica='', emoji=''
        if(d.type==='mayor')   { desc='Al por mayor'; aplica='Cant. >= '+d.qtyMin; emoji='📦' }
        else if(d.type==='especial'){ desc='Día especial'; aplica=d.dayName; emoji='📅' }
        else if(d.type==='cliente') { desc='Cliente'; aplica=d.clientName; emoji='👤' }
        else if(d.type==='general') { desc='General'; aplica='Para todos'; emoji='🎁' }
        const prod = d.productId ? (data.products.find(p=>p.id===d.productId)?.name||'?') : 'Todos'
        const card = document.createElement('div')
        card.className = 'bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-emerald-600 transition'
        card.innerHTML = '<div class="flex justify-between items-start mb-3"><div><div class="text-2xl font-bold text-emerald-400">'+d.percent+'%</div><div class="text-xs text-zinc-500">'+emoji+' '+desc+'</div></div><button onclick="deleteDiscount('+d.id+')" class="text-red-400 hover:text-red-300">🗑️</button></div><div class="space-y-2 text-sm"><div><span class="text-zinc-500">Condición:</span> <span class="text-zinc-200">'+aplica+'</span></div><div><span class="text-zinc-500">Aplica a:</span> <span class="text-emerald-300">'+prod+'</span></div></div>'
        c.appendChild(card)
    })
}
function deleteDiscount(id){ showConfirm('¿Eliminar descuento?', 'Esta acción no se puede deshacer.', () => _deleteDiscount(id)) }
function _deleteDiscount(id){
    data.discounts = data.discounts.filter(d=>d.id!==id)
    saveData(); addAudit('DESCUENTO ELIMINADO'); renderDiscounts()
}

// ─── CLIENTES ───────────────────────────────────────────────────────────────
function renderCustomers(){
    const tbody = document.getElementById('customersTable')
    if(!tbody) return
    tbody.innerHTML = ''
    
    const search = (document.getElementById('customerSearch')?.value || '').toLowerCase().trim()
    const list = (data.customers || [])
        .filter(c => !search || (c.name && c.name.toLowerCase().includes(search)))
        .sort((a,b) => (a.name||'').localeCompare(b.name||''))
    
    if(!list.length){
        tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-zinc-500">' + (search ? 'Sin resultados' : 'No hay clientes') + '</td></tr>'
        return
    }
    
    list.forEach(c => {
        const tr = document.createElement('tr')
        tr.className = 'border-b border-zinc-800 hover:bg-zinc-900'
        tr.innerHTML = `
            <td class="py-4 font-medium">${c.name}</td>
            <td>${c.vipLevel || '-'}</td>
            <td>${c.totalPurchases || 0}</td>
            <td>${fmtInfo(c.totalSpent||0,'Total gastado')}</td>
            <td class="${(c.debt||0)>0 ? 'text-amber-400' : 'text-zinc-500'} font-bold">${fmtInfo(c.debt||0,'Deuda')}</td>
            <td class="flex gap-2 py-4">
                <button onclick="showPayDebt(${c.id})" class="text-emerald-400 hover:text-emerald-300 text-sm" title="Pagar deuda">💵</button>
                <button onclick="showEditCustomer(${c.id})" class="text-zinc-400 hover:text-zinc-200 text-sm">✏️</button>
                <button onclick="deleteCustomer(${c.id})" class="text-red-400 hover:text-red-300 text-sm">🗑️</button>
            </td>
        `
        tbody.appendChild(tr)
    })
}

function showAddCustomer(){
    document.getElementById('custName').value = ''
    document.getElementById('custPhone').value = ''
    document.getElementById('custEmail').value = ''
    document.getElementById('custVip').value = ''
    document.getElementById('custId').value = ''
    showModal('modalCustomer')
}
function showEditCustomer(id){
    const c = data.customers.find(x=>x.id===id)
    if(!c) return
    document.getElementById('custName').value = c.name || ''
    document.getElementById('custPhone').value = c.phone || ''
    document.getElementById('custEmail').value = c.email || ''
    document.getElementById('custVip').value = c.vipLevel || ''
    document.getElementById('custId').value = c.id
    showModal('modalCustomer')
}
function saveCustomer(){
    const name = document.getElementById('custName').value.trim()
    const phone = document.getElementById('custPhone').value.trim()
    const email = document.getElementById('custEmail').value.trim()
    const vip = document.getElementById('custVip').value.trim()
    const idVal = document.getElementById('custId').value
    if(!name) return alert('Nombre requerido')
    
    const cliente = { id: idVal ? parseInt(idVal) : nextId++, name, phone, email, vipLevel: vip }
    
    if(idVal){
        const idx = data.customers.findIndex(c => c.id === parseInt(idVal))
        if(idx >= 0) {
            // Preserve debt and totalSpent
            cliente.debt = data.customers[idx].debt || 0
            cliente.totalSpent = data.customers[idx].totalSpent || 0
            cliente.totalPurchases = data.customers[idx].totalPurchases || 0
            data.customers[idx] = cliente
        }
    } else {
        cliente.debt = 0
        cliente.totalSpent = 0
        cliente.totalPurchases = 0
        data.customers.push(cliente)
    }
    
    saveData()
    hideModal('modalCustomer')
    renderCustomers()
    addAudit(idVal ? 'CLIENTE EDITADO: '+name : 'CLIENTE: '+name)
}
function deleteCustomer(id){
    const c = data.customers.find(x=>x.id===id)
    if(!c) return
    if((c.debt||0)>0) return alert('Este cliente tiene deuda pendiente. Págala primero.')
    showConfirm('¿Eliminar cliente?', `"${c.name}" será eliminado.`, () => {
        data.customers = data.customers.filter(x=>x.id!==id)
        saveData()
        renderCustomers()
        addAudit('CLIENTE ELIMINADO: '+c.name)
    })
}

// VIP Levels
function showManageVipLevels(){
    showModal('modalVipLevel')
    renderVipLevels()
}
function renderVipLevels(){
    const list = document.getElementById('vipLevelsList')
    if(!list) return
    list.innerHTML = ''
    
    const levels = data.vipLevels || []
    levels.forEach(l => {
        const div = document.createElement('div')
        div.className = 'bg-zinc-800 rounded-xl p-3 flex justify-between items-center'
        div.innerHTML = `
            <span class="font-medium">${l.name}</span>
            <span class="text-emerald-400">${l.discount}%</span>
            <button onclick="deleteVipLevel(${l.id})" class="text-red-400">🗑️</button>
        `
        list.appendChild(div)
    })
}
function addVipLevel(){
    const name = document.getElementById('newVipName').value.trim()
    const discount = parseFloat(document.getElementById('newVipDiscount').value)
    if(!name || !discount) return alert('Nombre y descuento requeridos')
    if(!data.vipLevels) data.vipLevels = []
    data.vipLevels.push({ id: nextId++, name, discount })
    saveData()
    document.getElementById('newVipName').value = ''
    document.getElementById('newVipDiscount').value = ''
    renderVipLevels()
}
function deleteVipLevel(id){
    data.vipLevels = data.vipLevels.filter(l => l.id !== id)
    saveData()
    renderVipLevels()
}

// Pay debt
function showPayDebt(customerId){
    if(customerId){
        const c = data.customers.find(x=>x.id===customerId)
        if(!c) return
        document.getElementById('payDebtCustomerName').textContent = c.name
        document.getElementById('payDebtCustomerId').value = c.id
        document.getElementById('payDebtAmount').value = c.debt || 0
    }
    showModal('modalPayDebt')
}
function savePayDebt(){
    const id = parseInt(document.getElementById('payDebtCustomerId').value)
    const amount = parseFloat(document.getElementById('payDebtAmount').value)
    const c = data.customers.find(x=>x.id===id)
    if(!c || !amount || amount<=0) return
    
    // Record payment
    if(!data.cashPayments) data.cashPayments = []
    data.cashPayments.push({
        id: nextId++,
        date: new Date().toISOString().slice(0,10),
        customerId: c.id,
        customerName: c.name,
        amountCUP: amount,
        timestamp: new Date().toISOString()
    })
    
    c.debt = Math.max(0, c.debt - amount)
    saveData()
    hideModal('modalPayDebt')
    renderCustomers()
    renderDashboard()
    addAudit('PAGO DEUDA: '+c.name+' - '+amount)
}

// ─── PROVEEDORES ─────────────────────────────────────────────────────────────
function renderProviders(){
    const tbody = document.getElementById('providersTable')
    if(!tbody) return
    tbody.innerHTML = ''
    
    const search = (document.getElementById('providerSearch')?.value || '').toLowerCase().trim()
    const list = (data.providers || [])
        .filter(p => !search || 
            (p.name && p.name.toLowerCase().includes(search)) ||
            (p.contact && p.contact.toLowerCase().includes(search)) ||
            (p.phone && p.phone.includes(search)) ||
            (p.email && p.email.toLowerCase().includes(search)) ||
            (p.location && p.location.toLowerCase().includes(search)))
    
    if(!list.length){
        tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-zinc-500">' + (search ? 'Sin resultados' : 'No hay proveedores registrados') + '</td></tr>'
        return
    }

    list.forEach(p => {
        const tr = document.createElement('tr')
        tr.className = 'border-b border-zinc-800 hover:bg-zinc-900'
        tr.innerHTML = '<td class="py-4 font-medium">'+p.name+'</td>'
            +'<td>'+(p.contact||'-')+'</td>'
            +'<td>'+(p.phone||'-')+'</td>'
            +'<td>'+(p.email||'-')+'</td>'
            +'<td>'+(p.location||'-')+'</td>'
            +'<td class="flex gap-2 py-4">'
            +'<button onclick="showEditProvider('+p.id+')" class="text-zinc-400 hover:text-zinc-200 text-sm">✏️</button>'
            +'<button onclick="deleteProvider('+p.id+')" class="text-red-400 hover:text-red-300 text-sm">🗑️</button>'
            +'</td>'
        tbody.appendChild(tr)
    })
}

function showAddProvider(){
    document.getElementById('providerName').value = ''
    document.getElementById('providerContact').value = ''
    document.getElementById('providerPhone').value = ''
    document.getElementById('providerEmail').value = ''
    document.getElementById('providerLocation').value = ''
    document.getElementById('providerNotes').value = ''
    document.getElementById('providerId').value = ''
    showModal('modalProvider')
}

function showEditProvider(id){
    const p = data.providers.find(x=>x.id===id)
    if(!p) return

    document.getElementById('providerName').value = p.name
    document.getElementById('providerContact').value = p.contact || ''
    document.getElementById('providerPhone').value = p.phone || ''
    document.getElementById('providerEmail').value = p.email || ''
    document.getElementById('providerLocation').value = p.location || ''
    document.getElementById('providerNotes').value = p.notes || ''
    document.getElementById('providerId').value = p.id

    showModal('modalProvider')
}

function saveProvider(){
    const name = document.getElementById('providerName').value.trim()
    const contact = document.getElementById('providerContact').value.trim()
    const phone = document.getElementById('providerPhone').value.trim()
    const email = document.getElementById('providerEmail').value.trim()
    const location = document.getElementById('providerLocation').value.trim()
    const notes = document.getElementById('providerNotes').value.trim()
    const idVal = document.getElementById('providerId').value

    if(!name) return alert('Nombre requerido')

    if(idVal){
        const p = data.providers.find(x=>x.id===parseInt(idVal))
        if(p){
            p.name = name
            p.contact = contact
            p.phone = phone
            p.email = email
            p.location = location
            p.notes = notes
        }
    } else {
        data.providers.push({
            id: nextId++,
            name,
            contact,
            phone,
            email,
            location,
            notes
        })
    }

    saveData()
    hideModal('modalProvider')
    renderProviders()
    addAudit('PROVEEDOR: '+name)
}

function deleteProvider(id){
    const p = data.providers.find(x=>x.id===id)
    if(!p) return

    showConfirm(
        '¿Eliminar proveedor?',
        '"'+p.name+'" será eliminado.',
        () => {
            data.providers = data.providers.filter(x=>x.id!==id)
            saveData()
            renderProviders()
            addAudit('PROVEEDOR ELIMINADO: '+p.name)
        }
    )
}

function populateProvidersDatalist(){
    const list = document.getElementById('providersList')
    if(!list) return

    list.innerHTML = ''

    data.providers.forEach(p=>{
        const option = document.createElement('option')
        option.value = p.name
        list.appendChild(option)
    })
}

// ─── COMPRAS ────────────────────────────────────────────────────────────────
function updateShippingLabel(){
    const inStock = document.getElementById('purchaseInStock').checked
    document.getElementById('purchaseShippingLabel').textContent = inStock
        ? '✅ En almacén — stock disponible de inmediato'
        : '🚚 En camino — aún no llegó al almacén'
}

function showAddPurchase(){
    populateProvidersDatalist()
    document.getElementById('purchaseDate').value = new Date().toISOString().slice(0,10)
    document.getElementById('purchaseProduct').value = ''
    document.getElementById('purchaseQty').value = ''
    document.getElementById('purchaseCost').value = ''
    document.getElementById('purchaseProvider').value = ''
    document.getElementById('purchaseInStock').checked = true
    updateShippingLabel()
    showModal('modalPurchase')
}

function savePurchase(){
    const date = document.getElementById('purchaseDate').value
    const productName = document.getElementById('purchaseProduct').value.trim()
    const qty = parseFloat(document.getElementById('purchaseQty').value)
    const cost = parseFloat(document.getElementById('purchaseCost').value)
    const provider = document.getElementById('purchaseProvider').value.trim()
    const inStock = document.getElementById('purchaseInStock').checked
    
    if(!productName || !qty || !cost) return alert('Producto, cantidad y costo requeridos')
    
    let product = data.products.find(p => p.name.toLowerCase() === productName.toLowerCase())
    
    if(!product){
        // Create new product
        product = {
            id: nextId++,
            name: productName,
            category: '',
            currentStock: 0,
            minStock: 0,
            avgCost: 0,
            totalCostValue: 0,
            markup: 30
        }
        data.products.push(product)
    }
    
    const totalCost = qty * cost
    const newStock = product.currentStock + qty
    const newTotalValue = (product.totalCostValue || 0) + totalCost
    const newAvgCost = newTotalValue / newStock
    
    product.currentStock = newStock
    product.avgCost = newAvgCost
    product.totalCostValue = newTotalValue
    
    const purchase = {
        id: nextId++,
        date,
        product: productName,
        productId: product.id,
        quantity: qty,
        unitCost: cost,
        totalCost: totalCost,
        unitCostCUP: cost,
        totalCostCUP: totalCost,
        provider,
        providerId: data.providers.find(p=>p.name===provider)?.id,
        status: inStock ? 'recibido' : 'en_camino'
    }
    
    data.purchases.push(purchase)
    saveData()
    addAudit('COMPRA: '+productName+' x'+qty+' @'+cost)
    hideModal('modalPurchase')
    renderPurchases()
    renderProducts()
    renderDashboard()
}

function renderPurchases(){
    const tbody = document.getElementById('purchasesTable')
    if(!tbody) return
    tbody.innerHTML = ''
    
    const search = (document.getElementById('purchaseSearch')?.value || '').toLowerCase().trim()
    const list = (data.purchases || [])
        .filter(p => !search || 
            (p.product && p.product.toLowerCase().includes(search)) ||
            (p.provider && p.provider.toLowerCase().includes(search)))
        .sort((a,b) => new Date(b.date) - new Date(a.date))
    
    if(!list.length){
        tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-zinc-500">' + (search ? 'Sin resultados' : 'No hay compras') + '</td></tr>'
        return
    }
    
    list.forEach(p => {
        const tr = document.createElement('tr')
        tr.className = 'border-b border-zinc-800 hover:bg-zinc-900'
        
        let statusBadge = ''
        if(p.status === 'en_camino' || p.status === 'transito'){
            statusBadge = '<span class="bg-amber-900/50 text-amber-400 text-xs px-2 py-0.5 rounded">🚚 En camino</span>'
        } else if(p.status === 'recibido'){
            statusBadge = '<span class="bg-emerald-900/50 text-emerald-400 text-xs px-2 py-0.5 rounded">✅ Recibido</span>'
        } else {
            statusBadge = '<span class="bg-zinc-700 text-zinc-300 text-xs px-2 py-0.5 rounded">'+p.status+'</span>'
        }
        
        tr.innerHTML = `
            <td class="py-4">${p.date}</td>
            <td>${p.product}</td>
            <td>${p.quantity}</td>
            <td>${fmtInfo(p.unitCostCUP||p.unitCost||0,'Costo unitario')}</td>
            <td>${p.provider || '-'}</td>
            <td>${statusBadge}</td>
            <td>
                ${(p.status === 'en_camino' || p.status === 'transito') ? '<button onclick="markPurchaseReceived('+p.id+')" class="text-emerald-400 hover:text-emerald-300 text-sm mr-1" title="Marcar como recibido">✅</button>' : ''}
                <button onclick="showPurchaseInfo(${p.id})" class="text-zinc-400 hover:text-zinc-200 text-sm mr-1">ℹ️</button>
                <button onclick="deletePurchase(${p.id})" class="text-red-400 hover:text-red-300 text-sm">🗑️</button>
            </td>
        `
        tbody.appendChild(tr)
    })
}

function markPurchaseReceived(id){
    const p = data.purchases.find(x=>x.id===id)
    if(!p) return
    p.status = 'recibido'
    saveData()
    renderPurchases()
    addAudit('COMPRA RECIBIDA: '+p.product)
}

function showPurchaseInfo(id){
    const p = data.purchases.find(x=>x.id===id)
    if(!p) return
    
    const html = `
        <div class="bg-zinc-800 rounded-2xl p-4 flex justify-between">
            <span>Producto</span>
            <span class="font-bold text-white">${p.product}</span>
        </div>
        <div class="bg-zinc-800 rounded-2xl p-4 flex justify-between">
            <span>Cantidad</span>
            <span class="font-bold text-emerald-400">${p.quantity}</span>
        </div>
        <div class="bg-zinc-800 rounded-2xl p-4 flex justify-between">
            <span>Costo unitario</span>
            <span class="font-bold text-emerald-400">${fmtCUP(p.unitCostCUP||p.unitCost||0)}</span>
        </div>
        <div class="bg-zinc-800 rounded-2xl p-4 flex justify-between">
            <span>Costo total</span>
            <span class="font-bold text-emerald-400">${fmtCUP(p.totalCostCUP||p.totalCost||0)}</span>
        </div>
        <div class="bg-zinc-800 rounded-2xl p-4 flex justify-between">
            <span>Proveedor</span>
            <span class="font-bold text-white">${p.provider || '-'}</span>
        </div>
        <div class="bg-zinc-800 rounded-2xl p-4 flex justify-between">
            <span>Estado</span>
            <span class="font-bold text-amber-400">${p.status}</span>
        </div>
    `
    
    document.getElementById('transitInfoContent').innerHTML = html
    showModal('modalTransitInfo')
}

function deletePurchase(id){
    const p = data.purchases.find(x=>x.id===id)
    if(!p) return
    if(p.status === 'recibido'){
        // Return stock
        const prod = data.products.find(x=>x.id===p.productId)
        if(prod){
            prod.currentStock = Math.max(0, prod.currentStock - p.quantity)
            // Recalculate avg cost
            prod.totalCostValue = prod.currentStock * (prod.avgCost || 0)
        }
    }
    data.purchases = data.purchases.filter(x=>x.id!==id)
    saveData()
    renderPurchases()
    renderProducts()
    renderDashboard()
    addAudit('COMPRA ELIMINADA: '+p.product)
}

// ─── VENTAS ─────────────────────────────────────────────────────────────────
function showQuickSale(){
    // Reset form
    const saleProd = document.getElementById('saleProd')
    const saleQty = document.getElementById('saleQty')
    const saleClient = document.getElementById('saleClient')
    const saleCredit = document.getElementById('saleCredit')
    const salePrice = document.getElementById('salePrice')
    const saleShipping = document.getElementById('saleShipping')
    const suggestedPriceDisplay = document.getElementById('suggestedPriceDisplay')
    const saleCalcInfo = document.getElementById('saleCalcInfo')
    
    if(saleProd) {
        // Poblar select con productos
        saleProd.innerHTML = '<option value="">Seleccionar producto...</option>'
        data.products.filter(p => (p.currentStock||0) > 0).forEach(p => {
            saleProd.innerHTML += `<option value="${p.name}">${p.name} (Stock: ${p.currentStock})</option>`
        })
        saleProd.value = ''
    }
    if(saleQty) saleQty.value = '1'
    if(saleClient) saleClient.value = ''
    if(saleCredit) saleCredit.checked = false
    if(salePrice) salePrice.value = ''
    if(saleShipping) saleShipping.value = ''
    if(suggestedPriceDisplay) suggestedPriceDisplay.textContent = '-'
    if(saleCalcInfo) saleCalcInfo.classList.add('hidden')
    
    updateSaleInfo()
    showModal('modalSale')
}

// Función que maneja los eventos del modal de venta
function updateSaleInfo(){
    const saleProd = document.getElementById('saleProd')
    const saleQty = document.getElementById('saleQty')
    const salePrice = document.getElementById('salePrice')
    const saleShipping = document.getElementById('saleShipping')
    const saleClient = document.getElementById('saleClient')
    const suggestedPriceDisplay = document.getElementById('suggestedPriceDisplay')
    const saleCalcInfo = document.getElementById('saleCalcInfo')
    const saleSubtotal = document.getElementById('saleSubtotal')
    const saleMargin = document.getElementById('saleMargin')
    
    if(!saleProd || !saleQty) return
    
    const productName = saleProd.value
    const qty = parseFloat(saleQty.value) || 0
    
    if(!productName || qty <= 0){
        if(suggestedPriceDisplay) suggestedPriceDisplay.textContent = '-'
        if(saleCalcInfo) saleCalcInfo.classList.add('hidden')
        return
    }
    
    const product = data.products.find(p => p.name === productName)
    if(!product){
        if(suggestedPriceDisplay) suggestedPriceDisplay.textContent = '-'
        return
    }
    
    // Calcular precio sugerido (costo + margen)
    const basePrice = (product.avgCost || 0) * (1 + (product.markup || 30) / 100)
    if(suggestedPriceDisplay) suggestedPriceDisplay.textContent = fmtCUP(basePrice)
    
    // Si el usuario no ha puesto precio, sugerir el precio
    if(salePrice && !salePrice.value){
        salePrice.value = basePrice
    }
    
    // Calcular total
    const price = parseFloat(salePrice?.value) || 0
    const shipping = parseFloat(saleShipping?.value) || 0
    const subtotal = price * qty
    const cost = (product.avgCost || 0) * qty
    const margin = subtotal > 0 ? ((subtotal - shipping - cost) / subtotal * 100) : 0
    
    if(saleCalcInfo) {
        saleCalcInfo.classList.remove('hidden')
        if(saleSubtotal) saleSubtotal.textContent = fmtCUP(subtotal)
        if(saleMargin) {
            saleMargin.textContent = margin.toFixed(1) + '%'
            saleMargin.className = margin >= 0 ? 'font-medium text-emerald-400' : 'font-medium text-red-400'
        }
    }
}

function updateSaleTotal(){
    const productName = document.getElementById('saleProduct').value.trim()
    const qty = parseFloat(document.getElementById('saleQty').value) || 0
    const discount = parseFloat(document.getElementById('saleDiscount').value) || 0
    
    const product = data.products.find(p => p.name.toLowerCase() === productName.toLowerCase())
    if(!product){
        document.getElementById('saleTotal').textContent = '0.00 CUP'
        return
    }
    
    // Check for applicable discounts
    let finalDiscount = discount
    const clientName = document.getElementById('saleClient').value.trim()
    
    // Client discount
    if(clientName){
        const client = data.customers.find(c => c.name.toLowerCase() === clientName.toLowerCase())
        if(client && client.vipLevel){
            const vipLevel = data.vipLevels.find(v => v.name === client.vipLevel)
            if(vipLevel){
                finalDiscount = Math.max(finalDiscount, vipLevel.discount)
            }
        }
    }
    
    // Quantity discount
    const qtyDiscount = data.discounts.find(d => 
        d.type === 'mayor' && 
        d.productId === product.id && 
        qty >= (d.qtyMin || 0)
    )
    if(qtyDiscount){
        finalDiscount = Math.max(finalDiscount, qtyDiscount.percent)
    }
    
    // Day discount
    const today = new Date().toLocaleDateString('es-ES', { weekday: 'long' })
    const dayDiscount = data.discounts.find(d => 
        d.type === 'especial' && 
        d.dayName?.toLowerCase() === today.toLowerCase() &&
        (d.productId === product.id || !d.productId)
    )
    if(dayDiscount){
        finalDiscount = Math.max(finalDiscount, dayDiscount.percent)
    }
    
    // Client-specific discount
    if(clientName){
        const clientDiscount = data.discounts.find(d => 
            d.type === 'cliente' && 
            d.clientName?.toLowerCase() === clientName.toLowerCase() &&
            (d.productId === product.id || !d.productId)
        )
        if(clientDiscount){
            finalDiscount = Math.max(finalDiscount, clientDiscount.percent)
        }
    }
    
    // Calculate price with markup
    const basePrice = (product.avgCost || 0) * (1 + (product.markup || 30) / 100)
    const finalPrice = roundCash(basePrice * qty * (1 - finalDiscount / 100))
    
    document.getElementById('saleTotal').textContent = fmtCUP(finalPrice)
    document.getElementById('saleFinalPrice').value = finalPrice
    document.getElementById('saleDiscountPercent').value = finalDiscount
}

function saveSale(){
    const productName = document.getElementById('saleProd').value
    const qty = parseFloat(document.getElementById('saleQty').value)
    const price = parseFloat(document.getElementById('salePrice').value)
    const shipping = parseFloat(document.getElementById('saleShipping').value) || 0
    const clientName = document.getElementById('saleClient').value.trim() || '-'
    const onCredit = document.getElementById('saleCredit').checked
    const currency = document.getElementById('saleCurrency').value
    
    if(!productName || !qty) return alert('Producto y cantidad requeridos')
    if(!price) return alert('Precio requerido')
    
    const product = data.products.find(p => p.name === productName)
    if(!product) return alert('Producto no encontrado')
    
    if(product.currentStock < qty) return alert('Stock insuficiente. Disponible: '+product.currentStock)
    
    // Convertir precio a CUP si es necesario
    let priceCUP = price
    if(currency === 'USD'){
        priceCUP = price * (data.exchangeRates?.USD || 500)
    } else if(currency === 'EUR'){
        priceCUP = price * (data.exchangeRates?.EUR || 650)
    }
    
    const totalPrice = priceCUP * qty
    const finalPriceCUP = totalPrice - shipping
    
    // Create sale
    const sale = {
        id: nextId++,
        date: new Date().toISOString().slice(0,10),
        product: productName,
        productId: product.id,
        qty,
        unitSellPrice: price,
        unitSellPriceCUP: priceCUP,
        finalPrice: price,
        finalPriceCUP,
        shipping,
        currency,
        discountPercent: 0,
        client: clientName,
        clientId: data.customers.find(c=>c.name===clientName)?.id,
        onCredit
    }
    
    data.sales.push(sale)
    
    // Update stock
    product.currentStock -= qty
    
    // Update customer
    if(clientName !== '-'){
        let client = data.customers.find(c=>c.name.toLowerCase() === clientName.toLowerCase())
        if(!client){
            // Create new client
            client = { id: nextId++, name: clientName, debt: 0, totalSpent: 0, totalPurchases: 0 }
            data.customers.push(client)
        }
        
        if(onCredit){
            client.debt = (client.debt || 0) + finalPriceCUP
        } else {
            client.totalSpent = (client.totalSpent || 0) + finalPriceCUP
            client.totalPurchases = (client.totalPurchases || 0) + qty
        }
    }
    
    // Imprimir ticket si está marcado
    const printReceipt = document.getElementById('printReceipt')
    if(printReceipt && printReceipt.checked){
        printSaleReceipt(sale.id)
    }
    
    saveData()
    addAudit('VENTA: '+productName+' x'+qty+' -> '+clientName+' '+(onCredit ? '(FIADO)' : ''))
    hideModal('modalSale')
    renderSales()
    renderProducts()
    renderDashboard()
}

function renderSales(){
    const tbody = document.getElementById('salesTable')
    if(!tbody) return
    tbody.innerHTML = ''
    
    const list = (data.sales || [])
        .sort((a,b) => new Date(b.date) - new Date(a.date))
    
    list.forEach(s => {
        const prod = data.products.find(p => p.id === s.productId)
        const priceHtml = fmtInfo((s.finalPriceCUP || s.finalPrice || 0), 'Precio')
        const shippingCUP = s.shippingCostCUP || 0
        const shippingHtml = shippingCUP > 0
            ? '<div class="text-xs text-red-400 mt-1">📦 Envío: -'+fmtInfo(shippingCUP,'Costo envío')+'</div>'
            : ''
        const tr = document.createElement('tr')
        tr.className = 'border-b border-zinc-800 hover:bg-zinc-900'
        const payBtn = (s.onCredit && s.client && s.client!=='-') ? '<button onclick="showPayDebt(null,\''+s.client+'\')" class="text-emerald-400 hover:text-emerald-300 text-xs mr-1 px-1.5 py-0.5 rounded bg-emerald-900/40" title="Pagar deuda">💵</button>' : ''
        tr.innerHTML = '<td class="py-4">'+s.date+'</td><td>'+(prod?prod.name:'?')+'</td><td>'+s.qty+'</td><td>'+priceHtml+shippingHtml+'</td><td>'+(s.onCredit?'💳 ':'')+s.client+'</td><td>'+payBtn+'<button onclick="printSaleReceipt('+s.id+')" class="text-zinc-400 hover:text-zinc-200 text-sm mr-1" title="Imprimir recibo">🖨️</button><button onclick="deleteSale('+s.id+')" class="text-red-400 hover:text-red-300 text-sm">🗑️</button></td>'
        tbody.appendChild(tr)
    })
}

function printSaleReceipt(saleId) {
    const s = data.sales.find(x=>x.id===saleId)
    if(!s) return
    
    const prod = data.products.find(p => p.id === s.productId)
    const prodName = prod ? prod.name : '?'
    const unitPrice = s.finalPriceCUP || s.unitSellPriceCUP || 0
    const totalPrice = s.qty * unitPrice
    const discount = s.discountPercent ? (totalPrice * s.discountPercent).toFixed(2) : '0.00'
    const finalPrice = totalPrice - (parseFloat(discount) || 0)
    const clientName = s.client || 'Cliente general'
    const paymentType = s.onCredit ? 'FIADO' : 'CONTADO'
    const paymentStatus = s.onCredit ? 'PENDIENTE' : 'PAGADO'
    
    const receiptHTML = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Recibo de Venta - Vexto</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', monospace; padding: 20px; max-width: 400px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px dashed #333; padding-bottom: 15px; }
            .header h1 { font-size: 24px; margin-bottom: 5px; }
            .header p { font-size: 12px; color: #666; }
            .info { margin-bottom: 15px; font-size: 12px; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
            .items { margin: 15px 0; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd; padding: 10px 0; }
            .item { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px; }
            .item-name { flex: 1; }
            .item-qty { width: 50px; text-align: center; }
            .item-price { width: 80px; text-align: right; }
            .totals { margin-top: 15px; }
            .total-row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 5px; }
            .total-final { font-size: 18px; font-weight: bold; border-top: 2px solid #333; padding-top: 10px; margin-top: 10px; }
            .footer { text-align: center; margin-top: 30px; font-size: 10px; color: #666; }
            .badge { display: inline-block; padding: 3px 8px; border-radius: 3px; font-size: 10px; font-weight: bold; }
            .badge-paid { background: #d1fae5; color: #065f46; }
            .badge-pending { background: #fef3c7; color: #92400e; }
            @media print { body { padding: 0; } }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🧾 VEXTO</h1>
            <p>Gestor de Inventario y Ventas</p>
        </div>
        
        <div class="info">
            <div class="info-row"><span>Fecha:</span><span>${s.date}</span></div>
            <div class="info-row"><span>Cliente:</span><span>${clientName}</span></div>
            <div class="info-row"><span>Pago:</span><span>${paymentType}</span></div>
            <div class="info-row"><span>Estado:</span><span class="badge ${s.onCredit ? 'badge-pending' : 'badge-paid'}">${paymentStatus}</span></div>
        </div>
        
        <div class="items">
            <div class="item" style="font-weight: bold;">
                <span class="item-name">Producto</span>
                <span class="item-qty">Cant.</span>
                <span class="item-price">Importe</span>
            </div>
            <div class="item">
                <span class="item-name">${prodName}</span>
                <span class="item-qty">${s.qty}</span>
                <span class="item-price">${fmtBaseCurrency(totalPrice)}</span>
            </div>
        </div>
        
        <div class="totals">
            <div class="total-row"><span>Subtotal:</span><span>${fmtBaseCurrency(totalPrice)}</span></div>
            ${s.discountPercent ? '<div class="total-row"><span>Descuento ('+(s.discountPercent*100).toFixed(0)+'%):</span><span>-${fmtBaseCurrency(discount)}</span></div>' : ''}
            <div class="total-row total-final"><span>TOTAL:</span><span>${fmtBaseCurrency(finalPrice)}</span></div>
        </div>
        
        <div class="footer">
            <p>¡Gracias por su compra!</p>
            <p>Generated by Vexto v${APP_VERSION}</p>
        </div>
        
        <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
    `
    
    const printWindow = window.open('', '_blank')
    printWindow.document.write(receiptHTML)
    printWindow.document.close()
}

function deleteSale(id){ showConfirm('¿Eliminar venta?', 'El stock será devuelto al inventario.', () => _deleteSale(id)) }
function _deleteSale(id){
    const s = data.sales.find(x=>x.id===id)
    if(!s) return
    const prod = data.products.find(p=>p.id===s.productId)
    if(prod) prod.currentStock += s.qty
    if(s.onCredit && s.client && s.client!=='-'){
        const cust = data.customers.find(c=>c.name===s.client)
        if(cust){ cust.debt -= s.qty*(s.finalPriceCUP||s.unitSellPriceCUP||0); if(cust.debt<0) cust.debt=0 }
    }
    data.sales = data.sales.filter(x=>x.id!==id)
    saveData(); addAudit('VENTA ELIMINADA: '+(prod?prod.name:'?')+' x'+s.qty)
    renderSales(); renderDashboard()
}

// ─── Reportes ─────────────────────────────────────────────────────────────────
function renderReports(){
    let revenue=0, cost=0, cashSales=0, totalShipping=0
    data.sales.forEach(s => {
        const prod     = data.products.find(p=>p.id===s.productId)
        const priceCUP = s.finalPriceCUP || s.unitSellPriceCUP || 0
        const shippingCUP = s.shippingCostCUP || 0
        revenue += s.qty * priceCUP
        cost    += s.qty * (prod ? prod.avgCost : 0)
        totalShipping += shippingCUP
        if(!s.onCredit) cashSales += s.qty * priceCUP
    })
    const debtPaid   = (data.cashPayments||[]).reduce((a,p)=>a+p.amountCUP,0)
    const cash       = cashSales + debtPaid
    const pending    = data.customers.reduce((a,c)=>a+(c.debt||0),0)
    // La ganancia neta ahora resta los gastos de envío
    const netProfit = revenue - cost - totalShipping
    document.getElementById('totalProfit').innerHTML      = fmtInfo(netProfit,'Ganancia neta (restando envíos)') + (totalShipping > 0 ? ' <span class="text-xs text-red-400">(envíos: -'+fmtBaseCurrency(totalShipping)+')</span>' : '')
    document.getElementById('totalCOGS').innerHTML        = fmtInfo(cost,'Costo mercancía vendida')
    document.getElementById('totalCash').innerHTML        = fmtInfo(cash,'Cobrado en efectivo')
    document.getElementById('totalPendingDebt').innerHTML = fmtInfo(pending,'Deuda pendiente')
    document.getElementById('totalIfAllPaid').innerHTML   = fmtInfo(cash+pending,'Total si todo se cobra')
    // Debt breakdown
    const debtors = data.customers.filter(c=>(c.debt||0)>0)
    const breakdown = document.getElementById('debtBreakdown')
    const list = document.getElementById('debtBreakdownList')
    if(debtors.length){
        list.innerHTML = debtors.map(c=>'<div class="flex justify-between text-sm"><span class="text-zinc-300">'+c.name+'</span><span class="text-amber-400">'+fmtInfo(c.debt,"Deuda de "+c.name)+'</span></div>').join('')
    } else {
        list.innerHTML = '<div class="text-zinc-500 text-sm">Sin deudas pendientes ✅</div>'
    }
}

function toggleDebtBreakdown(){
    const el = document.getElementById('debtBreakdown')
    el.classList.toggle('hidden')
}

// ─── Ajustes ──────────────────────────────────────────────────────────────────
function renderSettings(){
    document.getElementById('baseCurrencySelect').value = data.baseCurrency
    document.getElementById('rateUSD').value = data.exchangeRates.USD
    document.getElementById('rateEUR').value = data.exchangeRates.EUR
    cashRoundingStep = Number(localStorage.getItem('cashRoundingStep')) || 1
    cashRoundingDir  = localStorage.getItem('cashRoundingDir') || 'round'
    document.getElementById('cashRoundingStepInput').value = cashRoundingStep
    document.getElementById('cashRoundingDirInput').value  = cashRoundingDir
}
function updateBaseCurrency(){
    data.baseCurrency = document.getElementById('baseCurrencySelect').value
    saveData(); renderAll()
}
function saveRates(){
    const usd = parseFloat(document.getElementById('rateUSD').value)
    const eur = parseFloat(document.getElementById('rateEUR').value)
    if(usd > 0) data.exchangeRates.USD = usd
    if(eur > 0) data.exchangeRates.EUR = eur
    saveData(); renderAll()
    addAudit('AJUSTES: tasas USD='+data.exchangeRates.USD+' EUR='+data.exchangeRates.EUR)
}
function saveCashRoundingStep(){
    cashRoundingStep = Number(document.getElementById('cashRoundingStepInput').value) || 1
    localStorage.setItem('cashRoundingStep', cashRoundingStep)
    renderAll()
    addAudit('AJUSTES: redondeo múltiplo = '+cashRoundingStep)
}
function saveCashRoundingDir(){
    cashRoundingDir = document.getElementById('cashRoundingDirInput').value || 'round'
    localStorage.setItem('cashRoundingDir', cashRoundingDir)
    renderAll()
    addAudit('AJUSTES: redondeo dirección = '+cashRoundingDir)
}

// ─── Auditoría ───────────────────────────────────────────────────────────────
function addAudit(action){
    if(!data.audit) data.audit = []
    const _now = new Date(); data.audit.push({timestamp: _now.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'}) + ' ' + _now.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',second:'2-digit'}), user:currentUser, action})
    saveData()
}
function showAudit(){
    const div = document.getElementById('auditLog')
    div.innerHTML = ''
    if(!data.audit || !data.audit.length){ div.innerHTML='<div class="text-zinc-500">Sin registros</div>'; }
    else [...data.audit].reverse().forEach(log => {
        const d = document.createElement('div')
        d.className = 'bg-zinc-800 p-3 rounded-lg border-l-2 border-emerald-600'
        d.innerHTML = '<div class="text-xs text-zinc-400">'+log.timestamp+' — '+log.user+'</div><div class="text-zinc-200">'+log.action+'</div>'
        div.appendChild(d)
    })
    showModal('modalAudit')
}

// ─── Export / Import ──────────────────────────────────────────────────────────
function exportData(){
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:'application/json'}))
    a.download = 'tienda_'+currentUser+'_'+new Date().toISOString().slice(0,10)+'_'+new Date().getHours()+'.'+new Date().getMinutes()+'.'+new Date().getSeconds() + (new Date().getHours() >= 12 ? 'PM' : 'AM') + '.json'
    a.click()
}
function importData(){
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = e => {
        const reader = new FileReader()
        reader.onload = ev => {
            try {
                const d = JSON.parse(ev.target.result)
                if(!d.products || !d.purchases || !d.sales) return alert('Archivo inválido')
                if(!d.exchangeRates){
                    const r = parseFloat(d.exchangeRate)||500
                    d.exchangeRates = {USD:r,EUR:650}; d.baseCurrency='CUP'
                    ;(d.products||[]).forEach(p=>{p.avgCost=(p.avgCost||0)*r; p.totalCostValue=(p.totalCostValue||0)*r})
                    ;(d.purchases||[]).forEach(p=>{p.unitCostCUP=(p.unitCost||0)*r; p.propExpCUP=(p.proportionalExpense||0)*r; p.totalExpCUP=(p.totalExpenses||0)*r})
                    ;(d.sales||[]).forEach(s=>{s.unitSellPriceCUP=(s.unitSellPrice||0)*r; s.finalPriceCUP=((s.finalPrice||s.unitSellPrice)||0)*r})
                    ;(d.customers||[]).forEach(c=>{c.debt=(c.debt||0)*r})
                }
                data = d
                saveData(); renderAll()
                alert('Base de datos importada correctamente')
            } catch(err){ alert('Error: '+err.message) }
        }
        reader.readAsText(e.target.files[0])
    }
    input.click()
}

// ─── Auto-login (DESACTIVADO) ─────────────────────────────────────────────────────
// Esta función iniciaba sesión automáticamente si había datos guardados.
// Para activarla de nuevo, descomenta el código abaixo:
// window.addEventListener('DOMContentLoaded', () => {
//     const saved = localStorage.getItem('tienda_lastUser')
//     if(saved && localStorage.getItem('tienda_'+saved)){
//         document.getElementById('loginUser').value = saved
//         handleLogin()
//     }
// })

document.addEventListener('click', function(e){
    if(e.target.classList.contains('currency-info-btn')){
        const cup   = parseFloat(e.target.dataset.value)
        const label = e.target.dataset.label
        showCurrencyInfo(cup, label)
    }
})

// ─── Reset database ───────────────────────────────────────────────────────────
function showResetDatabaseConfirm(){

    showConfirm(
        'Eliminar base de datos',
        'Se borrarán TODOS los datos permanentemente. Esta acción no se puede deshacer.',
        confirmResetDatabase,
        {
            label:'Eliminar todo',
            btnClass:'bg-red-600 hover:bg-red-500',
            icon:'⚠️'
        }
    )
const cancelBtn = document.querySelector('#modalConfirm .bg-zinc-800')
if(cancelBtn) cancelBtn.style.display = ''
}

function confirmResetDatabase(){
    if(!currentUser) return

    localStorage.removeItem('tienda_' + currentUser)

    data = {
        products:[],
        purchases:[],
        sales:[],
        customers:[],
        providers:[],
        discounts:[],
        audit:[],
        vipLevels:[],
        exchangeRates:{USD:500,EUR:650},
        baseCurrency:'CUP'
    }

    saveData()
    renderAll()

    showConfirm(
        'Base de datos eliminada',
        'Todos los datos fueron borrados correctamente.',
        ()=>{ hideModal('modalConfirm') },
        {
            label:'Aceptar',
            btnClass:'bg-emerald-600 hover:bg-emerald-500',
            icon:'✅'
        }
    )

// ocultar botón cancelar
const cancelBtn = document.querySelector('#modalConfirm .bg-zinc-800')
if(cancelBtn) cancelBtn.style.display = 'none'
}

// ─── Editar base de datos ─────────────────────────────────────────────────────
function showEditDatabase(){
    const editor = document.getElementById('databaseEditor')
    editor.value = JSON.stringify(data, null, 2)
    showModal('modalEditDatabase')
}

// Guardar cambios en la base de datos desde el editor
function saveEditedDatabase(){
    const editor = document.getElementById('databaseEditor')
    try {
        const newData = JSON.parse(editor.value)
        if(!newData.products || !newData.purchases || !newData.sales) return alert('Archivo inválido')
        data = newData
        saveData()
        renderAll()
        hideModal('modalEditDatabase')
        addAudit('BASE DE DATOS EDITADA MANUALMENTE')
    } catch(err){
        alert('Error: '+err.message)
    }
}

// ─── Current Month data ─────────────────────────────────────────────────────────────
let currentMonthChart = null

function renderCurrentMonthChart(){

    const canvas = document.getElementById('currentMonthChart')
    if(!canvas) return

    const now = new Date()
    const month = now.getMonth()
    const year = now.getFullYear()

    const daysInMonth = new Date(year, month+1, 0).getDate()

    const sales = Array(daysInMonth).fill(0)
    const purchases = Array(daysInMonth).fill(0)

    data.sales.forEach(s=>{
        const d = new Date(s.date)
        if(d.getMonth()===month && d.getFullYear()===year){
            sales[d.getDate()-1] += (s.qty * s.finalPriceCUP) || 0
        }
    })

    data.purchases.forEach(p=>{
        const d = new Date(p.date)
        if(d.getMonth()===month && d.getFullYear()===year){
            purchases[d.getDate()-1] += (p.qty * p.unitCostCUP) || 0
        }
    })

    const labels = Array.from({length:daysInMonth}, (_,i)=> (i+1).toString())

    if(currentMonthChart){
        currentMonthChart.destroy()
    }

    currentMonthChart = new Chart(canvas, {
        type:'bar',
        data:{
            labels:labels,
            datasets:[
                {
                    label:'Ventas',
                    data:sales
                },
                {
                    label:'Compras',
                    data:purchases
                }
            ]
        },
        options:{
            responsive:true,
            plugins:{
                legend:{
                    labels:{ color:'#fff' }
                }
            },
            scales:{
                x:{ ticks:{ color:'#aaa' } },
                y:{ ticks:{ color:'#aaa' } }
            }
        }
    })
}

// ─── Información ─────────────────────────────────────────────────────────────
function renderInfo(){
    document.getElementById('infoContent').innerHTML = `
        <h3 class="text-xl font-bold mb-4">📖 Guía de Vexto</h3>
        
        <div class="space-y-4">
            <div class="bg-zinc-900 p-4 rounded-xl">
                <h4 class="font-bold text-emerald-400 mb-2">💰 Monedas y tasas</h4>
                <p class="text-sm text-zinc-300">Vexto soporta tres monedas: CUP, USD y EUR. Las tasas de cambio son informales y se configuran en Ajustes. Todos los valores se guardan en CUP internamente.</p>
            </div>
            
            <div class="bg-zinc-900 p-4 rounded-xl">
                <h4 class="font-bold text-emerald-400 mb-2">📦 Inventario</h4>
                <p class="text-sm text-zinc-300">Cada producto tiene un costo promedio que se calcula automáticamente con cada compra. El precio de venta se calcula: costo × (1 + markup%).</p>
            </div>
            
            <div class="bg-zinc-900 p-4 rounded-xl">
                <h4 class="font-bold text-emerald-400 mb-2">💳 Ventas al fiado</h4>
                <p class="text-sm text-zinc-300">Cuando vendes al fiado, el monto se suma a la deuda del cliente. Puedes registrar pagos desde la sección de Clientes.</p>
            </div>
            
            <div class="bg-zinc-900 p-4 rounded-xl">
                <h4 class="font-bold text-emerald-400 mb-2">🏷️ Descuentos</h4>
                <p class="text-sm text-zinc-300">Vexto soporta 4 tipos: (1) Por cantidad, (2) Por día especial, (3) Por cliente, (4) General. Se aplican automáticamente si cumplen las condiciones.</p>
            </div>
            
            <div class="bg-zinc-900 p-4 rounded-xl">
                <h4 class="font-bold text-emerald-400 mb-2">⭐ VIP</h4>
                <p class="text-sm text-zinc-300">Los niveles VIP dan descuentos permanentes a los clientes. Configúralos en el botón "Niveles VIP" en la sección de Clientes.</p>
            </div>
            
            <div class="bg-zinc-900 p-4 rounded-xl">
                <h4 class="font-bold text-emerald-400 mb-2">📊 Ganancias</h4>
                <p class="text-sm text-zinc-300">La ganancia neta = ingresos - costos - gastos de envío. Solo las ventas cobradas cuentan para la ganancia del día.</p>
            </div>
            
            <div class="bg-zinc-900 p-4 rounded-xl">
                <h4 class="font-bold text-emerald-400 mb-2">💾 Respaldo</h4>
                <p class="text-sm text-zinc-300">Usa Exportar regularmente para guardar tus datos. Los datos se guardan en este navegador.</p>
            </div>
        </div>
        
        <div class="mt-6 text-center text-zinc-500 text-sm">
            <p>Vexto v${APP_VERSION}</p>
            <p class="mt-1">Desarrollado con ❤️ para emprendedores cubanos</p>
        </div>
    `
}

// ─── Fin del archivo local ────────────────────────────────────────────────────
