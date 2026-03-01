// ─── Estado global ────────────────────────────────────────────────────────────
let cashRoundingStep = 1    // múltiplo mínimo de billete
let cashRoundingDir  = 'round'  // 'ceil' | 'floor' | 'round'
let currentUser = ''
let data = { products:[], purchases:[], sales:[], customers:[], providers:[], discounts:[], audit:[], vipLevels:[], exchangeRates:{USD:500,EUR:650}, baseCurrency:'CUP', businessInfo:{} }
let nextId = 1

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
                <span class="text-amber-400 font-bold">${fmtCUP(c.debt)}</span>
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

// ─── Formato número simple ───────────────────────────────
function fmtNum(num){
    num = Number(num) || 0
    return num.toLocaleString('es-ES', {minimumFractionDigits: 0, maximumFractionDigits: 0})
}

// ─── Formato: muestra en moneda base + botón ℹ️ ───────────────────────────────
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

// ─── Login ────────────────────────────────────────────────────────────────────
function handleLogin(){
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
    document.getElementById('loginPage').classList.add('hidden')
    document.getElementById('app').classList.remove('hidden')
    document.getElementById('currentUser').textContent = user
    renderAll()
    if(isNew) showModal('modalSetupRates')
}
function logout(){
    saveData()
    currentUser = ''
    document.getElementById('app').classList.add('hidden')
    document.getElementById('loginPage').classList.remove('hidden')
    document.getElementById('loginUser').value = ''
}
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
    showModal('modalSetupBusiness')
}

function saveBusinessInfo(fromSettings = false){
    const name = document.getElementById('businessName').value.trim()
    if(!name) return alert('El nombre del negocio es obligatorio')
    
    data.businessInfo = {
        name: name,
        address: document.getElementById('businessAddress').value.trim(),
        phone: document.getElementById('businessPhone').value.trim(),
        email: document.getElementById('businessEmail').value.trim(),
        nit: document.getElementById('businessNit').value.trim(),
        message: document.getElementById('businessMessage').value.trim()
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
    showModal('modalSetupBusiness')
    // Override the save function temporarily to use the settings version
    document.querySelector('#modalSetupBusiness button[onclick="saveBusinessInfo()"]').onclick = function() { saveBusinessInfo(true) }
}

// ─── Modales / Nav ────────────────────────────────────────────────────────────
let _modalZBase = 50;
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
    document.getElementById(sec).classList.add('active')
    const nav = document.querySelector('.app-nav')
    if(nav && window.innerWidth <= 1023) nav.classList.remove('mobile-open')
    if(sec==='dashboard') renderDashboard()
    if(sec==='products')  renderProducts()
    if(sec==='discounts') renderDiscounts()
    if(sec==='customers') renderCustomers()
    if(sec==='providers') renderProviders()
    if(sec==='purchases') renderPurchases()
    if(sec==='sales')     renderSales()
    if(sec==='reports')   renderReports()
    if(sec==='reports')   renderCurrentMonthChart()
    if(sec==='settings')  renderSettings()
    if(sec==='info')      renderInfo()
}
// ─── Modal de Confirmación ────────────────────────────────────────────────────
function showConfirm(title, message, onConfirm, opts){
    opts = opts||{}
    document.getElementById('confirmTitle').textContent = title
    document.getElementById('confirmMessage').textContent = message
    document.getElementById('confirmIcon').textContent = opts.icon || '🗑️'
    const btn = document.getElementById('confirmBtn')
    btn.textContent  = opts.label    || 'Eliminar'
    btn.className    = 'flex-1 py-3 rounded-2xl text-sm font-semibold ' + (opts.btnClass || 'bg-red-600 hover:bg-red-500')
    btn.onclick = () => { hideModal('modalConfirm'); onConfirm() }
    showModal('modalConfirm')
}

// ─── Clientes y VIP ──────────────────────────────────────────────────────────
function renderCustomers(){
    const tbody = document.getElementById('customersTable')
    if(!tbody) return
    tbody.innerHTML = ''
    
    const search = (document.getElementById('customerSearch')?.value || '').toLowerCase().trim()
    const list = (data.customers || [])
        .filter(c => !search || c.name.toLowerCase().includes(search))
    
    if(!list.length){
        tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-zinc-500">' + (search ? 'Sin resultados' : 'No hay clientes registrados') + '</td></tr>'
        return
    }
    list.forEach(c => {
        const vip = c.vipLevel ? (data.vipLevels||[]).find(v=>v.id===c.vipLevel) : null
        const vipBadge = vip
            ? '<span class="text-xs bg-amber-900 text-amber-300 px-2 py-0.5 rounded-full ml-1">⭐ '+vip.name+' ('+vip.percent+'%)</span>'
            : '<span class="text-xs text-zinc-600">—</span>'
        const custSales = data.sales.filter(s => s.client === c.name)
        const purchaseCount = custSales.length
        const totalSpent    = custSales.reduce((a,s) => a + s.qty*(s.finalPriceCUP||s.unitSellPriceCUP||0), 0)
        const tr = document.createElement('tr')
        tr.className = 'border-b border-zinc-800 hover:bg-zinc-900'
        tr.innerHTML = '<td class="py-4 font-medium cursor-pointer hover:text-emerald-400" onclick="showCustomerHistory('+c.id+')">'+c.name+'</td>'
            +'<td>'+vipBadge+'</td>'
            +'<td class="text-zinc-300">'+(purchaseCount > 0 ? purchaseCount+'x' : '<span class="text-zinc-600">0</span>')+'</td>'
            +'<td>'+(totalSpent > 0 ? fmtInfo(totalSpent,'Total gastado') : '<span class="text-zinc-600">—</span>')+'</td>'
            +'<td>'+fmtInfo(c.debt||0,'Deuda')+'</td>'
            +'<td class="flex gap-2 py-4">'
            +(c.debt > 0 ? '<button onclick="showPayDebt('+c.id+')" class="text-emerald-400 hover:text-emerald-300 text-xs px-1.5 py-0.5 rounded bg-emerald-900/40 mr-1" title="Registrar pago">💵 Pagar</button>' : '')
            +'<button onclick="showEditCustomer('+c.id+')" class="text-zinc-400 hover:text-zinc-200 text-sm">✏️</button>'
            +'<button onclick="deleteCustomer('+c.id+')" class="text-red-400 hover:text-red-300 text-sm">🗑️</button>'
            +'</td>'
        tbody.appendChild(tr)
    })
}
function showAddCustomer(){
    if(!data.vipLevels) data.vipLevels = []
    const sel = document.getElementById('customerVipLevel')
    sel.innerHTML = '<option value="">Sin nivel VIP</option>'
    data.vipLevels.forEach(v => {
        const o = document.createElement('option')
        o.value = v.id; o.textContent = '⭐ '+v.name+' ('+v.percent+'%)'
        sel.appendChild(o)
    })
    document.getElementById('customerName').value = ''
    document.getElementById('customerId').value = ''
    document.getElementById('customerVipLevel').value = ''
    showModal('modalCustomer')
}
function showEditCustomer(id){
    const c = data.customers.find(x=>x.id===id)
    if(!c) return
    if(!data.vipLevels) data.vipLevels = []
    const sel = document.getElementById('customerVipLevel')
    sel.innerHTML = '<option value="">Sin nivel VIP</option>'
    data.vipLevels.forEach(v => {
        const o = document.createElement('option')
        o.value = v.id; o.textContent = '⭐ '+v.name+' ('+v.percent+'%)'
        sel.appendChild(o)
    })
    document.getElementById('customerName').value = c.name
    document.getElementById('customerId').value = c.id
    document.getElementById('customerVipLevel').value = c.vipLevel || ''
    showModal('modalCustomer')
}
function saveCustomer(){
    const name  = document.getElementById('customerName').value.trim()
    const idVal = document.getElementById('customerId').value
    const vip   = document.getElementById('customerVipLevel').value
    if(!name) return alert('Nombre requerido')
    if(idVal){
        const c = data.customers.find(x=>x.id===parseInt(idVal))
        if(c){ c.name = name; c.vipLevel = vip }
    } else {
        data.customers.push({id:nextId++, name, debt:0, vipLevel:vip})
    }
    saveData(); hideModal('modalCustomer'); renderCustomers()
    addAudit('CLIENTE: '+name+(vip?' VIP='+vip:''))
}
function deleteCustomer(id){
    const c = data.customers.find(x=>x.id===id)
    if(!c) return
    showConfirm('¿Eliminar cliente?', '"'+c.name+'" será eliminado. Sus deudas en ventas se conservan.', () => {
        data.customers = data.customers.filter(x=>x.id!==id)
        saveData(); addAudit('CLIENTE ELIMINADO: '+c.name); renderCustomers()
    })
}

// Customer History Modal Functions
function showCustomerHistory(customerId){
    const c = data.customers.find(x=>x.id===customerId)
    if(!c) return
    const custSales = data.sales.filter(s => s.client === c.name)
    const vip = c.vipLevel ? (data.vipLevels||[]).find(v=>v.id===c.vipLevel) : null
    let html = '<div class="bg-zinc-800 rounded-2xl p-4 mb-4"><div class="flex justify-between items-center"><div><div class="text-lg font-bold text-white">'+c.name+'</div>'+(vip ? '<div class="text-amber-400 text-sm">⭐ '+vip.name+' ('+vip.percent+'% descuento)</div>' : '')+'</div><div class="text-right"><div class="text-zinc-400 text-xs">Deuda actual</div><div class="text-amber-400 font-bold text-lg">'+fmtCUP(c.debt||0)+'</div></div></div></div>'
    if(custSales.length === 0){
        html += '<div class="text-center text-zinc-500 py-8">Este cliente no tiene compras registradas</div>'
    } else {
        const sortedSales = [...custSales].sort((a,b) => b.date.localeCompare(a.date))
        let totalSpent = 0
        html += '<div class="space-y-2 max-h-80 overflow-y-auto">'
        sortedSales.forEach(s => {
            const prod = data.products.find(p => p.id === s.productId)
            const prodName = prod ? prod.name : '?'
            const price = s.finalPriceCUP || s.unitSellPriceCUP || 0
            const total = s.qty * price
            totalSpent += total
            const isCredit = s.isCredit ? '<span class="text-amber-400 text-xs ml-2">📤 Fiado</span>' : '<span class="text-emerald-400 text-xs ml-2">✅ Contado</span>'
            html += '<div class="bg-zinc-800 rounded-xl p-3 flex justify-between items-center"><div><div class="text-white font-medium">'+prodName+'</div><div class="text-zinc-500 text-xs">'+s.date+' × '+s.qty+' '+isCredit+'</div></div><div class="text-right"><div class="text-emerald-400 font-semibold">'+fmtCUP(total)+'</div><div class="text-zinc-500 text-xs">'+fmtCUP(price)+' c/u</div></div></div>'
        })
        html += '</div>'
        html += '<div class="bg-zinc-800 rounded-2xl p-4 mt-4 flex justify-between items-center"><div class="text-zinc-400">Total gastado</div><div class="text-emerald-400 font-bold text-xl">'+fmtCUP(totalSpent)+'</div></div>'
    }
    document.getElementById('customerHistoryContent').innerHTML = html
    document.getElementById('customerHistoryContent').dataset.customerName = c.name
    showModal('modalCustomerHistory')
}

