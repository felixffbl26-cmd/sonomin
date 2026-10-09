/* Vista PRONOSTICO: tendencia, probabilidad de superar un limite y simulador. */
(function (raiz) {
  "use strict";
  const { el, f0, f1, f2, linea, colorSem, css, fechaCorta } = raiz.SON_G;
  const U = raiz.SON_U, A = raiz.SON_ANALISIS, N = raiz.SON_NORMAS;
  raiz.SON_VISTAS = raiz.SON_VISTAS || {};

  const estado = { clave: "", dias: 30, limite: "ocup", delta: 0, horas: 8, agrupar: "estacion" };
  const MIN_PRELIMINAR = 5, MIN_FIRME = 10;
  const AGRUPAR = {
    estacion: { t: "Por estación (une P-02-T001, P-02-M004… en P-02)", o: { radioM: 0 } },
    cercanas: { t: "Por estación y lecturas a menos de 15 m", o: { radioM: 15 } },
    fijos: { t: "Solo puntos fijos (criterio estricto)", o: { soloFijos: true } },
  };
  const faltanTexto = (n) => {
    if (n >= MIN_FIRME) return "";
    if (n >= MIN_PRELIMINAR) return "preliminar: faltan " + (MIN_FIRME - n) + " para un resultado firme";
    return "faltan " + (MIN_PRELIMINAR - n) + " mediciones (mínimo " + MIN_PRELIMINAR + ")";
  };
  const LIMITES = {
    ocup: "85 dB(A) · límite ocupacional (8 h)",
    eca_dia: "ECA de la zona · horario diurno",
    eca_noche: "ECA de la zona · horario nocturno",
  };

  // filas y limite segun la opcion elegida
  function preparar(p, opcion) {
    let filas = p.filas, limite = N.LIMITE_OCUPACIONAL, etiqueta = "85 dB(A)";
    if (opcion !== "ocup") {
      const zona = N.ZONAS_ECA[p.zona] || N.ZONAS_ECA.INDUSTRIAL, dia = opcion === "eca_dia";
      filas = p.filas.filter((m) => N.esDiurno(m.ms) === dia);
      limite = dia ? zona.diurno : zona.nocturno;
      etiqueta = "ECA " + zona.nombre.toLowerCase() + " " + (dia ? "diurno" : "nocturno") + " " + limite + " dB(A)";
    }
    return { filas, limite, etiqueta };
  }

  function bajadaNecesaria(nivel, horas) {
    if (N.tiempoPermitidoH(nivel) >= horas) return 0;
    let lo = nivel - 40, hi = nivel;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (N.tiempoPermitidoH(mid) >= horas) lo = mid; else hi = mid; }
    return nivel - lo;
  }

  function render(cont, S) {
    const meds = S.filtradas.filter((m) => m.leq !== null);
    if (!meds.length) { cont.replaceChildren(U.vacio("No hay mediciones con este filtro.")); return; }
    let pts = A.porEstacion(meds, AGRUPAR[estado.agrupar].o);
    if (!pts.length) {
      cont.replaceChildren(el("div", { class: "caja-aviso info", texto: "Con «Solo puntos fijos» no hay mediciones: todas son de recorrido, jornada o monitoreo continuo. Elija «Por estación» o mida en modo Punto fijo." }), guia());
      const sel = selAgrupar(cont, S); cont.prepend(el("div", { class: "tarjeta" }, el("label", { class: "campo" }, el("span", { texto: "Cómo agrupar" }), sel)));
      return;
    }
    pts = pts.sort((a, b) => b.n - a.n || b.leq - a.leq);
    if (!pts.find((p) => p.clave === estado.clave)) estado.clave = pts[0].clave;
    const p = pts.find((x) => x.clave === estado.clave);
    const nodo = el("div");

    // ---------------------------------------------------------------- controles
    const selPunto = el("select", { "aria-label": "Estación" }, pts.map((x) => el("option", { value: x.clave, texto: x.punto + " · " + x.n + " med. · " + x.dias + (x.dias === 1 ? " día" : " días") + (x.n < MIN_PRELIMINAR ? " (insuficiente)" : ""), selected: x.clave === estado.clave })));
    const selDias = el("select", { "aria-label": "Horizonte" }, [7, 30, 90].map((d) => el("option", { value: d, texto: d + " días", selected: d === estado.dias })));
    const selLim = el("select", { "aria-label": "Límite" }, Object.entries(LIMITES).map(([k, t]) => el("option", { value: k, texto: t, selected: k === estado.limite })));
    selPunto.addEventListener("change", () => { estado.clave = selPunto.value; render(cont, S); });
    selDias.addEventListener("change", () => { estado.dias = Number(selDias.value); render(cont, S); });
    selLim.addEventListener("change", () => { estado.limite = selLim.value; render(cont, S); });
    nodo.appendChild(el("div", { class: "tarjeta" },
      el("h2", { texto: "Pronóstico por estación de monitoreo" }),
      el("p", { class: "sub", texto: "Estadística simple y reproducible: regresión lineal del Leq en el tiempo y probabilidad de superar un límite. No considera cambios en la operación (nueva maquinaria, otro turno, barreras)." }),
      el("div", { class: "filtros-fila", style: "padding:10px 0 0" },
        el("label", { class: "campo" }, el("span", { texto: "Cómo agrupar" }), selAgrupar(cont, S)),
        el("label", { class: "campo" }, el("span", { texto: "Estación" }), selPunto),
        el("label", { class: "campo" }, el("span", { texto: "Horizonte" }), selDias),
        el("label", { class: "campo" }, el("span", { texto: "Límite a evaluar" }), selLim))));

    // ----------------------------------------------------------- pronostico del punto
    const prep = preparar(p, estado.limite);
    const r = A.pronosticoPunto(prep.filas, estado.dias, prep.limite, { minN: MIN_PRELIMINAR });
    const cuerpo = el("div", { class: "seccion" });
    if (p.nombres && p.nombres.length > 1) cuerpo.appendChild(el("div", { class: "caja-aviso info", texto: "Esta estación une las lecturas de: " + p.nombres.join(", ") + " (están a menos de 15 m entre sí)." }));
    if (!r.suficiente) {
      cuerpo.appendChild(el("div", { class: "caja-aviso info", texto: "Esta estación tiene " + r.n + (r.n === 1 ? " medición" : " mediciones") + (estado.limite !== "ocup" ? " en ese horario" : "") + "; se necesitan al menos " + MIN_PRELIMINAR + " (y " + MIN_FIRME + " para un resultado firme), tomadas en días distintos. Proporción observada sobre el límite: " + (r.n ? r.k + " de " + r.n : "–") + "." }));
      cuerpo.appendChild(guia());
    } else {
      if (r.n < MIN_FIRME) cuerpo.appendChild(el("div", { class: "caja-aviso", texto: "Resultado preliminar: " + r.n + " mediciones. Con " + MIN_FIRME + " o más (en días distintos) el pronóstico es firme." }));
      const tr = r.tendencia, pct = (x) => (x * 100).toFixed(1) + " %";
      const signif = tr.suficiente && tr.p < 0.05;
      cuerpo.appendChild(el("div", { class: "rejilla cols-4" },
        U.kpi("Leq medio de la estación", f1(r.mu) + " dB(A)", "desviación " + f1(r.sd) + " dB · n = " + r.n, "c-" + N.semaforo(r.mu)),
        U.kpi("Tendencia", tr.suficiente ? (tr.b >= 0 ? "+" : "") + f2(tr.b) + " dB/día" : "–", tr.suficiente ? "IC 95 %: " + f2(tr.ic95[0]) + " a " + f2(tr.ic95[1]) + " · p = " + (tr.p < 0.001 ? "< 0.001" : tr.p.toFixed(3)) + (signif ? " (significativa)" : " (no significativa)") : "datos insuficientes"),
        U.kpi("Nivel esperado en " + estado.dias + " días", f1(r.mediaProy) + " dB(A)", (r.usarTendencia ? "usa la tendencia (significativa)" : r.horizonteLargo && tr.p < 0.05 ? "la tendencia no se extrapola más allá de los " + f0(tr.diasObservados) + " días observados: se usa el promedio" : "sin tendencia significativa: se usa el promedio") + " · ±" + f1(1.96 * r.sdProy) + " dB al 95 %", "c-" + N.semaforo(r.mediaProy)),
        U.kpi("Probabilidad de superar", pct(r.probModelo), "límite: " + prep.etiqueta + " · observado: " + r.k + " de " + r.n + " (" + pct(r.propEmpirica) + ", IC 95 %: " + pct(r.propIC[0]) + " a " + pct(r.propIC[1]) + ")", r.probModelo >= 0.5 ? "c-EXCEDE" : r.probModelo >= 0.1 ? "c-PRECAUCION" : "c-CONFORME")));

      // grafico: puntos + recta + banda
      const g = el("div");
      const v = prep.filas.filter((m) => m.leq !== null && m.ms);
      const tMax = Math.max(...v.map((m) => m.ms)), tMin = Math.min(...v.map((m) => m.ms)), tObj = tMax + estado.dias * 86400000;
      const rectas = [], bandaPuntos = [];
      const muestra = 24;
      for (let i = 0; i <= muestra; i++) {
        const x = tMin + ((tObj - tMin) * i) / muestra, td = (x - (tr.t0 || tMin)) / 86400000;
        let media = r.mu, sd = r.sd;
        if (r.usarTendencia) { media = tr.a + tr.b * td; sd = Math.sqrt(tr.s ** 2 * (1 + 1 / r.n + (td - tr.mx) ** 2 / tr.sxx)); }
        bandaPuntos.push({ x, lo: media - 1.96 * sd, hi: media + 1.96 * sd, m: media });
      }
      for (let i = 0; i < bandaPuntos.length - 1; i++) {
        rectas.push({ x0: bandaPuntos[i].x, y0: bandaPuntos[i].m, x1: bandaPuntos[i + 1].x, y1: bandaPuntos[i + 1].m, color: css("--serie-2"), dash: bandaPuntos[i].x >= tMax });
      }
      const todos = v.map((m) => m.leq).concat(bandaPuntos.flatMap((b) => [b.lo, b.hi]), [prep.limite]);
      const d0 = Math.floor((Math.min(...todos) - 3) / 5) * 5, d1 = Math.ceil((Math.max(...todos) + 3) / 5) * 5;
      cuerpo.appendChild(el("div", { class: "tarjeta seccion" }, el("h2", { texto: "Mediciones, tendencia y pronóstico" }),
        el("p", { class: "sub", texto: "Puntos: mediciones de la estación. Línea naranja: tendencia (continua en lo observado, punteada en lo proyectado). Banda: intervalo de predicción al 95 %. Línea roja: límite evaluado." }), g,
        raiz.SON_G.leyenda([{ color: css("--serie-1"), texto: "Mediciones", caja: true }, { color: css("--serie-2"), texto: "Tendencia / promedio" }, { color: "#e74c3c", texto: prep.etiqueta }])));
      linea(g, {
        series: [{ nombre: "Mediciones", color: css("--serie-1"), soloPuntos: true, puntos: v.map((m) => ({ x: m.ms, y: m.leq, detalle: [m.modo || "", "Lmax " + f1(m.lmax) + " dB(A)"] })) }],
        dominioY: [d0, d1], tiempo: true, alto: 280, xMin: tMin, xMax: tObj,
        banda: { puntos: bandaPuntos, color: css("--serie-2") }, rectas,
        limites: [{ v: prep.limite, etiqueta: prep.limite + " dB(A)", color: "#e74c3c" }],
      });
    }
    nodo.appendChild(cuerpo);

    // --------------------------------------------------- riesgo de todos los puntos
    const filasRiesgo = pts.map((x) => { const pr = preparar(x, estado.limite); return { x, r: A.pronosticoPunto(pr.filas, estado.dias, pr.limite, { minN: MIN_PRELIMINAR }) }; })
      .sort((a, b) => (b.r.suficiente ? b.r.probModelo : -1) - (a.r.suficiente ? a.r.probModelo : -1));
    const listos = filasRiesgo.filter((f) => f.r.suficiente).length;
    nodo.appendChild(el("div", { class: "tarjeta seccion" }, el("h2", { texto: "Riesgo de superar el límite en todas las estaciones" }),
      el("p", { class: "sub", texto: "Límite: " + LIMITES[estado.limite] + " · horizonte " + estado.dias + " días · " + listos + " de " + filasRiesgo.length + " estaciones con datos suficientes (mínimo " + MIN_PRELIMINAR + " mediciones; firme desde " + MIN_FIRME + ")." }),
      el("div", { class: "tabla-caja" }, el("table", null,
        el("thead", null, el("tr", null, ["Estación", "n", "Días", "Leq medio", "Tendencia dB/día", "Esperado", "Prob. de superar", "Observado"].map((t, i) => el("th", { class: i ? "num" : "", texto: t })))),
        el("tbody", null, filasRiesgo.map(({ x, r: rr }) => rr.suficiente
          ? el("tr", null, el("td", null, x.punto, rr.n < MIN_FIRME ? el("div", { class: "faltan", texto: faltanTexto(rr.n) }) : null), el("td", { class: "num", texto: String(rr.n) }), el("td", { class: "num", texto: String(x.dias) }), el("td", { class: "num", texto: f1(rr.mu) }),
            el("td", { class: "num", texto: rr.tendencia.suficiente ? (rr.tendencia.b >= 0 ? "+" : "") + f2(rr.tendencia.b) + (rr.tendencia.p < 0.05 ? " *" : "") : "–" }),
            el("td", { class: "num", texto: f1(rr.mediaProy) }), el("td", { class: "num c-" + (rr.probModelo >= 0.5 ? "EXCEDE" : rr.probModelo >= 0.1 ? "PRECAUCION" : "CONFORME"), texto: (rr.probModelo * 100).toFixed(1) + " %" }), el("td", { class: "num", texto: rr.k + " de " + rr.n }))
          : el("tr", null, el("td", { texto: x.punto }), el("td", { class: "num", texto: String(rr.n) }), el("td", { class: "num", texto: String(x.dias) }),
              el("td", { colspan: 5 }, el("span", { class: "barra-faltan" }, el("i", { style: "width:" + Math.round((100 * rr.n) / MIN_PRELIMINAR) + "%" })), el("span", { class: "faltan", texto: faltanTexto(rr.n) })))))),
        el("p", { class: "mudo", style: "font-size:12px;margin-top:6px", texto: "* tendencia estadísticamente significativa (p < 0.05)." }))));

    // ------------------------------------------------------------------ simulador
    const sim = el("div");
    nodo.appendChild(el("div", { class: "tarjeta seccion" }, el("h2", { texto: "Simulador: ¿qué pasa si cambia el ruido o la exposición?" }),
      el("p", { class: "sub", texto: "Parte del Leq del punto elegido y aplica el Anexo 12 del D.S. 024-2016-EM (dosis D = C / T × 100). Sirve para evaluar controles: silenciadores, barreras, rotación de personal." }), sim));
    function pintarSim() {
      const s = A.simular({ leq: p.leq, deltaDb: estado.delta, horas: estado.horas });
      const baja = bajadaNecesaria(p.leq + estado.delta, estado.horas);
      const rd = el("input", { type: "range", min: -15, max: 15, step: 0.5, value: estado.delta, "aria-label": "Cambio de nivel en dB", style: "width:100%" });
      const rh = el("input", { type: "range", min: 0.5, max: 12, step: 0.5, value: estado.horas, "aria-label": "Horas de exposición", style: "width:100%" });
      rd.addEventListener("input", () => { estado.delta = Number(rd.value); pintarSim(); });
      rh.addEventListener("input", () => { estado.horas = Number(rh.value); pintarSim(); });
      sim.replaceChildren(
        el("div", { class: "rejilla cols-2" },
          el("label", { class: "campo" }, el("span", { texto: "Cambio de nivel: " + (estado.delta >= 0 ? "+" : "") + f1(estado.delta) + " dB" }), rd),
          el("label", { class: "campo" }, el("span", { texto: "Exposición diaria: " + f1(estado.horas) + " h" }), rh)),
        el("div", { class: "rejilla cols-4", style: "margin-top:12px" },
          U.kpi("Nivel resultante", f1(s.nivel) + " dB(A)", "base " + f1(p.leq) + " dB(A) en " + p.punto, "c-" + s.sem),
          U.kpi("Tiempo permitido", N.formatoTiempo(s.permitido), "Anexo 12" + (s.sobreTabla ? " (extrapolado)" : "")),
          U.kpi("Dosis", f1(s.dosis) + " %", s.excedeDosis ? "supera el 100 %" : "no supera el 100 %", s.excedeDosis ? "c-EXCEDE" : "c-CONFORME"),
          U.kpi("Nivel equivalente de 8 h", f1(s.twa) + " dB(A)", "límite 85 dB(A)")),
        baja > 0.05 ? el("div", { class: "caja-aviso", texto: "Para exponerse " + f1(estado.horas) + " h sin pasar el 100 % de dosis, el nivel debería bajar al menos " + f1(baja) + " dB(A) (a " + f1(p.leq + estado.delta - baja) + " dB(A))." }) : el("div", { class: "caja-aviso ok", texto: "Con estos valores la dosis no supera el 100 %." }));
    }
    pintarSim();

    cont.replaceChildren(nodo);
  }

  function selAgrupar(cont, S) {
    const sel = el("select", { "aria-label": "Cómo agrupar" }, Object.entries(AGRUPAR).map(([k, a]) => el("option", { value: k, texto: a.t, selected: k === estado.agrupar ? true : null })));
    sel.addEventListener("change", () => { estado.agrupar = sel.value; estado.clave = ""; render(cont, S); });
    return sel;
  }

  // Que datos necesita el pronostico (respuesta directa a "medi de todo y no sale")
  function guia() {
    return el("div", { class: "tarjeta seccion" }, el("h2", { texto: "¿Qué datos necesita el pronóstico?" }),
      el("ol", { class: "pequeno", style: "margin:8px 0 0;padding-left:20px" },
        el("li", { texto: "Una estación fija de monitoreo: el mismo punto, con el mismo nombre en la app (por ejemplo «P-02 Chancadora») y en el mismo lugar." }),
        el("li", { texto: "Al menos " + MIN_PRELIMINAR + " mediciones de esa estación (" + MIN_FIRME + " para un resultado firme), en días distintos: la tendencia se calcula en dB por día." }),
        el("li", { texto: "Mejor en modo Punto fijo, de 5 a 15 minutos cada una y en la misma condición de operación (mismo turno y equipos funcionando). Los recorridos sirven para el mapa de ruido; si mide en recorrido o continuo, aquí se unen por estación." }),
        el("li", { texto: "Para evaluar el ECA por horario se necesitan esas mediciones separadas en diurno (07:01–22:00) y nocturno." })),
      el("p", { class: "mudo pequeno", style: "margin-top:8px", texto: "Ejemplo: medir P-02 lunes, miércoles y viernes durante dos semanas da 6 mediciones en 6 días: pronóstico preliminar. Con cuatro semanas, firme." }));
  }

  raiz.SON_VISTAS.pronostico = { render };
})(window);
