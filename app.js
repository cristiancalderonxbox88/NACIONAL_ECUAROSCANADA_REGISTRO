/* ============================================ */
/* CONFIGURACIÓN */
/* ============================================ */
const PIN_ADMIN = "1234";

// 🔗 Reemplaza con la URL de tu Apps Script (la que termina en /exec)
const URL_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbyslIJRHX7cfsY1qwoh2nqx1DUrKht1xVZGjXg38hUfqQYwiSbnbjMZpuo20qWaVWKw/exec";
const INTERVALO_SYNC = 30000;

/* ============================================ */
/* BASE DE DATOS EN MEMORIA */
/* ============================================ */
let datosSistema = {
    proveedores: [
        "(05) QUIMBIAMBA CACUANGO PEDRO",
        "(01) ECUAROSCANADA S.A.",
        "(02) GRACE MESA",
        "(03) HERNAN CABASCANGO",
        "(04) ESTACIO CACHIPUENDO NATHALY SILVANA"
    ],
    zonas: ["1", "2"],
    clasificadores: ["JM", "Y", "M", "C", "J", "D", "J-Y-D-JM", "JM-D"],
    mesas: ["M1 CE", "M2 AM", "M3 VE", "M4 RO", "M5 MO", "M6 NA", "PETALOS"],
    variedades: [
        "AMNESIA", "ARTC", "ATMC", "BLSH", "BRIGHTON", "CANDLELIGHT", "CARPE DIEM",
        "COFFE BREAK", "COLOR", "COTTON XPRESSION", "COUNTRY BLUES", "DARK PINK ROSE",
        "DEEP PURPLE", "DOZEN ROSE HOT PINK", "DOZEN ROSE LIGHT PINK", "DOZEN ROSE NOVELTY-BI",
        "ANNA JULIA", "ATHOMIC", "BE SWEET", "BOULEVARD", "CANDY X-PRESSION", "CANDELIGHT",
        "COTTON X-PRESSIÓN", "COUNTRY BLUE", "ECUA PINK", "ESPERANCE", "EXOTIC BERRY",
        "EXPLORER", "FREE SPIRIT", "FRUTTETO", "FULL MONTY", "GOTCHA", "HARD ROCK",
        "HEARTS", "HERMOSA", "HOT EXPLORER", "KAHALA", "LOLA", "LORRAINE", "LUCIANO",
        "MAGIC TIMES", "MANDALA", "MANDARIN X-PRESSION", "MONDIAL", "MOONSTONE",
        "NINA", "O`HARA", "OPALA", "PALOMA", "PINK FLOYD", "PINK MONDIAL", "PINK XPRESSION",
        "PLAYA BLANCA", "POMAROSA", "POWDER PUFF", "PRINCESS CROWN", "QUEENS CROWN",
        "QUICKSAND", "RED PANTHER", "SHIMMER", "SILANTOI", "SUPER SUN", "WHITE OHARA"
    ],
    plagas: [
        "MALTRATO FOLLAJE", "BOTON MALTRATADO", "MALTRATO POSTCO", "B. ABIERTO",
        "B. DEFORME", "CLOROTICO", "ROTOS", "TORCIDO", "C. DE GANZO", "TRIPS",
        "ACAROS", "OIDIO", "BOTRITIS", "AFIDOS", "VELLOSO", "MAL DESYEME",
        "FITO TOXICIDAD", "DEFIC. DE CALCIO", "TALLOS CORTOS", "P QUEMADOS",
        "2 CABEZAS O MENOS", "TALLOS DELGADOS", "PÁLIDOS", "B. DESCABEZADO CULTIVO",
        "INTOXICACIÓN", "SIN FOLLAJE", "GUSANO", "MB", "DIPTEROS", "LEPIDOPTEROS",
        "COLEOPTEROS", "SEMILLA DE MALEZA", "OTROS"
    ]
};

/* ============================================ */
/* ESTADO GLOBAL */
/* ============================================ */
let registrosLocales = [];
let valorActual = "0";
let mesaSeleccionada = null;
let variedadSeleccionada = null;
let plagaSeleccionada = null;
let clasificadorSeleccionado = null;
let indiceEditando = null;
let pinIngresado = "";
let adminDesbloqueado = false;

