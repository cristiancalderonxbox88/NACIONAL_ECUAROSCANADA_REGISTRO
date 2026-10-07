// ============================================================
// REGISTRO NACIONAL CALIDAD - World Roses Center / Ecuaroscanada
// app.js - Versión completa con IndexedDB + Google Sheets
// ============================================================

// ============================================================
// ⚙️ CONFIGURACIÓN
// ============================================================
const PIN_ADMIN = "1234";
const URL_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbyslIJRHX7cfsY1qwoh2nqx1DUrKht1xVZGjXg38hUfqQYwiSbnbjMZpuo20qWaVWKw/exec";
const INTERVALO_SYNC = 30000;

// ============================================================
// 📋 DATOS PRECARGADOS
// ============================================================
const PROVEEDORES_DEFAULT = [
    "(05) QUIMBIAMBA CACUANGO PEDRO",
    "(01) ECUAROSCANADA S.A.",
    "(02) GRACE MESA",
    "(03) HERNAN CABASCANGO",
    "(04) ESTACIO CACHIPUENDO NATHALY SILVANA"
];

const ZONAS_DEFAULT = ["1", "2"];

const CLASIFICADORES_DEFAULT = ["JM", "Y", "M", "C", "J", "D", "J-Y-D-JM", "JM-D"];

const MESAS_DEFAULT = ["M1 CE", "M2 AM", "M3 VE", "M4 RO", "M5 MO", "M6 NA", "PETALOS"];

const VARIEDADES_DEFAULT = [
    "AMNESIA", "ARTC", "ATMC", "BLSH", "BRIGHTON", "CANDLELIGHT", "CARPE DIEM",
    "COFFE BREAK", "COLOR", "COTTON XPRESSION", "COUNTRY BLUES", "DARK PINK ROSE",
    "DEEP PURPLE", "DOZEN ROSE HOT PINK", "DOZEN ROSE LIGHT PINK",
    "DOZEN ROSE NOVELTY-BI", "ANNA JULIA", "ATHOMIC", "BE SWEET", "BOULEVARD",
    "CANDY X-PRESSION", "COTTON X-PRESSIÓN", "COUNTRY BLUE", "ECUA PINK",
    "ESPERANCE", "EXOTIC BERRY", "EXPLORER", "FREE SPIRIT", "FRUTTETO", "FULL MONTY",
    "GOTCHA", "HARD ROCK", "HEARTS", "HERMOSA", "HOT EXPLORER", "KAHALA", "LOLA",
    "LORRAINE", "LUCIANO", "MAGIC TIMES", "MANDALA", "MANDARIN X-PRESSION",
    "MONDIAL", "MOONSTONE", "NINA", "O`HARA", "OPALA", "PALOMA", "PINK FLOYD",
    "PINK MONDIAL", "PINK XPRESSION", "PLAYA BLANCA", "POMAROSA", "POWDER PUFF",
    "PRINCESS CROWN", "QUEENS CROWN", "QUICKSAND", "RED PANTHER", "SHIMMER",
    "SILANTOI", "SUPER SUN", "WHITE OHARA"
];

const PLAGAS = [
    "MALTRATO FOLLAJE", "BOTON MALTRATADO", "MALTRATO POSTCO", "B. ABIERTO",
    "B. DEFORME", "CLOROTICO", "ROTOS", "TORCIDO", "C. DE GANZO", "TRIPS",
    "ACAROS", "OIDIO", "BOTRITIS", "AFIDOS", "VELLOSO", "MAL DESYEME",
    "FITO TOXICIDAD", "DEFIC. DE CALCIO", "TALLOS CORTOS", "P QUEMADOS",
    "2 CABEZAS O MENOS", "TALLOS DELGADOS", "PÁLIDOS", "B. DESCABEZADO CULTIVO",
    "INTOXICACIÓN", "SIN FOLLAJE", "GUSANO", "MB", "DIPTEROS", "LEPIDOPTEROS",
    "COLEOPTEROS", "SEMILLA DE MALEZA", "OTROS"
];

