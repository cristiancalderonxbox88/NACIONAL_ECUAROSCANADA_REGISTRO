/* =========================================================================
   WRC · REGISTRO NACIONAL CALIDAD — Firebase Firestore
   v3.0: Proveedores como lista + botón Guardar grande + sin Mesas/Zonas
   ========================================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  onSnapshot, writeBatch, serverTimestamp, query, where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

/* =========================================================
   CONFIGURACIÓN FIREBASE
   ========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyCDkDvFOHsEJvlbnHLyW2ppwjGLU4V-oAk",
  authDomain: "nacional-ecuaroscanada.firebaseapp.com",
  projectId: "nacional-ecuaroscanada",
  storageBucket: "nacional-ecuaroscanada.firebasestorage.app",
  messagingSenderId: "625903655491",
  appId: "1:625903655491:web:3a14bb6babeeff894112f6"
};

const PIN_ADMIN = "1234";

/* =========================================================
   CATÁLOGOS SEMILLA
   ========================================================= */
const DEFAULT_CATALOGOS = {
  proveedores: [
    "(05) QUIMBIAMBA CACUANGO PEDRO","(01) ECUAROSCANADA S.A.",
    "(02) GRACE MESA","(03) HERNAN CABASCANGO",
    "(04) ESTACIO CACHIPUENDO NATHALY SILVANA"
  ],
  clasificadores: ["JM","Y","M","C","J","D","J-Y-D-JM","JM-D"],
  variedades: [
    "AMNESIA","ARTC","ATMC","BLSH","BRIGHTON","CANDLELIGHT","CARPE DIEM",
    "COFFE BREAK","COLOR","COTTON XPRESSION","COUNTRY BLUES","DARK PINK ROSE",
    "DEEP PURPLE","DOZEN ROSE HOT PINK","DOZEN ROSE LIGHT PINK",
    "DOZEN ROSE NOVELTY-BI","ANNA JULIA","ATHOMIC","BE SWEET","BOULEVARD",
    "CANDY X-PRESSION","COTTON X-PRESSIÓN","COUNTRY BLUE","ECUA PINK",
    "ESPERANCE","EXOTIC BERRY","EXPLORER","FREE SPIRIT","FRUTTETO",
    "FULL MONTY","GOTCHA","HARD ROCK","HEARTS","HERMOSA","HOT EXPLORER",
    "KAHALA","LOLA","LORRAINE","LUCIANO","MAGIC TIMES","MANDALA",
    "MANDARIN X-PRESSION","MONDIAL","MOONSTONE","NINA","O`HARA","OPALA",
    "PALOMA","PINK FLOYD","PINK MONDIAL","PINK XPRESSION","PLAYA BLANCA",
    "POMAROSA","POWDER PUFF","PRINCESS CROWN","QUEENS CROWN","QUICKSAND",
    "RED PANTHER","SHIMMER","SILANTOI","SUPER SUN","WHITE OHARA"
  ],
  plagas: [
    "MALTRATO FOLLAJE","BOTON MALTRATADO","MALTRATO POSTCO","B. ABIERTO",
    "B. DEFORME","CLOROTICO","ROTOS","TORCIDO","C. DE GANZO","TRIPS",
    "ACAROS","OIDIO","BOTRITIS","AFIDOS","VELLOSO","MAL DESYEME",
    "FITO TOXICIDAD","DEFIC. DE CALCIO","TALLOS CORTOS","P QUEMADOS",
    "2 CABEZAS O MENOS","TALLOS DELGADOS","PÁLIDOS","B. DESCABEZADO CULTIVO",
    "INTOXICACIÓN","SIN FOLLAJE","GUSANO","MB","DIPTEROS","LEOPIDOPTEROS",
    "COLEOPTEROS","SEMILLA DE MALEZA","OTROS"
  ]
};

const CATS = ["proveedores","clasificadores","variedades","plagas"];
const ETIQUETAS_CAT = {
  proveedores:"Proveedores", clasificadores:"Clasificadores",
  variedades:"Variedades", plagas:"Plagas"
};