function printCustomerHistory(){
    const content = document.getElementById('customerHistoryContent')
    const customerName = content.dataset.customerName || 'Cliente'
    const html = content.innerHTML
    const printWindow = window.open('', '_blank')
    printWindow.document.write('<!DOCTYPE html><html><head><title>Historial - '+customerName+'</title><style>body{font-family:system-ui,sans-serif;padding:20px}.bg-zinc-800{background:#3f3f46;padding:16px;border-radius:8px;margin-bottom:8px}.text-white{color:#fff}.text-zinc-400{color:#a1a1aa}.text-zinc-500{color:#71717a}.text-emerald-400{color:#34d399}.text-amber-400{color:#fbbf24}.font-bold{font-weight:700}.text-lg{font-size:18px}.text-xl{font-size:24px}.text-xs{font-size:12px}.flex{display:flex}.justify-between{justify-content:space-between}.items-center{align-items:center}.text-right{text-align:right}@media print{body{padding:0}}</style></head><body><h1>🧾 Historial de '+customerName+'</h1>'+html+'<script>window.onload=function(){window.print();window.close()}</script></body></html>')
    printWindow.document.close()
}

function showManageVipLevels(){
    if(!data.vipLevels) data.vipLevels = []
    renderVipLevels()
    document.getElementById('vipLevelName').value = ''
    document.getElementById('vipLevelPercent').value = ''
    showModal('modalVipLevel')
}
function renderVipLevels(){
    const c = document.getElementById('vipLevelsList')
    c.innerHTML = ''
    if(!data.vipLevels || !data.vipLevels.length){
        c.innerHTML = '<div class="text-zinc-500 text-sm text-center py-3">No hay niveles creados</div>'
        return
    }
    data.vipLevels.forEach(v => {
        const div = document.createElement('div')
        div.className = 'bg-zinc-800 rounded-2xl px-4 py-3 flex justify-between items-center'
        div.innerHTML = '<div><span class="text-amber-400 font-semibold">⭐ '+v.name+'</span><span class="text-zinc-400 text-xs ml-2">'+v.percent+'% descuento</span></div>'
            +'<button onclick="deleteVipLevel(\''+v.id+'\')" class="text-red-400 hover:text-red-300 text-sm">🗑️</button>'
        c.appendChild(div)
    })
}
function addVipLevel(){
    const name    = document.getElementById('vipLevelName').value.trim()
    const percent = parseFloat(document.getElementById('vipLevelPercent').value)
    if(!name) return alert('Nombre requerido')
    if(!percent || percent <= 0 || percent >= 100) return alert('Porcentaje inválido (1-99)')
    if(!data.vipLevels) data.vipLevels = []
    const id = 'vip_'+Date.now()
    data.vipLevels.push({id, name, percent})
    saveData()
    addAudit('NIVEL VIP: '+name+' '+percent+'%')
    document.getElementById('vipLevelName').value = ''
    document.getElementById('vipLevelPercent').value = ''
    renderVipLevels()
}
function deleteVipLevel(id){
    showConfirm('¿Eliminar nivel VIP?', 'Los clientes con este nivel quedarán sin nivel.', () => {
        data.vipLevels = (data.vipLevels||[]).filter(v=>v.id!==id)
        // Remove from customers
        ;(data.customers||[]).forEach(c=>{ if(c.vipLevel===id) c.vipLevel='' })
        saveData(); renderVipLevels(); renderCustomers()
    })
}

// ─── Mark as received ────────────────────────────────────────────────────────
function markPurchaseReceived(id){
    const p = data.purchases.find(x=>x.id===id)
    if(!p || p.inStock) return
    const prod = data.products.find(x=>x.id===p.productId)
    if(!prod) return
    showConfirm('¿Marcar como recibido?', 'El stock se sumará al inventario ahora.', () => {
        const unitCUP = p.unitCostCUP || 0
        const propCUP = p.propExpCUP  || 0
        const finalCostCUP = unitCUP + (p.qty > 0 ? propCUP/p.qty : 0)
        prod.currentStock   = (prod.currentStock||0)   + p.qty
        prod.totalCostValue = (prod.totalCostValue||0) + p.qty * finalCostCUP
        prod.avgCost        = prod.totalCostValue / prod.currentStock
        p.inStock = true
        saveData()
        addAudit('RECIBIDO: '+(prod?prod.name:'?')+' x'+p.qty+' de '+(p.supplier||'-'))
        renderPurchases(); renderProducts(); renderDashboard()
    }, {label:'Entregado', btnClass:'bg-emerald-600 hover:bg-emerald-500', icon:'📦'})
}
function markProductReceived(productId){
    const pending = data.purchases.filter(p=>p.productId===productId && !p.inStock)
    if(!pending.length) return
    const prod = data.products.find(x=>x.id===productId)
    if(!prod) return
    showConfirm('¿Marcar todo como recibido?', pending.length+' envío(s) pendientes de '+prod.name+' se sumarán al stock.', () => {
        pending.forEach(p => {
            const unitCUP = p.unitCostCUP || 0
            const propCUP = p.propExpCUP  || 0
            const finalCostCUP = unitCUP + (p.qty > 0 ? propCUP/p.qty : 0)
            prod.currentStock   = (prod.currentStock||0)   + p.qty
            prod.totalCostValue = (prod.totalCostValue||0) + p.qty * finalCostCUP
            prod.avgCost        = prod.totalCostValue / prod.currentStock
            p.inStock = true
        })
        saveData()
        addAudit('RECIBIDO (lote): '+prod.name+' — '+pending.reduce((a,p)=>a+p.qty,0)+' unidades')
        renderPurchases(); renderProducts(); renderDashboard()
    }, {label:'Entregado', btnClass:'bg-emerald-600 hover:bg-emerald-500', icon:'📦'})
}

// ─── Pago de deudas ──────────────────────────────────────────────────────────
// totalCash in reports — we need to track cash payments separately
// We'll add to data.cashPayments array
function showPayDebt(customerId, clientName){
    if(!data.cashPayments) data.cashPayments = []
    let cust = null
    if(customerId) cust = data.customers.find(c=>c.id===customerId)
    else if(clientName) cust = data.customers.find(c=>c.name===clientName)
    if(!cust) return alert('Cliente no encontrado')
    const debtCUP = cust.debt || 0
    document.getElementById('payDebtCustomerId').value = cust.id
    document.getElementById('payDebtClientName').value = cust.name
    document.getElementById('payDebtAmount').value = ''
    document.getElementById('payDebtCurrency').value = 'CUP'
    document.getElementById('payDebtInfo').innerHTML =
        '<div class="flex justify-between"><span class="text-zinc-400">Cliente:</span><span class="font-semibold">'+cust.name+'</span></div>'
        +'<div class="flex justify-between"><span class="text-zinc-400">Deuda total:</span><span class="text-amber-400 font-bold">'+fmtInfo(debtCUP,'Deuda')+'</span></div>'
    showModal('modalPayDebt')
}
function payDebtFull(){
    const custId = parseInt(document.getElementById('payDebtCustomerId').value)
    const cust = data.customers.find(c=>c.id===custId)
    if(!cust) return
    document.getElementById('payDebtAmount').value = cust.debt.toFixed(2)
    document.getElementById('payDebtCurrency').value = 'CUP'
}
function saveDebtPayment(){
    const custId  = parseInt(document.getElementById('payDebtCustomerId').value)
    const amount  = parseFloat(document.getElementById('payDebtAmount').value)
    const cur     = document.getElementById('payDebtCurrency').value
    if(!amount || amount <= 0) return alert('Monto inválido')
    const cust = data.customers.find(c=>c.id===custId)
    if(!cust) return
    const amountCUP = toCUP(amount, cur)
    const paid = Math.min(amountCUP, cust.debt)
    cust.debt = Math.max(0, cust.debt - paid)
    if(!data.cashPayments) data.cashPayments = []
    data.cashPayments.push({id:nextId++, date:new Date().toISOString().slice(0,10), customerId:custId, clientName:cust.name, amountCUP:paid, currencyOriginal:cur})
    saveData()
    addAudit('PAGO DEUDA: '+cust.name+' pagó '+fmtCUP(paid)+(paid < amountCUP ? ' (deuda era menor, ajustado)':''))
    hideModal('modalPayDebt')
    renderCustomers(); renderReports(); renderDashboard()
    showConfirm('✅ Pago registrado', cust.name+' pagó '+paid.toFixed(2)+' CUP. Deuda restante: '+cust.debt.toFixed(2)+' CUP.', ()=>{}, {label:'Aceptar', btnClass:'bg-emerald-600 hover:bg-emerald-500', icon:'✅'})
    // Override confirm button to just close
}