// ============================================================
// 🧠 ESTADO GLOBAL
// ============================================================
const estado = {
    proveedores: [...PROVEEDORES_DEFAULT],
    zonas: [...ZONAS_DEFAULT],
    clasificadores: [...CLASIFICADORES_DEFAULT],
    mesas: [...MESAS_DEFAULT],
    variedades: [...VARIEDADES_DEFAULT],
    seleccion: {
        fecha: new Date().toISOString().split('T')[0],
        proveedor: "",
        zona: "",
        mesa: "",
        clasificador: "",
        variedad: "",
        plaga: "",
        cantidad: ""
    },
    editandoId: null,
    adminDesbloqueado: false,
    sincronizando: false
};

// ============================================================
// 🗄️ MÓDULO INDEXEDDB
// ============================================================
const DB_NAME = 'WRC_RegistroCalidad';
const DB_VERSION = 1;
const STORE_TX = 'transacciones';
const STORE_CONFIG = 'configuracion';

let db = null;

function abrirDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains(STORE_TX)) {
                const store = database.createObjectStore(STORE_TX, {
                    keyPath: 'id',
                    autoIncrement: true
                });
                store.createIndex('sincronizada', 'sincronizada', { unique: false });
                store.createIndex('fecha', 'fecha', { unique: false });
                store.createIndex('uuid', 'uuid', { unique: true });
            }
            if (!database.objectStoreNames.contains(STORE_CONFIG)) {
                database.createObjectStore(STORE_CONFIG, { keyPath: 'clave' });
            }
        };

        req.onsuccess = (e) => {
            db = e.target.result;
            console.log('✅ IndexedDB abierta');
            resolve(db);
        };
        req.onerror = (e) => {
            console.error('❌ Error IndexedDB:', e.target.error);
            reject(e.target.error);
        };
    });
}

function guardarTransaccionLocal(tx) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_TX, 'readwrite');
        const store = transaction.objectStore(STORE_TX);
        const registro = {
            ...tx,
            uuid: generarUUID(),
            sincronizada: false,
            timestamp: Date.now(),
            intentos: 0
        };
        const req = store.add(registro);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function obtenerPendientes() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TX, 'readonly');
        const store = tx.objectStore(STORE_TX);
        const index = store.index('sincronizada');
        const req = index.getAll(false);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

function obtenerTodas() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TX, 'readonly');
        const store = tx.objectStore(STORE_TX);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

function marcarSincronizada(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TX, 'readwrite');
        const store = tx.objectStore(STORE_TX);
        const req = store.get(id);
        req.onsuccess = () => {
            const r = req.result;
            if (r) {
                r.sincronizada = true;
                r.fechaSincronizacion = Date.now();
                store.put(r);
            }
            resolve();
        };
        req.onerror = () => reject(req.error);
    });
}

function incrementarIntentos(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TX, 'readwrite');
        const store = tx.objectStore(STORE_TX);
        const req = store.get(id);
        req.onsuccess = () => {
            const r = req.result;
            if (r) {
                r.intentos = (r.intentos || 0) + 1;
                store.put(r);
            }
            resolve();
        };
        req.onerror = () => reject(req.error);
    });
}

function eliminarTransaccionLocal(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TX, 'readwrite');
        const store = tx.objectStore(STORE_TX);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function actualizarTransaccionLocal(id, datos) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TX, 'readwrite');
        const store = tx.objectStore(STORE_TX);
        const req = store.get(id);
        req.onsuccess = () => {
            const r = req.result;
            if (!r) return reject('No encontrado');
            Object.assign(r, datos, {
                sincronizada: false,
                editada: true,
                fechaEdicion: Date.now()
            });
            store.put(r);
            resolve();
        };
        req.onerror = () => reject(req.error);
    });
}