const PLAGAS_ORDEN = [
  "MALTRATO FOLLAJE","BOTON MALTRATADO","MALTRATO POSTCO","B. ABIERTO",
  "B. DEFORME","CLOROTICO","ROTOS","TORCIDO","C. DE GANZO","TRIPS",
  "ACAROS","OIDIO","BOTRITIS","AFIDOS","VELLOSO","MAL DESYEME",
  "FITO TOXICIDAD","DEFIC. DE CALCIO","TALLOS CORTOS","P QUEMADOS",
  "2 CABEZAS O MENOS","TALLOS DELGADOS","PÁLIDOS","B. DESCABEZADO CULTIVO",
  "INTOXICACIÓN","SIN FOLLAJE","GUSANO","MB","DIPTEROS","LEOPIDOPTEROS",
  "COLEOPTEROS","SEMILLA DE MALEZA","OTROS"
];

/* ---------- EXCEL: FECHA | AÑO | MES | SEMANA | DIA | PROVEEDOR | VARIEDAD | [33 plagas] | TOTAL | CLASIFICADOR ---------- */
const COLUMNAS_EXCEL = [
  "FECHA","AÑO","MES","SEMANA","DIA","PROVEEDOR","VARIEDAD",
  ...PLAGAS_ORDEN,
  "TOTAL","CLASIFICADOR"
];

/* =========================================================
   FIREBASE INIT
   ========================================================= */
const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const auth = getAuth(app);

/* =========================================================
   ESTADO
   ========================================================= */
const state = {
  fecha: new Date().toISOString().slice(0,10),
  proveedor: "",
  clasificador: "", variedad: "", plaga: "",
  cantidad: "",
  pin: "",
  editandoId: null
};

const catalogos = {
  proveedores: [], clasificadores: [],
  variedades: [], plagas: []
};

let transaccionesCache = [];
let unsubscribeTrans = null;

/* =========================================================
   UTILS
   ========================================================= */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

/* =========================================================
   NOTIFICACIONES
   ========================================================= */
function mostrarToast(titulo, mensaje = "", tipo = "ok", ms = 3200) {
  let cont = document.getElementById("toast-container");
  if (!cont) {
    cont = document.createElement("div");
    cont.id = "toast-container";
    cont.className = "toast-container";
    document.body.appendChild(cont);
    inyectarEstilosToast();
  }

  const iconos = { ok:"✅", error:"⚠️", info:"ℹ️", warn:"⏳" };
  const el = document.createElement("div");
  el.className = "toast-item " + tipo;
  el.innerHTML = `
    <div class="toast-icono">${iconos[tipo] || "ℹ️"}</div>
    <div class="toast-texto">
      <div class="toast-titulo">${esc(titulo)}</div>
      ${mensaje ? `<div class="toast-msg">${esc(mensaje)}</div>` : ""}
    </div>`;

  cont.appendChild(el);

  setTimeout(() => {
    el.classList.add("saliendo");
    setTimeout(() => el.remove(), 260);
  }, ms);
}

function inyectarEstilosToast() {
  if (document.getElementById("estilos-toast")) return;
  const s = document.createElement("style");
  s.id = "estilos-toast";
  s.textContent = `
    .toast-container {
      position: fixed; top: 80px; right: 20px; z-index: 9999;
      display: flex; flex-direction: column; gap: 10px;
      pointer-events: none; max-width: 340px;
    }
    .toast-item {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 14px 18px; background: #fff;
      border-left: 5px solid #1976d2; border-radius: 8px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.18);
      font-family: 'Segoe UI', sans-serif; color: #333;
      animation: toastSlideIn 0.3s ease-out;
      pointer-events: auto; min-width: 280px;
    }
    .toast-icono { font-size: 22px; line-height: 1; flex-shrink: 0; }
    .toast-texto { flex: 1; line-height: 1.35; }
    .toast-titulo { font-weight: 700; margin-bottom: 2px; font-size: 14px; }
    .toast-msg { font-size: 12.5px; color: #666; }
    .toast-item.ok    { border-left-color: #27ae60; }
    .toast-item.ok    .toast-titulo { color: #27ae60; }
    .toast-item.error { border-left-color: #e74c3c; }
    .toast-item.error .toast-titulo { color: #e74c3c; }
    .toast-item.info  { border-left-color: #1976d2; }
    .toast-item.info  .toast-titulo { color: #1976d2; }
    .toast-item.warn  { border-left-color: #f39c12; }
    .toast-item.warn  .toast-titulo { color: #e67e22; }
    .toast-item.saliendo { animation: toastSlideOut 0.25s ease-in forwards; }
    @keyframes toastSlideIn {
      from { transform: translateX(120%); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }
    @keyframes toastSlideOut {
      from { transform: translateX(0);     opacity: 1; }
      to   { transform: translateX(120%);  opacity: 0; }
    }
  `;
  document.head.appendChild(s);
}

