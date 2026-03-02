/* ═══════════════════════════════════════════════════════════════
   ÉLUME - Tienda de Moda | JavaScript
   ═══════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

let state = {
  user: null,
  role: null,
  products: [],
  userLikes: {}
};

// ═══════════════════════════════════════════════════════════════
// AUTH USERS (hardcoded)
// ═══════════════════════════════════════════════════════════════

const USERS = {
  'admin': { password: 'admin123', role: 'admin' },
  'usuario': { password: 'user123', role: 'user' }
};

// ═══════════════════════════════════════════════════════════════
// DATA MANAGEMENT
// ═══════════════════════════════════════════════════════════════

async function loadData() {
  try {
    const res = await fetch('data.json');
    const data = await res.json();
    state.products = data.products || [];
    state.userLikes = data.user_likes || {};
  } catch (e) {
    console.log('Using default data');
    state.products = getDefaultProducts();
    state.userLikes = {};
  }
}

function getDefaultProducts() {
  return [
    { id: 1, name: "Vestido Floral", price: 850, category: "Vestidos", image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=600", description: "Vestido floral de verano, tela ligera.", likes: 24 },
    { id: 2, name: "Blusa Elegante", price: 420, category: "Blusas", image: "https://images.unsplash.com/photo-1594938298603-c8148c4b4c4b?w=600", description: "Blusa de seda con acabado premium.", likes: 18 },
    { id: 3, name: "Jeans Slim", price: 680, category: "Pantalones", image: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=600", description: "Jeans de corte slim fit moderno.", likes: 31 },
    { id: 4, name: "Chaqueta Casual", price: 1150, category: "Chaquetas", image: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600", description: "Chaqueta de tela resistente para cualquier ocasión.", likes: 42 },
    { id: 5, name: "Falda Plisada", price: 390, category: "Faldas", image: "https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=600", description: "Falda plisada de midi, perfecta para el trabajo.", likes: 15 },
    { id: 6, name: "Top Cropped", price: 290, category: "Tops", image: "https://images.unsplash.com/photo-1503342394128-c104d54dba01?w=600", description: "Top cropped de algodón suave.", likes: 28 }
  ];
}

// ═══════════════════════════════════════════════════════════════
// ROUTING
// ═══════════════════════════════════════════════════════════════

let currentView = 'store';

function showView(view) {
  currentView = view;
  renderNav();
  
  const main = document.getElementById('mainContent');
  
  if (view === 'login') {
    renderLogin(main);
  } else if (view === 'admin') {
    if (state.role !== 'admin') {
      showView('login');
      return;
    }
    renderAdmin(main);
  } else {
    renderStore(main);
  }
}

// ═══════════════════════════════════════════════════════════════
// NAV RENDER
// ═══════════════════════════════════════════════════════════════

function renderNav() {
  const navLinks = document.getElementById('navLinks');
  
  if (state.user) {
    let html = `
      <a class="nav-link ${currentView === 'store' ? 'active' : ''}" onclick="showView('store')">Tienda</a>
    `;
    
    if (state.role === 'admin') {
      html += `<a class="nav-link ${currentView === 'admin' ? 'active' : ''}" onclick="showView('admin')">Admin</a>`;
    }
    
    html += `
      <div class="nav-user">
        <div class="nav-avatar">${state.user[0]}</div>
        <span>${state.user}</span>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="logout()">Salir</button>
    `;
    
    navLinks.innerHTML = html;
  } else {
    navLinks.innerHTML = `<button class="btn btn-primary btn-sm" onclick="showView('login')">Iniciar sesión</button>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// STORE VIEW
// ═══════════════════════════════════════════════════════════════

function renderStore(container) {
  const userLikes = state.user ? (state.userLikes[state.user] || []) : [];
  
  let html = '';
  
  if (!state.user) {
    html += `
      <div class="login-banner" onclick="showView('login')">
        ✨ Inicia sesión para dar like a tus prendas favoritas
        <a href="#" onclick="showView('login')">Entrar ahora →</a>
      </div>
    `;
  }
  
  html += `
    <div class="hero">
      <p class="hero-label">Nueva colección 2024</p>
      <h1>Moda que <em>define</em><br>tu estilo</h1>
      <p>Descubre prendas únicas con materiales de calidad premium.</p>
    </div>
    
    <div class="filters">
      <button class="filter-btn active" data-cat="all" onclick="filterProducts('all', this)">Todos</button>
      <button class="filter-btn" data-cat="Vestidos" onclick="filterProducts('Vestidos', this)">Vestidos</button>
      <button class="filter-btn" data-cat="Blusas" onclick="filterProducts('Blusas', this)">Blusas</button>
      <button class="filter-btn" data-cat="Pantalones" onclick="filterProducts('Pantalones', this)">Pantalones</button>
      <button class="filter-btn" data-cat="Chaquetas" onclick="filterProducts('Chaquetas', this)">Chaquetas</button>
      <button class="filter-btn" data-cat="Faldas" onclick="filterProducts('Faldas', this)">Faldas</button>
      <button class="filter-btn" data-cat="Tops" onclick="filterProducts('Tops', this)">Tops</button>
    </div>
    
    <section class="products-section">
      <h2 class="section-title">Colección disponible</h2>
      <div class="products-grid" id="productsGrid">
        ${renderProducts(state.products, userLikes)}
      </div>
    </section>
  `;
  
  container.innerHTML = html;
}

function renderProducts(products, userLikes) {
  return products.map(p => {
    const isLiked = userLikes.includes(p.id);
    const heart = isLiked ? '♥' : '♡';
    const likedClass = isLiked ? 'liked' : '';
    
    return `
      <div class="card" data-category="${p.category}">
        <div class="card-img-wrap">
          <img src="${p.image}" alt="${p.name}" loading="lazy">
          <span class="card-category">${p.category}</span>
        </div>
        <div class="card-body">
          <div class="card-name">${p.name}</div>
          <div class="card-desc">${p.description}</div>
        </div>
        <div class="card-footer">
          <div class="card-price">${p.price.toLocaleString('es-MX')} <span>MXN</span></div>
          ${state.user ? `
            <button class="like-btn ${likedClass}" data-id="${p.id}" onclick="toggleLike(${p.id}, this)">
              <span class="heart">${heart}</span>
              <span class="like-count">${p.likes}</span>
            </button>
          ` : `
            <button class="like-btn no-auth" title="Inicia sesión para dar like">
              <span class="heart">♡</span>
              <span>${p.likes}</span>
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

function filterProducts(category, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  
  document.querySelectorAll('.card').forEach(card => {
    card.style.display = (category === 'all' || card.dataset.category === category) ? '' : 'none';
  });
}

function toggleLike(productId, btn) {
  if (!state.user) return;
  
  const userLikes = state.userLikes[state.user] || [];
  const product = state.products.find(p => p.id === productId);
  
  if (!product) return;
  
  if (userLikes.includes(productId)) {
    // Unlike
    product.likes--;
    state.userLikes[state.user] = userLikes.filter(id => id !== productId);
    btn.classList.remove('liked');
    btn.querySelector('.heart').textContent = '♡';
    showToast('💔 Like eliminado', 'error');
  } else {
    // Like
    product.likes++;
    state.userLikes[state.user].push(productId);
    btn.classList.add('liked');
    btn.querySelector('.heart').textContent = '♥';
    showToast('❤️ ¡Le diste like!');
  }
  
  btn.querySelector('.like-count').textContent = product.likes;
}

// ═══════════════════════════════════════════════════════════════
// LOGIN VIEW
// ═══════════════════════════════════════════════════════════════

function renderLogin(container) {
  container.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-logo">ÉLU<span>ME</span></div>
        <div class="login-sub">Accede a tu cuenta para explorar la colección</div>
        
        <div id="loginError"></div>
        
        <form onsubmit="handleLogin(event)">
          <div class="form-group">
            <label>Usuario</label>
            <input type="text" name="username" placeholder="Tu nombre de usuario" required autofocus>
          </div>
          <div class="form-group">
            <label>Contraseña</label>
            <input type="password" name="password" placeholder="Tu contraseña" required>
          </div>
          <button type="submit" class="btn btn-primary btn-full">Iniciar sesión →</button>
        </form>
        
        <div class="demo-accounts">
          <div class="demo-title">Cuentas de prueba</div>
          <div class="demo-grid">
            <div class="demo-card" onclick="fillLogin('usuario','user123')">
              <div class="demo-role">👤 Usuario</div>
              <div class="demo-creds">usuario</div>
              <div class="demo-pass">user123</div>
            </div>
            <div class="demo-card" onclick="fillLogin('admin','admin123')">
              <div class="demo-role">⚙️ Admin</div>
              <div class="demo-creds">admin</div>
              <div class="demo-pass">admin123</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function fillLogin(u, p) {
  document.querySelector('input[name=username]').value = u;
  document.querySelector('input[name=password]').value = p;
}

function handleLogin(e) {
  e.preventDefault();
  
  const username = e.target.username.value;
  const password = e.target.password.value;
  
  const user = USERS[username];
  
  if (user && user.password === password) {
    state.user = username;
    state.role = user.role;
    state.userLikes[username] = state.userLikes[username] || [];
    
    localStorage.setItem('elume_user', username);
    localStorage.setItem('elume_role', user.role);
    
    showToast('✅ ¡Bienvenido ' + username + '!');
    
    setTimeout(() => {
      showView(user.role === 'admin' ? 'admin' : 'store');
    }, 500);
  } else {
    document.getElementById('loginError').innerHTML = `
      <div class="error-msg">⚠️ Usuario o contraseña incorrectos</div>
    `;
  }
}

function logout() {
  state.user = null;
  state.role = null;
  
  localStorage.removeItem('elume_user');
  localStorage.removeItem('elume_role');
  
  showToast('👋 Sesión cerrada');
  showView('store');
}

// ═══════════════════════════════════════════════════════════════
// ADMIN VIEW
// ═══════════════════════════════════════════════════════════════

function renderAdmin(container) {
  const totalLikes = state.products.reduce((sum, p) => sum + p.likes, 0);
  const avgPrice = state.products.length > 0 
    ? state.products.reduce((sum, p) => sum + p.price, 0) / state.products.length 
    : 0;
  const maxPrice = state.products.length > 0 
    ? Math.max(...state.products.map(p => p.price)) 
    : 0;
  
  container.innerHTML = `
    <div class="admin-wrap">
      <div class="admin-header">
        <div>
          <h1>Panel de Administración</h1>
          <p>Gestiona productos, precios e imágenes de la tienda</p>
        </div>
        <button class="btn btn-primary" onclick="openAddModal()">+ Agregar producto</button>
      </div>
      
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-val">${state.products.length}</div>
          <div class="stat-label">Productos activos</div>
        </div>
        <div class="stat-card">
          <div class="stat-val">${totalLikes}</div>
          <div class="stat-label">Total de likes</div>
        </div>
        <div class="stat-card">
          <div class="stat-val">$${Math.round(avgPrice).toLocaleString('es-MX')}</div>
          <div class="stat-label">Precio promedio</div>
        </div>
        <div class="stat-card">
          <div class="stat-val">$${maxPrice.toLocaleString('es-MX')}</div>
          <div class="stat-label">Precio más alto</div>
        </div>
      </div>
      
      <div class="admin-grid">
        ${state.products.map(p => `
          <div class="admin-card" id="card-${p.id}">
            <img class="admin-card-img" src="${p.image}" alt="${p.name}">
            <div class="admin-card-body">
              <div class="admin-card-name">${p.name}</div>
              <div class="admin-card-meta">
                <span class="badge">${p.category}</span>
                <span class="badge badge-accent">$${p.price.toLocaleString('es-MX')}</span>
                <span class="likes-tag">♥ ${p.likes}</span>
              </div>
              <div class="admin-card-actions">
                <button class="btn btn-ghost btn-sm" onclick='openEditModal(${JSON.stringify(p)})'>✏️ Editar</button>
                <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">🗑 Eliminar</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Modal functions
function openEditModal(p) {
  document.getElementById('edit-id').value = p.id;
  document.getElementById('edit-name').value = p.name;
  document.getElementById('edit-price').value = p.price;
  document.getElementById('edit-desc').value = p.description;
  document.getElementById('edit-image').value = p.image;
  document.getElementById('edit-category').value = p.category;
  document.getElementById('edit-preview').src = p.image;
  document.getElementById('editModal').classList.add('open');
}

function openAddModal() {
  document.getElementById('add-name').value = '';
  document.getElementById('add-price').value = '';
  document.getElementById('add-desc').value = '';
  document.getElementById('add-image').value = '';
  document.getElementById('add-category').value = 'Vestidos';
  document.getElementById('add-preview').style.display = 'none';
  document.getElementById('addModal').classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function updatePreview(inputId, imgId) {
  const img = document.getElementById(imgId);
  img.src = document.getElementById(inputId).value;
  img.style.display = 'block';
}

function saveEdit() {
  const id = parseInt(document.getElementById('edit-id').value);
  const product = state.products.find(p => p.id === id);
  
  if (product) {
    product.name = document.getElementById('edit-name').value;
    product.price = parseFloat(document.getElementById('edit-price').value);
    product.description = document.getElementById('edit-desc').value;
    product.image = document.getElementById('edit-image').value;
    product.category = document.getElementById('edit-category').value;
    
    showToast('✅ Producto actualizado');
    closeModal('editModal');
    renderAdmin(document.getElementById('mainContent'));
  }
}

function saveAdd() {
  const newId = state.products.length > 0 
    ? Math.max(...state.products.map(p => p.id)) + 1 
    : 1;
  
  const newProduct = {
    id: newId,
    name: document.getElementById('add-name').value || 'Nuevo Producto',
    price: parseFloat(document.getElementById('add-price').value) || 0,
    category: document.getElementById('add-category').value,
    description: document.getElementById('add-desc').value,
    image: document.getElementById('add-image').value || 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=600',
    likes: 0
  };
  
  state.products.push(newProduct);
  
  showToast('✅ Producto agregado');
  closeModal('addModal');
  renderAdmin(document.getElementById('mainContent'));
}

function deleteProduct(id) {
  if (!confirm('¿Eliminar este producto?')) return;
  
  state.products = state.products.filter(p => p.id !== id);
  
  document.getElementById(`card-${id}`).remove();
  showToast('🗑 Producto eliminado', 'error');
}

// ═══════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  setTimeout(() => t.className = '', 2500);
}

// ═══════════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════════

const toggle = document.getElementById('themeToggle');
const html = document.documentElement;
const saved = localStorage.getItem('theme') || 'light';
html.setAttribute('data-theme', saved);
toggle.addEventListener('click', () => {
  const current = html.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════

async function init() {
  await loadData();
  
  // Check for saved session
  const savedUser = localStorage.getItem('elume_user');
  const savedRole = localStorage.getItem('elume_role');
  
  if (savedUser && savedRole) {
    state.user = savedUser;
    state.role = savedRole;
    state.userLikes[savedUser] = state.userLikes[savedUser] || [];
  }
  
  showView('store');
}

// Start the app
init();