function guardarConfig(clave, valor) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_CONFIG, 'readwrite');
        const store = tx.objectStore(STORE_CONFIG);
        const req = store.put({ clave, valor });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function obtenerConfig(clave) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_CONFIG, 'readonly');
        const store = tx.objectStore(STORE_CONFIG);
        const req = store.get(clave);
        req.onsuccess = () => resolve(req.result ? req.result.valor : null);
        req.onerror = () => reject(req.error);
    });
}

// ============================================================
// 🔑 UTILIDADES
// ============================================================
function generarUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ============================================================
// ☁️ MÓDULO DE SINCRONIZACIÓN
// ============================================================
async function enviarASheets(tx) {
    if (!URL_APPS_SCRIPT || URL_APPS_SCRIPT.includes('TU_URL')) {
        console.warn('⚠️ URL_APPS_SCRIPT no configurada');
        return false;
    }
    try {
        const response = await fetch(URL_APPS_SCRIPT, {
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
                plaga: tx.plaga,
                cantidad: tx.cantidad
            })
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const result = await response.json();
        return result.status === 'ok';
    } catch (error) {
        console.error('❌ Error enviando a Sheets:', error);
        return false;
    }
}

async function sincronizarPendientes() {
    if (estado.sincronizando) return;
    if (!navigator.onLine) return;

    const pendientes = await obtenerPendientes();
    if (pendientes.length === 0) return;

    estado.sincronizando = true;
    actualizarIndicadorSync();
    console.log(`🔄 Sincronizando ${pendientes.length} pendientes...`);

    for (const tx of pendientes) {
        const exito = await enviarASheets(tx);
        if (exito) {
            await marcarSincronizada(tx.id);
        } else {
            await incrementarIntentos(tx.id);
            if ((tx.intentos || 0) + 1 >= 5) break;
        }
    }

    estado.sincronizando = false;
    actualizarIndicadorSync();
}

async function actualizarIndicadorSync() {
    const indicador = document.getElementById('indicador-sync');
    const icono = document.getElementById('sync-icono');
    const texto = document.getElementById('sync-texto');
    const badge = document.getElementById('sync-pendientes');
    if (!indicador) return;

    const pendientes = await obtenerPendientes();

    indicador.classList.remove('online', 'offline', 'sincronizando');

    if (!navigator.onLine) {
        indicador.classList.add('offline');
        if (icono) icono.textContent = '🔴';
        if (texto) texto.textContent = 'Sin conexión';
    } else if (estado.sincronizando || pendientes.length > 0) {
        indicador.classList.add('sincronizando');
        if (icono) icono.textContent = '🟡';
        if (texto) texto.textContent = estado.sincronizando ? 'Sincronizando' : 'Pendientes';
    } else {
        indicador.classList.add('online');
        if (icono) icono.textContent = '🟢';
        if (texto) texto.textContent = 'En línea';
    }

    if (badge) {
        if (pendientes.length > 0) {
            badge.style.display = 'inline-block';
            badge.textContent = pendientes.length;
        } else {
            badge.style.display = 'none';
        }
    }
}

window.addEventListener('online', () => {
    console.log('🌐 Conexión restaurada');
    actualizarIndicadorSync();
    sincronizarPendientes();
});
window.addEventListener('offline', () => {
    console.log('📴 Sin conexión');
    actualizarIndicadorSync();
});

// ============================================================
// 🎨 RENDERIZADO DE LISTAS
// ============================================================
function renderizarLista(contenedorId, items, tipo, filtro = '') {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;
    contenedor.innerHTML = '';

    const filtroUpper = filtro.toUpperCase();
    items
        .filter(item => !filtro || item.toUpperCase().includes(filtroUpper))
        .forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'item-btn';
            btn.textContent = item;

            if (estado.seleccion[tipo] === item) {
                btn.classList.add('seleccionado');
            }

            btn.addEventListener('click', () => {
                estado.seleccion[tipo] = item;
                renderizarTodasLasListas();
            });

            contenedor.appendChild(btn);
        });
}

