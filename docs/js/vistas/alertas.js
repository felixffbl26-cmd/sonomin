/* Vista ALERTAS (solo administrador): enviar avisos en tiempo real a los celulares y ver quien los recibio y leyo.
 * La base de datos vuelve a verificar todo: enviar_alerta() solo la ejecuta un administrador, y cada persona
 * solo recibe las alertas dirigidas a ella (a todos, a un proyecto que ve o a ella misma). */
(function (raiz) {
  "use strict";
  const { el, fechaHora } = raiz.SON_G;
  const U = raiz.SON_U, D = raiz.SON_DATOS;
  raiz.SON_VISTAS = raiz.SON_VISTAS || {};

  const NIVELES = {
    INFORMATIVA: { t: "Informativa", d: "Aviso general. Se muestra en el celular y suena la notificación." },
    ADVERTENCIA: { t: "Advertencia", d: "Pide atención. Se muestra en el celular y vibra." },
    URGENTE: { t: "Urgente", d: "Evacuación o riesgo inmediato. Vibración larga y ventana que obliga a pulsar «Entendido»." },
  };
  const PLANTILLAS = [
    { t: "Evacuar la labor", titulo: "Evacuar la labor", mensaje: "Salga de la labor ahora por la ruta de evacuación y repórtese con su supervisor.", nivel: "URGENTE" },
    { t: "Doble protección auditiva", titulo: "Use doble protección auditiva", mensaje: "El nivel de ruido en su zona es alto. Use tapones y orejeras mientras dure la tarea.", nivel: "ADVERTENCIA" },
    { t: "Terminar y reportar", titulo: "Termine la medición y repórtese", mensaje: "Termine la medición actual, guarde los datos y comuníquese con la central.", nivel: "ADVERTENCIA" },
    { t: "Cambio de punto", titulo: "Cambio de punto de medición", mensaje: "Pase al siguiente punto del plan y confirme cuando esté en posición.", nivel: "INFORMATIVA" },
  ];
  const VIGENCIAS = [[1, "1 hora"], [4, "4 horas"], [12, "12 horas"], [24, "24 horas"], [72, "3 días"]];
  const hora = (iso) => (iso ? fechaHora(Date.parse(iso)) : "–");

  let est = { alertas: [], lecturas: [], usuarios: [], error: "" };
  let refs = {}, desligar = null, sondeo = null, pendiente = null;

  function estadoDe(a, u) {
    const l = est.lecturas.find((x) => x.alerta_id === a.id && x.usuario_id === u.user_id);
    if (l && l.leida) return { clave: "LEIDA", texto: "Leída", cuando: l.leido_en };
    if (l) return { clave: "RECIBIDA", texto: "Recibida, sin leer", cuando: l.recibido_en };
    return Date.parse(a.vence) < Date.now() ? { clave: "VENCIDA", texto: "No llegó (venció)", cuando: null } : { clave: "PENDIENTE", texto: "Pendiente", cuando: null };
  }
  function destinoTexto(a) {
    if (a.destino_tipo === "PROYECTO") return "Proyecto: " + a.destino_proyecto;
    if (a.destino_tipo === "PERSONA") return "Persona: " + (a.destino_email || "–");
    return "Todas las personas con acceso";
  }

  function tarjetaAlerta(a) {
    const dest = D.destinatariosAlerta(a, est.usuarios);
    // quien confirmo aunque no figure como destinatario esperado (por ejemplo otro administrador)
    const extra = est.lecturas.filter((l) => l.alerta_id === a.id && !dest.some((u) => u.user_id === l.usuario_id))
      .map((l) => ({ user_id: l.usuario_id, email: l.usuario_email, nombre: "" }));
    const filas = dest.concat(extra);
    const estados = filas.map((u) => estadoDe(a, u));
    const leidas = estados.filter((s) => s.clave === "LEIDA").length, recibidas = estados.filter((s) => s.clave === "LEIDA" || s.clave === "RECIBIDA").length;
    const vigente = Date.parse(a.vence) > Date.now();
    const resumen = filas.length ? leidas + " de " + filas.length + " leyeron · " + recibidas + " recibieron" : "Sin destinatarios registrados";
    const tabla = filas.length ? el("div", { class: "tabla-caja" }, el("table", null,
      el("thead", null, el("tr", null, ["Persona", "Estado", "Cuándo"].map((t) => el("th", { texto: t })))),
      el("tbody", null, filas.map((u, i) => el("tr", null,
        el("td", { texto: (u.nombre ? u.nombre + " · " : "") + (u.email || "") }),
        el("td", null, el("span", { class: "estado-al " + estados[i].clave, texto: estados[i].texto })),
        el("td", { texto: hora(estados[i].cuando) })))))) : null;
    return el("div", { class: "tarjeta seccion" },
      el("div", { class: "fila", style: "justify-content:space-between;align-items:flex-start" },
        el("div", null, el("span", { class: "nivel-al " + a.nivel, texto: (NIVELES[a.nivel] || { t: a.nivel }).t }), " ", el("b", { texto: a.titulo })),
        el("span", { class: "mudo", style: "font-size:12.5px", texto: U.hace(Date.parse(a.creado)) })),
      el("p", { style: "margin:6px 0", texto: a.mensaje }),
      el("div", { class: "mudo", style: "font-size:12.5px", texto: destinoTexto(a) + " · enviada por " + (a.creada_por_email || "–") + " · " + (vigente ? "vigente hasta " : "venció el ") + hora(a.vence) }),
      el("div", { class: "fila", style: "margin:8px 0 4px" }, el("b", { texto: resumen })),
      tabla);
  }

  function pintarLista() {
    if (!refs.lista) return;
    if (est.error) { refs.lista.replaceChildren(el("div", { class: "caja-aviso grave", texto: est.error })); return; }
    refs.lista.replaceChildren(...(est.alertas.length
      ? est.alertas.slice(0, 15).map(tarjetaAlerta)
      : [el("div", { class: "tarjeta" }, el("p", { class: "mudo", texto: "Todavía no envió ninguna alerta. Cuando envíe una, aquí verá quién la recibió y quién la leyó, al segundo." }))]));
  }
  function pintarListaPronto() {
    if (pendiente) return;
    pendiente = setTimeout(() => { pendiente = null; pintarLista(); }, 350);
  }

  async function recargar() {
    try {
      const r = await D.alertas();
      est.alertas = r.alertas; est.lecturas = r.lecturas; est.error = "";
    } catch (e) {
      est.error = /alertas|relation|schema cache|does not exist/i.test(e.message)
        ? "Falta activar las alertas en la nube: ejecute el archivo ampliacion_v6_alertas.sql en Supabase › SQL Editor. (" + e.message + ")"
        : "No se pudieron leer las alertas: " + e.message;
    }
    pintarLista();
  }

  function formulario(S) {
    const personas = est.usuarios.filter((u) => u.rol === "celular" || u.rol === "lector");
    const proyectos = S.nombresProyectos();
    const fTitulo = el("input", { type: "text", maxlength: "80", placeholder: "Ej.: Evacuar la labor", id: "al-titulo" });
    const fMsg = el("textarea", { maxlength: "500", rows: "3", placeholder: "Qué debe hacer la persona. Mensaje corto y claro.", id: "al-msg" });
    const cuenta = el("span", { class: "mudo", style: "font-size:12px", texto: "0 / 500" });
    fMsg.addEventListener("input", () => { cuenta.textContent = fMsg.value.length + " / 500"; });
    const fNivel = el("select", { id: "al-nivel" }, Object.entries(NIVELES).map(([k, n]) => el("option", { value: k, texto: n.t })));
    const nivelAyuda = el("span", { class: "mudo", style: "font-size:12px", texto: NIVELES.INFORMATIVA.d });
    fNivel.addEventListener("change", () => { nivelAyuda.textContent = NIVELES[fNivel.value].d; });
    const fDest = el("select", { id: "al-dest" },
      el("option", { value: "TODOS", texto: "Todas las personas con acceso" }),
      el("option", { value: "PROYECTO", texto: "Las personas de un proyecto" }),
      el("option", { value: "PERSONA", texto: "Una sola persona" }));
    const fProy = el("select", { id: "al-proy" }, proyectos.length ? proyectos.map((n) => el("option", { value: n, texto: n })) : el("option", { value: "", texto: "(no hay proyectos todavía)" }));
    const fPers = el("select", { id: "al-pers" }, personas.length ? personas.map((u) => el("option", { value: u.user_id, texto: (u.nombre ? u.nombre + " · " : "") + u.email + " (" + u.rol + ")" })) : el("option", { value: "", texto: "(no hay personas aprobadas)" }));
    const fVig = el("select", { id: "al-vig" }, VIGENCIAS.map(([h, t]) => el("option", { value: String(h), texto: t, selected: h === 12 ? true : null })));
    const cajaProy = el("label", { class: "campo", hidden: true }, el("span", { texto: "Proyecto" }), fProy);
    const cajaPers = el("label", { class: "campo", hidden: true }, el("span", { texto: "Persona" }), fPers);
    const resumen = el("div", { class: "mudo", style: "font-size:13px" });
    const err = el("div", { class: "error", role: "alert" });
    const btn = el("button", { class: "boton", type: "button" }, "Enviar alerta ahora");

    const destinoActual = () => ({ destino_tipo: fDest.value,
      destino_proyecto: fDest.value === "PROYECTO" ? fProy.value : null, destino_usuario: fDest.value === "PERSONA" ? fPers.value : null });
    const actualizarResumen = () => {
      cajaProy.hidden = fDest.value !== "PROYECTO"; cajaPers.hidden = fDest.value !== "PERSONA";
      const n = D.destinatariosAlerta(destinoActual(), est.usuarios).length;
      resumen.textContent = "La recibirán " + n + (n === 1 ? " persona" : " personas") + " (en cuanto abran SONOMIN o si ya lo tienen abierto, en unos 5 segundos).";
    };
    [fDest, fProy, fPers].forEach((s) => s.addEventListener("change", actualizarResumen));
    actualizarResumen();

    let temporizador = null;
    const restablecer = () => { btn.dataset.confirmar = ""; btn.textContent = "Enviar alerta ahora"; };
    btn.addEventListener("click", async () => {
      err.textContent = "";
      const titulo = fTitulo.value.trim(), mensaje = fMsg.value.trim(), d = destinoActual();
      if (!titulo || !mensaje) { err.textContent = "Escriba el título y el mensaje."; return; }
      if (d.destino_tipo === "PROYECTO" && !d.destino_proyecto) { err.textContent = "Elija un proyecto."; return; }
      if (d.destino_tipo === "PERSONA" && !d.destino_usuario) { err.textContent = "Elija una persona."; return; }
      const n = D.destinatariosAlerta(d, est.usuarios).length;
      if (!n) { err.textContent = "Nadie recibiría esta alerta: elija otro destino o asigne proyectos en «Accesos»."; return; }
      if ((d.destino_tipo === "TODOS" || fNivel.value === "URGENTE") && btn.dataset.confirmar !== "1") {
        btn.dataset.confirmar = "1"; btn.textContent = "¿Enviar a " + n + (n === 1 ? " persona" : " personas") + "? Pulse otra vez";
        clearTimeout(temporizador); temporizador = setTimeout(restablecer, 5000); return;
      }
      clearTimeout(temporizador); restablecer();
      btn.disabled = true;
      try {
        await D.enviarAlerta({ titulo, mensaje, nivel: fNivel.value, tipo: d.destino_tipo, proyecto: d.destino_proyecto, usuario: d.destino_usuario, horas: Number(fVig.value) });
        raiz.SON_UI.aviso("Alerta enviada a " + n + (n === 1 ? " persona." : " personas."), "info");
        fTitulo.value = ""; fMsg.value = ""; cuenta.textContent = "0 / 500";
        await recargar();
      } catch (ex) {
        err.textContent = /enviar_alerta|function|schema cache/i.test(ex.message)
          ? "Falta activar las alertas en la nube: ejecute ampliacion_v6_alertas.sql en Supabase › SQL Editor." : "No se pudo enviar: " + ex.message;
      } finally { btn.disabled = false; }
    });

    const plantillas = el("div", { class: "chips" }, PLANTILLAS.map((p) => el("button", { class: "chip", type: "button", style: "cursor:pointer", onclick: () => {
      fTitulo.value = p.titulo; fMsg.value = p.mensaje; fNivel.value = p.nivel; nivelAyuda.textContent = NIVELES[p.nivel].d; cuenta.textContent = p.mensaje.length + " / 500";
    } }, p.t)));

    return el("div", { class: "tarjeta" }, el("h2", { texto: "Nueva alerta" }),
      el("p", { class: "mudo", style: "margin:4px 0 10px", texto: "Plantillas rápidas:" }), plantillas,
      el("div", { class: "formulario", style: "margin-top:12px" },
        el("label", { class: "campo ancho" }, el("span", { texto: "Título (máximo 80 caracteres)" }), fTitulo),
        el("label", { class: "campo ancho" }, el("span", { texto: "Mensaje" }), fMsg, cuenta),
        el("label", { class: "campo" }, el("span", { texto: "Nivel" }), fNivel, nivelAyuda),
        el("label", { class: "campo" }, el("span", { texto: "Vigencia" }), fVig),
        el("label", { class: "campo" }, el("span", { texto: "Enviar a" }), fDest), el("div"),
        cajaProy, cajaPers),
      resumen, err,
      el("div", { class: "fila", style: "margin-top:12px;justify-content:flex-end" }, btn));
  }

  async function montar(cont, S) {
    if (desligar) { desligar(); desligar = null; }
    if (sondeo) { clearInterval(sondeo); sondeo = null; }
    cont.replaceChildren(el("div", { class: "tarjeta" }, el("p", { class: "mudo", texto: "Cargando…" })));
    try { est.usuarios = await D.usuarios(); } catch (e) { est.usuarios = []; }
    const conectados = [...S.vivos.values()].filter((v) => S.conectadoReciente(v)).length;
    refs.lista = el("div");
    const nodo = el("div");
    if (!D.enNube) nodo.appendChild(el("div", { class: "caja-aviso info", texto: "Modo demostración: las alertas se simulan aquí y no llegan a ningún celular." }));
    nodo.appendChild(el("div", { class: "caja-aviso info", texto: "Las alertas llegan al celular en unos 5 segundos mientras SONOMIN esté abierto, midiendo o compartiendo ubicación. Si la app está cerrada, la persona la verá al abrirla (la alerta sigue vigente). Ahora hay " + conectados + " celular(es) conectado(s)." }));
    nodo.appendChild(formulario(S));
    nodo.appendChild(el("h2", { style: "margin:18px 0 6px", texto: "Alertas enviadas" }));
    nodo.appendChild(refs.lista);
    cont.replaceChildren(nodo);
    await recargar();
    desligar = D.escucharAlertas((tipo, fila) => {
      if (!fila) return;
      if (tipo === "alerta" && fila.id) {
        const i = est.alertas.findIndex((x) => x.id === fila.id);
        if (i >= 0) est.alertas[i] = fila; else est.alertas.unshift(fila);
        est.alertas.sort((a, b) => Date.parse(b.creado) - Date.parse(a.creado));
      } else if (tipo === "lectura" && fila.alerta_id) {
        const i = est.lecturas.findIndex((x) => x.alerta_id === fila.alerta_id && x.usuario_id === fila.usuario_id);
        if (i >= 0) est.lecturas[i] = fila; else est.lecturas.push(fila);
      }
      pintarListaPronto();
    });
    // respaldo: si el canal en tiempo real cae, la lista se relee cada 10 s (solo mientras esta pestaña esta a la vista)
    sondeo = setInterval(() => { if (!cont.isConnected || S.vista !== "alertas") return; recargar(); }, 10000);
  }

  raiz.SON_VISTAS.alertas = {
    render: (cont, S) => {
      // Si ya esta dibujada solo se actualiza la lista: llega una medicion nueva y no debe borrar lo que se esta escribiendo.
      if (raiz.SON_VISTAS.alertas.montada && refs.raiz === cont && cont.querySelector("#al-titulo")) { recargar(); return; }
      refs = { raiz: cont };
      montar(cont, S);
    },
  };
})(window);