/* ============================================ */
/* INDEXEDDB */
/* ============================================ */
const DB_NAME = 'WRC_RegistroCalidad';
const DB_VERSION = 2;
const STORE_TX = 'transacciones';
const STORE_CONFIG = 'config';
let db = null;

function abrirDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const d = e.target.result;
            if (!d.objectStoreNames.contains(STORE_TX)) {
                const store = d.createObjectStore(STORE_TX, { keyPath: 'id', autoIncrement: true });
                store.createIndex('sincronizada', 'sincronizada', { unique: false });
                store.createIndex('uuid', 'uuid', { unique: true });
            }
            if (!d.objectStoreNames.contains(STORE_CONFIG)) {
                d.createObjectStore(STORE_CONFIG, { keyPath: 'clave' });
            }
        };
        req.onsuccess = (e) => { db = e.target.result; resolve(db); };
        req.onerror = (e) => reject(e.target.error);
    });
}

function dbGuardarTransaccion(tx) {
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE_TX, 'readwrite');
        const store = t.objectStore(STORE_TX);
        const reg = { ...tx, uuid: generarUUID(), sincronizada: false, timestamp: Date.now(), intentos: 0 };
        const req = store.add(reg);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function dbActualizarTransaccion(id, datos) {
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE_TX, 'readwrite');
        const store = t.objectStore(STORE_TX);
        const req = store.get(id);
        req.onsuccess = () => {
            const r = req.result;
            if (!r) return reject('No encontrado');
            Object.assign(r, datos, { sincronizada: false, editada: true });
            store.put(r);
            resolve();
        };
        req.onerror = () => reject(req.error);
    });
}

function dbEliminarTransaccion(id) {
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE_TX, 'readwrite');
        const store = t.objectStore(STORE_TX);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function dbObtenerTodas() {
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE_TX, 'readonly');
        const store = t.objectStore(STORE_TX);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

function dbObtenerPendientes() {
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE_TX, 'readonly');
        const store = t.objectStore(STORE_TX);
        const idx = store.index('sincronizada');
        const req = idx.getAll(false);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

function dbMarcarSincronizada(id) {
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE_TX, 'readwrite');
        const store = t.objectStore(STORE_TX);
        const req = store.get(id);
        req.onsuccess = () => {
            const r = req.result;
            if (r) { r.sincronizada = true; r.fechaSincronizacion = Date.now(); store.put(r); }
            resolve();
        };
        req.onerror = () => reject(req.error);
    });
}

function dbGuardarConfig(clave, valor) {
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE_CONFIG, 'readwrite');
        const store = t.objectStore(STORE_CONFIG);
        const req = store.put({ clave, valor });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function dbObtenerConfig(clave) {
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE_CONFIG, 'readonly');
        const store = t.objectStore(STORE_CONFIG);
        const req = store.get(clave);
        req.onsuccess = () => resolve(req.result ? req.result.valor : null);
        req.onerror = () => reject(req.error);
    });
}

function generarUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