// ─── Sección Información ─────────────────────────────────────────────────────
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

    const ex = (label, val) =>
        `<div class="bg-zinc-800 rounded-2xl px-4 py-3 flex justify-between items-center text-xs">
            <span class="text-zinc-400">${label}</span>
            <span class="text-emerald-400 font-mono font-semibold">${val}</span>
        </div>`

    const p = s => `<p>${s}</p>`
    const note = s => `<p class="text-zinc-500 text-xs">${s}</p>`

    c.innerHTML = [

      card('🚀','Guía de inicio rápido',
        p('¿Es tu primera vez usando Vexto? Sigue estos pasos básicos para empezar:')
        + '<ol class="list-decimal pl-5 space-y-2 mt-3">'
        + '<li><span class="font-semibold text-emerald-400">📦 Crea productos:</span> Ve a Productos → click en "+ Nuevo". Dale nombre, categoría, stock mínimo y margen de ganancia (ej: 50%).</li>'
        + '<li><span class="font-semibold text-emerald-400">🛒 Registra compras:</span> Ve a Compras → "+ Nueva compra". Selecciona el proveedor y agrega los productos con su costo. Esto suma stock a tu inventario.</li>'
        + '<li><span class="font-semibold text-emerald-400">💰 Haz ventas:</span> Ve a Ventas → "+ Venta rápida" o usa el botón grande del Dashboard. Elige el producto, cantidad y el precio (el sugerido se calcula solo).</li>'
        + '<li><span class="font-semibold text-emerald-400">👥 Administra clientes:</span> En Clientes puedes registrar clientes y ver su historial. Si les vendes a crédito, se registra como deuda.</li>'
        + '<li><span class="font-semibold text-emerald-400">💾 Respalda tus datos:</span> Usa los botones "📥 Importar" y "📤 Exportar" en la barra superior. Exporta al menos una vez al día.</li>'
        + '</ol>'
        + note('💡 Consejo: Explora el Dashboard para ver el valor de tu stock, ganancias del día y deudas pendientes.')
      ),

      card('⌨️','Atajos de teclado',
        p('Vexto soporta atajos de teclado para mejorar tu productividad:')
        + '<div class="bg-zinc-800 rounded-xl p-3 mt-3 space-y-2">'
        + '<div class="flex justify-between"><span class="text-zinc-400">Cerrar modal</span><kbd class="bg-zinc-700 px-2 py-1 rounded text-xs">Esc</kbd></div>'
        + '<div class="flex justify-between"><span class="text-zinc-400">Nuevo producto</span><kbd class="bg-zinc-700 px-2 py-1 rounded text-xs">Ctrl + N</kbd></div>'
        + '<div class="flex justify-between"><span class="text-zinc-400">Guardar</span><kbd class="bg-zinc-700 px-2 py-1 rounded text-xs">Ctrl + S</kbd></div>'
        + '<div class="flex justify-between"><span class="text-zinc-400">Buscar</span><kbd class="bg-zinc-700 px-2 py-1 rounded text-xs">Ctrl + F</kbd></div>'
        + '</div>'
        + note('Presiona Ctrl+F en cualquier sección para enfocar el campo de búsqueda.')
      ),

      card('📦','Costo promedio ponderado (avgCost)',
        p('Cada vez que compras unidades de un producto, Vexto recalcula el costo promedio considerando tanto las unidades existentes como las nuevas.')
        + p('La fórmula es: <code class="bg-zinc-800 px-1 rounded">(stock_anterior × costo_anterior + nuevas_unidades × nuevo_costo) ÷ stock_total</code>')
        + ex('Tienes 10 unidades a 100 CUP c/u → compras 5 más a 130 CUP c/u',
             '(10×100 + 5×130) ÷ 15 = 110 CUP promedio')
        + note('Esto asegura que el precio sugerido de venta refleje cuánto costó la mezcla real de inventario, no solo el último lote.')
      ),

      card('💰','Precio sugerido de venta',
        p('Vexto sugiere un precio basado en el costo promedio más tu margen de ganancia configurado.')
        + p('Fórmula: <code class="bg-zinc-800 px-1 rounded">costo_promedio × (1 + margen/100)</code>')
        + ex('Costo promedio: 110 CUP · Margen: 50%', '110 × 1.5 = 165 CUP sugerido')
        + note('Puedes cambiar el margen al crear un producto. Si hay redondeo activo, el precio se ajusta al múltiplo de billete más cercano.')
      ),

      card('🔄','Redondeo de precios',
        p('Para evitar vueltos en billetes pequeños, puedes configurar un múltiplo mínimo de billete (ej: 50 CUP).')
        + p('Modos disponibles: al más cercano, siempre hacia arriba ↑, siempre hacia abajo ↓.')
        + ex('Precio calculado: 163 CUP · Múltiplo 50 · Modo: arriba', '→ 200 CUP')
        + ex('Precio calculado: 163 CUP · Múltiplo 50 · Modo: cercano', '→ 150 CUP')
        + note('El precio sugerido se redondea; el precio final siempre lo decides tú.')
      ),

      card('💱','Conversión de monedas',
        p('Vexto trabaja internamente en CUP. Cuando registras una compra o venta en USD o EUR, convierte al momento usando las tasas que configuraste.')
        + p('Los valores históricos quedan guardados en CUP para que los reportes sean consistentes aunque cambies las tasas después.')
        + ex('Compra: 10 unidades a 1 USD c/u · Tasa: 500 CUP/USD', '→ Costo unitario: 500 CUP')
        + ex('Venta: 1 unidad a 0.5 USD · Tasa: 500 CUP/USD', '→ Ingreso: 250 CUP')
        + note('Actualiza las tasas regularmente en ⚙️ Ajustes para que los precios sugeridos sean precisos.')
      ),

      card('🏷️','Descuentos y niveles VIP',
        p('Los descuentos se aplican automáticamente en la venta. Vexto toma el mayor descuento aplicable entre todos los activos.')
        + p('Tipos de descuento: al por mayor (por cantidad mínima), día especial (por nombre de evento), cliente específico, general (para todos).')
        + p('Los niveles VIP asignan un % de descuento permanente a clientes. Si un cliente tiene nivel VIP y también hay un descuento por cantidad, gana el mayor.')
        + ex('Cliente con VIP 15% compra 60 unidades · Descuento mayoreo 10%', '→ Se aplica 15% (el mayor)')
        + note('Los descuentos reducen el ingreso de la venta. La ganancia neta se calcula sobre el precio final con descuento.')
      ),

      card('🚚','Compras: En camino vs En almacén',
        p('Al registrar una compra puedes marcarla como "En camino" o "En almacén".')
        + p('"En camino": el stock NO se suma al inventario todavía, pero el gasto sí se cuenta en el valor comprometido del Dashboard.')
        + p('"En almacén": el stock se suma inmediatamente y el costo promedio se recalcula.')
        + ex('Pediste 20 unidades a 100 CUP (en camino)', '→ Stock: sin cambios · Dashboard suma 2.000 CUP comprometidos')
        + ex('Marcas como Entregado', '→ Stock +20 · Costo promedio recalculado')
        + note('Al eliminar una compra "En camino", el stock no se toca. Al eliminar una "En almacén", el stock se descuenta.')
      ),

      card('📊','Cálculo de ganancia',
        p('La ganancia neta por venta es: <code class="bg-zinc-800 px-1 rounded">(precio_final - costo_promedio) × cantidad</code>')
        + p('La ganancia neta total en Reportes suma todas las ventas. El costo de mercancía vendida (COGS) es la suma de costo_promedio × cantidad de cada venta.')
        + ex('Vendiste 5 unidades a 200 CUP · Costo promedio: 110 CUP', '→ Ganancia: (200-110)×5 = 450 CUP')
        + note('Si eliminas una venta, el stock se devuelve pero la auditoría queda registrada.')
      ),

      card('💵','Caja, deudas y fiado',
        p('La sección Reportes separa tres valores:')
        + `<ul class="list-disc pl-5 space-y-1">
            <li><span class="text-emerald-400 font-semibold">Cobrado en efectivo</span>: ventas al contado + pagos de deuda ya cobrados.</li>
            <li><span class="text-amber-400 font-semibold">Deuda pendiente</span>: ventas a fiado que aún no fueron pagadas. Este dinero existe pero no está en caja.</li>
            <li><span class="text-sky-400 font-semibold">Total si todo se cobra</span>: suma de los dos anteriores — tu potencial real si todos pagan.</li>
        </ul>`
        + ex('Efectivo: 5.000 CUP · Fiado pendiente: 1.200 CUP', '→ Total potencial: 6.200 CUP')
        + note('Registra los pagos de deuda con el botón 💵 en Clientes o Ventas. Solo entonces el dinero pasa a Cobrado en efectivo.')
      ),

      card('🔢','Valor del stock',
        p('El Dashboard muestra el valor total del inventario calculado como: suma de <code class="bg-zinc-800 px-1 rounded">stock × costo_promedio</code> de cada producto.')
        + p('También incluye el valor comprometido en envíos "En camino" (calculado sobre el costo unitario de cada compra pendiente).')
        + ex('Producto A: 10 uds × 110 CUP = 1.100 CUP · Producto B: 5 uds × 200 CUP = 1.000 CUP', '→ Valor stock: 2.100 CUP')
        + note('Este valor no es la ganancia potencial — es cuánto dinero tienes invertido en mercancía.')
      ),

      card('📈','Ganancia neta vs COGS',
        p('<span class="text-emerald-400 font-semibold">Ganancia neta</span> = Ingresos por ventas - Costo de mercancía - Gastos adicionales.')
        + p('<span class="text-sky-400 font-semibold">COGS</span> (Costo de lo vendido) = Solo el costo de los productos que se vendieron, no el costo total del inventario.')
        + `<ul class="list-disc pl-5 space-y-1 mt-2">`
        + `<li>COGS = suma de (costo_promedio × cantidad_vendida) de cada venta</li>`
        + `<li>No incluye productos que aún están en almacén</li>`
        + `</ul>`
        + ex('Vendiste 5 unidades (costo: 110 CUP c/u) · Ingreso: 1.000 CUP', 'COGS: 550 CUP · Ganancia: 450 CUP (sin gastos)')
        + note('Los gastos adicionales (envío, etc.) se restan de la ganancia, no del COGS.')
      ),

      card('📋','Diferencia entre cobrado y vendido',
        p('Es importante entender la diferencia entre lo que <span class="text-emerald-400">vendes</span> y lo que <span class="text-amber-400">cobras</span>:')
        + `<ul class="list-disc pl-5 space-y-2 mt-2">`
        + `<li><span class="text-emerald-400 font-semibold">Cobrado en efectivo</span>: Dinero que ya tienes en caja (ventas al contado + pagos de deuda)</li>`
        + `<li><span class="text-amber-400 font-semibold">Deuda pendiente</span>: Ventas a fiado que aún no se han cobrado</li>`
        + `<li><span class="text-sky-400 font-semibold">Total vendido</span>: Ingresos totales (efectivo + deuda)</li>`
        + `</ul>`
        + ex('Ventas del mes: 10.000 CUP (8.000 efectivo + 2.000 fiado)', '→ Cobrado: 8.000 CUP · Pendiente: 2.000 CUP')
        + note('La ganancia "real" de tu negocio es sobre lo que cobras, no sobre las ventas registradas.')
      ),

      card('🎯','Entendiendo el Dashboard',
        p('El Dashboard te da una vista rápida de tu negocio:')
        + `<ul class="list-disc pl-5 space-y-2 mt-2">`
        + `<li><span class="text-emerald-400">📦 Valor stock</span>: Cuánto dinero tienes invertido en mercancía (no es ganancia)</li>`
        + `<li><span class="text-amber-400">💰 Deudores</span>: Total que te deben - dinero que existe pero no tienes en caja</li>`
        + `<li><span class="text-emerald-400">📈 Ganancia hoy</span>: Ganancias de ventas cobradas hoy (no incluye fiados)</li>`
        + `<li><span class="text-sky-400">💵 Ventas del mes</span>: Total de ventas del mes (incluye fiados, no es lo que has cobrado)</li>`
        + `</ul>`
        + note('Para una imagen completa, revisa la sección Reportes.')
      ),

    ].join('')
}