/* =========================================================
   ARRANQUE
   ========================================================= */
(async function init() {
  try { await signInAnonymously(auth); console.log("[WRC] Auth OK"); }
  catch(e){ console.warn("[WRC] Auth:", e.code || e.message); }

  try { await sembrarSiHaceFalta(); }
  catch(e){ console.error("[WRC] Seed:", e); }

  CATS.forEach(escucharCatalogo);
  escucharTransacciones(state.fecha);

  const f = $("fecha");
  if (f) {
    f.value = state.fecha;
    f.addEventListener("change", (e) => {
      state.fecha = e.target.value || new Date().toISOString().slice(0,10);
      state.editandoId = null;
      escucharTransacciones(state.fecha);
    });
  }

  actualizarIndicadorSync();
  window.addEventListener("online", () => {
    actualizarIndicadorSync();
    mostrarToast("Conexión restaurada", "Sincronizando datos pendientes…", "ok");
  });
  window.addEventListener("offline", () => {
    actualizarIndicadorSync();
    mostrarToast("Sin conexión", "Los registros se guardarán localmente.", "warn", 4500);
  });

  inyectarBotonRango();
  renderTodo();
})();

/* =========================================================
   SEMILLA (solo si meta/config no existe)
   ========================================================= */
async function sembrarSiHaceFalta() {
  const metaRef = doc(db, "meta", "config");
  let snap;
  try { snap = await getDoc(metaRef); } catch(e){ return; }
  if (snap.exists() && snap.data().seeded) return;

  const batch = writeBatch(db);
  for (const [col, items] of Object.entries(DEFAULT_CATALOGOS)) {
    items.forEach((nombre, i) => {
      batch.set(doc(collection(db, col)), { nombre, orden: i, activo: true });
    });
  }
  batch.set(metaRef, { seeded: true, seededAt: serverTimestamp() });
  await batch.commit();
  console.log("[WRC] Catálogos iniciales creados.");
}

/* =========================================================
   LISTENERS
   ========================================================= */
function escucharCatalogo(nombre) {
  onSnapshot(collection(db, nombre),
    (snap) => {
      catalogos[nombre] = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) =>
          (a.orden ?? 9999) - (b.orden ?? 9999) ||
          String(a.nombre).localeCompare(String(b.nombre), "es"));
      renderTodo();
      const modalAdmin = document.getElementById("modalAdmin");
      const vistaAdmin = document.getElementById("vistaAdmin");
      if (modalAdmin && modalAdmin.style.display === "flex"
          && vistaAdmin && vistaAdmin.style.display !== "none") {
        window.actualizarVistaAdmin();
      }
    },
    (err) => console.error(`[WRC] onSnapshot ${nombre}:`, err.code, err.message));
}

function escucharTransacciones(fecha) {
  if (unsubscribeTrans) { unsubscribeTrans(); unsubscribeTrans = null; }
  const q = query(collection(db, "transacciones"), where("fecha", "==", fecha));
  unsubscribeTrans = onSnapshot(q,
    (snap) => {
      transaccionesCache = snap.docs
        .map(d => ({ ...d.data(), id: d.id, pendiente: d.metadata.hasPendingWrites }))
        .sort((a,b) => {
          const ta = a.creado?.seconds ?? 0;
          const tb = b.creado?.seconds ?? 0;
          return tb - ta;
        });
      renderTransacciones();
      actualizarIndicadorSync();
    },
    (err) => console.error("[WRC] onSnapshot trans:", err.code, err.message));
}

/* =========================================================
   RENDER
   ========================================================= */