/* ============================================ */
/* SINCRONIZACIÓN CON GOOGLE SHEETS */
/* ============================================ */
async function enviarASheets(tx) {
    if (!URL_APPS_SCRIPT || URL_APPS_SCRIPT.includes('TU_URL')) return false;
    try {
        const res = await fetch(URL_APPS_SCRIPT, {
            method: 'POST',
            body: JSON.stringify({
                accion: tx.editada ? 'actualizar' : 'crear',
                uuid: tx.uuid,
                fecha: tx.fecha,
                proveedor: tx.proveedor,
                zona: tx.zona,
                mesa: tx.mesa,
                clasificador: tx.clasificador,
                variedad: tx.variedad,
                plaga: tx.plaga_enfermedad,
                cantidad: tx.cantidad
            })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const r = await res.json();
        return r.status === 'ok';
    } catch (e) {
        console.error('❌ Error sync:', e);
        return false;
    }
}

async function sincronizarPendientes() {
    if (!navigator.onLine) return;
    const pend = await dbObtenerPendientes();
    if (pend.length === 0) return;
    console.log(`🔄 Sincronizando ${pend.length} pendientes...`);
    for (const tx of pend) {
        const ok = await enviarASheets(tx);
        if (ok) await dbMarcarSincronizada(tx.id);
        else break;
    }
    actualizarIndicadorSync();
    await recargarRegistrosDesdeDB();
}

async function actualizarIndicadorSync() {
    const el = document.getElementById('sync-indicador');
    if (!el) return;
    const pend = await dbObtenerPendientes();
    el.classList.remove('online', 'offline', 'sincronizando');
    if (!navigator.onLine) {
        el.classList.add('offline');
        el.textContent = `🔴 Sin conexión${pend.length ? ' · ' + pend.length : ''}`;
    } else if (pend.length > 0) {
        el.classList.add('sincronizando');
        el.textContent = `🟡 Sincronizando · ${pend.length}`;
    } else {
        el.classList.add('online');
        el.textContent = '🟢 En línea';
    }
}

window.addEventListener('online', () => { actualizarIndicadorSync(); sincronizarPendientes(); });
window.addEventListener('offline', () => actualizarIndicadorSync());

async function recargarRegistrosDesdeDB() {
    registrosLocales = await dbObtenerTodas();
}

/* ============================================ */
/* RENDERIZADO */
/* ============================================ */
function renderizarSelectores() {
    document.getElementById('proveedor').innerHTML =
        datosSistema.proveedores.map(p => `<option value="${p}">${p}</option>`).join('');
    document.getElementById('zona').innerHTML =
        datosSistema.zonas.map(z => `<option value="${z}">Zona ${z}</option>`).join('');
}

function renderizarListas() {
    document.getElementById('lista-mesas').innerHTML =
        datosSistema.mesas.map(m => `<li data-id="${m}">${m}</li>`).join('');
    document.getElementById('lista-clasificadores').innerHTML =
        datosSistema.clasificadores.map(c => `<li data-id="${c}">${c}</li>`).join('');
    document.getElementById('lista-variedades').innerHTML =
        datosSistema.variedades.map(v => `<li data-id="${v}">${v}</li>`).join('');
    document.getElementById('lista-plagas').innerHTML =
        datosSistema.plagas.map(p => `<li data-id="${p}">${p}</li>`).join('');
}

/* ============================================ */
/* BUSCADORES */
/* ============================================ */
function filtrarLista(idLista, textoBusqueda) {
    const lista = document.getElementById(idLista);
    const texto = textoBusqueda.toLowerCase().trim();
    Array.from(lista.children).forEach(li => {
        const contenido = li.getAttribute('data-id').toLowerCase();
        li.style.display = contenido.includes(texto) ? 'flex' : 'none';
    });
}

function toggleBuscador(idBuscador) {
    const buscador = document.getElementById(idBuscador);
    buscador.classList.toggle('activo');
    if (buscador.classList.contains('activo')) {
        const input = buscador.querySelector('input');
        input.focus();
        input.value = '';
        const idLista = idBuscador.replace('buscador-', 'lista-');
        filtrarLista(idLista, '');
    }
}

/* ============================================ */
/* TECLADO NUMÉRICO */
/* ============================================ */
function presionarTecla(num) {
    if (valorActual === "0") valorActual = num;
    else valorActual += num;
    document.getElementById('pantalla').innerText = valorActual;
}

function borrarTodo() {
    valorActual = "0";
    document.getElementById('pantalla').innerText = valorActual;
}

/* ============================================ */
/* SELECCIÓN DE LISTAS */
/* ============================================ */
function configurarLista(idLista, tipo) {
    document.getElementById(idLista).addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') {
            Array.from(e.currentTarget.children).forEach(li => li.classList.remove('active'));
            e.target.classList.add('active');
            const valor = e.target.getAttribute('data-id');
            if (tipo === 'mesa') mesaSeleccionada = valor;
            if (tipo === 'variedad') variedadSeleccionada = valor;
            if (tipo === 'plaga') plagaSeleccionada = valor;
            if (tipo === 'clasificador') clasificadorSeleccionado = valor;
        }
    });
}

