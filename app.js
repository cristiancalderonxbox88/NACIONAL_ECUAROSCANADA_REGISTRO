/* =========================================================================
   WRC · REGISTRO NACIONAL CALIDAD — v3.0 (Firebase + diseño original)
   ========================================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, writeBatch, serverTimestamp, query, where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

/* ---------- CONFIGURACIÓN ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyCDkDvFOHsEJvlbnHLyW2ppwjGLU4V-oAk",
  authDomain: "nacional-ecuaroscanada.firebaseapp.com",
  projectId: "nacional-ecuaroscanada",
  storageBucket: "nacional-ecuaroscanada.firebasestorage.app",
  messagingSenderId: "625903655491",
  appId: "1:625903655491:web:3a14bb6babeeff894112f6"
};

const PIN_ADMIN = "1234";

/* ---------- COLUMNAS BASE DEL EXCEL (9) + 33 PLAGAS = 42 ---------- */
const BASE_COLS = [
  "FECHA","PROVEEDOR","ZONA","MESA","CLASIFICADOR","VARIEDAD",
  "TOTAL DEFECTOS","N° REGISTROS","OBSERVACIONES"
];

/* ---------- CATÁLOGOS SEMILLA ---------- */
const DEFAULT_CATALOGOS = {
  proveedores: [
    "(05) QUIMBIAMBA CACUANGO PEDRO","(01) ECUAROSCANADA S.A.",
    "(02) GRACE MESA","(03) HERNAN CABASCANGO",
    "(04) ESTACIO CACHIPUENDO NATHALY SILVANA"
  ],
  zonas: ["1","2"],
  clasificadores: ["JM","Y","M","C","J","D","J-Y-D-JM","JM-D"],
  mesas: ["M1 CE","M2 AM","M3 VE","M4 RO","M5 MO","M6 NA","PETALOS"],
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

const CATS = ["proveedores","zonas","clasificadores","mesas","variedades","plagas"];
const ETIQUETAS_CAT = {
  proveedores:"Proveedores", zonas:"Zonas", clasificadores:"Clasificadores",
  mesas:"Mesas", variedades:"Variedades", plagas:"Plagas"
};

/* ---------- FIREBASE ---------- */
const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const auth = getAuth(app);

/* ---------- ESTADO ---------- */
const state = {
  fecha: new Date().toISOString().slice(0,10),
  proveedor: "", zona: "",
  mesa: "", clasificador: "", variedad: "", plaga: "",
  cantidad: "",
  pin: "",
  editandoId: null
};

const catalogos = {
  proveedores: [], zonas: [], clasificadores: [],
  mesas: [], variedades: [], plagas: []
};

let transaccionesCache = [];
let unsubscribeTrans = null;

/* ---------- UTILS ---------- */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function toast(msg, tipo = "info", ms = 2600) {
  let cont = document.getElementById("toasts");
  if (!cont) {
    cont = document.createElement("div");
    cont.id = "toasts";
    cont.className = "toasts";
    document.body.appendChild(cont);
  }
  const el = document.createElement("div");
  el.className = "toast " + tipo;
  el.textContent = msg;
  cont.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .25s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 260);
  }, ms);
}

/* ---------- ARRANQUE ---------- */
(async function init() {
  try { await signInAnonymously(auth); console.log("[WRC] Auth anónima OK"); }
  catch(e){ console.warn("[WRC] Auth:", e.code || e.message); }

  try { await sembrarSiHaceFalta(); }
  catch(e){ console.error("[WRC] Seed:", e); }

  CATS.forEach(escucharCatalogo);
  escucharTransacciones(state.fecha);

  $("fecha").value = state.fecha;
  $("fecha").addEventListener("change", (e) => {
    state.fecha = e.target.value || new Date().toISOString().slice(0,10);
    state.editandoId = null;
    escucharTransacciones(state.fecha);
  });

  $("proveedor").addEventListener("change", (e) => { state.proveedor = e.target.value; });
  $("zona").addEventListener("change",      (e) => { state.zona      = e.target.value; });

  actualizarIndicadorSync();
  window.addEventListener("online",  actualizarIndicadorSync);
  window.addEventListener("offline", actualizarIndicadorSync);

  renderTodo();
})();

/* ---------- SEMILLA ---------- */
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

/* ---------- LISTENERS ---------- */
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
      if (modalAdmin && modalAdmin.style.display === "flex"
          && document.getElementById("vistaAdmin").style.display !== "none") {
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
    },
    (err) => console.error("[WRC] onSnapshot transacciones:", err.code, err.message));
}

/* ---------- RENDER ---------- */
function renderTodo() {
  renderSelects();
  renderListas();
  renderPantalla();
}

function renderSelects() {
  llenarSelect("proveedor", catalogos.proveedores, "Seleccione Proveedor", state.proveedor);
  llenarSelect("zona",      catalogos.zonas,       "Zona",                state.zona);
}