function renderizarTodasLasListas() {
    const filtros = {
        mesas: document.getElementById('filtro-mesas')?.value || '',
        clasificadores: document.getElementById('filtro-clasificadores')?.value || '',
        variedades: document.getElementById('filtro-variedades')?.value || '',
        plagas: document.getElementById('filtro-plagas')?.value || ''
    };
    renderizarLista('lista-mesas', estado.mesas, 'mesa', filtros.mesas);
    renderizarLista('lista-clasificadores', estado.clasificadores, 'clasificador', filtros.clasificadores);
    renderizarLista('lista-variedades', estado.variedades, 'variedad', filtros.variedades);
    renderizarLista('lista-plagas', PLAGAS, 'plaga', filtros.plagas);

    const display = document.getElementById('display-cantidad');
    if (display) display.textContent = estado.seleccion.cantidad || '0';
}

// ============================================================
// 🧮 TECLADO NUMÉRICO
// ============================================================
function inicializarNumpad() {
    document.querySelectorAll('.numpad-btn[data-num]').forEach(btn => {
        btn.addEventListener('click', () => {
            const n = btn.dataset.num;
            if (estado.seleccion.cantidad.length < 6) {
                estado.seleccion.cantidad += n;
                actualizarDisplay();
            }
        });
    });

    document.getElementById('btn-borrar')?.addEventListener('click', () => {
        estado.seleccion.cantidad = estado.seleccion.cantidad.slice(0, -1);
        actualizarDisplay();
    });

    document.getElementById('btn-limpiar')?.addEventListener('click', () => {
        estado.seleccion.cantidad = '';
        actualizarDisplay();
    });
}

function actualizarDisplay() {
    const display = document.getElementById('display-cantidad');
    if (display) display.textContent = estado.seleccion.cantidad || '0';
}

// ============================================================
// 💾 GUARDAR / ACTUALIZAR TRANSACCIÓN
// ============================================================
async function guardarTransaccion() {
    const s = estado.seleccion;

    if (!s.fecha || !s.proveedor || !s.zona || !s.mesa ||
        !s.clasificador || !s.variedad || !s.plaga || !s.cantidad) {
        alert('⚠️ Debes completar todos los campos');
        return;
    }

    const transaccion = {
        fecha: s.fecha,
        proveedor: s.proveedor,
        zona: s.zona,
        mesa: s.mesa,
        clasificador: s.clasificador,
        variedad: s.variedad,
        plaga: s.plaga,
        cantidad: parseInt(s.cantidad)
    };

    try {
        if (estado.editandoId !== null) {
            await actualizarTransaccionLocal(estado.editandoId, transaccion);
            estado.editandoId = null;
            cambiarBotonGuardar(false);
            console.log('✏️ Transacción actualizada');
        } else {
            const id = await guardarTransaccionLocal(transaccion);
            console.log('💾 Guardado local con ID:', id);
        }

        if (navigator.onLine) {
            sincronizarPendientes();
        }

        actualizarIndicadorSync();

        // Limpiar solo variedad, plaga y cantidad
        s.variedad = '';
        s.plaga = '';
        s.cantidad = '';
        actualizarDisplay();
        renderizarTodasLasListas();

    } catch (error) {
        console.error('Error guardando:', error);
        alert('❌ Error al guardar. Intenta de nuevo.');
    }
}

function cambiarBotonGuardar(modoEdicion) {
    const btn = document.getElementById('btn-guardar');
    if (!btn) return;
    if (modoEdicion) {
        btn.textContent = 'Actualizar';
        btn.classList.add('editando');
    } else {
        btn.textContent = 'Guardar';
        btn.classList.remove('editando');
    }
}

// ============================================================
// 🧑‍💼 MODAL ADMIN
// ============================================================
let adminBuffer = '';

function abrirAdmin() {
    if (estado.adminDesbloqueado) {
        mostrarPanelAdmin();
        return;
    }
    adminBuffer = '';
    actualizarPuntosAdmin();
    document.getElementById('modal-pin')?.classList.add('visible');
}

