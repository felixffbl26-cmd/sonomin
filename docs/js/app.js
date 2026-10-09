/* SONOMIN · nucleo del tablero: sesion, filtros, pestanas, tiempo real y alertas. */
(function (raiz) {
  "use strict";
  const { el } = raiz.SON_G;
  const D = raiz.SON_DATOS, A = raiz.SON_ANALISIS, N = raiz.SON_NORMAS;
  const $ = (s) => document.querySelector(s);

  const S = {
    todas: [], filtradas: [], filtro: { proyecto: "", dias: 0, ambito: "", modo: "" },
    vivos: new Map(), vivoRecibido: new Map(), hist: new Map(), rastro: new Map(),
    eventos: [], meta: new Map(), informes: [], papelera: [], auditoria: null, vista: "vivo", estadoTR: "", estadoOk: false, rol: "",
    alertas: { sonido: true, aviso: false }, sucias: new Set(), cargando: false,
  };
  raiz.SON_S = S;
  const RECIENTE_MS = 12000;

  // ------------------------------------------------------------ utilidades UI
  const dlg = $("#dialogo");
  raiz.SON_UI = Object.assign(raiz.SON_UI || {}, {
    dialogo(titulo, nodo) {
      $("#dialogo-titulo").textContent = titulo;
      $("#dialogo-cuerpo").replaceChildren(nodo);
      if (!dlg.open) dlg.showModal();
      dlg.scrollTop = 0;
    },
    cerrarDialogo() { if (dlg.open) dlg.close(); },
    verFoto(url, pie) { $("#visor-img").src = url; $("#visor-pie").textContent = pie || ""; $("#visor").showModal(); },
    irA: (v) => cambiarVista(v),
    filtrarProyecto(p) { $("#f-proyecto").value = p; S.filtro.proyecto = $("#f-proyecto").value; pintar(true); },
    refrescar: () => pintar(true),
    aviso: (texto, tipo) => mostrarAviso(texto, tipo),
  });
  $("#dialogo-cerrar").addEventListener("click", () => dlg.close());
  $("#visor").addEventListener("click", () => $("#visor").close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  /** Celulares que estan midiendo ahora (dato nuevo hace menos de 12 s). */
  S.activos = function () {
    const ahora = Date.now();
    return [...S.vivos.values()].filter((v) => v.midiendo && ahora - (S.vivoRecibido.get(v.id) || 0) < RECIENTE_MS);
  };
  S.conectadoReciente = function (v) { return Date.now() - (S.vivoRecibido.get(v.id) || 0) < RECIENTE_MS; };

  // -------------------------------------------------------------------- tema
  // claro, oscuro o igual que el sistema; se recuerda en este navegador
  function aplicarTema(t) {
    if (t === "claro" || t === "oscuro") document.documentElement.setAttribute("data-tema", t);
    else document.documentElement.removeAttribute("data-tema");
    try { localStorage.setItem("sonomin_tema", t || ""); } catch (e) { /* sin almacenamiento */ }
    document.querySelectorAll(".selector-tema button").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.tema || "") === (t || ""))));
  }
  let temaInicial = "";
  try { temaInicial = localStorage.getItem("sonomin_tema") || ""; } catch (e) { /* ignorar */ }
  aplicarTema(temaInicial);
  document.querySelectorAll(".selector-tema button").forEach((b) => b.addEventListener("click", () => {
    aplicarTema(b.dataset.tema || "");
    if (!$("#app").hidden) pintar(true);
  }));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!document.documentElement.getAttribute("data-tema") && !$("#app").hidden) pintar(true);
  });

  // ----------------------------------------------------------------- alertas
  try { const g = JSON.parse(localStorage.getItem("sonomin_alertas") || "null"); if (g) Object.assign(S.alertas, g); } catch (e) { /* ignorar */ }
  function guardarAlertas() { try { localStorage.setItem("sonomin_alertas", JSON.stringify(S.alertas)); } catch (e) { /* ignorar */ } }
  function textoBotonAlertas() {
    document.querySelectorAll(".accion-alertas").forEach((b) => {
      b.querySelector("span").textContent = S.alertas.sonido ? "Alertas: sí" : "Alertas: no";
      b.setAttribute("aria-pressed", String(S.alertas.sonido));
      b.title = "Sonido y notificación cuando una medición llegue a 85 dB(A) o supere el ECA";
    });
  }
  document.querySelectorAll(".accion-alertas").forEach((b) => b.addEventListener("click", async () => {
    S.alertas.sonido = !S.alertas.sonido;
    if (S.alertas.sonido && "Notification" in raiz && Notification.permission === "default") {
      try { S.alertas.aviso = (await Notification.requestPermission()) === "granted"; } catch (e) { /* sin permiso */ }
    } else if ("Notification" in raiz) S.alertas.aviso = Notification.permission === "granted";
    guardarAlertas(); textoBotonAlertas();
    mostrarAviso(S.alertas.sonido ? "Alertas activadas: sonará un aviso cuando una medición llegue a 85 dB(A) o supere el ECA." : "Alertas desactivadas.", "info");
  }));
  textoBotonAlertas();

  let audio = null;
  function pitido() {
    try {
      audio = audio || new (raiz.AudioContext || raiz.webkitAudioContext)();
      [0, 0.22].forEach((t) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = "sine"; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, audio.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.18);
        o.connect(g).connect(audio.destination); o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.2);
      });
    } catch (e) { /* el navegador no permite sonido sin interaccion previa */ }
  }

  function mostrarAviso(texto, tipo) {
    const caja = $("#avisos");
    const n = el("div", { class: "aviso-flotante " + (tipo || ""), role: "status" }, el("span", { texto }), el("button", { type: "button", "aria-label": "Cerrar aviso", texto: "×", onclick: () => n.remove() }));
    caja.prepend(n);
    while (caja.children.length > 4) caja.lastChild.remove();
    setTimeout(() => n.remove(), tipo === "grave" ? 15000 : 6000);
  }

  function alertar(e) {
    const texto = (e.tipo === "ALERTA_ECA" ? "Supera el ECA · " : "≥ 85 dB(A) · ") + (e.punto || "") + " · " + Number(e.nivel_dba).toFixed(1) + " dB(A) · " + (e.proyecto || "");
    mostrarAviso(texto, "grave");
    if (!S.alertas.sonido) return;
    pitido();
    if (S.alertas.aviso && "Notification" in raiz && Notification.permission === "granted" && document.hidden) {
      try { new Notification("SONOMIN · alerta de ruido", { body: texto, icon: "img/sonomin_192.png", tag: "sonomin-" + e.id }); } catch (x) { /* ignorar */ }
    }
  }

  // ----------------------------------------------------------------- filtros
  function aplicarFiltros() {
    const f = S.filtro;
    const limite = f.dias === 1 ? Date.parse(N.horaLima(Date.now()).dia + "T05:00:00Z") : f.dias > 0 ? Date.now() - f.dias * 86400000 : 0;
    S.filtradas = S.todas.filter((m) =>
      (!f.proyecto || m.proyecto === f.proyecto) && (!f.ambito || m.ambito === f.ambito) && (!f.modo || m.modo === f.modo) && (m.ms || 0) >= limite);
    $("#f-resumen").textContent = S.filtradas.length + " de " + S.todas.length + " mediciones";
  }
  S.nombresProyectos = function () {
    return [...new Set(S.todas.map((m) => m.proyecto).concat([...S.meta.keys()], [...S.vivos.values()].map((v) => v.proyecto)).filter(Boolean))].sort();
  };
  function llenarProyectos() {
    const sel = $("#f-proyecto"), prev = sel.value;
    const nombres = S.nombresProyectos();
    sel.replaceChildren(el("option", { value: "", texto: "Todos los proyectos" }), nombres.map((n) => el("option", { value: n, texto: n })));
    sel.value = nombres.includes(prev) ? prev : "";
    S.filtro.proyecto = sel.value;
  }
  $("#f-proyecto").addEventListener("change", (e) => { S.filtro.proyecto = e.target.value; pintar(true); });
  $("#f-ambito").addEventListener("change", (e) => { S.filtro.ambito = e.target.value; pintar(true); });
  $("#f-modo").addEventListener("change", (e) => { S.filtro.modo = e.target.value; pintar(true); });
  $("#f-periodo").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    S.filtro.dias = Number(b.dataset.dias);
    document.querySelectorAll("#f-periodo button").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    pintar(true);
  });

  // ---------------------------------------------------------------- pestanas
  const TITULOS = {
    vivo: ["En vivo", "Celulares midiendo ahora, dónde están y la actividad al segundo"],
    mapa: ["Mapa", "Mediciones georreferenciadas, mapa de ruido y celulares en campo"],
    proyectos: ["Proyectos", "Avance de cada proyecto frente a su plan"],
    mediciones: ["Mediciones", "Registro completo, detalle, fotos y papelera"],
    analisis: ["Análisis", "Evaluación ocupacional y ambiental por punto"],
    estadistica: ["Estadística", "Descriptiva, distribución, ANOVA y correlaciones"],
    pronostico: ["Pronóstico", "Tendencia por estación de monitoreo y riesgo de superar el límite"],
    penalidades: ["Penalidades", "Infracciones posibles y multas referenciales"],
    informes: ["Informes", "Informe técnico al instante, Excel y descargas"],
    accesos: ["Accesos", "Cuentas, roles y proyectos asignados"],
    registro: ["Registro", "Auditoría: quién hizo qué y cuándo"],
  };
  const EN_BARRA = ["vivo", "mapa", "mediciones", "analisis"];
  function cambiarVista(v) {
    if (!raiz.SON_VISTAS[v] || ((v === "accesos" || v === "registro") && S.rol !== "admin")) v = "vivo";
    S.vista = v;
    document.querySelectorAll(".pestana").forEach((p) => p.setAttribute("aria-selected", p.dataset.vista === v ? "true" : "false"));
    document.querySelectorAll(".vista").forEach((s) => { s.hidden = s.id !== "vista-" + v; });
    const t = TITULOS[v] || [v, ""];
    $("#titulo-vista").textContent = t[0]; $("#sub-vista").textContent = t[1];
    $("main").dataset.titulo = t[0];
    document.title = t[0] + " · SONOMIN";
    $("#boton-mas").classList.toggle("activo", !EN_BARRA.includes(v));
    if ($("#hoja-mas").open) $("#hoja-mas").close();
    try { history.replaceState(null, "", "#" + v); } catch (e) { /* ignorar */ }
    pintar(false);
  }
  document.querySelectorAll(".pestana").forEach((p) => p.addEventListener("click", () => { cambiarVista(p.dataset.vista); if (p.closest(".hoja, .inferior")) scrollTo(0, 0); }));
  $("#boton-mas").addEventListener("click", () => $("#hoja-mas").showModal());
  $("#cerrar-mas").addEventListener("click", () => $("#hoja-mas").close());
  $("#hoja-mas").addEventListener("click", (e) => { if (e.target === $("#hoja-mas")) $("#hoja-mas").close(); });
  $("#boton-filtros").addEventListener("click", () => {
    const abierto = $("#filtros").classList.toggle("abierto");
    $("#boton-filtros").setAttribute("aria-expanded", String(abierto));
  });

  // Dibuja la vista activa; las demas se marcan como sucias y se dibujan al abrirlas.
  function pintar(todasSucias) {
    aplicarFiltros();
    if (todasSucias) Object.keys(raiz.SON_VISTAS).forEach((k) => S.sucias.add(k));
    const v = S.vista;
    if (S.sucias.has(v) || !raiz.SON_VISTAS[v].montada) {
      S.sucias.delete(v);
      try { raiz.SON_VISTAS[v].render($("#vista-" + v), S); raiz.SON_VISTAS[v].montada = true; }
      catch (e) { console.error(e); $("#vista-" + v).replaceChildren(el("div", { class: "caja-aviso grave", texto: "No se pudo dibujar esta sección: " + e.message })); }
    }
  }
  const avisarVista = (metodo) => { const v = raiz.SON_VISTAS[S.vista]; if (v && v.montada && v[metodo]) try { v[metodo](S); } catch (e) { console.error(e); } };

  // ------------------------------------------------------------- tiempo real
  function textoEstado() {
    const act = S.activos();
    const punto = $("#punto-estado");
    if (act.length) {
      punto.className = "punto-estado midiendo";
      $("#texto-estado").textContent = act.length === 1 ? "Midiendo ahora · " + (act[0].punto || "") : act.length + " celulares midiendo ahora";
      return;
    }
    punto.className = "punto-estado" + (S.estadoOk ? " vivo" : "");
    $("#texto-estado").textContent = S.estadoTR || "Conectando…";
  }
  setInterval(() => { textoEstado(); avisarVista("tic"); }, 3000);

  // Una medicion en la papelera no entra en ningun calculo: va a S.papelera (solo la ve el administrador)
  function ubicarMedicion(m) {
    S.todas = S.todas.filter((x) => x.uuid !== m.uuid);
    S.papelera = S.papelera.filter((x) => x.uuid !== m.uuid);
    if (m.eliminada) S.papelera.unshift(m);
    else { S.todas.push(m); S.todas.sort((a, b) => (b.ms || 0) - (a.ms || 0)); }
  }
  function alMedicionCambio(fila) {
    const previa = S.todas.find((x) => x.uuid === fila.uuid) || S.papelera.find((x) => x.uuid === fila.uuid);
    ubicarMedicion(A.normalizar({ ...(previa || {}), ...fila }));
    pintar(true);
  }
  function alMedicionBorrada(uuid) {
    S.todas = S.todas.filter((x) => x.uuid !== uuid);
    S.papelera = S.papelera.filter((x) => x.uuid !== uuid);
    pintar(true);
  }
  raiz.SON_UI.ubicarMedicion = (m) => { ubicarMedicion(A.normalizar(m)); pintar(true); };
  raiz.SON_UI.quitarMedicion = alMedicionBorrada;

  function alMedicion(fila) {
    if (S.todas.some((m) => m.uuid === fila.uuid) || S.papelera.some((m) => m.uuid === fila.uuid)) return;
    if (fila.eliminada) { S.papelera.unshift(A.normalizar(fila)); return; }
    S.todas.unshift(A.normalizar(fila));
    if (!S.nombresProyectos().length || ![...document.querySelectorAll("#f-proyecto option")].some((o) => o.value === fila.proyecto)) llenarProyectos();
    // la vista activa se redibuja al instante; las demas cuando se abran
    Object.keys(raiz.SON_VISTAS).forEach((k) => S.sucias.add(k));
    if (S.vista === "vivo") { aplicarFiltros(); S.sucias.delete("vivo"); avisarVista("alMedicion"); } else pintar(false);
  }

  function alVivo(fila, esRespaldo) {
    const prev = S.vivos.get(fila.id);
    // se cuenta desde que llega un dato NUEVO (no depende de que el reloj de esta PC coincida con el del servidor)
    const nuevo = !prev || prev.actualizado !== fila.actualizado || prev.ts !== fila.ts;
    if (!nuevo && esRespaldo) return;
    if (nuevo && (!esRespaldo || (fila.actualizado && Math.abs(Date.now() - Date.parse(fila.actualizado)) < RECIENTE_MS))) S.vivoRecibido.set(fila.id, Date.now());
    if (!S.vivoRecibido.has(fila.id)) S.vivoRecibido.set(fila.id, 0);
    S.vivos.set(fila.id, { ...(prev || {}), ...fila });
    if (fila.midiendo && Number.isFinite(Number(fila.nivel_dba))) {
      const h = S.hist.get(fila.id) || [];
      h.push({ x: Date.now(), y: Number(fila.nivel_dba), punto: fila.punto });
      const corte = Date.now() - 300000;
      while (h.length && h[0].x < corte) h.shift();
      S.hist.set(fila.id, h);
    }
    const lat = Number(fila.latitud), lon = Number(fila.longitud);
    if (fila.midiendo && fila.latitud !== null && fila.latitud !== undefined && Number.isFinite(lat) && Number.isFinite(lon)) {
      const r = S.rastro.get(fila.id) || [];
      const u = r[r.length - 1];
      if (!u || Math.abs(u[0] - lat) > 0.00002 || Math.abs(u[1] - lon) > 0.00002) r.push([lat, lon, Number(fila.nivel_dba), Date.now()]);
      if (r.length > 4000) r.splice(0, r.length - 4000);
      S.rastro.set(fila.id, r);
    }
    textoEstado();
    avisarVista("actualizar");
  }

  function alEvento(e) {
    if (S.eventos.some((x) => x.id === e.id)) return;
    S.eventos.unshift(e);
    if (S.eventos.length > 1500) S.eventos.length = 1500;
    if (e.tipo === "ALERTA_OCUPACIONAL" || e.tipo === "ALERTA_ECA") alertar(e);
    avisarVista("alEvento");
  }

  function alProyectoMeta(nuevo, viejo) {
    if (nuevo) S.meta.set(nuevo.proyecto, nuevo);
    else if (viejo && viejo.proyecto) S.meta.delete(viejo.proyecto);
    S.sucias.add("proyectos");
    if (S.vista === "proyectos") pintar(false);
  }

  // ------------------------------------------------------------------ arranque
  let desuscribir = null;
  async function cargarTodo() {
    S.cargando = true;
    try {
      const [filas, informes, vivos, eventos, posiciones, meta] = await Promise.all([
        D.cargarMediciones(), D.cargarInformes().catch(() => []), D.cargarVivos().catch(() => []), D.cargarEventos().catch(() => []),
        D.cargarPosiciones().catch(() => []), D.cargarProyectosMeta().catch(() => []),
      ]);
      const normal = filas.map(A.normalizar);
      S.todas = normal.filter((m) => !m.eliminada);
      S.papelera = normal.filter((m) => m.eliminada);
      S.informes = informes;
      S.eventos = eventos;
      S.meta = new Map(meta.map((m) => [m.proyecto, m]));
      vivos.forEach((v) => {
        S.vivos.set(v.id, v);
        const fresco = v.actualizado && Math.abs(Date.now() - Date.parse(v.actualizado)) < RECIENTE_MS;
        S.vivoRecibido.set(v.id, fresco ? Date.now() : 0);
      });
      posiciones.forEach((p) => {
        const r = S.rastro.get(p.dispositivo_id) || [];
        r.push([p.latitud, p.longitud, p.nivel_dba, Date.parse(p.creado)]);
        S.rastro.set(p.dispositivo_id, r);
      });
      if (D._marcas) D._marcas(Math.max(0, ...eventos.map((e) => e.id || 0)), Math.max(0, ...filas.map((f) => f.inicio_ms || 0)));
      llenarProyectos();
    } finally { S.cargando = false; }
  }

  async function entrarAlTablero(sesion) {
    $("#pantalla-login").hidden = true;
    $("#app").hidden = false;
    $("#aviso-demo").hidden = D.enNube;
    S.rol = sesion.rol || D.rol || "";
    document.querySelectorAll('[data-solo="admin"]').forEach((n) => { n.hidden = S.rol !== "admin"; });
    const nombreRol = { admin: "Administrador · ve todo", lector: "Lector", celular: "Celular" }[S.rol] || S.rol;
    document.querySelectorAll(".usuario-correo").forEach((n) => { n.textContent = sesion.email || ""; });
    document.querySelectorAll(".usuario-rol").forEach((n) => { n.textContent = nombreRol; });
    S.misProyectos = null;
    $("#aviso-proyectos").hidden = true;
    if (S.rol && S.rol !== "admin") {
      try { S.misProyectos = await D.misProyectos(); } catch (e) { S.misProyectos = null; }
      if (S.misProyectos) {
        const txt = S.misProyectos.length ? nombreRol + " · " + S.misProyectos.length + (S.misProyectos.length === 1 ? " proyecto" : " proyectos") : nombreRol + " · sin proyectos";
        document.querySelectorAll(".usuario-rol").forEach((n) => { n.textContent = txt; n.title = S.misProyectos.join(", "); });
        if (!S.misProyectos.length) {
          $("#aviso-proyectos").textContent = "Su cuenta está aprobada, pero el administrador todavía no le asignó ningún proyecto. Por seguridad solo verá datos de los proyectos que le asignen" + (S.rol === "celular" ? " (y las mediciones que envíe este celular)." : ".");
          $("#aviso-proyectos").hidden = false;
        }
      }
    }
    try { await cargarTodo(); }
    catch (e) { $("#vista-vivo").replaceChildren(el("div", { class: "caja-aviso grave", texto: "No se pudieron cargar los datos: " + e.message })); }
    const inicial = (location.hash || "#vivo").slice(1);
    cambiarVista(inicial);
    if (desuscribir) desuscribir();
    desuscribir = D.suscribir({
      onMedicion: alMedicion, onVivo: alVivo, onEvento: alEvento, onProyectoMeta: alProyectoMeta,
      onMedicionCambio: alMedicionCambio, onMedicionBorrada: alMedicionBorrada,
      onAuditoria: (f) => { if (S.auditoria) S.auditoria.unshift(f); const v = raiz.SON_VISTAS.registro; if (S.vista === "registro" && v && v.alAuditoria) v.alAuditoria(S, f); },
      onInforme: (f) => { S.informes.unshift(f); S.sucias.add("informes"); if (S.vista === "informes") pintar(false); mostrarAviso("Nuevo informe disponible: " + f.titulo, "info"); },
      onEstado: (t, ok) => { S.estadoTR = t; S.estadoOk = ok; textoEstado(); },
    });
    // registro de ingreso (despues de conectar el tiempo real): una vez por pestana abierta; recargar no cuenta como otro ingreso
    let yaRegistrado = false;
    try { yaRegistrado = sessionStorage.getItem("sonomin_ingreso") === (sesion.email || "demo"); } catch (e) { /* sin almacenamiento */ }
    if (!yaRegistrado) {
      D.registrar("INGRESO", { pagina: location.pathname, pantalla: screen.width + "x" + screen.height, navegador: navigator.userAgent.slice(0, 140) });
      try { sessionStorage.setItem("sonomin_ingreso", sesion.email || "demo"); } catch (e) { /* ignorar */ }
    }
  }

  // ------------------------------------------------------- login y registro
  function mostrarFormulario(cual) {
    $("#form-login").hidden = cual !== "login";
    $("#form-registro").hidden = cual !== "registro";
    $("#login-error").textContent = ""; $("#registro-error").textContent = ""; $("#registro-ok").hidden = true;
  }
  $("#ir-registro").addEventListener("click", () => mostrarFormulario("registro"));
  $("#ir-login").addEventListener("click", () => mostrarFormulario("login"));

  $("#form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#login-error"); err.textContent = "";
    const boton = e.target.querySelector("button[type=submit]"); boton.disabled = true;
    try {
      const s = await D.entrar($("#login-correo").value.trim(), $("#login-clave").value);
      await entrarAlTablero(s);
    } catch (ex) { err.textContent = ex.message; }
    finally { boton.disabled = false; }
  });

  $("#form-registro").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#registro-error"); err.textContent = "";
    const clave = $("#reg-clave").value;
    if (clave.length < 8) { err.textContent = "La contraseña debe tener al menos 8 caracteres."; return; }
    if (clave !== $("#reg-clave2").value) { err.textContent = "Las dos contraseñas no coinciden."; return; }
    const boton = e.target.querySelector("button[type=submit]"); boton.disabled = true;
    try {
      const r = await D.solicitarAcceso({ nombre: $("#reg-nombre").value.trim(), correo: $("#reg-correo").value.trim(), clave, motivo: $("#reg-motivo").value.trim() });
      e.target.reset();
      const ok = $("#registro-ok");
      ok.textContent = r.demo ? "En modo demostración no se crean cuentas. Con la nube conectada, su solicitud llegaría al administrador." :
        (r.confirmar ? "Listo. Revise su correo y confirme la cuenta (mire también en spam). Después, el administrador debe aprobar su acceso; cuando lo haga podrá entrar." :
          "Solicitud enviada. Cuando el administrador apruebe su acceso podrá entrar con su correo y contraseña.");
      ok.hidden = false;
    } catch (ex) { err.textContent = ex.message; }
    finally { boton.disabled = false; }
  });

  document.querySelectorAll(".accion-salir").forEach((b) => b.addEventListener("click", async () => {
    if ($("#hoja-mas").open) $("#hoja-mas").close();
    if (desuscribir) { desuscribir(); desuscribir = null; }
    await D.salir();
    S.todas = []; S.papelera = []; S.auditoria = null; S.vivos.clear(); S.hist.clear(); S.rastro.clear(); S.eventos = [];
    try { sessionStorage.removeItem("sonomin_ingreso"); } catch (e) { /* ignorar */ }
    Object.values(raiz.SON_VISTAS).forEach((v) => { v.montada = false; });
    if (D.enNube) { $("#app").hidden = true; $("#pantalla-login").hidden = false; $("#login-clave").value = ""; mostrarFormulario("login"); }
    else location.reload();
  }));

  (async function iniciar() {
    let s = null;
    try { s = await D.sesionActual(); } catch (e) { /* sin sesion */ }
    if (s) {
      try {
        if (D.enNube) {
          const rol = await D.miRol();
          if (!rol) {
            await D.salir();
            $("#pantalla-login").hidden = false;
            $("#login-error").textContent = "Su cuenta está confirmada, pero el administrador todavía no le dio acceso.";
            return;
          }
          D.rol = rol; s.rol = rol;
        }
        await entrarAlTablero(s);
        return;
      } catch (e) { await D.salir(); }
    }
    $("#pantalla-login").hidden = false;
  })();
})(window);