function renderAll(){ renderDashboard(); renderProducts(); renderDiscounts(); renderCustomers(); renderPurchases(); renderSales(); renderReports(); renderSettings() }

// ─── Dashboard ────────────────────────────────────────────────────────────────
function renderDashboard(){
    // Stock value: in-storage products only (avgCost * currentStock)
    const stockValue = data.products.reduce((a,p) => a + (p.currentStock||0)*(p.avgCost||0), 0)
    // Add in-transit value (purchased but not arrived yet) — counted as committed spend
    const transitValue = data.purchases
        .filter(p => !p.inStock)
        .reduce((a,p) => a + p.qty * (p.unitCostCUP||0), 0)
    const totalDebt   = data.customers.reduce((a,c) => a + (c.debt||0), 0)
    const todayDate = new Date()
    const today = todayDate.toISOString().slice(0,10)
    const todayProfit = data.sales.filter(s=>s.date===today).reduce((a,s)=>{
        const p = data.products.find(pr=>pr.id===s.productId)
        const price = s.finalPriceCUP || s.unitSellPriceCUP || 0
        return a + s.qty * (price - (p ? p.avgCost : 0))
    }, 0)
    const transitCount = data.purchases.filter(p => !p.inStock).length
    const stockLabel = transitCount > 0
        ? 'Valor stock <span class="text-xs text-amber-400 ml-1">+🚚'+transitCount+'</span>'
        : 'Valor stock'
    document.getElementById('dashStockValue').innerHTML  = fmtInfo(stockValue + transitValue, 'Valor stock (incl. en camino)')
    document.getElementById('dashDebt').innerHTML        = fmtInfo(totalDebt,   'Deudores')
    document.getElementById('dashTodayProfit').innerHTML = fmtInfo(todayProfit, 'Ganancia hoy')
    document.getElementById('dashMonthSales').textContent = data.sales.length
    
    // ─── Comparación semanal ────────────────────────────────────────────────
    // Get start of current week (Sunday)
    const dayOfWeek = todayDate.getDay()
    const startOfThisWeek = new Date(todayDate)
    startOfThisWeek.setDate(todayDate.getDate() - dayOfWeek)
    const startOfThisWeekStr = startOfThisWeek.toISOString().slice(0,10)
    
    // Start of previous week
    const startOfPrevWeek = new Date(startOfThisWeek)
    startOfPrevWeek.setDate(startOfThisWeek.getDate() - 7)
    const startOfPrevWeekStr = startOfPrevWeek.toISOString().slice(0,10)
    const endOfPrevWeek = new Date(startOfThisWeek)
    endOfPrevWeek.setDate(startOfThisWeek.getDate() - 1)
    const endOfPrevWeekStr = endOfPrevWeek.toISOString().slice(0,10)
    
    // Sales this week
    const thisWeekSales = data.sales.filter(s => s.date >= startOfThisWeekStr)
    const thisWeekCount = thisWeekSales.length
    
    // Sales last week
    const prevWeekSales = data.sales.filter(s => s.date >= startOfPrevWeekStr && s.date <= endOfPrevWeekStr)
    const prevWeekCount = prevWeekSales.length
    
    // Update week comparison UI
    const weekCountEl = document.getElementById('weekSalesCount')
    const prevWeekCountEl = document.getElementById('prevWeekSalesCount')
    const weekBar = document.getElementById('weekSalesBar')
    const prevWeekBar = document.getElementById('prevWeekSalesBar')
    const weekComparison = document.getElementById('weekComparison')
    
    if(weekCountEl) weekCountEl.textContent = thisWeekCount
    if(prevWeekCountEl) prevWeekCountEl.textContent = prevWeekCount
    
    // Set bar heights (max = 100% for the larger value)
    const maxWeekCount = Math.max(thisWeekCount, prevWeekCount, 1)
    if(weekBar) weekBar.style.height = (thisWeekCount / maxWeekCount * 100) + '%'
    if(prevWeekBar) prevWeekBar.style.height = (prevWeekCount / maxWeekCount * 100) + '%'
    
    // Show comparison text
    if(weekComparison) {
        if(prevWeekCount === 0 && thisWeekCount > 0) {
            weekComparison.innerHTML = '<span class="text-emerald-400 font-semibold">⬆ Nueva semana con ventas</span>'
        } else if(prevWeekCount === 0 && thisWeekCount === 0) {
            weekComparison.innerHTML = '<span class="text-zinc-500">Sin ventas en ambas semanas</span>'
        } else {
            const diff = thisWeekCount - prevWeekCount
            const pct = Math.round((diff / prevWeekCount) * 100)
            if(diff > 0) {
                weekComparison.innerHTML = '<span class="text-emerald-400 font-semibold">⬆ +' + diff + ' ventas (' + pct + '% vs semana anterior)</span>'
            } else if(diff < 0) {
                weekComparison.innerHTML = '<span class="text-red-400 font-semibold">⬇ ' + diff + ' ventas (' + pct + '% vs semana anterior)</span>'
            } else {
                weekComparison.innerHTML = '<span class="text-zinc-400">=</span>'
            }
        }
    }
    
    // ─── Compras en camino ─────────────────────────────────────────────────
    const inTransitEl = document.getElementById('inTransitCount')
    const inTransitValueEl = document.getElementById('inTransitValue')
    const inTransitListEl = document.getElementById('inTransitList')
    
    if(inTransitEl) inTransitEl.textContent = transitCount
    if(inTransitValueEl) inTransitValueEl.textContent = fmtNum(transitValue) + ' CUP'
    
    // List in-transit purchases
    if(inTransitListEl) {
        const inTransitPurchases = data.purchases.filter(p => !p.inStock)
        if(inTransitPurchases.length === 0) {
            inTransitListEl.innerHTML = '<div class="text-zinc-500 text-xs">No hay compras pendientes</div>'
        } else {
            inTransitListEl.innerHTML = inTransitPurchases.slice(0, 5).map(p => {
                const prod = data.products.find(pr => pr.id === p.productId) || {name: 'Producto'}
                return '<div class="text-xs bg-zinc-800 rounded-lg p-2 flex justify-between"><span class="text-zinc-300">' + prod.name + '</span><span class="text-amber-400">x' + p.qty + '</span></div>'
            }).join('')
            if(inTransitPurchases.length > 5) {
                inTransitListEl.innerHTML += '<div class="text-xs text-zinc-500 text-center">+' + (inTransitPurchases.length - 5) + ' más</div>'
            }
        }
    }
    
    // ─── Top productos del mes ──────────────────────────────────────────────
    const topProductsEl = document.getElementById('topProductsList')
    if(topProductsEl) {
        // Get sales this month
        const thisMonth = today.slice(0, 7) // YYYY-MM
        const monthSales = data.sales.filter(s => s.date.startsWith(thisMonth))
        
        // Group by product and sum quantity
        const productSales = {}
        monthSales.forEach(s => {
            if(!productSales[s.productId]) productSales[s.productId] = 0
            productSales[s.productId] += s.qty
        })
        
        // Convert to array and sort
        const topProducts = Object.entries(productSales)
            .map(([productId, qty]) => ({
                productId: parseInt(productId),
                qty,
                product: data.products.find(p => p.id === parseInt(productId))
            }))
            .filter(item => item.product)
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5)
        
        if(topProducts.length === 0) {
            topProductsEl.innerHTML = '<div class="text-zinc-500 text-sm text-center py-4">Sin ventas este mes</div>'
        } else {
            topProductsEl.innerHTML = topProducts.map((item, idx) => {
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1) + '.'
                return '<div class="flex items-center justify-between bg-zinc-800 rounded-xl px-4 py-3"><div class="flex items-center gap-3"><span class="text-lg">' + medal + '</span><span class="font-medium">' + item.product.name + '</span></div><span class="text-emerald-400 font-bold">' + item.qty + ' uds</span></div>'
            }).join('')
        }
    }
    
    // Update low stock badge
    const lowStockProducts = data.products.filter(p => (p.currentStock||0) > 0 && (p.currentStock||0) < (p.minStock||0))
    const zeroStockProducts = data.products.filter(p => (p.currentStock||0) <= 0)
    const totalLowStock = lowStockProducts.length + zeroStockProducts.length
    
    // Count debtors with debt older than 1 week
    const oneWeekAgo = new Date(todayDate.getTime() - 7 * 24 * 60 * 60 * 1000)
    const oldDebtors = (data.customers || []).filter(c => {
        if(!c.debt || c.debt <= 0) return false
        const clientSales = data.sales.filter(s => 
            s.client === c.name && 
            s.onCredit && 
            new Date(s.date) < oneWeekAgo
        )
        return clientSales.length > 0
    })
    
    const totalNotifications = totalLowStock + oldDebtors.length
    const badge = document.getElementById('lowStockBadge')
    const countEl = document.getElementById('lowStockCount')
    if(badge && countEl) {
        countEl.textContent = totalNotifications
        if(totalNotifications > 0) {
            badge.classList.remove('hidden')
        } else {
            badge.classList.add('hidden')
        }
    }
}

// ─── Productos ────────────────────────────────────────────────────────────────
let productSortKey = 'name'
let productSortDir = 1  // 1 = asc, -1 = desc

function sortProducts(key){
    if(productSortKey === key) productSortDir *= -1
    else { productSortKey = key; productSortDir = 1 }
    renderProducts()
}