/* ============================================ */
/* INIT */
/* ============================================ */
async function init() {
    await abrirDB();

    // Cargar listas personalizadas guardadas por el admin
    const listas = ['proveedores', 'zonas', 'clasificadores', 'mesas', 'variedades', 'plagas'];
    for (const lista of listas) {
        const guardada = await dbObtenerConfig(`lista_${lista}`);
        if (guardada && Array.isArray(guardada)) datosSistema[lista] = guardada;
    }

    await recargarRegistrosDesdeDB();

    renderizarSelectores();
    renderizarListas();
    configurarLista('lista-mesas', 'mesa');
    configurarLista('lista-clasificadores', 'clasificador');
    configurarLista('lista-variedades', 'variedad');
    configurarLista('lista-plagas', 'plaga');

    actualizarIndicadorSync();
    sincronizarPendientes();
    setInterval(() => sincronizarPendientes(), INTERVALO_SYNC);

    console.log('✅ App iniciada. Registros cargados:', registrosLocales.length);
}
init();

/* ============================================ */
/* MODAL ADMIN - CON PIN */
/* ============================================ */
function abrirAdmin() {
    document.getElementById('modalAdmin').style.display = 'flex';
    if (adminDesbloqueado) mostrarVistaAdmin();
    else mostrarVistaPin();
}

function cerrarAdmin() {
    document.getElementById('modalAdmin').style.display = 'none';
    pinIngresado = "";
    actualizarPinDisplay();
    document.getElementById('pinError').innerText = "";
    document.getElementById('adminInput').value = '';
}

function mostrarVistaPin() {
    document.getElementById('vistaPin').style.display = 'block';
    document.getElementById('vistaAdmin').style.display = 'none';
    pinIngresado = "";
    actualizarPinDisplay();
    document.getElementById('pinError').innerText = "";
}

function mostrarVistaAdmin() {
    document.getElementById('vistaPin').style.display = 'none';
    document.getElementById('vistaAdmin').style.display = 'block';
    actualizarVistaAdmin();
}

/* ============================================ */
/* TECLADO DEL PIN */
/* ============================================ */
function presionarPin(num) {
    if (pinIngresado.length >= 4) return;
    pinIngresado += num;
    actualizarPinDisplay();
    document.getElementById('pinError').innerText = "";
    if (pinIngresado.length === 4) setTimeout(validarPin, 200);
}

function borrarPin() {
    pinIngresado = pinIngresado.slice(0, -1);
    actualizarPinDisplay();
    document.getElementById('pinError').innerText = "";
}

function actualizarPinDisplay() {
    const dots = document.querySelectorAll('#pinDisplay .pin-dot');
    dots.forEach((dot, index) => {
        if (index < pinIngresado.length) dot.classList.add('lleno');
        else dot.classList.remove('lleno');
    });
}

function validarPin() {
    const display = document.getElementById('pinDisplay');
    if (pinIngresado === PIN_ADMIN) {
        adminDesbloqueado = true;
        mostrarVistaAdmin();
    } else {
        display.classList.add('error');
        document.getElementById('pinError').innerText = "❌ PIN incorrecto. Intenta de nuevo.";
        setTimeout(() => {
            display.classList.remove('error');
            pinIngresado = "";
            actualizarPinDisplay();
        }, 600);
    }
}

/* ============================================ */
/* ADMIN - AGREGAR Y ELIMINAR */
/* ============================================ */
function actualizarVistaAdmin() {
    const categoria = document.getElementById('adminCategoria').value;
    const listaActual = datosSistema[categoria];
    const contenedorLista = document.getElementById('adminListaActual');
    const placeholders = {
        proveedores: "Nombre del Proveedor",
        zonas: "Número de Zona (Ej. 3)",
        clasificadores: "Código Clasificador (Ej. JM)",
        mesas: "Nombre de la Mesa (Ej. M7 LP)",
        variedades: "Nombre de la Variedad"
    };
    document.getElementById('adminInput').placeholder = placeholders[categoria] || "Escribe el nombre aquí...";

    if (listaActual.length === 0) {
        contenedorLista.innerHTML = '<li style="text-align:center;padding:15px;color:#999;font-size:13px;">No hay items en esta categoría.</li>';
        return;
    }
    contenedorLista.innerHTML = listaActual.map((item, index) => `
        <li class="admin-item">
            <span class="item-texto">• ${item}</span>
            <button class="btn-eliminar-item" onclick="eliminarItemAdmin('${categoria}', ${index})" title="Eliminar">🗑️</button>
        </li>
    `).join('');
}

