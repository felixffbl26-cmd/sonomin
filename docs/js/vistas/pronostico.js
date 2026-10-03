/* Vista PRONOSTICO: tendencia, probabilidad de superar un limite y simulador. */
(function (raiz) {
  "use strict";
  const { el, f0, f1, f2, linea, colorSem, css, fechaCorta } = raiz.SON_G;
  const U = raiz.SON_U, A = raiz.SON_ANALISIS, N = raiz.SON_NORMAS;
  raiz.SON_VISTAS = raiz.SON_VISTAS || {};

  const estado = { clave: "", dias: 30, limite: "ocup", delta: 0, horas: 8 };
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
    const pts = A.porPunto(meds);
    if (!pts.find((p) => p.clave === estado.clave)) estado.clave = pts[0].clave;
    const p = pts.find((x) => x.clave === estado.clave);
    const nodo = el("div");

    // ---------------------------------------------------------------- controles
    const selPunto = el("select", { "aria-label": "Punto" }, pts.map((x) => el("option", { value: x.clave, texto: x.punto + " (" + x.n + ")", selected: x.clave === estado.clave })));
    const selDias = el("select", { "aria-label": "Horizonte" }, [7, 30, 90].map((d) => el("option", { value: d, texto: d + " días", selected: d === estado.dias })));
    const selLim = el("select", { "aria-label": "Límite" }, Object.entries(LIMITES).map(([k, t]) => el("option", { value: k, texto: t, selected: k === estado.limite })));
    selPunto.addEventListener("change", () => { estado.clave = selPunto.value; render(cont, S); });
    selDias.addEventListener("change", () => { estado.dias = Number(selDias.value); render(cont, S); });
    selLim.addEventListener("change", () => { estado.limite = selLim.value; render(cont, S); });
    nodo.appendChild(el("div", { class: "tarjeta" },
      el("h2", { texto: "Pronóstico por punto" }),
      el("p", { class: "sub", texto: "Estadística simple y reproducible: regresión lineal del Leq en el tiempo y probabilidad de superar un límite. No considera cambios en la operación (nueva maquinaria, otro turno, barreras)." }),
      el("div", { class: "filtros-fila", style: "padding:10px 0 0" },
        el("label", { class: "campo" }, el("span", { texto: "Punto" }), selPunto),
        el("label", { class: "campo" }, el("span", { texto: "Horizonte" }), selDias),
        el("label", { class: "campo" }, el("span", { texto: "Límite a evaluar" }), selLim))));

    // ----------------------------------------------------------- pronostico del punto
    const prep = preparar(p, estado.limite);
    const r = A.pronosticoPunto(prep.filas, estado.dias, prep.limite);
    const cuerpo = el("div", { class: "seccion" });
    if (!r.suficiente) {
      cuerpo.appendChild(el("div", { class: "caja-aviso info", texto: r.motivo + " Con " + r.n + " mediciones del punto" + (estado.limite !== "ocup" ? " en ese horario" : "") + " no se estima un pronóstico confiable; la proporción observada que superó el límite fue " + (r.n ? r.k + " de " + r.n : "–") + "." }));
    } else {
      const tr = r.tendencia, pct = (x) => (x * 100).toFixed(1) + " %";
      const signif = tr.suficiente && tr.p < 0.05;
      cuerpo.appendChild(el("div", { class: "rejilla cols-4" },
        U.kpi("Leq medio del punto", f1(r.mu) + " dB(A)", "desviación " + f1(r.sd) + " dB · n = " + r.n, "c-" + N.semaforo(r.mu)),
        U.kpi("Tendencia", tr.suficiente ? (tr.b >= 0 ? "+" : "") + f2(tr.b) + " dB/día" : "–", tr.suficiente ? "IC 95 %: " + f2(tr.ic95[0]) + " a " + f2(tr.ic95[1]) + " · p = " + (tr.p < 0.001 ? "< 0.001" : tr.p.toFixed(3)) + (signif ? " (significativa)" : " (no significativa)") : "datos insuficientes"),
        U.kpi("Nivel esperado en " + estado.dias + " días", f1(r.mediaProy) + " dB(A)", r.usarTendencia ? "usa la tendencia (significativa) · ±" + f1(1.96 * r.sdProy) + " dB al 95 %" : "sin tendencia significativa: se usa el promedio · ±" + f1(1.96 * r.sdProy) + " dB al 95 %", "c-" + N.semaforo(r.mediaProy)),
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
        el("p", { class: "sub", texto: "Puntos: mediciones del punto. Línea naranja: tendencia (continua en lo observado, punteada en lo proyectado). Banda: intervalo de predicción al 95 %. Línea roja: límite evaluado." }), g,
        raiz.SON_G.leyenda([{ color: css("--serie-1"), texto: "Mediciones", caja: true }, { color: css("--serie-2"), texto: "Tendencia / promedio" }, { color: "#d03b3b", texto: prep.etiqueta }])));
      linea(g, {
        series: [{ nombre: "Mediciones", color: css("--serie-1"), soloPuntos: true, puntos: v.map((m) => ({ x: m.ms, y: m.leq, detalle: [m.modo || "", "Lmax " + f1(m.lmax) + " dB(A)"] })) }],
        dominioY: [d0, d1], tiempo: true, alto: 280, xMin: tMin, xMax: tObj,
        banda: { puntos: bandaPuntos, color: css("--serie-2") }, rectas,
        limites: [{ v: prep.limite, etiqueta: prep.limite + " dB(A)", color: "#d03b3b" }],
      });
    }
    nodo.appendChild(cuerpo);

    // --------------------------------------------------- riesgo de todos los puntos
    const filasRiesgo = pts.map((x) => { const pr = preparar(x, estado.limite); return { x, r: A.pronosticoPunto(pr.filas, estado.dias, pr.limite) }; })
      .sort((a, b) => (b.r.suficiente ? b.r.probModelo : -1) - (a.r.suficiente ? a.r.probModelo : -1));
    nodo.appendChild(el("div", { class: "tarjeta seccion" }, el("h2", { texto: "Riesgo de superar el límite en todos los puntos" }),
      el("p", { class: "sub", texto: "Límite: " + LIMITES[estado.limite] + " · horizonte " + estado.dias + " días. Se exigen al menos 10 mediciones por punto." }),
      el("div", { class: "tabla-caja" }, el("table", null,
        el("thead", null, el("tr", null, ["Punto", "n", "Leq medio", "Tendencia dB/día", "Esperado", "Prob. de superar", "Observado"].map((t, i) => el("th", { class: i ? "num" : "", texto: t })))),
        el("tbody", null, filasRiesgo.map(({ x, r: rr }) => rr.suficiente
          ? el("tr", null, el("td", { texto: x.punto }), el("td", { class: "num", texto: String(rr.n) }), el("td", { class: "num", texto: f1(rr.mu) }),
            el("td", { class: "num", texto: rr.tendencia.suficiente ? (rr.tendencia.b >= 0 ? "+" : "") + f2(rr.tendencia.b) + (rr.tendencia.p < 0.05 ? " *" : "") : "–" }),
            el("td", { class: "num", texto: f1(rr.mediaProy) }), el("td", { class: "num c-" + (rr.probModelo >= 0.5 ? "EXCEDE" : rr.probModelo >= 0.1 ? "PRECAUCION" : "CONFORME"), texto: (rr.probModelo * 100).toFixed(1) + " %" }), el("td", { class: "num", texto: rr.k + " de " + rr.n }))
          : el("tr", null, el("td", { texto: x.punto }), el("td", { class: "num", texto: String(rr.n) }), el("td", { class: "mudo", colspan: 5, texto: "datos insuficientes" }))))),
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

  raiz.SON_VISTAS.pronostico = { render };
})(window);