function actualizarPuntosAdmin() {
    const puntos = document.getElementById('pin-puntos');
    if (puntos) puntos.textContent = '●'.repeat(adminBuffer.length) + '○'.repeat(4 - adminBuffer.length);
}

function inicializarPin() {
    document.querySelectorAll('.pin-btn[data-pin]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (adminBuffer.length >= 4) return;
            adminBuffer += btn.dataset.pin;
            actualizarPuntosAdmin();
            if (adminBuffer.length === 4) {
                setTimeout(() => {
                    if (adminBuffer === PIN_ADMIN) {
                        estado.adminDesbloqueado = true;
                        document.getElementById('modal-pin')?.classList.remove('visible');
                        mostrarPanelAdmin();
                    } else {
                        alert('❌ PIN incorrecto');
                        adminBuffer = '';
                        actualizarPuntosAdmin();
                    }
                }, 200);
            }
        });
    });

    document.getElementById('pin-borrar')?.addEventListener('click', () => {
        adminBuffer = adminBuffer.slice(0, -1);
        actualizarPuntosAdmin();
    });

    document.getElementById('pin-cerrar')?.addEventListener('click', () => {
        adminBuffer = '';
        document.getElementById('modal-pin')?.classList.remove('visible');
    });
}

function mostrarPanelAdmin() {
    const modal = document.getElementById('modal-admin');
    if (!modal) return;
    modal.classList.add('visible');
    renderizarAdminListas();
}

function renderizarAdminListas() {
    const mapas = {
        'admin-proveedores': { items: estado.proveedores, tipo: 'proveedor' },
        'admin-zonas': { items: estado.zonas, tipo: 'zona' },
        'admin-clasificadores': { items: estado.clasificadores, tipo: 'clasificador' },
        'admin-mesas': { items: estado.mesas, tipo: 'mesa' },
        'admin-variedades': { items: estado.variedades, tipo: 'variedad' }
    };

    Object.entries(mapas).forEach(([id, { items, tipo }]) => {
        const cont = document.getElementById(id);
        if (!cont) return;
        cont.innerHTML = '';
        items.forEach((item, idx) => {
            const div = document.createElement('div');
            div.className = 'admin-item';
            const span = document.createElement('span');
            span.textContent = item;
            const btn = document.createElement('button');
            btn.textContent = '🗑️';
            btn.className = 'btn-eliminar';
            btn.onclick = () => {
                if (!confirm(`¿Eliminar "${item}"?`)) return;
                items.splice(idx, 1);
                guardarConfig(`lista_${tipo}s`, items);
                renderizarAdminListas();
                renderizarTodasLasListas();
            };
            div.appendChild(span);
            div.appendChild(btn);
            cont.appendChild(div);
        });
    });
}

function inicializarAdminBotones() {
    document.querySelectorAll('[data-admin-add]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tipo = btn.dataset.adminAdd;
            const input = document.getElementById(`input-admin-${tipo}`);
            if (!input || !input.value.trim()) return;
            const valor = input.value.trim();
            if (estado[`${tipo}s`].includes(valor)) {
                alert('Ya existe');
                return;
            }
            estado[`${tipo}s`].push(valor);
            guardarConfig(`lista_${tipo}s`, estado[`${tipo}s`]);
            input.value = '';
            renderizarAdminListas();
            renderizarTodasLasListas();
        });
    });

    document.getElementById('admin-cerrar')?.addEventListener('click', () => {
        document.getElementById('modal-admin')?.classList.remove('visible');
    });
}

// ============================================================
// 📋 MODAL TRANSACCIONES
// ============================================================
async function abrirTransacciones() {
    const modal = document.getElementById('modal-transacciones');
    if (!modal) return;
    modal.classList.add('visible');
    await renderizarTransacciones();
}