function renderTodo() {
  renderListas();
  renderPantalla();
}

function renderListas() {
  renderListaUL("lista-proveedores",    catalogos.proveedores,    state.proveedor,    v => { state.proveedor    = (state.proveedor===v)?"":v;    renderListas(); });
  renderListaUL("lista-clasificadores", catalogos.clasificadores, state.clasificador, v => { state.clasificador = (state.clasificador===v)?"":v; renderListas(); });
  renderListaUL("lista-variedades",     catalogos.variedades,     state.variedad,     v => { state.variedad     = (state.variedad===v)?"":v;     renderListas(); });
  renderListaUL("lista-plagas",         catalogos.plagas,         state.plaga,        v => { state.plaga        = (state.plaga===v)?"":v;        renderListas(); });
}

function renderListaUL(ulId, items, seleccionado, onSelect) {
  const ul = $(ulId); if (!ul) return;
  ul.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.style.cssText = "color:#999;font-style:italic;justify-content:center;";
    li.textContent = "Cargando…";
    ul.appendChild(li);
    return;
  }
  items.forEach(it => {
    const nombre = it.nombre ?? it;
    const li = document.createElement("li");
    if (seleccionado === nombre) li.classList.add("active");
    li.textContent = nombre;
    li.addEventListener("click", () => onSelect(nombre));
    ul.appendChild(li);
  });
}

function renderPantalla() {
  const p = $("pantalla"); if (p) p.textContent = state.cantidad === "" ? "0" : state.cantidad;
}

