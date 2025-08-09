// js/app.js - RadioAccess (mejorado: rotaci贸n de servidores y reproducci贸n resiliente)

const ALL_SERVERS_JSON = 'https://all.api.radio-browser.info/json/servers';
let apiServers = ['https://de1.api.radio-browser.info/json']; // fallback inicial
let apiBase = apiServers[0]; // se actualizar谩 en init()
const themeToggle = document.getElementById("themeToggle");
const stationsList = document.getElementById("stationsList");
const searchBtn = document.getElementById("searchBtn");
const searchInput = document.getElementById("searchInput");
const countrySelect = document.getElementById("countrySelect");
const languageSelect = document.getElementById("languageSelect");
const tagSelect = document.getElementById("tagSelect");

// estado
let currentAudio = null;
let currentStation = null;

// Tema (igual que antes)
document.documentElement.setAttribute("data-theme", localStorage.getItem("theme") || "light");
themeToggle.addEventListener("click", () => {
    let currentTheme = document.documentElement.getAttribute("data-theme");
    let newTheme = currentTheme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    themeToggle.textContent = newTheme === "light" ? "馃寵" : "鈽€锔�";
});

/* -----------------------
   UTIL: probar servidores
   ----------------------- */
async function fetchWithServerRotation(path, opts = {}) {
    // Se intenta con la lista apiServers en orden; si falla uno, pasa al siguiente.
    const servers = apiServers.slice(); // copia
    let lastError = null;
    for (let i = 0; i < servers.length; i++) {
        const base = servers[i].replace(/\/json\/?$/,''); // asegurarnos formato
        const url = `${base}${path}`;
        try {
            const res = await fetch(url, opts);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            // Si la petici贸n funciona, guardamos base como apiBase preferido y devolvemos la respuesta
            apiBase = base + '/json';
            return res;
        } catch (err) {
            console.warn(`Servidor API fall贸 (${url}):`, err);
            lastError = err;
            // continuar al siguiente servidor
        }
    }
    throw lastError;
}

/* -----------------------
   INICIALIZAR SERVIDORES
   ----------------------- */
async function initServers() {
    try {
        const res = await fetch(ALL_SERVERS_JSON);
        const list = await res.json();
        // 'list' contiene objetos con 'name' y 'url' / 'url' puede ser por ejemplo "https://de1.api.radio-browser.info"
        // Convertimos a endpoints con /json
        apiServers = list
            .map(s => (s.url || s.name) ) // algunos servers usan 'url' otros usan 'name'
            .filter(Boolean)
            .map(u => u.endsWith('/json') ? u : (u.replace(/\/$/, '') + '/json'));
        // meter un fallback por si list vac铆o
        if (!apiServers.length) apiServers = ['https://de1.api.radio-browser.info/json'];
        console.log('Servidores API detectados:', apiServers);
        // probamos uno r谩pido: buscamos tags para asegurar que funciona alguno
        await fetchWithServerRotation('/json/tags?limit=1');
    } catch (err) {
        console.warn('No se pudo obtener lista de servidores, usando fallback. Error:', err);
        apiServers = ['https://de1.api.radio-browser.info/json'];
    }
}

/* -----------------------
   CARGA FILTROS (pa铆ses/lenguajes/tags)
   ----------------------- */
async function loadFilters() {
    try {
        // Usamos fetchWithServerRotation para que rote servidores si es necesario.
        const [countriesR, languagesR, tagsR] = await Promise.all([
            fetchWithServerRotation('/json/countries'),
            fetchWithServerRotation('/json/languages'),
            fetchWithServerRotation('/json/tags')
        ]);
        const countries = await countriesR.json();
        const languages = await languagesR.json();
        const tags = await tagsR.json();

        countries.forEach(c => {
            countrySelect.innerHTML += `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`;
        });
        languages.forEach(l => {
            languageSelect.innerHTML += `<option value="${escapeHtml(l.name)}">${escapeHtml(l.name)}</option>`;
        });
        tags.slice(0,200).forEach(t => { // limit para no saturar UI
            tagSelect.innerHTML += `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`;
        });
    } catch (err) {
        console.warn('Error cargando filtros:', err);
        // Ca铆da graciosa: dejamos selects vac铆os y el usuario puede buscar por texto
    }
}