async function renderizarTransacciones() {
    const tbody = document.getElementById('transacciones-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const todas = await obtenerTodas();
    todas.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    todas.forEach((tx, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td>${tx.fecha}</td>
            <td>${tx.proveedor}</td>
            <td>${tx.mesa}</td>
            <td>${tx.clasificador}</td>
            <td>${tx.variedad}</td>
            <td>${tx.plaga}</td>
            <td>${tx.cantidad}</td>
            <td>
                <button class="btn-editar" data-id="${tx.id}">✏️</button>
                <button class="btn-eliminar" data-id="${tx.id}">🗑️</button>
                <span class="estado-sync">${tx.sincronizada ? '🟢' : '🟡'}</span>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-editar').forEach(btn => {
        btn.onclick = () => editarTransaccion(parseInt(btn.dataset.id));
    });
    tbody.querySelectorAll('.btn-eliminar').forEach(btn => {
        btn.onclick = () => eliminarTransaccion(parseInt(btn.dataset.id));
    });
}

async function editarTransaccion(id) {
    const todas = await obtenerTodas();
    const tx = todas.find(t => t.id === id);
    if (!tx) return;

    Object.assign(estado.seleccion, {
        fecha: tx.fecha,
        proveedor: tx.proveedor,
        zona: tx.zona,
        mesa: tx.mesa,
        clasificador: tx.clasificador,
        variedad: tx.variedad,
        plaga: tx.plaga,
        cantidad: String(tx.cantidad)
    });
    estado.editandoId = id;
    cambiarBotonGuardar(true);
    renderizarTodasLasListas();
    actualizarDisplay();
    sincronizarCabeceraConEstado();

    document.getElementById('modal-transacciones')?.classList.remove('visible');
}

async function eliminarTransaccion(id) {
    if (!confirm('¿Eliminar esta transacción?')) return;
    await eliminarTransaccionLocal(id);
    await renderizarTransacciones();
    actualizarIndicadorSync();
}

function sincronizarCabeceraConEstado() {
    const s = estado.seleccion;
    const fechaInput = document.getElementById('input-fecha');
    const proveedorSel = document.getElementById('select-proveedor');
    const zonaSel = document.getElementById('select-zona');
    if (fechaInput) fechaInput.value = s.fecha;
    if (proveedorSel) proveedorSel.value = s.proveedor;
    if (zonaSel) zonaSel.value = s.zona;
}

// ============================================================
// 📊 GENERACIÓN DE EXCEL
// ============================================================
async function descargarExcel() {
    if (typeof XLSX === 'undefined') {
        alert('❌ SheetJS no está cargado. Verifica el CDN en index.html.');
        return;
    }

    const todas = await obtenerTodas();
    if (todas.length === 0) {
        alert('No hay transacciones para exportar');
        return;
    }

    const s = estado.seleccion;
    const filtradas = todas.filter(t =>
        (!s.proveedor || t.proveedor === s.proveedor) &&
        (!s.fecha || t.fecha === s.fecha)
    );

    if (filtradas.length === 0) {
        alert('No hay transacciones con los filtros actuales');
        return;
    }

    const cabeceras = ['FECHA', 'AÑO', 'MES', 'SEMANA', 'DIA', 'ZONA', 'VARIEDAD',
        ...PLAGAS, 'TOTAL', 'CLASIFICADOR'];

    const agrupado = {};
    filtradas.forEach(t => {
        const key = `${t.variedad}|${t.zona}|${t.clasificador}`;
        if (!agrupado[key]) {
            agrupado[key] = {
                fecha: t.fecha,
                zona: t.zona,
                variedad: t.variedad,
                clasificador: t.clasificador,
                plagas: {}
            };
        }
        agrupado[key].plagas[t.plaga] = (agrupado[key].plagas[t.plaga] || 0) + t.cantidad;
    });

    const filas = [cabeceras];
    Object.values(agrupado).forEach(g => {
        const fecha = new Date(g.fecha + 'T12:00:00');
        const año = fecha.getFullYear();
        const mes = fecha.getMonth() + 1;
        const dia = fecha.getDate();
        const semana = getSemanaISO(fecha);

        let total = 0;
        const fila = [g.fecha, año, mes, semana, dia, g.zona, g.variedad];

        PLAGAS.forEach(p => {
            const v = g.plagas[p] || 0;
            fila.push(v);
            total += v;
        });

        fila.push(total, g.clasificador);
        filas.push(fila);
    });

    const ws = XLSX.utils.aoa_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nacional');

    const nombre = `NACIONAL_${(s.proveedor || 'TODOS').replace(/[^\w]/g, '_')}_${s.fecha || 'TODAS'}.xlsx`;
    XLSX.writeFile(wb, nombre);
    console.log('📊 Excel generado:', nombre);
}

function getSemanaISO(fecha) {
    const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// ============================================================
// 🎛️ INICIALIZACIÓN DE EVENTOS
// ============================================================
function inicializarCabecera() {
    const fechaInput = document.getElementById('input-fecha');
    const proveedorSel = document.getElementById('select-proveedor');
    const zonaSel = document.getElementById('select-zona');

    if (fechaInput) {
        fechaInput.value = estado.seleccion.fecha;
        fechaInput.addEventListener('change', e => {
            estado.seleccion.fecha = e.target.value;
        });
    }
    if (proveedorSel) {
        // Limpiar primero para evitar duplicados
        proveedorSel.innerHTML = '<option value="">-- Seleccionar --</option>';
        estado.proveedores.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            proveedorSel.appendChild(opt);
        });
        proveedorSel.addEventListener('change', e => {
            estado.seleccion.proveedor = e.target.value;
        });
    }
    if (zonaSel) {
        zonaSel.innerHTML = '<option value="">--</option>';
        estado.zonas.forEach(z => {
            const opt = document.createElement('option');
            opt.value = z;
            opt.textContent = z;
            zonaSel.appendChild(opt);
        });
        zonaSel.addEventListener('change', e => {
            estado.seleccion.zona = e.target.value;
        });
    }
}

