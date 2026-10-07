/* =========================================================================
   WRC · REGISTRO NACIONAL CALIDAD — v2.0 (Firebase Firestore)
   Nacional Ecuaroscanada S.A.
   ========================================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection, doc, getDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, writeBatch, serverTimestamp, query, where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

/* ---------- 1. CONFIGURACIÓN ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyCDkDvFOHsEJvlbnHLyW2ppwjGLU4V-oAk",
  authDomain: "nacional-ecuaroscanada.firebaseapp.com",
  projectId: "nacional-ecuaroscanada",
  storageBucket: "nacional-ecuaroscanada.firebasestorage.app",
  messagingSenderId: "625903655491",
  appId: "1:625903655491:web:3a14bb6babeeff894112f6"
};

const PIN_ADMIN = "1234";

/* ---------- 2. COLUMNAS BASE DEL EXCEL ---------- */
const BASE_COLS = [
  "FECHA","PROVEEDOR","ZONA","MESA","CLASIFICADOR","VARIEDAD",
  "TOTAL DEFECTOS","N° REGISTROS","OBSERVACIONES"
];

/* ---------- 3. CATÁLOGOS POR DEFECTO ---------- */
const DEFAULT_CATALOGOS = {
  proveedores: [
    "(05) QUIMBIAMBA CACUANGO PEDRO",
    "(01) ECUAROSCANADA S.A.",
    "(02) GRACE MESA",
    "(03) HERNAN CABASCANGO",
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

/* ---------- 4. INICIALIZACIÓN FIREBASE ---------- */
const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const auth = getAuth(app);

/* ---------- 5. ESTADO ---------- */
const state = {
  fecha: hoyISO(), proveedor:"", zona:"", mesa:"",
  clasificador:"", variedad:"", plaga:"", cantidad:""
};

const catalogos = {
  proveedores:[], zonas:[], clasificadores:[],
  mesas:[], variedades:[], plagas:[]
};

let transaccionesCache = [];
let unsubscribeTrans = null;
let editandoId = null;
let adminCat = "variedades";
let pinValidado = false;

/* ---------- 6. UTILIDADES ---------- */
function hoyISO(d = new Date()) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0,10);
}
function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function $(id) { return document.getElementById(id); }
function aviso(msg, tipo = "info", ms = 2600) {
  const cont = $("toasts");
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
function abrirModal(id)  { $(id).classList.add("abierto"); }
function cerrarModal(id) { $(id).classList.remove("abierto"); }

/* ---------- 7. ARRANQUE ---------- */
(async function iniciar() {
  try {
    await signInAnonymously(auth);
    console.log("[WRC] Auth anónima OK");
  } catch (e) {
    console.warn("[WRC] Auth anónima no disponible:", e.code || e.message);
  }

  try { await sembrarSiHaceFalta(); }
  catch (e) { console.error("[WRC] Error al sembrar catálogos:", e); }

  CATS.forEach(escucharCatalogo);
  escucharTransacciones(state.fecha);

  enlazarEventos();
  renderTodo();
  actualizarEstadoRed();
})();

/* ---------- 8. SEMILLA ---------- */
async function sembrarSiHaceFalta() {
  const metaRef = doc(db, "meta", "config");
  let snap;
  try { snap = await getDoc(metaRef); }
  catch (e) { return; }
  if (snap.exists() && snap.data().seeded) return;

  const batch = writeBatch(db);
  for (const [coleccion, items] of Object.entries(DEFAULT_CATALOGOS)) {
    items.forEach((nombre, i) => {
      batch.set(doc(collection(db, coleccion)), { nombre, orden: i, activo: true });
    });
  }
  batch.set(metaRef, { seeded: true, seededAt: serverTimestamp() });
  await batch.commit();
  console.log("[WRC] Catálogos iniciales creados en Firestore.");
}

/* ---------- 9. LISTENERS CATÁLOGOS ---------- */
function escucharCatalogo(nombre) {
  onSnapshot(collection(db, nombre),
    (snap) => {
      catalogos[nombre] = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) =>
          (a.orden ?? 9999) - (b.orden ?? 9999) ||
          String(a.nombre).localeCompare(String(b.nombre), "es")
        );
      renderTodo();
    },
    (err) => console.error(`[WRC] onSnapshot ${nombre}:`, err.code, err.message)
  );
}

