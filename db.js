// ============================================
// MÓDULO DE BASE DE DATOS LOCAL (IndexedDB)
// ============================================

const DB_NAME = 'WRC_RegistroCalidad';
const DB_VERSION = 1;
const STORE_TRANSACCIONES = 'transacciones';

let db = null;

function abrirDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_TRANSACCIONES)) {
                const store = database.createObjectStore(STORE_TRANSACCIONES, {
                    keyPath: 'id',
                    autoIncrement: true
                });
                store.createIndex('sincronizada', 'sincronizada', { unique: false });
                store.createIndex('fecha', 'fecha', { unique: false });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('✅ IndexedDB abierta correctamente');
            resolve(db);
        };

        request.onerror = (event) => {
            console.error('❌ Error abriendo IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}

// Guardar una transacción (siempre local primero)
function guardarTransaccionLocal(transaccion) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TRANSACCIONES, 'readwrite');
        const store = tx.objectStore(STORE_TRANSACCIONES);

        const registro = {
            ...transaccion,
            sincronizada: false,
            timestamp: Date.now(),
            intentos: 0
        };

        const request = store.add(registro);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Obtener todas las transacciones pendientes de sincronizar
function obtenerPendientes() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TRANSACCIONES, 'readonly');
        const store = tx.objectStore(STORE_TRANSACCIONES);
        const index = store.index('sincronizada');
        const request = index.getAll(false); // false = no sincronizadas

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Marcar una transacción como sincronizada
function marcarComoSincronizada(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TRANSACCIONES, 'readwrite');
        const store = tx.objectStore(STORE_TRANSACCIONES);
        const request = store.get(id);

        request.onsuccess = () => {
            const registro = request.result;
            if (registro) {
                registro.sincronizada = true;
                registro.fechaSincronizacion = Date.now();
                store.put(registro);
            }
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

// Obtener todas las transacciones (sincronizadas y pendientes)
function obtenerTodasLasTransacciones() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TRANSACCIONES, 'readonly');
        const store = tx.objectStore(STORE_TRANSACCIONES);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Eliminar una transacción local
function eliminarTransaccionLocal(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_TRANSACCIONES, 'readwrite');
        const store = tx.objectStore(STORE_TRANSACCIONES);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}