function llenarSelect(id, items, placeholder, valorActual) {
  const sel = $(id); if (!sel) return;
  const previo = valorActual || sel.value;
  sel.innerHTML = "";
  const o0 = document.createElement("option"); o0.value = ""; o0.textContent = placeholder;
  sel.appendChild(o0);
  items.forEach(it => {
    const o = document.createElement("option");
    o.value = it.nombre; o.textContent = it.nombre;
    sel.appendChild(o);
  });
  sel.value = previo;
  if (sel.value !== previo) sel.value = "";
}

function renderListas() {
  renderListaUL("lista-mesas",          catalogos.mesas,          state.mesa,          v => { state.mesa = (state.mesa===v)?"":v; renderListas(); });
  renderListaUL("lista-clasificadores", catalogos.clasificadores, state.clasificador,  v => { state.clasificador = (state.clasificador===v)?"":v; renderListas(); });
  renderListaUL("lista-variedades",     catalogos.variedades,     state.variedad,      v => { state.variedad = (state.variedad===v)?"":v; renderListas(); });
  renderListaUL("lista-plagas",         catalogos.plagas,         state.plaga,         v => { state.plaga = (state.plaga===v)?"":v; renderListas(); });
}

function renderListaUL(ulId, items, seleccionado, onSelect) {
  const ul = $(ulId); if (!ul) return;
  const inputBuscador = ul.parentElement.querySelector(".buscador input");
  const filtro = (inputBuscador?.value || "").trim().toUpperCase();

  ul.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.style.cssText = "color:#999;font-style:italic;justify-content:center;";
    li.textContent = "Cargando…";
    ul.appendChild(li);
    return;
  }

  let pintados = 0;
  items.forEach(it => {
    const nombre = it.nombre ?? it;
    if (filtro && !String(nombre).toUpperCase().includes(filtro)) return;
    pintados++;
    const li = document.createElement("li");
    if (seleccionado === nombre) li.classList.add("active");
    li.textContent = nombre;
    li.addEventListener("click", () => onSelect(nombre));
    ul.appendChild(li);
  });

  if (!pintados) {
    const li = document.createElement("li");
    li.style.cssText = "color:#999;font-style:italic;justify-content:center;";
    li.textContent = "Sin resultados";
    ul.appendChild(li);
  }
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
    tbody.innerHTML = `<tr><td colspan="9" class="sin-registros">Sin transacciones para esta fecha</td></tr>`;
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
        <td>${esc(t.mesa)}</td>
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
        <td>${esc(t.mesa)}</td>
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

/* ---------- FUNCIONES GLOBALES (las que llama el HTML) ---------- */
window.guardarRegistro = async function() {
  if (!state.mesa)         return toast("Selecciona una MESA", "error");
  if (!state.clasificador) return toast("Selecciona un CLASIFICADOR", "error");
  if (!state.variedad)     return toast("Selecciona una VARIEDAD", "error");
  if (!state.plaga)        return toast("Selecciona una PLAGA", "error");
  const cant = parseInt(state.cantidad, 10);
  if (!Number.isFinite(cant) || cant <= 0) return toast("Ingresa una CANTIDAD", "error");

  try {
    await addDoc(collection(db, "transacciones"), {
      fecha:        state.fecha,
      proveedor:    state.proveedor || "",
      zona:         state.zona || "",
      mesa:         state.mesa,
      clasificador: state.clasificador,
      variedad:     state.variedad,
      plaga:        state.plaga,
      tallos:       cant,
      usuario:      localStorage.getItem("wrc_usuario") || "TABLET",
      creado:       serverTimestamp(),
      actualizado:  serverTimestamp()
    });
    // Captura rápida: mesa y clasificador se mantienen
    state.variedad = ""; state.plaga = ""; state.cantidad = "";
    renderListas(); renderPantalla();
    toast("✔ Registro guardado", "ok", 1400);
  } catch(e) {
    console.error(e);
    toast("Error al guardar: " + e.message, "error", 4000);
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

/* ---------- MODALES ---------- */
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

/* ---------- PIN ---------- */
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

/* ---------- ADMIN ---------- */
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
        toast("Elemento eliminado", "ok", 1400);
      } catch(e) { toast("Error: " + e.message, "error"); }
    });
  });
};

window.agregarItemAdmin = async function() {
  const cat = document.getElementById("adminCategoria").value;
  const input = document.getElementById("adminInput");
  const nombre = input.value.trim().toUpperCase();
  if (!nombre) return toast("Escribe un nombre", "error");

  const yaExiste = (catalogos[cat] || []).some(i => String(i.nombre).toUpperCase() === nombre);
  if (yaExiste) return toast("Ya existe ese elemento", "error");

  try {
    await addDoc(collection(db, cat), {
      nombre, orden: (catalogos[cat] || []).length, activo: true
    });
    input.value = "";
    toast(`✔ Agregado a ${ETIQUETAS_CAT[cat]}`, "ok", 1400);
  } catch(e) { toast("Error: " + e.message, "error"); }
};