/* ---------- 10. LISTENER TRANSACCIONES ---------- */
function escucharTransacciones(fecha) {
  if (unsubscribeTrans) { unsubscribeTrans(); unsubscribeTrans = null; }
  const q = query(collection(db, "transacciones"), where("fecha","==",fecha));
  unsubscribeTrans = onSnapshot(q,
    (snap) => {
      transaccionesCache = snap.docs
        .map(d => ({ ...d.data(), id: d.id, pendiente: d.metadata.hasPendingWrites }))
        .sort((a, b) => {
          const ta = a.creado?.seconds ?? 0;
          const tb = b.creado?.seconds ?? 0;
          return tb - ta;
        });
      renderTransacciones();
    },
    (err) => {
      console.error("[WRC] onSnapshot transacciones:", err.code, err.message);
      aviso("Error leyendo transacciones: " + err.message, "error", 4000);
    }
  );
}

/* ---------- 11. RENDER ---------- */
function renderTodo() {
  renderSelects();
  renderListas();
  renderResumen();
  renderPantalla();
}
function renderSelects() {
  llenarSelect("proveedor", catalogos.proveedores, "TODOS", state.proveedor);
  llenarSelect("zona", catalogos.zonas, "TODAS", state.zona);
}
function llenarSelect(id, items, placeholder, valorActual) {
  const sel = $(id); if (!sel) return;
  const previo = valorActual ?? sel.value;
  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = ""; opt0.textContent = placeholder;
  sel.appendChild(opt0);
  items.forEach(it => {
    const o = document.createElement("option");
    o.value = it.nombre; o.textContent = it.nombre;
    sel.appendChild(o);
  });
  sel.value = previo;
  if (sel.value !== previo) sel.value = "";
}
function renderListas() {
  renderLista("listaMesas","buscarMesas",catalogos.mesas,state.mesa,(v)=>{
    state.mesa = (state.mesa === v) ? "" : v;
    renderListas(); renderResumen();
  });
  renderLista("listaClasificadores","buscarClasificadores",catalogos.clasificadores,state.clasificador,(v)=>{
    state.clasificador = (state.clasificador === v) ? "" : v;
    renderListas(); renderResumen();
  });
  renderLista("listaVariedades","buscarVariedades",catalogos.variedades,state.variedad,(v)=>{
    state.variedad = (state.variedad === v) ? "" : v;
    renderListas(); renderResumen();
  });
  renderLista("listaPlagas","buscarPlagas",catalogos.plagas,state.plaga,(v)=>{
    state.plaga = (state.plaga === v) ? "" : v;
    renderListas(); renderResumen();
  });
}
function renderLista(contId, buscarId, items, seleccionado, onSelect) {
  const cont = $(contId); if (!cont) return;
  const input = $(buscarId);
  const filtro = (input?.value || "").trim().toUpperCase();
  cont.innerHTML = "";
  let pintados = 0;
  items.forEach((it) => {
    const nombre = it.nombre ?? it;
    if (filtro && !String(nombre).toUpperCase().includes(filtro)) return;
    pintados++;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "item" + (seleccionado === nombre ? " activo" : "");
    b.textContent = nombre;
    b.addEventListener("click", () => onSelect(nombre));
    cont.appendChild(b);
  });
  if (!pintados) {
    const p = document.createElement("div");
    p.className = "vacio";
    p.textContent = items.length ? "Sin resultados" : "Cargando…";
    cont.appendChild(p);
  }
}
function renderResumen() {
  $("rzMesa").textContent = state.mesa || "—";
  $("rzClasif").textContent = state.clasificador || "—";
  $("rzVariedad").textContent = state.variedad || "—";
  $("rzPlaga").textContent = state.plaga || "—";
}
function renderPantalla() {
  $("pantalla").textContent = state.cantidad === "" ? "0" : state.cantidad;
}

/* ---------- 12. GUARDAR ---------- */
async function guardar() {
  if (!state.mesa) return aviso("Selecciona una MESA", "error");
  if (!state.clasificador) return aviso("Selecciona un CLASIFICADOR", "error");
  if (!state.variedad) return aviso("Selecciona una VARIEDAD", "error");
  if (!state.plaga) return aviso("Selecciona una PLAGA", "error");
  const cant = parseInt(state.cantidad, 10);
  if (!Number.isFinite(cant) || cant <= 0) return aviso("Ingresa una CANTIDAD", "error");

  const btn = $("btnGuardar");
  btn.disabled = true;
  try {
    await addDoc(collection(db, "transacciones"), {
      fecha: state.fecha, proveedor: state.proveedor || "", zona: state.zona || "",
      mesa: state.mesa, clasificador: state.clasificador, variedad: state.variedad,
      plaga: state.plaga, tallos: cant,
      usuario: localStorage.getItem("wrc_usuario") || "TABLET",
      creado: serverTimestamp(), actualizado: serverTimestamp()
    });
    state.variedad = ""; state.plaga = ""; state.cantidad = "";
    renderListas(); renderResumen(); renderPantalla();
    aviso("✔ Registro guardado", "ok", 1400);
  } catch (e) {
    console.error(e);
    aviso("Error al guardar: " + e.message, "error", 4000);
  } finally { btn.disabled = false; }
}