/* -----------------------
   B脷SQUEDA DE EMISORAS
   ----------------------- */
async function searchStations() {
    stationsList.innerHTML = `<p class="loading">Cargando emisoras...</p>`;
    try {
        const name = encodeURIComponent(searchInput.value || '');
        const country = encodeURIComponent(countrySelect.value || '');
        const language = encodeURIComponent(languageSelect.value || '');
        const tag = encodeURIComponent(tagSelect.value || '');
        const q = `/json/stations/search?limit=50&name=${name}&country=${country}&language=${language}&tag=${tag}`;
        const res = await fetchWithServerRotation(q);
        const data = await res.json();
        renderStations(data);
    } catch (err) {
        console.error('Error buscando estaciones:', err);
        stationsList.innerHTML = `<p class="muted">Error buscando emisoras. Intenta recargar la p谩gina.</p>`;
    }
}

/* -----------------------
   RENDER
   ----------------------- */
function renderStations(stations) {
    stationsList.innerHTML = "";
    if (!stations || stations.length === 0) {
        stationsList.innerHTML = `<p>No se encontraron emisoras</p>`;
        return;
    }

    stations.forEach(station => {
        // Usamos lastcheckok si existe para marcar estado
        const ok = (station.lastcheckok === 1) ? '鉁�' : '鉂�';
        const html = `
            <div class="station" data-uuid="${station.stationuuid}">
                <img src="${station.favicon || 'assets/logo.png'}" alt="${escapeHtml(station.name)}" onerror="this.src='assets/logo.png'">
                <h3>${escapeHtml(station.name)}</h3>
                <div class="muted">${escapeHtml(station.country)} 鈥� ${escapeHtml(station.language)} ${ok}</div>
                <div style="margin-top:8px">
                    <button class="play-btn">鈻� Reproducir</button>
                    <button class="open-apps-btn">Abrir en app</button>
                </div>
            </div>
        `;
        stationsList.insertAdjacentHTML('beforeend', html);
    });

    // listeners
    stationsList.querySelectorAll('.play-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const stEl = e.target.closest('.station');
            const uuid = stEl.dataset.uuid;
            try {
                // obtener datos de la emisora por UUID y reproducir con pol铆tica de reintentos
                const station = await fetchStationByUUID(uuid);
                await playStationResilient(station);
            } catch (err) {
                alert('No se pudo reproducir la estaci贸n: ' + err.message);
            }
        });
    });

    // abrir en apps: abrimos la p谩gina oficial de apps de Radio Browser; el usuario puede elegir
    stationsList.querySelectorAll('.open-apps-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Abrimos la p谩gina de apps en nueva pesta帽a. No hacemos scraping por CORS.
            window.open('https://www.radio-browser.info/users', '_blank');
        });
    });
}

/* -----------------------
   OBTENER ESTACI脫N POR UUID
   ----------------------- */
async function fetchStationByUUID(uuid) {
    // endpoint: /json/stations/byuuid/{uuid}
    const res = await fetchWithServerRotation(`/json/stations/byuuid/${encodeURIComponent(uuid)}`);
    const data = await res.json();
    if (!data || !data.length) throw new Error('Estaci贸n no encontrada');
    return data[0];
}

/* -----------------------
   REPRODUCCI脫N RESILIENTE
   - intenta url_resolved (recomendado)
   - si falla, intenta url
   - captura 'error' en audio y reintenta con fallback si aplica
   ----------------------- */