function renderProducts(){
    const search = (document.getElementById('productSearch')?.value || '').toLowerCase().trim()

    // Sort indicators
    ;['name','category','currentStock','avgCost'].forEach(k => {
        const el = document.getElementById('sort-'+k)
        if(el) el.textContent = k === productSortKey ? (productSortDir === 1 ? '\u25b2' : '\u25bc') : ''
    })

    // Filter + sort
    const list = data.products
        .filter(p => !search || p.name.toLowerCase().includes(search))
        .slice()
        .sort((a, b) => {
            let av = a[productSortKey] ?? '', bv = b[productSortKey] ?? ''
            if(typeof av === 'string') return av.localeCompare(bv) * productSortDir
            return (av - bv) * productSortDir
        })

    // Rebuild tbody completely to avoid browser quirks with table mutation
    const table = document.querySelector('#products table')
    if(!table) return
    const oldTbody = table.querySelector('tbody')
    if(oldTbody) oldTbody.remove()
    const tbody = document.createElement('tbody')
    tbody.id = 'productsTable'
    tbody.className = 'text-sm'
    table.appendChild(tbody)

    if(!list.length){
        const tr = document.createElement('tr')
        tr.innerHTML = '<td colspan="6" class="py-8 text-center text-zinc-500">Sin resultados</td>'
        tbody.appendChild(tr)
        return
    }

    list.forEach(p => {
        const transitPurchases = (data.purchases||[]).filter(pu => pu.productId === p.id && !pu.inStock)
        const transitQty = transitPurchases.reduce((a,pu) => a + pu.qty, 0)
        const stockClass = p.currentStock <= 0
            ? 'text-red-400 font-semibold'
            : p.currentStock < (p.minStock || 0)
                ? 'text-amber-400'
                : 'text-emerald-400'
        const truckHtml = transitQty > 0
            ? ' <button onclick="showTransitInfo('+p.id+')" class="text-amber-400 hover:text-amber-300 text-base" title="'+transitQty+' en camino">🚚</button>'
            + ' <button onclick="markProductReceived('+p.id+')" class="text-emerald-400 hover:text-emerald-300 text-xs px-1.5 py-0.5 rounded bg-emerald-900/40 hover:bg-emerald-900/70" title="Marcar todo como recibido">✅ Recibido</button>'
            : ''
        const tr = document.createElement('tr')
        tr.className = 'border-b border-zinc-800 hover:bg-zinc-900'
        tr.innerHTML = '<td class="py-4">'+p.name+truckHtml+'</td>'
            +'<td>'+p.category+'</td>'
            +'<td class="'+stockClass+'">'+(p.currentStock||0)+'</td>'
            +'<td>'+fmtInfo(p.avgCost||0,'Costo promedio')+'</td>'
            +'<td>'+(p.minStock||0)+'</td>'
            +'<td><button onclick="deleteProduct('+p.id+')" class="text-red-400 hover:text-red-300 text-sm" title="Eliminar">🗑️</button></td>'
        tbody.appendChild(tr)
    })
}

function deleteProduct(id){ showConfirm('¿Eliminar producto?', 'El historial se conservará (aparecerá como "?").', () => _deleteProduct(id)) }
function _deleteProduct(id){
    const prod = data.products.find(p=>p.id===id)
    if(!prod) return
    data.products = data.products.filter(p=>p.id!==id)
    saveData()
    addAudit('PRODUCTO ELIMINADO: '+prod.name)
    renderProducts(); renderDashboard()
}

function showProductsInfo(){
    const total   = data.products.length
    const sinStock = data.products.filter(p => (p.currentStock||0) <= 0).length
    const bajo    = data.products.filter(p => (p.currentStock||0) > 0 && (p.currentStock||0) < (p.minStock||0)).length
    const ok      = total - sinStock - bajo
    const stockVal = data.products.reduce((a,p) => a + (p.currentStock||0)*(p.avgCost||0), 0)

    document.getElementById('productsInfoContent').innerHTML =
        '<div class="bg-zinc-800 rounded-2xl p-4 flex justify-between items-center">'
            +'<span class="text-zinc-400">Total de productos</span>'
            +'<span class="font-bold text-white text-lg">'+total+'</span>'
        +'</div>'
        +'<div class="bg-zinc-800 rounded-2xl p-4 flex justify-between items-center">'
            +'<span class="text-zinc-400">✅ Stock correcto</span>'
            +'<span class="font-bold text-emerald-400 text-lg">'+ok+'</span>'
        +'</div>'
        +'<div class="bg-zinc-800 rounded-2xl p-4 flex justify-between items-center">'
            +'<span class="text-zinc-400">⚠️ Stock bajo</span>'
            +'<span class="font-bold text-amber-400 text-lg">'+bajo+'</span>'
        +'</div>'
        +'<div class="bg-zinc-800 rounded-2xl p-4 flex justify-between items-center">'
            +'<span class="text-zinc-400">🔴 Sin stock</span>'
            +'<span class="font-bold text-red-400 text-lg">'+sinStock+'</span>'
        +'</div>'
        +'<div class="bg-zinc-800 rounded-2xl p-4 flex justify-between items-center border-t border-zinc-700 mt-1">'
            +'<span class="text-zinc-400">💰 Valor total stock</span>'
            +'<span class="font-bold text-emerald-300 text-sm">'+fmtInfo(stockVal,'Valor stock')+'</span>'
        +'</div>'
    showModal('modalProductsInfo')
}

function showDailyReport(){
    const today = new Date().toISOString().slice(0,10)
    
    // Get today's sales
    const todaySales = data.sales.filter(s => s.date === today)
    
    // Get today's purchases
    const todayPurchases = data.purchases.filter(p => p.date === today)
    
    // Calculate totals
    let totalVentas = 0
    let totalEfectivo = 0
    let totalFiado = 0
    let totalGastos = 0
    let totalCompras = 0
    
    todaySales.forEach(s => {
        const ventaTotal = (s.finalPriceCUP || s.unitSellPriceCUP || 0) * s.qty
        totalVentas += ventaTotal
        if (s.onCredit) {
            totalFiado += ventaTotal
        } else {
            totalEfectivo += ventaTotal
        }
        totalGastos += (s.expense||0)
    })
    
    todayPurchases.forEach(p => {
        totalCompras += (p.totalCostCUP || 0)
    })
    
    const gananciaNeta = totalVentas - totalGastos
    
    // Get date formatted
    const fechaObj = new Date()
    const fechaFormateada = fechaObj.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    
    // Get business info
    const bi = data.businessInfo || {}
    const businessHeader = bi.name ? `
        <div class="text-center mb-4 pb-4 border-b border-zinc-700">
            <div class="text-xl font-bold text-white">${bi.name}</div>
            ${bi.address ? `<div class="text-xs text-zinc-400">📍 ${bi.address}</div>` : ''}
            ${bi.phone ? `<div class="text-xs text-zinc-400">📞 ${bi.phone}</div>` : ''}
            ${bi.email ? `<div class="text-xs text-zinc-400">📧 ${bi.email}</div>` : ''}
            ${bi.nit ? `<div class="text-xs text-zinc-400">🆔 NIT: ${bi.nit}</div>` : ''}
        </div>
    ` : ''
    
    let html = `
        ${businessHeader}
        <div class="bg-zinc-800 rounded-2xl p-4 mb-4">
            <div class="text-center">
                <div class="text-lg font-bold text-white">📊 REPORTE DEL DÍA</div>
                <div class="text-sm text-zinc-400">${fechaFormateada}</div>
            </div>
        </div>
        
        <!-- Resumen -->
        <div class="grid grid-cols-2 gap-3 mb-4">
            <div class="bg-zinc-800 rounded-xl p-3 text-center">
                <div class="text-xs text-zinc-400">Ventas</div>
                <div class="text-xl font-bold text-sky-400">${fmtCUP(totalVentas)}</div>
            </div>
            <div class="bg-zinc-800 rounded-xl p-3 text-center">
                <div class="text-xs text-zinc-400">Ganancia</div>
                <div class="text-xl font-bold text-emerald-400">${fmtCUP(gananciaNeta)}</div>
            </div>
            <div class="bg-zinc-800 rounded-xl p-3 text-center">
                <div class="text-xs text-zinc-400">Efectivo</div>
                <div class="text-xl font-bold text-emerald-300">${fmtCUP(totalEfectivo)}</div>
            </div>
            <div class="bg-zinc-800 rounded-xl p-3 text-center">
                <div class="text-xs text-zinc-400">Fiado</div>
                <div class="text-xl font-bold text-amber-400">${fmtCUP(totalFiado)}</div>
            </div>
        </div>
        
        <!-- Compras del día -->
        <div class="bg-zinc-800 rounded-xl p-3 mb-4">
            <div class="font-semibold text-zinc-300 mb-2">🛒 Compras del día: ${fmtCUP(totalCompras)}</div>
            ${todayPurchases.length === 0 ? '<div class="text-zinc-500 text-sm">No hay compras registradas</div>' : ''}
            ${todayPurchases.map(p => {
                const prod = data.products.find(pr => pr.id === p.productId)
                return `<div class="text-sm flex justify-between py-1 border-b border-zinc-700 last:border-0">
                    <span>${prod ? prod.name : 'Producto #' + p.productId} (${p.qty} uds)</span>
                    <span class="text-amber-400">${fmtCUP(p.totalCostCUP || 0)}</span>
                </div>`
            }).join('')}
        </div>
        
        <!-- Ventas del día -->
        <div class="bg-zinc-800 rounded-xl p-3 mb-4">
            <div class="font-semibold text-zinc-300 mb-2">💰 Ventas del día (${todaySales.length} transacciones)</div>
            ${todaySales.length === 0 ? '<div class="text-zinc-500 text-sm">No hay ventas registradas</div>' : ''}
            ${todaySales.map(s => {
                const prod = data.products.find(pr => pr.id === s.productId)
                const total = (s.finalPriceCUP || s.unitSellPriceCUP || 0) * s.qty
                return `<div class="text-sm py-1 border-b border-zinc-700 last:border-0">
                    <div class="flex justify-between">
                        <span>${prod ? prod.name : 'Producto #' + s.productId} (${s.qty} uds)</span>
                        <span class="${s.onCredit ? 'text-amber-400' : 'text-emerald-400'}">${fmtCUP(total)}</span>
                    </div>
                    <div class="text-xs text-zinc-500 flex justify-between">
                        <span>${s.client || 'Sin cliente'}</span>
                        <span>${s.onCredit ? '🔴 Fiado' : '✅ Efectivo'}</span>
                    </div>
                </div>`
            }).join('')}
        </div>
        
        <!-- Resumen final -->
        <div class="bg-zinc-800 rounded-xl p-3">
            <div class="font-semibold text-zinc-300 mb-2">📋 Resumen</div>
            <div class="space-y-1 text-sm">
                <div class="flex justify-between"><span class="text-zinc-400">Total ventas:</span><span>${fmtCUP(totalVentas)}</span></div>
                <div class="flex justify-between"><span class="text-zinc-400">Efectivo cobrado:</span><span class="text-emerald-400">${fmtCUP(totalEfectivo)}</span></div>
                <div class="flex justify-between"><span class="text-zinc-400">Pendiente de cobro:</span><span class="text-amber-400">${fmtCUP(totalFiado)}</span></div>
                <div class="flex justify-between"><span class="text-zinc-400">Gastos:</span><span class="text-red-400">-${fmtCUP(totalGastos)}</span></div>
                <div class="flex justify-between"><span class="text-zinc-400">Compras:</span><span class="text-amber-400">-${fmtCUP(totalCompras)}</span></div>
                <div class="border-t border-zinc-700 mt-2 pt-2 flex justify-between font-bold">
                    <span>Ganancia neta:</span>
                    <span class="${gananciaNeta >= 0 ? 'text-emerald-400' : 'text-red-400'}">${fmtCUP(gananciaNeta)}</span>
                </div>
            </div>
        </div>
    `
    
    document.getElementById('dailyReportContent').innerHTML = html
    showModal('modalDailyReport')
}