async function agregarItemAdmin() {
    const categoria = document.getElementById('adminCategoria').value;
    const input = document.getElementById('adminInput');
    const nuevoValor = input.value.trim();
    if (nuevoValor === "") { alert("Escribe un valor válido."); return; }
    if (datosSistema[categoria].includes(nuevoValor)) { alert("Este registro ya existe."); return; }

    datosSistema[categoria].push(nuevoValor);
    await dbGuardarConfig(`lista_${categoria}`, datosSistema[categoria]);
    renderizarSelectores();
    renderizarListas();
    actualizarVistaAdmin();
    input.value = '';
}

async function eliminarItemAdmin(categoria, index) {
    const item = datosSistema[categoria][index];
    if (!confirm(`¿Eliminar "${item}" de la lista de ${categoria}?`)) return;
    datosSistema[categoria].splice(index, 1);
    await dbGuardarConfig(`lista_${categoria}`, datosSistema[categoria]);
    renderizarSelectores();
    renderizarListas();
    actualizarVistaAdmin();
}

/* ============================================ */
/* MODAL TRANSACCIONES */
/* ============================================ */
function abrirTransacciones() {
    document.getElementById('modalTransacciones').style.display = 'flex';
    renderizarTransacciones();
}

function cerrarTransacciones() {
    document.getElementById('modalTransacciones').style.display = 'none';
    if (indiceEditando !== null) cancelarEdicion();
}

