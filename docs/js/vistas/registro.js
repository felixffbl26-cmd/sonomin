/* Vista REGISTRO (solo administrador): auditoria de todo lo que se hace en el sistema.
 * La escribe el servidor (triggers y funciones); nadie puede editarla ni borrarla desde el tablero. */
(function (raiz) {
  "use strict";
  const { el, f1 } = raiz.SON_G;
  const U = raiz.SON_U, D = raiz.SON_DATOS, N = raiz.SON_NORMAS;
  raiz.SON_VISTAS = raiz.SON_VISTAS || {};

  const ACCIONES = {
    INGRESO: { t: "Ingreso al tablero", g: "ingresos" },
    MEDICION_A_PAPELERA: { t: "Medición a la papelera", g: "mediciones" },
    MEDICION_RESTAURADA: { t: "Medición restaurada", g: "mediciones" },
    MEDICION_ELIMINADA_DEFINITIVA: { t: "Medición borrada para siempre", g: "mediciones" },
    ACCESO_OTORGADO: { t: "Acceso otorgado", g: "accesos" },
    ROL_CAMBIADO: { t: "Rol cambiado", g: "accesos" },
    ACCESO_QUITADO: { t: "Acceso quitado", g: "accesos" },
    PLAN_PROYECTO_CREADO: { t: "Plan de proyecto creado", g: "proyectos" },
    PLAN_PROYECTO_EDITADO: { t: "Plan de proyecto editado", g: "proyectos" },
    PLAN_PROYECTO_BORRADO: { t: "Plan de proyecto borrado", g: "proyectos" },
    INFORME_GENERADO: { t: "Informe técnico generado", g: "informes" },
    INFORME_AUTOMATICO: { t: "Informe automático (GitHub)", g: "informes" },
    EXPORTACION_CSV: { t: "Descarga de datos (CSV)", g: "informes" },
    EXPORTACION_EXCEL: { t: "Descarga de datos (Excel)", g: "informes" },
  };
  const GRUPOS = [["", "Toda la actividad"], ["ingresos", "Ingresos al tablero"], ["mediciones", "Papelera y borrados"], ["accesos", "Accesos y roles"], ["proyectos", "Planes de proyecto"], ["informes", "Informes y descargas"]];
  const estado = { grupo: "", texto: "", dias: 30 };
  const dos = (n) => String(n).padStart(2, "0");
  const fechaSeg = (iso) => { const ms = Date.parse(iso), h = N.horaLima(ms); return h.dia.split("-").reverse().join("/") + " " + dos(h.h) + ":" + dos(h.m) + ":" + dos(Math.floor(ms / 1000) % 60); };

  function detalleTexto(a) {
    const d = a.detalle || {};
    switch (a.accion) {
      case "INGRESO": return (d.rol ? "como " + d.rol : "") + (d.pantalla ? " · pantalla " + d.pantalla : "") + (d.navegador ? " · " + navegador(d.navegador) : "");
      case "MEDICION_A_PAPELERA": case "MEDICION_ELIMINADA_DEFINITIVA":
        return [d.proyecto, d.punto, Number.isFinite(Number(d.leq_dba)) ? f1(Number(d.leq_dba)) + " dB(A)" : "", d.fecha, d.motivo ? "motivo: «" + d.motivo + "»" : ""].filter(Boolean).join(" · ");
      case "MEDICION_RESTAURADA": return [d.proyecto, d.punto, Number.isFinite(Number(d.leq_dba)) ? f1(Number(d.leq_dba)) + " dB(A)" : ""].filter(Boolean).join(" · ");
      case "ACCESO_OTORGADO": case "ACCESO_QUITADO": return "rol " + (d.rol || "?");
      case "ROL_CAMBIADO": return (d.antes || "?") + " → " + (d.ahora || "?");
      case "PLAN_PROYECTO_CREADO": case "PLAN_PROYECTO_EDITADO": case "PLAN_PROYECTO_BORRADO":
        return [d.estado, d.objetivo_puntos ? "meta " + d.objetivo_puntos + " puntos" : "", d.objetivo_mediciones ? d.objetivo_mediciones + " mediciones" : "", d.fecha_fin ? "hasta " + d.fecha_fin : ""].filter(Boolean).join(" · ");
      case "INFORME_GENERADO": return [d.proyecto || "todos los proyectos", d.mediciones !== undefined ? d.mediciones + " mediciones" : "", d.fotos !== undefined ? d.fotos + " fotos" : ""].filter(Boolean).join(" · ");
      case "INFORME_AUTOMATICO": return [d.proyecto || "todos los proyectos", d.n_mediciones !== undefined ? d.n_mediciones + " mediciones" : ""].filter(Boolean).join(" · ");
      case "EXPORTACION_CSV": case "EXPORTACION_EXCEL": return d.filas !== undefined ? d.filas + " filas" : "";
      default: return JSON.stringify(d).slice(0, 160);
    }
  }
  function navegador(ua) {
    const so = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
    const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
    return [nav, so].filter(Boolean).join(" en ");
  }

  function filtrar(lista) {
    const q = estado.texto.trim().toLowerCase(), desde = estado.dias ? Date.now() - estado.dias * 86400000 : 0;
    return lista.filter((a) => (!estado.grupo || (ACCIONES[a.accion] || {}).g === estado.grupo) && Date.parse(a.creado) >= desde &&
      (!q || [a.usuario_email, a.objeto, (ACCIONES[a.accion] || {}).t, detalleTexto(a)].join(" ").toLowerCase().includes(q)));
  }

  function fila(a, nueva) {
    const info = ACCIONES[a.accion] || { t: a.accion, g: "" };
    return el("tr", { class: nueva ? "fila-nueva" : "" }, el("td", { class: "tab-num", texto: fechaSeg(a.creado) }), el("td", { texto: a.usuario_email || "–" }),
      el("td", null, el("span", { class: "etq-aud " + info.g, texto: info.t })), el("td", { texto: a.objeto || "" }), el("td", { class: "mudo", texto: detalleTexto(a) }));
  }

  let refs = {};
  function pintarTabla(S) {
    if (!refs.cuerpo) return;
    const lista = filtrar(S.auditoria || []);
    refs.cuerpo.replaceChildren(...lista.slice(0, 600).map((a) => fila(a, false)));
    refs.cuenta.textContent = lista.length + " registro(s)" + (lista.length > 600 ? " · se muestran los 600 más recientes (el CSV los trae todos)" : "");
    const hoy = Date.parse(N.horaLima(Date.now()).dia + "T05:00:00Z"), sem = Date.now() - 7 * 86400000, todo = S.auditoria || [];
    refs.kpis.replaceChildren(
      U.kpi("Ingresos de hoy", String(todo.filter((a) => a.accion === "INGRESO" && Date.parse(a.creado) >= hoy).length), "personas que abrieron el tablero"),
      U.kpi("Personas distintas (7 días)", String(new Set(todo.filter((a) => a.accion === "INGRESO" && Date.parse(a.creado) >= sem).map((a) => a.usuario_email)).size), "con al menos un ingreso"),
      U.kpi("Mediciones retiradas", String(todo.filter((a) => a.accion === "MEDICION_A_PAPELERA").length), todo.filter((a) => a.accion === "MEDICION_ELIMINADA_DEFINITIVA").length + " borradas para siempre"),
      U.kpi("Cambios de acceso", String(todo.filter((a) => (ACCIONES[a.accion] || {}).g === "accesos").length), "otorgados, cambiados o quitados"));
  }

  async function render(cont, S) {
    refs = {};
    cont.replaceChildren(el("div", { class: "tarjeta" }, el("p", { class: "mudo", texto: "Cargando el registro…" })));
    try { S.auditoria = await D.cargarAuditoria(); } // siempre fresco al abrir; luego se actualiza en vivo
    catch (e) { cont.replaceChildren(el("div", { class: "caja-aviso grave", texto: "No se pudo leer el registro: " + e.message + ". ¿Se ejecutó la versión 4 del esquema en Supabase?" })); return; }
    refs.kpis = el("div", { class: "rejilla cols-4" });
    refs.cuerpo = el("tbody");
    refs.cuenta = el("span", { class: "mudo", style: "font-size:13px" });
    const selGrupo = el("select", { "aria-label": "Tipo de actividad", onchange: (e) => { estado.grupo = e.target.value; pintarTabla(S); } }, GRUPOS.map(([v, t]) => el("option", { value: v, texto: t, selected: v === estado.grupo ? true : null })));
    const selDias = el("select", { "aria-label": "Periodo", onchange: (e) => { estado.dias = Number(e.target.value); pintarTabla(S); } }, [[1, "Últimas 24 h"], [7, "Últimos 7 días"], [30, "Últimos 30 días"], [0, "Todo"]].map(([v, t]) => el("option", { value: v, texto: t, selected: v === estado.dias ? true : null })));
    const buscar = el("input", { type: "search", placeholder: "Buscar persona, punto, motivo…", value: estado.texto, "aria-label": "Buscar en el registro" });
    buscar.addEventListener("input", () => { estado.texto = buscar.value; pintarTabla(S); });
    const csv = el("button", { class: "boton sec", type: "button", onclick: () => {
      const lista = filtrar(S.auditoria || []);
      U.descargar("SONOMIN_registro_auditoria.csv", U.csv(["fecha_hora_lima", "usuario", "accion", "objeto", "detalle"], lista.map((a) => [fechaSeg(a.creado), a.usuario_email, (ACCIONES[a.accion] || {}).t || a.accion, a.objeto || "", detalleTexto(a)])));
      D.registrar("EXPORTACION_CSV", { filas: lista.length, tabla: "auditoria" });
    } }, "Descargar CSV");
    cont.replaceChildren(el("div", null,
      el("div", { class: "tarjeta" }, el("h2", { texto: "Registro de actividad (auditoría)" }),
        el("p", { class: "sub", texto: "Todo queda anotado por el servidor con la persona, la fecha y la hora de Lima: ingresos al tablero, mediciones enviadas a la papelera, restauradas o borradas, accesos otorgados o quitados, cambios de rol, planes de proyecto e informes. Nadie puede editar ni borrar este registro, ni siquiera el administrador." })),
      el("div", { class: "seccion" }, refs.kpis),
      el("div", { class: "tarjeta seccion" },
        el("div", { class: "fila", style: "justify-content:space-between" }, el("div", { class: "fila" }, selGrupo, selDias, buscar), csv),
        el("div", { style: "margin-top:6px" }, refs.cuenta),
        el("div", { class: "tabla-caja", style: "margin-top:8px;max-height:640px;overflow-y:auto" }, el("table", null,
          el("thead", null, el("tr", null, ["Fecha y hora (Lima)", "Persona", "Acción", "Sobre qué", "Detalle"].map((t) => el("th", { texto: t })))), refs.cuerpo)))));
    if (!D.enNube) cont.firstChild.prepend(el("div", { class: "caja-aviso info", texto: "Modo demostración: registros de ejemplo. Con la nube, cada acción real queda aquí." }));
    pintarTabla(S);
  }

  raiz.SON_VISTAS.registro = {
    render,
    alAuditoria(S, f) {
      if (!refs.cuerpo) return;
      pintarTabla(S);
      const primera = refs.cuerpo.firstChild;
      if (primera && filtrar([f]).length) primera.classList.add("fila-nueva");
    },
  };
})(window);