function inicializarBuscadores() {
    const mapa = {
        'filtro-mesas': 'mesas',
        'filtro-clasificadores': 'clasificadores',
        'filtro-variedades': 'variedades',
        'filtro-plagas': 'plagas'
    };
    Object.keys(mapa).forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => renderizarTodasLasListas());
        }
    });

    document.querySelectorAll('.lupa').forEach(lupa => {
        lupa.addEventListener('click', () => {
            const target = document.getElementById(lupa.dataset.target);
            if (target) target.classList.toggle('visible');
        });
    });
}

function inicializarBotonesPrincipales() {
    document.getElementById('btn-guardar')?.addEventListener('click', guardarTransaccion);
    document.getElementById('btn-admin')?.addEventListener('click', abrirAdmin);
    document.getElementById('btn-transacciones')?.addEventListener('click', abrirTransacciones);
    document.getElementById('btn-excel')?.addEventListener('click', descargarExcel);

    document.getElementById('transacciones-cerrar')?.addEventListener('click', () => {
        document.getElementById('modal-transacciones')?.classList.remove('visible');
    });
}

// ============================================================
// 🚀 INICIALIZACIÓN GENERAL
// ============================================================
async function inicializar() {
    try {
        await abrirDB();

        const listas = ['proveedores', 'zonas', 'clasificadores', 'mesas', 'variedades'];
        for (const lista of listas) {
            const guardada = await obtenerConfig(`lista_${lista}`);
            if (guardada && Array.isArray(guardada)) {
                estado[lista] = guardada;
            }
        }

        inicializarCabecera();
        inicializarBuscadores();
        inicializarNumpad();
        inicializarPin();
        inicializarAdminBotones();
        inicializarBotonesPrincipales();
        renderizarTodasLasListas();
        actualizarDisplay();

        await actualizarIndicadorSync();
        sincronizarPendientes();

        setInterval(() => sincronizarPendientes(), INTERVALO_SYNC);

        console.log('✅ Aplicación inicializada');
    } catch (error) {
        console.error('❌ Error en inicialización:', error);
        alert('Error al iniciar la aplicación. Revisa la consola.');
    }
}

window.addEventListener('load', inicializar);