function renderizarTransacciones() {
    const tbody = document.getElementById('tablaTransaccionesBody');
    const contador = document.getElementById('contadorTransacciones');
    contador.innerText = `${registrosLocales.length} registro${registrosLocales.length !== 1 ? 's' : ''}`;

    if (registrosLocales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="sin-registros">No hay transacciones registradas aún.</td></tr>`;
        return;
    }

    tbody.innerHTML = registrosLocales.map((reg, index) => {
        const esEditando = indiceEditando === index;
        let fechaBonita = reg.fecha;
        if (reg.fecha) {
            const p = reg.fecha.split('-');
            if (p.length === 3) fechaBonita = `${p[2]}/${p[1]}/${p[0]}`;
        }
        const proveedorCorto = reg.proveedor.replace(/^\(\d+\)\s*/, '').substring(0, 25) + (reg.proveedor.length > 30 ? '...' : '');
        const syncIcon = reg.sincronizada ? '🟢' : '🟡';
        return `
            <tr class="${esEditando ? 'editando' : ''}">
                <td><strong>${index + 1}</strong></td>
                <td style="white-space: nowrap;">${fechaBonita}</td>
                <td title="${reg.proveedor}">${proveedorCorto}</td>
                <td>${reg.mesa}</td>
                <td>${reg.clasificador}</td>
                <td>${reg.variedad}</td>
                <td>${reg.plaga_enfermedad}</td>
                <td><strong>${reg.cantidad}</strong> ${syncIcon}</td>
                <td style="white-space: nowrap;">
                    <button class="btn-accion btn-editar" onclick="editarTransaccion(${index})" title="Editar">✏️</button>
                    <button class="btn-accion btn-eliminar" onclick="eliminarTransaccion(${index})" title="Eliminar">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');
}

function editarTransaccion(index) {
    const reg = registrosLocales[index];
    indiceEditando = index;
    document.getElementById('modalTransacciones').style.display = 'none';

    mesaSeleccionada = reg.mesa;
    marcarActivo('lista-mesas', reg.mesa);
    clasificadorSeleccionado = reg.clasificador;
    marcarActivo('lista-clasificadores', reg.clasificador);
    variedadSeleccionada = reg.variedad;
    marcarActivo('lista-variedades', reg.variedad);
    plagaSeleccionada = reg.plaga_enfermedad;
    marcarActivo('lista-plagas', reg.plaga_enfermedad);

    valorActual = String(reg.cantidad);
    document.getElementById('pantalla').innerText = valorActual;

    const btn = document.querySelector('.btn-guardar-rojo');
    btn.innerText = "Actualizar";
    btn.style.backgroundColor = "#ff9800";

    agregarBotonCancelar();
    window.scrollTo(0, 0);
}

function marcarActivo(idLista, valor) {
    const lista = document.getElementById(idLista);
    Array.from(lista.children).forEach(li => {
        li.classList.remove('active');
        if (li.getAttribute('data-id') === valor) li.classList.add('active');
    });
}

function agregarBotonCancelar() {
    if (document.getElementById('btnCancelarEdicion')) return;
    const btnGuardar = document.querySelector('.btn-guardar-rojo');
    const btnCancelar = document.createElement('button');
    btnCancelar.id = 'btnCancelarEdicion';
    btnCancelar.innerText = "Cancelar";
    btnCancelar.style.cssText = `background-color: #757575; color: white; border: none; padding: 12px 20px; border-radius: 4px; font-size: 14px; font-weight: bold; cursor: pointer; margin-left: 10px;`;
    btnCancelar.onclick = cancelarEdicion;
    btnGuardar.parentNode.insertBefore(btnCancelar, btnGuardar.nextSibling);
}

function cancelarEdicion() {
    indiceEditando = null;
    const btn = document.querySelector('.btn-guardar-rojo');
    btn.innerText = "Guardar";
    btn.style.backgroundColor = "#e74c3c";
    const btnCancelar = document.getElementById('btnCancelarEdicion');
    if (btnCancelar) btnCancelar.remove();
    borrarTodo();
    mesaSeleccionada = null;
    variedadSeleccionada = null;
    plagaSeleccionada = null;
    clasificadorSeleccionado = null;
    document.querySelectorAll('.lista-items li').forEach(li => li.classList.remove('active'));
}

async function eliminarTransaccion(index) {
    const reg = registrosLocales[index];
    if (!confirm(`¿Eliminar este registro?\n\nMesa: ${reg.mesa}\nVariedad: ${reg.variedad}\nPlaga: ${reg.plaga_enfermedad}\nCantidad: ${reg.cantidad}`)) return;

    if (reg.id) await dbEliminarTransaccion(reg.id);
    registrosLocales.splice(index, 1);
    if (indiceEditando === index) cancelarEdicion();
    else if (indiceEditando !== null && indiceEditando > index) indiceEditando--;
    renderizarTransacciones();
    actualizarIndicadorSync();
}

/* ============================================ */
/* CERRAR MODALES AL CLIC FUERA */
/* ============================================ */
window.onclick = function(event) {
    const mAdmin = document.getElementById('modalAdmin');
    const mTrans = document.getElementById('modalTransacciones');
    if (event.target === mAdmin) cerrarAdmin();
    if (event.target === mTrans) cerrarTransacciones();
};

/* ============================================ */
/* GUARDAR / ACTUALIZAR */
/* ============================================ */
async function guardarRegistro() {
    if (!mesaSeleccionada || !variedadSeleccionada || !plagaSeleccionada || !clasificadorSeleccionado) {
        alert("Selecciona Mesa, Clasificador, Variedad y Plaga/Enfermedad.");
        return;
    }
    if (valorActual === "0") { alert("Ingresa una cantidad mayor a 0."); return; }

    const nuevoRegistro = {
        fecha: document.getElementById('fecha').value,
        proveedor: document.getElementById('proveedor').value,
        zona: document.getElementById('zona').value,
        clasificador: clasificadorSeleccionado,
        mesa: mesaSeleccionada,
        variedad: variedadSeleccionada,
        plaga_enfermedad: plagaSeleccionada,
        cantidad: parseInt(valorActual)
    };

    if (indiceEditando !== null) {
        const regActual = registrosLocales[indiceEditando];
        if (regActual.id) await dbActualizarTransaccion(regActual.id, nuevoRegistro);
        registrosLocales[indiceEditando] = { ...regActual, ...nuevoRegistro, sincronizada: false };

        indiceEditando = null;
        const btn = document.querySelector('.btn-guardar-rojo');
        btn.innerText = "Guardar";
        btn.style.backgroundColor = "#e74c3c";
        const btnCancelar = document.getElementById('btnCancelarEdicion');
        if (btnCancelar) btnCancelar.remove();
        alert("✅ Registro actualizado correctamente.");
    } else {
        await dbGuardarTransaccion(nuevoRegistro);
        await recargarRegistrosDesdeDB();

        const btn = document.querySelector('.btn-guardar-rojo');
        const textoOriginal = btn.innerText;
        btn.innerText = "¡Guardado!";
        btn.style.backgroundColor = "#27ae60";
        setTimeout(() => {
            btn.innerText = textoOriginal;
            btn.style.backgroundColor = "#e74c3c";
        }, 1000);
    }

    // Sincronizar en segundo plano
    if (navigator.onLine) sincronizarPendientes();
    actualizarIndicadorSync();

    // Limpiar solo Variedad, Plaga y teclado
    borrarTodo();
    variedadSeleccionada = null;
    plagaSeleccionada = null;
    document.querySelectorAll('#lista-variedades li, #lista-plagas li')
        .forEach(li => li.classList.remove('active'));
}

/* ============================================ */
/* GENERAR EXCEL */
/* ============================================ */
function generarExcel() {
    const fechaSeleccionada = document.getElementById('fecha').value;
    const proveedorSeleccionado = document.getElementById('proveedor').value;
    const zonaSeleccionada = document.getElementById('zona').value;

    const registrosFiltrados = registrosLocales.filter(r =>
        r.fecha === fechaSeleccionada &&
        r.proveedor === proveedorSeleccionado &&
        r.zona === zonaSeleccionada
    );

    if (registrosFiltrados.length === 0) {
        alert("No hay registros guardados para esta fecha, proveedor y zona.");
        return;
    }

    const columnasExcel = [
        "FECHA", "AÑO", "MES", "SEMANA", "DIA", "ZONA", "VARIEDAD",
        "MALTRATO FOLLAJE", "BOTON MALTRATADO", "MALTRATO POSTCO", "B. ABIERTO",
        "B. DEFORME", "CLOROTICO", "ROTOS", "TORCIDO", "C. DE GANZO", "TRIPS",
        "ACAROS", "OIDIO", "BOTRITIS", "AFIDOS", "VELLOSO", "MAL DESYEME",
        "FITO TOXICIDAD", "DEFIC. DE CALCIO", "TALLOS CORTOS", "P QUEMADOS",
        "2 CABEZAS O MENOS", "TALLOS DELGADOS", "PÁLIDOS", "B. DESCABEZADO CULTIVO",
        "INTOXICACIÓN", "SIN FOLLAJE", "GUSANO", "MB", "DIPTEROS", "LEPIDOPTEROS",
        "COLEOPTEROS", "SEMILLA DE MALEZA", "OTROS", "TOTAL", "CLASIFICADOR"
    ];

    const datosAgrupados = {};
    registrosFiltrados.forEach((data) => {
        const variedad = data.variedad;
        if (!datosAgrupados[variedad]) {
            const p = data.fecha.split('-');
            datosAgrupados[variedad] = {
                "FECHA": data.fecha, "AÑO": p[0], "MES": p[1], "SEMANA": "40",
                "DIA": p[2], "ZONA": data.zona, "VARIEDAD": variedad,
                "CLASIFICADOR": data.clasificador, "TOTAL": 0
            };
            columnasExcel.forEach(col => {
                if (datosAgrupados[variedad][col] === undefined) datosAgrupados[variedad][col] = 0;
            });
        }
        const plaga = data.plaga_enfermedad;
        if (datosAgrupados[variedad][plaga] !== undefined) datosAgrupados[variedad][plaga] += data.cantidad;
        else datosAgrupados[variedad]["OTROS"] += data.cantidad;
        datosAgrupados[variedad]["TOTAL"] += data.cantidad;
    });

    const dataArray = Object.values(datosAgrupados);
    const ws = XLSX.utils.json_to_sheet(dataArray, { header: columnasExcel });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Nacional");
    const nombreArchivo = `NACIONAL_${proveedorSeleccionado.replace(/[^a-zA-Z0-9]/g, '_')}_${fechaSeleccionada}.xlsx`;
    XLSX.writeFile(wb, nombreArchivo);
}