async function playStationResilient(station) {
    // stop previous
    if (currentAudio) {
        try { currentAudio.pause(); } catch(e) {}
        currentAudio = null;
    }
    currentStation = station;

    // candidate URLs: url_resolved primero, luego url original
    const candidates = [];
    if (station.url_resolved) candidates.push(station.url_resolved);
    if (station.url && station.url_resolved !== station.url) candidates.push(station.url);

    if (!candidates.length) throw new Error('No hay URL de stream disponible para esta emisora.');

    // UI: mostrar algo mientras probamos
    const playingToast = document.createElement('div');
    playingToast.className = 'playing-toast';
    playingToast.style.cssText = 'position:fixed;right:18px;bottom:18px;padding:10px;border-radius:10px;background:rgba(0,0,0,0.7);color:white;';
    playingToast.textContent = `Intentando reproducir: ${station.name}`;
    document.body.appendChild(playingToast);

    let lastError = null;
    for (let i = 0; i < candidates.length; i++) {
        const url = candidates[i];
        try {
            const audio = new Audio();
            audio.crossOrigin = "anonymous";
            // attach error handlers
            const startPromise = new Promise((resolve, reject) => {
                const onCan = () => { cleanup(); resolve('ok'); };
                const onErr = (ev) => { cleanup(); reject(new Error('Playback error')); };
                const onTimeout = () => { cleanup(); reject(new Error('Timeout al reproducir')); };
                function cleanup() {
                    audio.removeEventListener('canplay', onCan);
                    audio.removeEventListener('canplaythrough', onCan);
                    audio.removeEventListener('error', onErr);
                    clearTimeout(timeoutId);
                }
                audio.addEventListener('canplay', onCan);
                audio.addEventListener('canplaythrough', onCan);
                audio.addEventListener('error', onErr);
                const timeoutId = setTimeout(onTimeout, 8000); // 8s para considerar fallo
            });

            audio.src = url;
            // intentamos play (algunos navegadores requieren user gesture; si falla por autoplay, se lanzar谩 error)
            try { await audio.play(); } catch (playErr) {
                // a煤n as铆, esperamos canplay para saber si el stream es v谩lido
                console.warn('play() fall贸 (probable autoplay policy), esperando canplay...', playErr);
            }
            // esperamos resultado del startPromise (canplay o error)
            await startPromise;

            // si llegamos aqu铆: OK -> usamos este audio
            currentAudio = audio;
            // montar controles b谩sicos visibles (podr铆as integrar player fijo en UI)
            showMiniPlayer(station, url, audio);

            document.body.removeChild(playingToast);
            return; // 茅xito
        } catch (err) {
            console.warn('Intento reproducci贸n con', url, 'fall贸:', err);
            lastError = err;
            // continuar con siguiente candidate
        }
    }

    // si agotamos candidatos
    document.body.removeChild(playingToast);
    throw new Error('No se pudo reproducir la emisora (todos los intentos fallaron).');
}

/* -----------------------
   MINI PLAYER (simple)
   ----------------------- */
function showMiniPlayer(station, url, audio) {
    // limpiar cualquier mini-player previo
    const prev = document.getElementById('mini-player');
    if (prev) prev.remove();

    const div = document.createElement('div');
    div.id = 'mini-player';
    div.style.cssText = 'position:fixed;left:18px;bottom:18px;padding:12px;border-radius:12px;background:linear-gradient(90deg,var(--primary-color),var(--secondary-color));color:#fff;display:flex;gap:8px;align-items:center;z-index:9999;';
    div.innerHTML = `
        <div style="font-weight:700;margin-right:8px;">鈻�</div>
        <div style="min-width:200px;">
            <div style="font-size:14px;font-weight:700">${escapeHtml(station.name)}</div>
            <div style="font-size:12px;opacity:.9">${escapeHtml(station.country)} 鈥� ${escapeHtml(station.language)}</div>
            <div style="margin-top:6px"><button id="mp-pause">Pause</button> <button id="mp-close">Cerrar</button> <button id="mp-open">Abrir web</button></div>
        </div>
    `;
    document.body.appendChild(div);

    document.getElementById('mp-pause').addEventListener('click', () => {
        if (audio.paused) { audio.play(); document.getElementById('mp-pause').textContent = 'Pause'; }
        else { audio.pause(); document.getElementById('mp-pause').textContent = 'Play'; }
    });
    document.getElementById('mp-close').addEventListener('click', () => {
        try { audio.pause(); } catch(e) {}
        div.remove();
    });
    document.getElementById('mp-open').addEventListener('click', () => {
        window.open(station.homepage || url, '_blank');
    });
}

/* -----------------------
   HELPERS
   ----------------------- */
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>\"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":\"&#39;\"}[c])); }

/* -----------------------
   INIT
   ----------------------- */
(async function init(){
    await initServers();        // obtiene y rota servidores API
    await loadFilters();        // carga pa铆ses/idiomas/tags
    await searchStations();     // b煤squeda inicial
})();

// hook del bot贸n de b煤squeda
searchBtn.addEventListener("click", searchStations);
