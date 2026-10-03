/* Vista PROYECTOS: avance de cada proyecto frente a su plan, ritmo, estado en vivo y resultados. */
(function (raiz) {
  "use strict";
  const { el, f1, f0, columnas, fechaHora, fechaCorta, css } = raiz.SON_G;
  const U = raiz.SON_U, A = raiz.SON_ANALISIS, N = raiz.SON_NORMAS, D = raiz.SON_DATOS;
  raiz.SON_VISTAS = raiz.SON_VISTAS || {};

  const DIA = 86400000;
  const diaLima = (ms) => N.horaLima(ms).dia;
  const inicioHoy = () => Date.parse(diaLima(Date.now()) + "T05:00:00Z");
  const fechaTexto = (iso) => (iso ? iso.split("-").reverse().join("/") : "–");

  function resumen(S, nombre) {
    const meds = S.todas.filter((m) => m.proyecto === nombre);
    const v = meds.filter((m) => Number.isFinite(m.leq));
    const meta = S.meta.get(nombre) || {};
    const puntos = A.porPunto(v);
    const ahora = Date.now(), hoy = inicioHoy();
    const activos = S.activos().filter((x) => x.proyecto === nombre);
    const ultima = meds.length ? Math.max(...meds.map((m) => m.ms || 0)) : 0;
    const dias = new Set(meds.map((m) => m.dia)).size;
    const ult7 = meds.filter((m) => (m.ms || 0) >= ahora - 7 * DIA).length;
    const ritmo = ult7 / 7;
    const objP = Number(meta.objetivo_puntos) || 0, objM = Number(meta.objetivo_mediciones) || 0;
    const faltanM = Math.max(0, objM - meds.length);
    const terminoEstimado = objM && faltanM > 0 && ritmo > 0 ? ahora + (faltanM / ritmo) * DIA : null;
    const finPlan = meta.fecha_fin ? Date.parse(meta.fecha_fin + "T23:59:00-05:00") : null;
    const sup = v.filter((m) => m.ambito === "SUPERFICIE" && Number.isFinite(m.limEca));
    const serie = [];
    for (let i = 13; i >= 0; i--) {
      const d = diaLima(ahora - i * DIA);
      serie.push({ x: d, dia: d, valor: meds.filter((m) => m.dia === d).length, n: meds.filter((m) => m.dia === d).length, etiqueta: fechaTexto(d) });
    }
    return {
      nombre, meta, meds, v, puntos, activos, ultima, dias, ritmo, objP, objM, terminoEstimado, finPlan,
      leq: v.length ? A.leqEnergetico(v.map((m) => m.leq), v.map((m) => m.dur)) : NaN,
      sobre85: v.filter((m) => m.leq >= N.LIMITE_OCUPACIONAL).length,
      sobreEca: sup.filter((m) => m.leq > m.limEca).length, nSup: sup.length,
      evaluadores: [...new Set(meds.map((m) => m.evaluador).filter(Boolean))],
      hoy: meds.filter((m) => (m.ms || 0) >= hoy).length,
      avanceP: objP ? Math.min(100, (100 * puntos.length) / objP) : null,
      avanceM: objM ? Math.min(100, (100 * meds.length) / objM) : null,
      serie,
    };
  }

  function estadoDe(r) {
    if (r.activos.length) return { clase: "vivo", texto: "● Midiendo ahora (" + r.activos.length + ")" };
    if (r.hoy) return { clase: "hoy", texto: "Con actividad hoy" };
    if (r.meta.estado && r.meta.estado !== "EN CURSO") return { clase: "", texto: r.meta.estado.charAt(0) + r.meta.estado.slice(1).toLowerCase() };
    return { clase: "", texto: r.ultima ? "Última actividad " + U.hace(r.ultima) : "Sin mediciones aún" };
  }

  function tarjeta(S, r) {
    const est = estadoDe(r);
    const graf = el("div", { style: "margin-top:8px" });
    const cuerpo = el("div", { class: "tarjeta" },
      el("div", { class: "fila", style: "justify-content:space-between;align-items:start" },
        el("div", null, el("h2", { texto: r.nombre }), el("p", { class: "sub", texto: [r.meta.unidad_minera, r.meta.responsable ? "Responsable: " + r.meta.responsable : ""].filter(Boolean).join(" · ") || "Sin datos de plan" })),
        el("span", { class: "estado-proy " + est.clase, texto: est.texto })),
      el("div", { class: "cifras-proy" },
        el("div", null, el("b", { texto: String(r.meds.length) }), el("span", { texto: "mediciones" + (r.objM ? " de " + r.objM : "") })),
        el("div", null, el("b", { texto: String(r.puntos.length) }), el("span", { texto: "puntos" + (r.objP ? " de " + r.objP : "") })),
        el("div", null, el("b", { class: Number.isFinite(r.leq) ? "c-" + N.semaforo(r.leq) : "", texto: Number.isFinite(r.leq) ? f1(r.leq) : "–" }), el("span", { texto: "Leq global dB(A)" }))),
      r.avanceP !== null ? el("div", { style: "margin-top:10px" },
        el("div", { class: "fila", style: "justify-content:space-between;font-size:12.5px" }, el("span", { texto: "Avance de puntos medidos" }), el("b", { texto: f0(r.avanceP) + " %" })),
        el("div", { class: "barra-avance", role: "progressbar", "aria-valuenow": Math.round(r.avanceP), "aria-valuemin": 0, "aria-valuemax": 100 }, el("i", { style: "width:" + r.avanceP + "%" }))) : null,
      r.avanceM !== null ? el("div", { style: "margin-top:8px" },
        el("div", { class: "fila", style: "justify-content:space-between;font-size:12.5px" }, el("span", { texto: "Avance de mediciones" }), el("b", { texto: f0(r.avanceM) + " %" })),
        el("div", { class: "barra-avance" }, el("i", { style: "width:" + r.avanceM + "%;background:var(--serie-1)" }))) : null,
      el("p", { class: "mudo", style: "font-size:12.5px;margin-top:10px", texto:
        "Ritmo: " + f1(r.ritmo) + " mediciones/día (últimos 7 días) · " + r.dias + " día(s) con mediciones" +
        (r.terminoEstimado ? " · al ritmo actual completa la meta el " + fechaHora(r.terminoEstimado).slice(0, 10) : "") +
        (r.finPlan ? " · plan hasta el " + fechaTexto(r.meta.fecha_fin) + (r.terminoEstimado && r.terminoEstimado > r.finPlan ? " (va retrasado)" : "") : "") }),
      el("p", { style: "font-size:13px;margin-top:4px" },
        el("span", { class: r.sobre85 ? "c-EXCEDE" : "c-CONFORME", texto: r.sobre85 + " mediciones ≥ 85 dB(A)" }), " · ",
        el("span", { class: r.sobreEca ? "c-EXCEDE" : "", texto: r.nSup ? r.sobreEca + " de " + r.nSup + " en superficie sobre el ECA" : "sin mediciones de superficie" })),
      el("h3", { style: "margin-top:10px", texto: "Mediciones por día (últimos 14 días)" }), graf,
      r.puntos.length ? el("div", { class: "chips", style: "margin-top:8px" }, r.puntos.slice(0, 6).map((p) => el("span", { class: "chip", title: p.n + " mediciones", texto: p.punto + " · " + f1(p.leq) }))) : null,
      r.activos.length ? el("div", { class: "caja-aviso info", style: "margin-top:10px" }, "Ahora: " + r.activos.map((a) => (a.dispositivo || "Celular") + " en " + (a.punto || "?") + " (" + f0(Number(a.nivel_dba)) + " dB(A))").join(" · ")) : null,
      el("p", { class: "mudo", style: "font-size:12px;margin-top:8px", texto: (r.evaluadores.length ? "Evaluadores: " + r.evaluadores.join(", ") + " · " : "") + (r.ultima ? "última medición " + fechaHora(r.ultima) : "") }),
      el("div", { class: "fila", style: "margin-top:8px" },
        el("button", { class: "boton sec", type: "button", onclick: () => { raiz.SON_UI.filtrarProyecto(r.nombre); raiz.SON_UI.irA("vivo"); } }, "Ver en vivo"),
        el("button", { class: "boton sec", type: "button", onclick: () => { raiz.SON_UI.filtrarProyecto(r.nombre); raiz.SON_UI.irA("estadistica"); } }, "Estadística"),
        S.rol === "admin" ? el("button", { class: "boton sec", type: "button", onclick: () => editar(S, r) }, "Editar plan") : null));
    requestAnimationFrame(() => columnas(graf, { datos: r.serie, dominio: [0, Math.max(4, ...r.serie.map((d) => d.valor))], unidad: "mediciones", alto: 90, etiquetaX: (d) => fechaCorta(Date.parse(d.dia + "T12:00:00-05:00")), colorFn: () => css("--verde") }));
    return cuerpo;
  }

  function editar(S, r) {
    const m = r.meta || {};
    const campo = (id, etq, tipo, valor, extra) => el("label", { class: "campo" + (extra && extra.ancho ? " ancho" : "") }, el("span", { texto: etq }),
      el("input", { id, type: tipo, value: valor ?? "", ...(extra && extra.attrs) }));
    const estado = el("select", { id: "pm-estado" }, ["PLANIFICADO", "EN CURSO", "PAUSADO", "CERRADO"].map((e) => el("option", { value: e, texto: e.charAt(0) + e.slice(1).toLowerCase(), selected: (m.estado || "EN CURSO") === e ? true : null })));
    const err = el("div", { class: "error" });
    const form = el("form", { class: "formulario" },
      campo("pm-unidad", "Unidad minera", "text", m.unidad_minera), campo("pm-resp", "Responsable", "text", m.responsable),
      campo("pm-objp", "Meta de puntos a medir", "number", m.objetivo_puntos, { attrs: { min: 0, step: 1 } }),
      campo("pm-objm", "Meta de mediciones", "number", m.objetivo_mediciones, { attrs: { min: 0, step: 1 } }),
      campo("pm-ini", "Fecha de inicio", "date", m.fecha_inicio), campo("pm-fin", "Fecha de término planificada", "date", m.fecha_fin),
      el("label", { class: "campo" }, el("span", { texto: "Estado" }), estado),
      campo("pm-notas", "Notas", "text", m.notas, { ancho: true }),
      el("div", { class: "ancho" }, err),
      el("div", { class: "ancho fila" }, el("button", { class: "boton", type: "submit" }, "Guardar plan"), el("span", { class: "mudo", style: "font-size:12.5px", texto: "Todos los que tienen acceso verán el cambio al instante." })));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const n = (id) => { const x = form.querySelector("#" + id).value; return x === "" ? null : Number(x); };
      const t = (id) => form.querySelector("#" + id).value.trim() || null;
      try {
        const fila = await D.guardarProyectoMeta({ proyecto: r.nombre, unidad_minera: t("pm-unidad"), responsable: t("pm-resp"), objetivo_puntos: n("pm-objp"), objetivo_mediciones: n("pm-objm"),
          fecha_inicio: t("pm-ini"), fecha_fin: t("pm-fin"), estado: form.querySelector("#pm-estado").value, notas: t("pm-notas") });
        S.meta.set(r.nombre, fila);
        raiz.SON_UI.cerrarDialogo(); raiz.SON_UI.refrescar(); raiz.SON_UI.aviso("Plan del proyecto guardado.", "info");
      } catch (ex) { err.textContent = "No se pudo guardar: " + ex.message; }
    });
    raiz.SON_UI.dialogo("Plan del proyecto · " + r.nombre, form);
  }

  function render(cont, S) {
    const nombres = S.nombresProyectos().filter((n) => !S.filtro.proyecto || n === S.filtro.proyecto);
    const lista = nombres.map((n) => resumen(S, n)).sort((a, b) => (b.activos.length - a.activos.length) || (b.ultima - a.ultima));
    const nodo = el("div");
    nodo.appendChild(el("div", { class: "tarjeta" }, el("h2", { texto: "Avance de los proyectos" }),
      el("p", { class: "sub", texto: "Cada proyecto se arma solo con las mediciones que envían los celulares. El avance se calcula frente a la meta de puntos y de mediciones del plan" + (S.rol === "admin" ? " (pulse «Editar plan» para fijarla)." : ", que define el administrador.") })));
    if (!lista.length) { nodo.appendChild(U.vacio("Todavía no hay proyectos. Aparecerán en cuanto un celular envíe su primera medición.")); cont.replaceChildren(nodo); return; }

    // tabla comparativa
    const filas = lista.map((r) => [r.nombre, estadoDe(r).texto, r.meds.length, r.puntos.length + (r.objP ? " / " + r.objP : ""), r.avanceP === null ? "–" : f0(r.avanceP) + " %",
      Number.isFinite(r.leq) ? f1(r.leq) : "–", r.sobre85, r.nSup ? r.sobreEca + " / " + r.nSup : "–", f1(r.ritmo), r.ultima ? fechaHora(r.ultima) : "–"]);
    const tabla = el("table", null,
      el("thead", null, el("tr", null, ["Proyecto", "Estado", "Mediciones", "Puntos", "Avance", "Leq dB(A)", "≥ 85", "Sobre ECA", "Ritmo/día", "Última"].map((t, i) => el("th", { class: i >= 2 && i <= 8 ? "num" : "", texto: t })))),
      el("tbody", null, filas.map((f) => el("tr", null, f.map((c, i) => el("td", { class: i >= 2 && i <= 8 ? "num" : "", texto: String(c) }))))));
    nodo.appendChild(el("div", { class: "tarjeta seccion" }, el("div", { class: "fila", style: "justify-content:space-between" }, el("h2", { texto: "Comparación" }),
      el("button", { class: "boton sec", type: "button", onclick: () => U.descargar("SONOMIN_proyectos.csv", U.csv(["proyecto", "estado", "mediciones", "puntos", "avance_puntos", "leq_dba", "mediciones_85", "sobre_eca", "ritmo_dia", "ultima"], filas)) }, "Descargar CSV")),
      el("div", { class: "tabla-caja" }, tabla)));
    nodo.appendChild(el("div", { class: "proyectos seccion" }, lista.map((r) => tarjeta(S, r))));
    cont.replaceChildren(nodo);
  }

  raiz.SON_VISTAS.proyectos = { render, tic() {} };
})(window);