function renderTransacciones() {
  const tbody = $("tablaTransaccionesBody");
  const cont  = $("contadorTransacciones");
  if (!tbody) return;

  if (cont) cont.textContent = `${transaccionesCache.length} registro${transaccionesCache.length===1?"":"s"}`;
  tbody.innerHTML = "";

  if (!transaccionesCache.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="sin-registros">Sin transacciones para esta fecha</td></tr>`;
    return;
  }

  transaccionesCache.forEach((t, i) => {
    const tr = document.createElement("tr");
    if (state.editandoId === t.id) tr.classList.add("editando");

    if (state.editandoId === t.id) {
      tr.innerHTML = `
        <td>${i+1}</td>
        <td>${esc(t.fecha)}</td>
        <td>${esc(t.proveedor||"—")}</td>
        <td>${esc(t.clasificador)}</td>
        <td><input data-campo="variedad" value="${esc(t.variedad)}" style="width:120px;padding:4px;border:1px solid #1976d2;border-radius:3px;"></td>
        <td><input data-campo="plaga"    value="${esc(t.plaga)}"    style="width:120px;padding:4px;border:1px solid #1976d2;border-radius:3px;"></td>
        <td><input type="number" min="1" data-campo="tallos" value="${esc(t.tallos)}" style="width:60px;padding:4px;border:1px solid #1976d2;border-radius:3px;"></td>
        <td>
          <button class="btn-accion btn-editar"   data-accion="save">✓</button>
          <button class="btn-accion btn-eliminar" data-accion="cancel">✕</button>
        </td>`;
    } else {
      tr.innerHTML = `
        <td>${i+1}</td>
        <td>${esc(t.fecha)}</td>
        <td>${esc(t.proveedor||"—")}</td>
        <td>${esc(t.clasificador)}</td>
        <td>${esc(t.variedad)}</td>
        <td>${esc(t.plaga)}</td>
        <td>${esc(t.tallos)}</td>
        <td>
          <button class="btn-accion btn-editar"   data-accion="edit" data-id="${t.id}">✏️</button>
          <button class="btn-accion btn-eliminar" data-accion="del"  data-id="${t.id}">🗑️</button>
        </td>`;
    }
    tbody.appendChild(tr);
  });
}

/* =========================================================
   GUARDAR
   ========================================================= */
window.guardarRegistro = async function() {
  if (!state.proveedor)    return mostrarToast("Falta Proveedor", "Selecciona un proveedor.", "error");
  if (!state.clasificador) return mostrarToast("Falta Clasificador", "Selecciona un clasificador.", "error");
  if (!state.variedad)     return mostrarToast("Falta Variedad", "Selecciona una variedad.", "error");
  if (!state.plaga)        return mostrarToast("Falta Plaga", "Selecciona una plaga.", "error");

  const cant = parseInt(state.cantidad, 10);
  if (!Number.isFinite(cant) || cant <= 0)
    return mostrarToast("Cantidad inválida", "Ingresa una cantidad mayor a cero.", "error");

  try {
    await addDoc(collection(db, "transacciones"), {
      fecha:        state.fecha,
      proveedor:    state.proveedor,
      clasificador: state.clasificador,
      variedad:     state.variedad,
      plaga:        state.plaga,
      tallos:       cant,
      usuario:      localStorage.getItem("wrc_usuario") || "TABLET",
      creado:       serverTimestamp(),
      actualizado:  serverTimestamp()
    });

    state.variedad = ""; state.plaga = ""; state.cantidad = "";
    renderListas(); renderPantalla();

    if (navigator.onLine) {
      mostrarToast("Transacción guardada", `${state.proveedor} · ${state.clasificador}`, "ok");
    } else {
      mostrarToast("Guardado localmente", "Sin conexión. Se subirá al reconectar.", "warn", 4200);
    }
  } catch(e) {
    console.error(e);
    mostrarToast("Error al guardar", e.message, "error");
  }
};

window.toggleBuscador = function(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle("activo");
};

window.filtrarLista = function(listaId, texto) {
  const ul = document.getElementById(listaId); if (!ul) return;
  const t = (texto || "").trim().toUpperCase();
  ul.querySelectorAll("li").forEach(li => {
    li.style.display = (!t || li.textContent.toUpperCase().includes(t)) ? "" : "none";
  });
};

window.presionarTecla = function(d) {
  if (state.cantidad.length < 6) {
    state.cantidad = (state.cantidad === "0" ? "" : state.cantidad) + d;
    renderPantalla();
  }
};

window.borrarTodo = function() {
  state.cantidad = "";
  renderPantalla();
};

/* =========================================================
   MODALES
   ========================================================= */
window.abrirAdmin = function() {
  state.pin = "";
  actualizarPinDots();
  document.getElementById("pinError").textContent = "";
  document.getElementById("vistaPin").style.display = "";
  document.getElementById("vistaAdmin").style.display = "none";
  document.getElementById("modalAdmin").style.display = "flex";
};

window.cerrarAdmin = function() {
  document.getElementById("modalAdmin").style.display = "none";
};

window.abrirTransacciones = function() {
  state.editandoId = null;
  renderTransacciones();
  document.getElementById("modalTransacciones").style.display = "flex";
};

window.cerrarTransacciones = function() {
  document.getElementById("modalTransacciones").style.display = "none";
};

/* =========================================================
   PIN
   ========================================================= */
function actualizarPinDots() {
  const dots = document.querySelectorAll("#pinDisplay .pin-dot");
  dots.forEach((d, i) => d.classList.toggle("lleno", i < state.pin.length));
}

window.presionarPin = function(d) {
  if (state.pin.length >= 4) return;
  state.pin += d;
  actualizarPinDots();

  if (state.pin.length === 4) {
    setTimeout(() => {
      if (state.pin === PIN_ADMIN) {
        document.getElementById("vistaPin").style.display = "none";
        document.getElementById("vistaAdmin").style.display = "";
        window.actualizarVistaAdmin();
      } else {
        const disp = document.getElementById("pinDisplay");
        disp.classList.add("error");
        document.getElementById("pinError").textContent = "PIN incorrecto";
        setTimeout(() => {
          disp.classList.remove("error");
          state.pin = "";
          actualizarPinDots();
        }, 500);
      }
    }, 200);
  }
};

window.borrarPin = function() {
  state.pin = state.pin.slice(0, -1);
  actualizarPinDots();
};

/* =========================================================
   ADMIN
   ========================================================= */
window.actualizarVistaAdmin = function() {
  const cat = document.getElementById("adminCategoria").value;
  const ul = document.getElementById("adminListaActual");
  ul.innerHTML = "";

  const items = catalogos[cat] || [];
  if (!items.length) {
    ul.innerHTML = `<li style="color:#999;font-style:italic;padding:10px 0;">Sin elementos</li>`;
    return;
  }
  items.forEach(it => {
    const li = document.createElement("li");
    li.className = "admin-item";
    li.innerHTML = `
      <span class="item-texto">${esc(it.nombre)}</span>
      <button class="btn-eliminar-item" data-id="${it.id}" data-cat="${cat}">🗑️</button>`;
    ul.appendChild(li);
  });

  ul.querySelectorAll(".btn-eliminar-item").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id, cat2 = btn.dataset.cat;
      const nombre = btn.previousElementSibling.textContent;
      if (!confirm(`¿Eliminar "${nombre}" de ${ETIQUETAS_CAT[cat2]}?`)) return;
      try {
        await deleteDoc(doc(db, cat2, id));
        mostrarToast("Elemento eliminado", nombre, "ok", 2000);
      } catch(e) { mostrarToast("Error", e.message, "error"); }
    });
  });
};

window.agregarItemAdmin = async function() {
  const cat = document.getElementById("adminCategoria").value;
  const input = document.getElementById("adminInput");
  const nombre = input.value.trim().toUpperCase();
  if (!nombre) return mostrarToast("Falta nombre", "Escribe un nombre para agregar.", "error");

  const yaExiste = (catalogos[cat] || []).some(i => String(i.nombre).toUpperCase() === nombre);
  if (yaExiste) return mostrarToast("Duplicado", "Ese elemento ya existe.", "error");

  try {
    await addDoc(collection(db, cat), {
      nombre, orden: (catalogos[cat] || []).length, activo: true
    });
    input.value = "";
    mostrarToast("Agregado", `${nombre} se añadió a ${ETIQUETAS_CAT[cat]}.`, "ok", 2200);
  } catch(e) { mostrarToast("Error", e.message, "error"); }
};

/* =========================================================
   EDITAR/ELIMINAR TRANSACCIONES
   ========================================================= */
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-accion]");
  if (!btn) return;
  const accion = btn.dataset.accion;
  const id = btn.dataset.id;

  if (accion === "edit")   { state.editandoId = id; renderTransacciones(); return; }
  if (accion === "cancel") { state.editandoId = null; renderTransacciones(); return; }

  if (accion === "del") {
    if (!confirm("¿Eliminar esta transacción? No se puede deshacer.")) return;
    try {
      await deleteDoc(doc(db, "transacciones", id));
      mostrarToast("Transacción eliminada", "", "ok", 2000);
    }
    catch(e) { mostrarToast("Error", e.message, "error"); }
    return;
  }

  if (accion === "save") {
    const tr = btn.closest("tr");
    const variedad = tr.querySelector('[data-campo="variedad"]').value.trim();
    const plaga    = tr.querySelector('[data-campo="plaga"]').value.trim();
    const tallos   = parseInt(tr.querySelector('[data-campo="tallos"]').value, 10);
    if (!variedad || !plaga) return mostrarToast("Datos incompletos", "Variedad y plaga obligatorias.", "error");
    if (!Number.isFinite(tallos) || tallos <= 0) return mostrarToast("Cantidad inválida", "", "error");
    try {
      await updateDoc(doc(db, "transacciones", id), {
        variedad, plaga, tallos, actualizado: serverTimestamp()
      });
      state.editandoId = null;
      mostrarToast("Actualizado", "Cambios guardados correctamente.", "ok", 2000);
    } catch(e) { mostrarToast("Error", e.message, "error"); }
  }
});

/* =========================================================
   EXCEL (42 columnas)
   ========================================================= */
function partesFecha(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  const tmp = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const semana = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  const dias = ["DOMINGO","LUNES","MARTES","MIERCOLES","JUEVES","VIERNES","SABADO"];
  const meses = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO",
                 "JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
  return { anio: y, mes: meses[m - 1], semana, dia: dias[fecha.getUTCDay()] };
}

function construirExcel(datos, etiquetaArchivo) {
  if (typeof XLSX === "undefined") return mostrarToast("Falta SheetJS", "No se cargó la librería.", "error");
  if (!datos || !datos.length) return mostrarToast("Sin datos", "No hay transacciones para exportar.", "error");

  const grupos = new Map();

  datos.forEach(t => {
    const key = [t.fecha, t.proveedor || "", t.variedad || "", t.clasificador || ""].join("¦");
    if (!grupos.has(key)) {
      const f = partesFecha(t.fecha);
      const fila = {
        FECHA: t.fecha || "",
        "AÑO": f.anio, MES: f.mes, SEMANA: f.semana, DIA: f.dia,
        PROVEEDOR: t.proveedor || "",
        VARIEDAD: t.variedad || "",
        CLASIFICADOR: t.clasificador || ""
      };
      PLAGAS_ORDEN.forEach(p => { fila[p] = 0; });
      grupos.set(key, fila);
    }
    const fila = grupos.get(key);
    const cant = Number(t.tallos) || 0;
    const plagaKey = PLAGAS_ORDEN.includes(t.plaga) ? t.plaga : "OTROS";
    fila[plagaKey] = (fila[plagaKey] || 0) + cant;
  });

  const filas = [];
  [...grupos.values()]
    .sort((a, b) =>
      String(a.FECHA).localeCompare(String(b.FECHA)) ||
      String(a.PROVEEDOR).localeCompare(String(b.PROVEEDOR), "es") ||
      String(a.VARIEDAD).localeCompare(String(b.VARIEDAD), "es") ||
      String(a.CLASIFICADOR).localeCompare(String(b.CLASIFICADOR), "es"))
    .forEach(f => {
      let total = 0;
      PLAGAS_ORDEN.forEach(p => { total += Number(f[p]) || 0; });
      f.TOTAL = total;
      filas.push(COLUMNAS_EXCEL.map(c => f[c] ?? ""));
    });

  const filaTotal = COLUMNAS_EXCEL.map((c, i) => {
    if (i === 0) return "TOTALES";
    if (i <= 6) return "";
    if (c === "CLASIFICADOR") return "";
    let s = 0;
    filas.forEach(r => { s += Number(r[i]) || 0; });
    return s;
  });

  const ws = XLSX.utils.aoa_to_sheet([COLUMNAS_EXCEL, ...filas, filaTotal]);
  ws["!cols"] = COLUMNAS_EXCEL.map((c) => {
    if (c === "FECHA") return { wch: 12 };
    if (c === "AÑO") return { wch: 7 };
    if (c === "MES") return { wch: 11 };
    if (c === "SEMANA") return { wch: 9 };
    if (c === "DIA") return { wch: 11 };
    if (c === "PROVEEDOR") return { wch: 34 };
    if (c === "VARIEDAD") return { wch: 24 };
    if (c === "CLASIFICADOR") return { wch: 14 };
    if (c === "TOTAL") return { wch: 9 };
    return { wch: 12 };
  });
  ws["!freeze"] = { xSplit: 7, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CALIDAD");
  XLSX.writeFile(wb, `Registro_Calidad_${etiquetaArchivo}.xlsx`);
  mostrarToast("Excel descargado", `${COLUMNAS_EXCEL.length} columnas · ${filas.length} filas`, "ok", 2500);
}

/* =========================================================
   BOTÓN 🗓️ RANGO DE FECHAS
   ========================================================= */
function inyectarEstilosRango() {
  if (document.getElementById("estilos-rango")) return;
  const s = document.createElement("style");
  s.id = "estilos-rango";
  s.textContent = `
    .rango-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999; padding: 20px;
    }
    .rango-modal {
      background: #fff; border-radius: 10px; padding: 24px;
      width: 380px; max-width: 100%; font-family: 'Segoe UI', sans-serif;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    }
    .rango-modal h3 { margin: 0 0 18px; font-size: 17px; color: #333; }
    .rango-campo { margin-bottom: 14px; }
    .rango-campo label {
      display: block; font-size: 11px; font-weight: 700;
      color: #666; margin-bottom: 4px; letter-spacing: 0.04em;
    }
    .rango-campo input {
      width: 100%; padding: 11px; border: 1px solid #ccc;
      border-radius: 6px; font-size: 15px; font-family: inherit;
      box-sizing: border-box;
    }
    .rango-campo input:focus { outline: none; border-color: #1976d2; }
    .rango-botones {
      display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;
    }
    .rango-btn {
      padding: 10px 20px; border-radius: 6px; border: none;
      font-size: 14px; font-weight: 700; cursor: pointer;
      font-family: inherit;
    }
    .rango-btn-cancelar { background: #e0e0e0; color: #333; }
    .rango-btn-cancelar:hover { background: #d0d0d0; }
    .rango-btn-exportar { background: #1976d2; color: #fff; }
    .rango-btn-exportar:hover { background: #115293; }
  `;
  document.head.appendChild(s);
}

function inyectarBotonRango() {
  const headerLeft = document.querySelector(".header-left");
  if (!headerLeft || document.getElementById("btn-rango")) return;

  const btn = document.createElement("button");
  btn.id = "btn-rango";
  btn.className = "icon-btn";
  btn.title = "Exportar por rango de fechas";
  btn.textContent = "🗓️";
  btn.onclick = abrirModalRango;

  headerLeft.appendChild(btn);
}

function abrirModalRango() {
  inyectarEstilosRango();
  if (document.getElementById("rango-overlay")) return;

  const hoy = new Date().toISOString().slice(0, 10);
  const hace7 = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);

  const overlay = document.createElement("div");
  overlay.id = "rango-overlay";
  overlay.className = "rango-overlay";
  overlay.innerHTML = `
    <div class="rango-modal">
      <h3>📅 Exportar rango de fechas</h3>
      <div class="rango-campo">
        <label>DESDE</label>
        <input type="date" id="rango-desde" value="${hace7}">
      </div>
      <div class="rango-campo">
        <label>HASTA</label>
        <input type="date" id="rango-hasta" value="${hoy}">
      </div>
      <div class="rango-botones">
        <button class="rango-btn rango-btn-cancelar" id="rango-cancelar">Cancelar</button>
        <button class="rango-btn rango-btn-exportar" id="rango-exportar">Exportar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.getElementById("rango-cancelar").onclick = () => overlay.remove();
  document.getElementById("rango-exportar").onclick = async () => {
    const desde = document.getElementById("rango-desde").value;
    const hasta = document.getElementById("rango-hasta").value;

    if (!desde || !hasta)
      return mostrarToast("Faltan fechas", "Selecciona DESDE y HASTA.", "error");
    if (desde > hasta)
      return mostrarToast("Rango inválido", "DESDE no puede ser mayor que HASTA.", "error");

    overlay.remove();
    await exportarRango(desde, hasta);
  };
}

async function exportarRango(desde, hasta) {
  try {
    mostrarToast("Consultando…", `Trayendo datos de ${desde} a ${hasta}`, "info", 2000);

    const q = query(
      collection(db, "transacciones"),
      where("fecha", ">=", desde),
      where("fecha", "<=", hasta)
    );
    const snap = await getDocs(q);
    const datos = snap.docs.map(d => ({ ...d.data(), id: d.id }));

    if (!datos.length) {
      return mostrarToast("Sin datos", "No hay transacciones en ese rango.", "warn", 3000);
    }

    datos.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    construirExcel(datos, `${desde}_a_${hasta}`);
  } catch (e) {
    console.error(e);
    mostrarToast("Error", e.message, "error");
  }
}

/* =========================================================
   INDICADOR DE RED
   ========================================================= */
function actualizarIndicadorSync() {
  const el = document.getElementById("sync-indicador");
  if (!el) return;

  const pendientes = transaccionesCache.filter(t => t.pendiente).length;

  if (!navigator.onLine) {
    el.className = "sync-indicador offline";
    el.textContent = pendientes > 0
      ? `🔴 Sin conexión · ${pendientes} pendiente${pendientes===1?"":"s"}`
      : "🔴 Sin conexión";
  } else if (pendientes > 0) {
    el.className = "sync-indicador sincronizando";
    el.textContent = `🟡 Sincronizando ${pendientes}…`;
  } else {
    el.className = "sync-indicador online";
    el.textContent = "🟢 En línea";
  }
}

setInterval(actualizarIndicadorSync, 3000);

console.log("%cWRC Registro · Firebase v3.0","color:#e74c3c;font-weight:bold;font-size:12px");