/* ---------- TRANSACCIONES: editar/eliminar ---------- */
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-accion]");
  if (!btn) return;
  const accion = btn.dataset.accion;
  const id = btn.dataset.id;

  if (accion === "edit")   { state.editandoId = id; renderTransacciones(); return; }
  if (accion === "cancel") { state.editandoId = null; renderTransacciones(); return; }

  if (accion === "del") {
    if (!confirm("¿Eliminar esta transacción? No se puede deshacer.")) return;
    try { await deleteDoc(doc(db, "transacciones", id)); toast("Transacción eliminada", "ok", 1400); }
    catch(e) { toast("Error: " + e.message, "error"); }
    return;
  }

  if (accion === "save") {
    const tr = btn.closest("tr");
    const variedad = tr.querySelector('[data-campo="variedad"]').value.trim();
    const plaga    = tr.querySelector('[data-campo="plaga"]').value.trim();
    const tallos   = parseInt(tr.querySelector('[data-campo="tallos"]').value, 10);
    if (!variedad || !plaga) return toast("Variedad y plaga obligatorias", "error");
    if (!Number.isFinite(tallos) || tallos <= 0) return toast("Cantidad inválida", "error");
    try {
      await updateDoc(doc(db, "transacciones", id), {
        variedad, plaga, tallos, actualizado: serverTimestamp()
      });
      state.editandoId = null;
      toast("✔ Actualizado", "ok", 1400);
    } catch(e) { toast("Error: " + e.message, "error"); }
  }
});

/* ---------- EXCEL (42 columnas) ---------- */
window.generarExcel = function() {
  if (typeof XLSX === "undefined") return toast("SheetJS no cargado", "error");
  if (!transaccionesCache.length)  return toast("No hay transacciones para exportar", "error");

  const plagasCols = (catalogos.plagas.length
    ? catalogos.plagas.map(p => p.nombre)
    : DEFAULT_CATALOGOS.plagas).slice();

  transaccionesCache.forEach(t => {
    if (t.plaga && !plagasCols.includes(t.plaga)) plagasCols.push(t.plaga);
  });

  const COLUMNAS = [...BASE_COLS, ...plagasCols];
  const grupos = new Map();

  transaccionesCache.forEach(t => {
    const key = [t.fecha,t.proveedor,t.zona,t.mesa,t.clasificador,t.variedad].join("¦");
    if (!grupos.has(key)) {
      const fila = {
        FECHA: t.fecha||"", PROVEEDOR: t.proveedor||"", ZONA: t.zona||"",
        MESA: t.mesa||"", CLASIFICADOR: t.clasificador||"",
        VARIEDAD: t.variedad||"", OBSERVACIONES: ""
      };
      plagasCols.forEach(p => { fila[p] = 0; });
      fila._regs = 0;
      grupos.set(key, fila);
    }
    const fila = grupos.get(key);
    const cant = Number(t.tallos) || 0;
    fila[t.plaga] = (fila[t.plaga] || 0) + cant;
    fila._regs++;
  });

  const filas = [];
  [...grupos.values()]
    .sort((a,b) =>
      String(a.MESA).localeCompare(String(b.MESA),"es") ||
      String(a.VARIEDAD).localeCompare(String(b.VARIEDAD),"es"))
    .forEach(f => {
      let total = 0;
      plagasCols.forEach(p => { total += Number(f[p]) || 0; });
      f["TOTAL DEFECTOS"] = total;
      f["N° REGISTROS"] = f._regs;
      filas.push(COLUMNAS.map(c => f[c] ?? ""));
    });

  const filaTotal = COLUMNAS.map((c,i) => {
    if (i < BASE_COLS.length - 2) return i === 0 ? "TOTALES" : "";
    if (c === "OBSERVACIONES") return "";
    let s = 0; filas.forEach(r => { s += Number(r[i]) || 0; });
    return s;
  });

  const ws = XLSX.utils.aoa_to_sheet([COLUMNAS, ...filas, filaTotal]);
  ws["!cols"] = COLUMNAS.map((c,i) => {
    if (i < BASE_COLS.length) {
      if (c === "FECHA") return { wch:12 };
      if (c === "PROVEEDOR") return { wch:34 };
      if (c === "VARIEDAD") return { wch:24 };
      return { wch:14 };
    }
    return { wch:13 };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CALIDAD");
  XLSX.writeFile(wb, `Registro_Calidad_${state.fecha}.xlsx`);
  toast(`📊 Excel (${COLUMNAS.length} columnas)`, "ok", 2600);
};

/* ---------- INDICADOR DE RED ---------- */
function actualizarIndicadorSync() {
  const el = document.getElementById("sync-indicador");
  if (!el) return;
  const on = navigator.onLine;
  el.className = "sync-indicador " + (on ? "online" : "offline");
  el.textContent = on ? "🟢 En línea" : "🔴 Sin conexión";
}

console.log("%cWRC Registro · v3.0 (Firebase)","color:#e74c3c;font-weight:bold;font-size:12px");