/* ---------- 13. TABLA TRANSACCIONES ---------- */
function renderTransacciones() {
  const tbody = $("tablaTrans"); const input = $("buscarTrans");
  if (!tbody) return;
  const filtro = (input?.value || "").trim().toUpperCase();
  const lista = transaccionesCache.filter(t => {
    if (!filtro) return true;
    return [t.mesa,t.clasificador,t.variedad,t.plaga,t.usuario]
      .some(v => String(v || "").toUpperCase().includes(filtro));
  });
  $("transFecha").textContent = state.fecha;
  $("transContador").textContent = `${lista.length} registro${lista.length === 1 ? "" : "s"}`;
  tbody.innerHTML = "";
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="vacio">Sin transacciones para esta fecha</td></tr>`;
    return;
  }
  lista.forEach(t => {
    const tr = document.createElement("tr");
    if (t.pendiente) tr.classList.add("pendiente-row");
    if (t.id === editandoId) {
      tr.innerHTML = `
        <td>${esc(t.fecha)}</td>
        <td>${esc(t.mesa)}</td>
        <td>${esc(t.clasificador)}</td>
        <td><input class="edit-in" data-campo="variedad" value="${esc(t.variedad)}"></td>
        <td><input class="edit-in" data-campo="plaga" value="${esc(t.plaga)}"></td>
        <td><input class="edit-in edit-num" type="number" min="1" data-campo="tallos" value="${esc(t.tallos)}"></td>
        <td>—</td>
        <td><div class="acciones-celda">
          <button class="mini ok" data-accion="save" data-id="${t.id}">✓</button>
          <button class="mini" data-accion="cancel">✕</button>
        </div></td>`;
    } else {
      tr.innerHTML = `
        <td>${esc(t.fecha)}</td>
        <td><b>${esc(t.mesa)}</b></td>
        <td>${esc(t.clasificador)}</td>
        <td>${esc(t.variedad)}</td>
        <td>${esc(t.plaga)}</td>
        <td><b>${esc(t.tallos)}</b></td>
        <td><span class="dot ${t.pendiente ? "pendiente" : "sincronizado"}"></span></td>
        <td><div class="acciones-celda">
          <button class="mini" data-accion="edit" data-id="${t.id}">✏️</button>
          <button class="mini del" data-accion="del" data-id="${t.id}">🗑️</button>
        </div></td>`;
    }
    tbody.appendChild(tr);
  });
}
async function manejarAccionTrans(e) {
  const btn = e.target.closest("button[data-accion]");
  if (!btn) return;
  const accion = btn.dataset.accion; const id = btn.dataset.id;

  if (accion === "edit") { editandoId = id; renderTransacciones(); return; }
  if (accion === "cancel") { editandoId = null; renderTransacciones(); return; }

  if (accion === "del") {
    if (!confirm("¿Eliminar esta transacción? Esta acción no se puede deshacer.")) return;
    try { await deleteDoc(doc(db, "transacciones", id)); aviso("Transacción eliminada", "ok", 1600); }
    catch (err) { aviso("Error al eliminar: " + err.message, "error"); }
    return;
  }
  if (accion === "save") {
    const tr = btn.closest("tr");
    const variedad = tr.querySelector('[data-campo="variedad"]').value.trim();
    const plaga = tr.querySelector('[data-campo="plaga"]').value.trim();
    const tallos = parseInt(tr.querySelector('[data-campo="tallos"]').value, 10);
    if (!variedad || !plaga) return aviso("Variedad y plaga son obligatorias", "error");
    if (!Number.isFinite(tallos) || tallos <= 0) return aviso("Cantidad inválida", "error");
    try {
      await updateDoc(doc(db, "transacciones", id), {
        variedad, plaga, tallos, actualizado: serverTimestamp()
      });
      editandoId = null;
      aviso("✔ Transacción actualizada", "ok", 1600);
    } catch (err) { aviso("Error al actualizar: " + err.message, "error"); }
  }
}

/* ---------- 14. EXCEL ---------- */
function exportarExcel() {
  if (typeof XLSX === "undefined") return aviso("SheetJS no está cargado", "error");
  if (!transaccionesCache.length) return aviso("No hay transacciones para exportar", "error");

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
        FECHA: t.fecha || "", PROVEEDOR: t.proveedor || "", ZONA: t.zona || "",
        MESA: t.mesa || "", CLASIFICADOR: t.clasificador || "",
        VARIEDAD: t.variedad || "", OBSERVACIONES: ""
      };
      plagasCols.forEach(p => { fila[p] = 0; });
      fila._registros = 0;
      grupos.set(key, fila);
    }
    const fila = grupos.get(key);
    const cant = Number(t.tallos) || 0;
    fila[t.plaga] = (fila[t.plaga] || 0) + cant;
    fila._registros++;
  });

  const filas = [];
  [...grupos.values()]
    .sort((a, b) =>
      String(a.MESA).localeCompare(String(b.MESA),"es") ||
      String(a.VARIEDAD).localeCompare(String(b.VARIEDAD),"es"))
    .forEach(f => {
      let total = 0;
      plagasCols.forEach(p => { total += Number(f[p]) || 0; });
      f["TOTAL DEFECTOS"] = total;
      f["N° REGISTROS"] = f._registros;
      filas.push(COLUMNAS.map(c => f[c] ?? ""));
    });

  const filaTotal = COLUMNAS.map((c, i) => {
    if (i < BASE_COLS.length - 2) return i === 0 ? "TOTALES" : "";
    if (c === "OBSERVACIONES") return "";
    let suma = 0;
    filas.forEach(r => { suma += Number(r[i]) || 0; });
    return suma;
  });

  const aoa = [COLUMNAS, ...filas, filaTotal];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = COLUMNAS.map((c, i) => {
    if (i < BASE_COLS.length) {
      if (c === "FECHA") return { wch: 12 };
      if (c === "PROVEEDOR") return { wch: 34 };
      if (c === "VARIEDAD") return { wch: 24 };
      return { wch: 14 };
    }
    return { wch: 13 };
  });
  ws["!freeze"] = { xSplit: 6, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CALIDAD");
  XLSX.writeFile(wb, `Registro_Calidad_${state.fecha}.xlsx`);
  aviso(`📊 Excel generado (${COLUMNAS.length} columnas)`, "ok", 2600);
}

/* ---------- 15. ADMIN ---------- */
function renderTabsAdmin() {
  const cont = $("adminTabs"); cont.innerHTML = "";
  CATS.forEach(cat => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tab" + (adminCat === cat ? " activo" : "");
    b.textContent = ETIQUETAS_CAT[cat];
    b.onclick = () => { adminCat = cat; renderTabsAdmin(); renderAdminLista(); };
    cont.appendChild(b);
  });
}
function renderAdminLista() {
  const cont = $("adminLista"); cont.innerHTML = "";
  const items = catalogos[adminCat] || [];
  if (!items.length) {
    cont.innerHTML = `<div class="vacio">Sin elementos en ${ETIQUETAS_CAT[adminCat]}</div>`;
    return;
  }
  items.forEach(it => {
    const div = document.createElement("div");
    div.className = "admin-item";
    div.innerHTML = `<span title="${esc(it.nombre)}">${esc(it.nombre)}</span>
                     <button type="button" title="Eliminar">🗑️</button>`;
    div.querySelector("button").onclick = async () => {
      if (!confirm(`¿Eliminar "${it.nombre}" de ${ETIQUETAS_CAT[adminCat]}?`)) return;
      try { await deleteDoc(doc(db, adminCat, it.id)); aviso("Elemento eliminado", "ok", 1500); }
      catch (e) { aviso("Error: " + e.message, "error"); }
    };
    cont.appendChild(div);
  });
}
async function agregarItemAdmin() {
  const input = $("adminNuevo");
  const nombre = input.value.trim().toUpperCase();
  if (!nombre) return aviso("Escribe un nombre", "error");
  const yaExiste = (catalogos[adminCat] || []).some(i => String(i.nombre).toUpperCase() === nombre);
  if (yaExiste) return aviso("Ya existe ese elemento", "error");
  const orden = (catalogos[adminCat] || []).length;
  try {
    await addDoc(collection(db, adminCat), { nombre, orden, activo: true });
    input.value = "";
    aviso(`✔ Agregado a ${ETIQUETAS_CAT[adminCat]}`, "ok", 1500);
  } catch (e) { aviso("Error al agregar: " + e.message, "error"); }
}

/* ---------- 16. ESTADO DE RED ---------- */
function actualizarEstadoRed() {
  const el = $("estadoRed"); if (!el) return;
  const online = navigator.onLine;
  el.classList.toggle("offline", !online);
  el.textContent = "●";
  el.title = online ? "En línea" : "Sin conexión — los datos se guardan localmente";
}

/* ---------- 17. EVENTOS ---------- */
function enlazarEventos() {
  $("fecha").value = state.fecha;
  $("fecha").addEventListener("change", (e) => {
    state.fecha = e.target.value || hoyISO();
    editandoId = null;
    escucharTransacciones(state.fecha);
  });
  $("proveedor").addEventListener("change", (e) => { state.proveedor = e.target.value; });
  $("zona").addEventListener("change", (e) => { state.zona = e.target.value; });
  $("btnGuardar").addEventListener("click", guardar);
  $("btnExcel").addEventListener("click", exportarExcel);

  $("btnTrans").addEventListener("click", () => {
    editandoId = null; renderTransacciones(); abrirModal("modalTrans");
  });

  $("btnAdmin").addEventListener("click", () => {
    if (pinValidado) {
      renderTabsAdmin(); renderAdminLista(); abrirModal("modalAdmin");
    } else {
      $("pinInput").value = ""; $("pinError").textContent = "";
      abrirModal("modalPin");
      setTimeout(() => $("pinInput").focus(), 120);
    }
  });

  $("pinOk").addEventListener("click", validarPin);
  $("pinInput").addEventListener("keydown", (e) => { if (e.key === "Enter") validarPin(); });

  function validarPin() {
    const val = $("pinInput").value.trim();
    if (val === PIN_ADMIN) {
      pinValidado = true;
      cerrarModal("modalPin");
      renderTabsAdmin(); renderAdminLista(); abrirModal("modalAdmin");
    } else {
      $("pinError").textContent = "PIN incorrecto";
      $("pinInput").value = ""; $("pinInput").focus();
    }
  }

  $("adminAgregar").addEventListener("click", agregarItemAdmin);
  $("adminNuevo").addEventListener("keydown", (e) => { if (e.key === "Enter") agregarItemAdmin(); });

  const uInput = $("usuarioInput");
  uInput.value = localStorage.getItem("wrc_usuario") || "TABLET";
  uInput.addEventListener("change", () => {
    localStorage.setItem("wrc_usuario", uInput.value.trim().toUpperCase() || "TABLET");
    aviso("Operario actualizado", "ok", 1400);
  });

  document.querySelectorAll("[data-cerrar]").forEach(btn => {
    btn.addEventListener("click", () => {
      cerrarModal(btn.dataset.cerrar);
      if (btn.dataset.cerrar === "modalPin") $("pinError").textContent = "";
    });
  });
  document.querySelectorAll(".overlay").forEach(ov => {
    ov.addEventListener("click", (e) => { if (e.target === ov) ov.classList.remove("abierto"); });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape")
      document.querySelectorAll(".overlay.abierto").forEach(o => o.classList.remove("abierto"));
  });

  ["buscarMesas","buscarClasificadores","buscarVariedades","buscarPlagas"]
    .forEach(id => $(id).addEventListener("input", renderListas));
  $("buscarTrans").addEventListener("input", renderTransacciones);

  $("teclado").addEventListener("click", (e) => {
    const tecla = e.target.closest(".tecla"); if (!tecla) return;
    const v = tecla.dataset.tecla;
    if (v === "C") state.cantidad = "";
    else if (v === "B") state.cantidad = state.cantidad.slice(0, -1);
    else if (state.cantidad.length < 6)
      state.cantidad = (state.cantidad === "0" ? "" : state.cantidad) + v;
    renderPantalla();
  });

  $("tablaTrans").addEventListener("click", manejarAccionTrans);

  window.addEventListener("online", () => { actualizarEstadoRed(); aviso("Conexión restaurada", "ok", 1800); });
  window.addEventListener("offline", () => { actualizarEstadoRed(); aviso("Sin conexión — modo local", "info", 2400); });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && state.cantidad &&
        !document.querySelector(".overlay.abierto") &&
        document.activeElement.tagName !== "INPUT") guardar();
  });
}

console.log("%cWRC Registro Nacional Calidad · v2.0 (Firestore)",
            "color:#1565c0;font-weight:bold;font-size:12px");