function printDailyReport(){
    const contenido = document.getElementById('dailyReportContent').innerHTML
    
    // Get business info for print header
    const bi = data.businessInfo || {}
    const businessHeader = bi.name ? `
        <div style="text-align: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #27272a;">
            <div style="font-size: 1.5rem; font-weight: bold; margin-bottom: 5px;">${bi.name}</div>
            ${bi.address ? `<div style="color: #71717a; font-size: 0.875rem;">📍 ${bi.address}</div>` : ''}
            ${bi.phone ? `<div style="color: #71717a; font-size: 0.875rem;">📞 ${bi.phone}</div>` : ''}
            ${bi.email ? `<div style="color: #71717a; font-size: 0.875rem;">📧 ${bi.email}</div>` : ''}
            ${bi.nit ? `<div style="color: #71717a; font-size: 0.875rem;">🆔 NIT: ${bi.nit}</div>` : ''}
        </div>
    ` : ''
    
    const printWindow = window.open('', '_blank')
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Reporte del día - Vexto</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                .bg-zinc-800 { background: #f4f4f5; padding: 15px; border-radius: 10px; margin: 10px 0; }
                .text-zinc-400 { color: #71717a; }
                .text-zinc-300 { color: #d4d4d8; }
                .text-emerald-400 { color: #34d399; }
                .text-amber-400 { color: #fbbf24; }
                .text-sky-400 { color: #38bdf8; }
                .text-red-400 { color: #f87171; }
                .text-xl { font-size: 1.25rem; }
                .text-lg { font-size: 1.125rem; }
                .text-sm { font-size: 0.875rem; }
                .text-xs { font-size: 0.75rem; }
                .font-bold { font-weight: bold; }
                .font-semibold { font-weight: 600; }
                .grid { display: grid; }
                .grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
                .gap-3 { gap: 0.75rem; }
                .mb-2 { margin-bottom: 0.5rem; }
                .mb-4 { margin-bottom: 1rem; }
                .space-y-1 > * + * { margin-top: 0.25rem; }
                .border-t { border-top: 1px solid #3f3f46; }
                .mt-2 { margin-top: 0.5rem; }
                .pt-2 { padding-top: 0.5rem; }
                .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
                .rounded-xl { border-radius: 0.75rem; }
                .rounded-2xl { border-radius: 1rem; }
                .text-center { text-align: center; }
                .flex { display: flex; }
                .justify-between { justify-content: space-between; }
            </style>
        </head>
        <body>
            ${businessHeader}
            ${contenido}
            ${bi.message ? `<div style="text-align: center; margin-top: 20px; padding-top: 10px; border-top: 1px solid #27272a; color: #71717a; font-size: 0.875rem;">${bi.message}</div>` : ''}
            <script>window.onload = function() { window.print(); window.close(); }</script>
        </body>
        </html>
    `)
    printWindow.document.close()
}

function showTransitInfo(productId){
    const prod = data.products.find(p=>p.id===productId)
    if(!prod) return
    const transitPurchases = data.purchases.filter(p=>p.productId===productId && !p.inStock)
    let html = '<div class="text-sm font-semibold text-zinc-300 mb-3">'+prod.name+'</div>'
    if(!transitPurchases.length){
        html += '<div class="text-zinc-500">No hay stock en camino.</div>'
    } else {
        transitPurchases.forEach(p => {
            const totalCUP = p.qty * (p.unitCostCUP||0)
            html += '<div class="bg-zinc-800 rounded-2xl p-3 space-y-1">'
                + '<div class="flex justify-between"><span class="text-zinc-400">Fecha:</span><span>'+p.date+'</span></div>'
                + '<div class="flex justify-between"><span class="text-zinc-400">Cantidad:</span><span class="text-amber-400 font-semibold">'+p.qty+'</span></div>'
                + '<div class="flex justify-between"><span class="text-zinc-400">Proveedor:</span><span>'+(p.supplier||'-')+'</span></div>'
                + '<div class="flex justify-between"><span class="text-zinc-400">Costo total:</span><span>'+fmtInfo(totalCUP,'Costo en camino')+'</span></div>'
                + '</div>'
        })
        const totalQty = transitPurchases.reduce((a,p)=>a+p.qty,0)
        html += '<div class="mt-2 text-center text-sm text-amber-400 font-semibold">🚚 Total en camino: '+totalQty+' unidades</div>'
    }
    document.getElementById('transitInfoContent').innerHTML = html
    showModal('modalTransitInfo')
}

function showAddProduct(){ showModal('modalProduct') }
function saveProduct(){
    const name   = document.getElementById('prodName').value.trim()
    const cat    = document.getElementById('prodCat').value.trim()
    const min    = parseFloat(document.getElementById('prodMin').value) || 0
    const markup = (parseFloat(document.getElementById('prodMarkup').value) || 50) / 100
    if(!name) return alert('Nombre requerido')
    data.products.push({id:nextId++, name, category:cat||'General', minStock:min, currentStock:0, totalCostValue:0, avgCost:0, markup})
    saveData(); hideModal('modalProduct'); renderProducts(); renderDashboard()
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

// ─── Compras ──────────────────────────────────────────────────────────────────
function updateShippingLabel(){
    const inStock = document.getElementById('purchaseInStock').checked
    document.getElementById('purchaseShippingLabel').textContent = inStock
        ? '✅ En almacén — stock disponible de inmediato'
        : '🚚 En camino — aún no llegó al almacén'
}

function showAddPurchase(){
    populateProvidersDatalist()
    document.getElementById('purchaseDate').value = new Date().toISOString().slice(0,10)
    document.getElementById('purchaseSupp').value = ''
    document.getElementById('purchaseInStock').checked = false
    updateShippingLabel()
    document.getElementById('purchaseLinesList').innerHTML = '<div class="text-zinc-500 text-sm px-1">Haz clic en “+ Agregar producto”</div>'
    document.getElementById('expensesList').innerHTML = ''
    showModal('modalPurchase')
}
function addPurchaseLine(){
    const list = document.getElementById('purchaseLinesList')
    // remove placeholder
    const ph = list.querySelector('.text-zinc-500')
    if(ph) ph.remove()

    const lineId = 'line_' + Date.now() + '_' + Math.floor(Math.random()*1000)
    const div = document.createElement('div')
    div.className = 'bg-zinc-700 p-2 md:p-3 rounded-xl'
    div.dataset.lineId = lineId
    const prods = data.products.map(p=>'<option value="'+p.id+'">'+p.name+'</option>').join('')
    const currs = ['CUP','USD','EUR'].map(c=>'<option value="'+c+'"'+(c===data.baseCurrency?' selected':'')+'>'+c+'</option>').join('')
    div.innerHTML =
        '<div class="grid grid-cols-12 gap-1 items-center">'
        +'<select class="col-span-4 bg-zinc-800 border-0 rounded-lg px-2 py-1 text-xs purchase-prod" onchange="updatePurchaseLine(\''+lineId+'\')">'
        +'<option value="">Producto…</option>'+prods+'</select>'
        +'<input type="number" placeholder="Cant." class="col-span-2 bg-zinc-800 border-0 rounded-lg px-2 py-1 text-xs purchase-qty" oninput="updatePurchaseLine(\''+lineId+'\')">'
        +'<input type="number" placeholder="Precio" class="col-span-2 bg-zinc-800 border-0 rounded-lg px-2 py-1 text-xs purchase-unit" oninput="updatePurchaseLine(\''+lineId+'\')">'
        +'<select class="col-span-2 bg-zinc-800 border-0 rounded-lg px-1 py-1 text-xs purchase-currency" onchange="updatePurchaseLine(\''+lineId+'\')">'+currs+'</select>'
        +'<span class="col-span-1 text-right text-zinc-400 text-xs purchase-subtotal">-</span>'
        +'<button type="button" onclick="this.closest(\'[data-line-id]\').remove()" class="text-zinc-500 hover:text-red-400 text-lg leading-none">×</button>'
        +'</div>'
    list.appendChild(div)
}
function updatePurchaseLine(lineId){
    const div = document.querySelector('[data-line-id="'+lineId+'"]')
    if(!div) return
    const qty  = parseFloat(div.querySelector('.purchase-qty').value)  || 0
    const unit = parseFloat(div.querySelector('.purchase-unit').value) || 0
    const cur  = div.querySelector('.purchase-currency').value
    const sub  = fromCUP(toCUP(qty*unit,cur),data.baseCurrency)
    div.querySelector('.purchase-subtotal').textContent = sub > 0 ? sub.toFixed(2)+' '+data.baseCurrency : '-'
}
function addExpenseLine(){
    const div = document.createElement('div')
    div.className = 'flex gap-2 expense-row'
    const currs = ['CUP','USD','EUR'].map(c=>'<option value="'+c+'"'+(c===data.baseCurrency?' selected':'')+'>'+c+'</option>').join('')
    div.innerHTML = '<input placeholder="Descripción" class="flex-1 bg-zinc-800 border-0 rounded-2xl px-3 py-2 text-xs expense-desc">'
        +'<input type="number" placeholder="Monto" class="w-20 bg-zinc-800 border-0 rounded-2xl px-3 py-2 text-xs expense-amount">'
        +'<select class="bg-zinc-800 border-0 rounded-2xl px-2 py-2 text-xs expense-currency">'+currs+'</select>'
        +'<span class="text-zinc-500 cursor-pointer text-lg" onclick="this.parentElement.remove()">×</span>'
    document.getElementById('expensesList').appendChild(div)
}
function savePurchase(){
    const date    = document.getElementById('purchaseDate').value
    const supp    = document.getElementById('purchaseSupp').value.trim()
    const inStock = document.getElementById('purchaseInStock').checked
    if(!date || !supp) return alert('Fecha y proveedor requeridos')

    const lineDivs = document.querySelectorAll('#purchaseLinesList [data-line-id]')
    const lines = []
    lineDivs.forEach(div => {
        const prodId = parseInt(div.querySelector('.purchase-prod').value)
        const qty    = parseFloat(div.querySelector('.purchase-qty').value)
        const unit   = parseFloat(div.querySelector('.purchase-unit').value)
        const cur    = div.querySelector('.purchase-currency').value
        if(prodId && qty > 0 && unit > 0) lines.push({prodId, qty, unit, cur})
    })
    if(!lines.length) return alert('Agrega al menos un producto con cantidad y precio')

    let totalExpCUP = 0
    document.querySelectorAll('.expense-row').forEach(row => {
        totalExpCUP += toCUP(parseFloat(row.querySelector('.expense-amount').value)||0, row.querySelector('.expense-currency').value)
    })
    const totalValCUP = lines.reduce((a,l) => a + toCUP(l.qty*l.unit, l.cur), 0)

    const batchId = nextId++
    lines.forEach(line => {
        const prod = data.products.find(p => p.id === line.prodId)
        if(!prod) return
        const unitCostCUP  = toCUP(line.unit, line.cur)
        const propExpCUP   = totalValCUP > 0 ? (line.qty*unitCostCUP/totalValCUP)*totalExpCUP : 0
        const finalCostCUP = unitCostCUP + (line.qty > 0 ? propExpCUP/line.qty : 0)

        // Only add to live stock if inStock (already arrived)
        if(inStock){
            prod.currentStock   = (prod.currentStock  ||0) + line.qty
            prod.totalCostValue = (prod.totalCostValue ||0) + line.qty*finalCostCUP
            prod.avgCost        = prod.totalCostValue / prod.currentStock
        }

        data.purchases.push({
            id: nextId++, batchId, productId:line.prodId,
            date, qty:line.qty, unitCostCUP, propExpCUP, totalExpCUP,
            currencyOriginal:line.cur, supplier:supp,
            inStock  // true = en almacen, false = en camino
        })
    })
//    if(supp && !data.customers.find(c=>c.name===supp))
//        data.customers.push({id:nextId++, name:supp, debt:0, vipLevel:''})

    saveData()
    const status = inStock ? 'en almacén' : 'en camino'
    addAudit('COMPRA ('+status+'): '+lines.map(l=>{const p=data.products.find(pr=>pr.id===l.prodId); return p?p.name+' x'+l.qty:'?'}).join(', ')+' de '+supp)
    hideModal('modalPurchase'); renderPurchases(); renderProducts(); renderDashboard()
}
function renderPurchases(){
    const tbody = document.getElementById('purchasesTable')
    tbody.innerHTML = ''
    
    const search = (document.getElementById('purchaseSearch')?.value || '').toLowerCase().trim()
    
    const list = (data.purchases || []).filter(p => {
        if(search) {
            const prod = data.products.find(pr=>pr.id===p.productId)
            const prodName = prod ? prod.name.toLowerCase() : ''
            return p.date.includes(search) || 
                   prodName.includes(search) || 
                   (p.supplier && p.supplier.toLowerCase().includes(search)) ||
                   String(p.qty).includes(search)
        }
        return true
    })
    
    if(!list.length){
        tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-zinc-500">' + (search ? 'Sin resultados' : 'No hay compras registradas') + '</td></tr>'
        return
    }
    
    list.forEach(p => {
        const prod    = data.products.find(pr=>pr.id===p.productId)
        const costCUP = p.unitCostCUP !== undefined ? p.unitCostCUP : 0
        const statusHtml = p.inStock
            ? '<span class="text-xs text-emerald-400">✅ Almacén</span>'
            : '<span class="text-xs text-amber-400">🚚 En camino</span>'
        const tr = document.createElement('tr')
        tr.className = 'border-b border-zinc-800 hover:bg-zinc-900'
        tr.innerHTML = '<td class="py-4">'+p.date+'</td>'
            +'<td>'+(prod?prod.name:'?')+'</td>'
            +'<td>'+p.qty+'</td>'
            +'<td>'+fmtInfo(costCUP,'Costo unitario')+'</td>'
            +'<td>'+(p.supplier||'-')+'</td>'
            +'<td>'+statusHtml+'</td>'
            +'<td>'
            +(p.inStock ? '' : '<button onclick="markPurchaseReceived('+p.id+')" class="text-emerald-400 hover:text-emerald-300 text-xs mr-2 px-1.5 py-0.5 rounded bg-emerald-900/40" title="Marcar como recibido">✅</button>')
            +'<button onclick="showPurchaseInfo('+p.id+')" class="text-zinc-400 hover:text-zinc-200 text-sm mr-2">ℹ️</button>'
            +'<button onclick="deletePurchase('+p.id+')" class="text-red-400 hover:text-red-300 text-sm">🗑️</button>'
            +'</td>'
        tbody.appendChild(tr)
    })
}
function showPurchaseInfo(id){
    const p = data.purchases.find(x=>x.id===id)
    if(!p) return
    const prod = data.products.find(pr=>pr.id===p.productId)
    const unitCUP  = p.unitCostCUP  || 0
    const propCUP  = p.propExpCUP   || 0
    const totalExp = p.totalExpCUP  || 0
    const sub      = p.qty * unitCUP
    const total    = sub + propCUP
    document.getElementById('purchaseInfoContent').innerHTML =
        '<div><span class="text-zinc-500">Fecha:</span> <span class="text-zinc-200">'+p.date+'</span></div>'
        +'<div><span class="text-zinc-500">Producto:</span> <span class="text-emerald-300 font-medium">'+(prod?prod.name:'?')+'</span></div>'
        +'<div><span class="text-zinc-500">Cantidad:</span> <span class="text-zinc-200">'+p.qty+'</span></div>'
        +'<div><span class="text-zinc-500">Moneda original:</span> <span class="text-zinc-200">'+(p.currencyOriginal||'-')+'</span></div>'
        +'<div><span class="text-zinc-500">Costo unitario:</span> <span class="text-emerald-300">'+fmtInfo(unitCUP,'Costo unitario')+'</span></div>'
        +'<div><span class="text-zinc-500">Subtotal:</span> <span class="text-zinc-200">'+fmtInfo(sub,'Subtotal')+'</span></div>'
        +'<div><span class="text-zinc-500">Gastos proporcionales:</span> <span class="text-zinc-200">'+fmtInfo(propCUP,'G. proporcionales')+'</span></div>'
        +'<div><span class="text-zinc-500">Gastos totales lote:</span> <span class="text-zinc-200">'+fmtInfo(totalExp,'G. totales lote')+'</span></div>'
        +'<div class="text-lg font-bold mt-2">Total: <span class="text-emerald-400">'+fmtInfo(total,'Total compra')+'</span></div>'
        +'<div class="text-sm text-zinc-500 mt-2">Proveedor: '+(p.supplier||'-')+'</div>'
    showModal('modalPurchaseInfo')
}
function deletePurchase(id){ showConfirm('¿Eliminar compra?', 'El stock del producto será ajustado.', () => _deletePurchase(id)) }
function _deletePurchase(id){
    const p = data.purchases.find(x=>x.id===id)
    if(!p) return
    const prod = data.products.find(x=>x.id===p.productId)
    // Only revert stock if the purchase was already in storage
    if(prod && p.inStock){
        const unitCUP = p.unitCostCUP || 0
        const propCUP = p.propExpCUP  || 0
        const finalCostCUP = unitCUP + (p.qty > 0 ? propCUP / p.qty : 0)
        prod.currentStock   -= p.qty
        prod.totalCostValue -= p.qty * finalCostCUP
        if(prod.currentStock > 0) prod.avgCost = prod.totalCostValue / prod.currentStock
        else { prod.avgCost = 0; prod.totalCostValue = 0; prod.currentStock = 0 }
    }
    data.purchases = data.purchases.filter(x=>x.id!==id)
    saveData(); addAudit('COMPRA ELIMINADA: '+(prod?prod.name:'?')+' x'+p.qty)
    renderPurchases(); renderProducts(); renderDashboard()
}

// ─── Ventas ───────────────────────────────────────────────────────────────────
function updateSaleInfo(){
    const prodId = parseInt(document.getElementById('saleProd').value)
    const prod   = data.products.find(p=>p.id===prodId)
    const cur    = document.getElementById('saleCurrency').value
    const qty    = parseFloat(document.getElementById('saleQty').value) || 0
    const price  = parseFloat(document.getElementById('salePrice').value) || 0
    const shipping = parseFloat(document.getElementById('saleShipping').value) || 0
    
    // Precio sugerido
    if(prod && prod.avgCost > 0){
        const markup    = prod.markup || 0.5
        const rawCUP    = prod.avgCost * (1 + markup)
        const sugCUP    = roundCash(rawCUP)
        const sugLabel  = cashRoundingStep > 1
            ? fmtInfo(sugCUP, 'Precio sugerido') + ' <span class="text-zinc-600 text-xs">(redondeado de '+rawCUP.toFixed(2)+')</span>'
            : fmtInfo(sugCUP, 'Precio sugerido')
        document.getElementById('suggestedPriceDisplay').innerHTML = sugLabel
        if(!document.getElementById('salePrice').value){
            document.getElementById('salePrice').value = fromCUP(sugCUP, cur).toFixed(2)
        }
    } else {
        document.getElementById('suggestedPriceDisplay').textContent = '-'
    }
    
    // Calcular subtotal y margen
    const calcInfo = document.getElementById('saleCalcInfo')
    const subtotalEl = document.getElementById('saleSubtotal')
    const marginEl = document.getElementById('saleMargin')
    
    if(qty > 0 && price > 0){
        const subtotal = price * qty
        subtotalEl.textContent = fmtCUP(toCUP(subtotal, cur))
        
        // Calcular margen: (precio - costo) × cantidad - envío
        if(prod && prod.avgCost > 0){
            const costCUP = prod.avgCost
            const shippingCUP = toCUP(shipping, cur)
            const revenueCUP = toCUP(price, cur)
            // Margen = (precio - costo) × cantidad - envío
            const marginCUP = (revenueCUP - costCUP) * qty - shippingCUP
            const totalRevenue = revenueCUP * qty
            const marginPercent = totalRevenue > 0 ? ((marginCUP / totalRevenue) * 100).toFixed(1) : 0
            
            if(marginCUP >= 0){
                marginEl.innerHTML = '<span class="text-emerald-400">+' + fmtCUP(marginCUP) + ' (' + marginPercent + '%)</span>'
            } else {
                marginEl.innerHTML = '<span class="text-red-400">' + fmtCUP(marginCUP) + ' (' + marginPercent + '%)</span>'
            }
        } else {
            marginEl.textContent = '-'
        }
        calcInfo.classList.remove('hidden')
    } else {
        calcInfo.classList.add('hidden')
    }
}
// ─── Client autocomplete ─────────────────────────────────────────────────────
let _suggHighlight = -1
function filterClientSuggestions(val){
    const ul = document.getElementById('clientSuggestions')
    const q  = val.trim().toLowerCase()
    if(!q){ ul.classList.add('hidden'); return }
    const matches = (data.customers||[]).filter(c => c.name.toLowerCase().includes(q)).slice(0,8)
    if(!matches.length){ ul.classList.add('hidden'); return }
    ul.innerHTML = ''
    _suggHighlight = -1
    matches.forEach((c,i) => {
        const li = document.createElement('li')
        li.className = 'px-4 py-2 cursor-pointer hover:bg-zinc-700 text-sm flex justify-between items-center'
        const vip = c.vipLevel ? (data.vipLevels||[]).find(v=>v.id===c.vipLevel) : null
        const badge = vip ? '<span class="text-xs text-amber-400">⭐ '+vip.name+'</span>' : ''
        li.innerHTML = '<span>'+c.name+'</span>'+badge
        li.onmousedown = () => {
            document.getElementById('saleClient').value = c.name
            ul.classList.add('hidden')
            updateSuggestedPrice()
        }
        ul.appendChild(li)
    })
    ul.classList.remove('hidden')
}
function handleClientKey(e){
    const ul = document.getElementById('clientSuggestions')
    const items = ul.querySelectorAll('li')
    if(ul.classList.contains('hidden') || !items.length) return
    if(e.key==='ArrowDown'){ e.preventDefault(); _suggHighlight=Math.min(_suggHighlight+1,items.length-1); items.forEach((li,i)=>li.classList.toggle('bg-zinc-700',i===_suggHighlight)) }
    else if(e.key==='ArrowUp'){ e.preventDefault(); _suggHighlight=Math.max(_suggHighlight-1,0); items.forEach((li,i)=>li.classList.toggle('bg-zinc-700',i===_suggHighlight)) }
    else if(e.key==='Enter' && _suggHighlight>=0){ e.preventDefault(); items[_suggHighlight].onmousedown() }
    else if(e.key==='Escape'){ ul.classList.add('hidden') }
}
function hideSuggestions(){
    const ul = document.getElementById('clientSuggestions')
    if(ul) ul.classList.add('hidden')
}

function showQuickSale(){
    const sel = document.getElementById('saleProd')
    sel.innerHTML = '<option value="">Selecciona producto</option>'
    data.products.forEach(p => { const o=document.createElement('option'); o.value=p.id; o.textContent=p.name+' (Stock: '+(p.currentStock||0)+')'; sel.appendChild(o) })
    document.getElementById('saleQty').value    = ''
    document.getElementById('salePrice').value  = ''
    document.getElementById('saleClient').value = ''
    document.getElementById('saleCredit').checked = false
    document.getElementById('saleShipping').value = ''
    document.getElementById('suggestedPriceDisplay').textContent = '-'
    document.getElementById('saleCurrency').value = data.baseCurrency
    document.getElementById('saleCalcInfo').classList.add('hidden')
    showModal('modalSale')
}
function getApplicableDiscount(qty, clientName, productId){
    if(!data.discounts) return 0
    let max = 0
    // Regular discounts
    data.discounts.forEach(d => {
        const ok = !d.productId || d.productId===productId
        if(!ok) return
        if(d.type==='mayor'  && qty>=d.qtyMin)                              max=Math.max(max,d.percent)
        else if(d.type==='cliente' && clientName && clientName.toLowerCase().includes(d.clientName.toLowerCase())) max=Math.max(max,d.percent)
        else if(d.type==='general')                                          max=Math.max(max,d.percent)
    })
    // VIP discount: look up customer by name and check their level
    if(clientName && data.customers && data.vipLevels){
        const cust = data.customers.find(c=>c.name.toLowerCase()===clientName.toLowerCase())
        if(cust && cust.vipLevel){
            const level = data.vipLevels.find(v=>v.id===cust.vipLevel)
            if(level) max = Math.max(max, level.percent)
        }
    }
    return max/100
}
function saveSale(){
    const prodId  = parseInt(document.getElementById('saleProd').value)
    const qty     = parseFloat(document.getElementById('saleQty').value)
    const price   = parseFloat(document.getElementById('salePrice').value)
    const cur     = document.getElementById('saleCurrency').value
    const client  = document.getElementById('saleClient').value.trim()
    const credit  = document.getElementById('saleCredit').checked
    const printReceipt = document.getElementById('printReceipt')?.checked || false
    const shipping = parseFloat(document.getElementById('saleShipping').value) || 0
    const shippingCUP = toCUP(shipping, cur)
    if(!prodId || !qty || !price) return notify('Campos requeridos', 'error')
    const prod = data.products.find(p=>p.id===prodId)
    if(!prod || prod.currentStock < qty) return notify('Stock insuficiente', 'error')
    const unitSellPriceCUP = toCUP(price, cur)
    const discountPercent  = getApplicableDiscount(qty, client, prodId)
    const finalPriceCUP    = unitSellPriceCUP * (1 - discountPercent)
    prod.currentStock -= qty
    const today = new Date().toISOString().slice(0,10)
    const saleId = nextId++
    data.sales.push({id:saleId, productId:prodId, date:today, qty, unitSellPriceCUP, finalPriceCUP, discountPercent, currencyOriginal:cur, client:client||'-', onCredit:credit, shippingCostCUP:shippingCUP})
    // Auto-register any named client (not only on fiado)
    if(client){
        let cust = data.customers.find(c=>c.name===client)
        if(!cust){ cust={id:nextId++,name:client,debt:0,vipLevel:''}; data.customers.push(cust) }
        if(credit) cust.debt = (cust.debt||0) + qty*finalPriceCUP
    }
    saveData()
    const dtxt = discountPercent > 0 ? ' (dto '+((discountPercent*100).toFixed(0))+'%)' : ''
    const shipTxt = shippingCUP > 0 ? ' (envío: '+fmtCUP(shippingCUP)+')' : ''
    addAudit('VENTA: '+prod.name+' x'+qty+' a '+fmtCUP(finalPriceCUP)+dtxt+shipTxt)
    hideModal('modalSale'); renderSales(); renderCustomers(); renderDashboard(); renderReports()
    
    // Print receipt if checkbox is checked
    if(printReceipt) {
        setTimeout(() => printSaleReceipt(saleId), 300)
    }
    
    notify('✅ Venta registrada: '+prod.name+' x'+qty, 'success')
}
function renderSales(){
    const tbody = document.getElementById('salesTable')
    tbody.innerHTML = ''
    data.sales.forEach(s => {
        const prod = data.products.find(pr=>pr.id===s.productId)
        const priceCUP = s.finalPriceCUP || s.unitSellPriceCUP || 0
        const hasDiscount = s.discountPercent && s.discountPercent > 0
        const shippingCUP = s.shippingCostCUP || 0
        const priceHtml = hasDiscount
            ? '<span class="text-emerald-400">'+fmtInfo(priceCUP,'Precio final')+'</span> <span class="text-xs text-zinc-500">(-'+(s.discountPercent*100).toFixed(0)+'%)</span>'
            : fmtInfo(priceCUP,'Precio venta')
        // Mostrar gasto de envío en rojo si existe
        const shippingHtml = shippingCUP > 0
            ? '<div class="text-xs text-red-400 mt-1">📦 Envío: -'+fmtCUP(shippingCUP)+'</div>'
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
                <span class="item-price">${fmtCUP(totalPrice)}</span>
            </div>
        </div>
        
        <div class="totals">
            <div class="total-row"><span>Subtotal:</span><span>${fmtCUP(totalPrice)}</span></div>
            ${s.discountPercent ? '<div class="total-row"><span>Descuento ('+(s.discountPercent*100).toFixed(0)+'%):</span><span>-${fmtCUP(discount)}</span></div>' : ''}
            <div class="total-row total-final"><span>TOTAL:</span><span>${fmtCUP(finalPrice)}</span></div>
        </div>
        
        <div class="footer">
            <p>¡Gracias por su compra!</p>
            <p>Generated by Vexto v1.0.6</p>
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
    document.getElementById('totalProfit').innerHTML      = fmtInfo(netProfit,'Ganancia neta (restando envíos)') + (totalShipping > 0 ? ' <span class="text-xs text-red-400">(envíos: -'+fmtCUP(totalShipping)+')</span>' : '')
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

// ─── Auditoría ────────────────────────────────────────────────────────────────
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

// ─── Auto-login ───────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('tienda_lastUser')
    if(saved && localStorage.getItem('tienda_'+saved)){
        document.getElementById('loginUser').value = saved
        handleLogin()
    }
})

document.addEventListener('click', function(e){
    if(e.target.classList.contains('currency-info-btn')){
        const cup   = parseFloat(e.target.dataset.value)
        const label = e.target.dataset.label
        showCurrencyInfo(cup, label)
    }
})

// ─── PROVEEDORES ─────────────────────────────────────────

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

// ─── Reset database ───────────────────────────────────────────────────────────
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