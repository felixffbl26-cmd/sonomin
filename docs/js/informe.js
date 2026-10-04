/* SONOMIN · informe tecnico al instante (vista previa imprimible -> PDF) y libro Excel.
 * Usa las mediciones del filtro actual. Formato de informe tecnico: logos, datos del documento,
 * secciones con numeros romanos, tablas con lineas, evidencia fotografica en orden cronologico y firmas.
 * Todos los textos que vienen de la base de datos se insertan con textContent. */
(function (raiz) {
  "use strict";
  const { el, sv, f0, f1, f2, fechaHora } = raiz.SON_G;
  const A = raiz.SON_ANALISIS, N = raiz.SON_NORMAS, D = raiz.SON_DATOS, U = raiz.SON_U;

  const ROMANOS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV"];
  const TXT_SEM = { CONFORME: "Conforme", PRECAUCION: "Precaución (≥ 82)", EXCEDE: "Excede (≥ 85)" };
  const MODOS = { PUNTUAL: "Punto fijo", RECORRIDO: "Recorrido", JORNADA: "Jornada (dosimetría)", CONTINUO: "Monitoreo continuo" };
  const MAX_FOTOS = 80, MAX_ANEXO = 600;
  const dos = (n) => String(n).padStart(2, "0");

  function codigoDocumento() {
    const h = N.horaLima(Date.now());
    return "INF-SONOMIN-" + h.dia.replace(/-/g, "") + "-" + dos(h.h) + dos(h.m);
  }
  function fechaLarga(ms) {
    const h = N.horaLima(ms), meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const [a, m, d] = h.dia.split("-").map(Number);
    return d + " de " + meses[m - 1] + " de " + a;
  }

  // ------------------------------------------------------------ calculos
  function preparar(S) {
    const meds = S.filtradas.filter((m) => Number.isFinite(m.leq)).slice().sort((a, b) => (a.ms || 0) - (b.ms || 0));
    const puntos = A.porPunto(meds);
    const d = meds.length ? A.descriptiva(meds) : { n: 0 };
    const proyectos = [...new Set(meds.map((m) => m.proyecto))];
    const evaluadores = [...new Set(meds.map((m) => m.evaluador).filter(Boolean))];
    const sup = meds.filter((m) => m.ambito === "SUPERFICIE" && Number.isFinite(m.limEca));
    const calibradas = meds.filter((m) => m.calibrado === true).length;
    const modos = {}; meds.forEach((m) => { modos[m.modo || "?"] = (modos[m.modo || "?"] || 0) + 1; });
    const ocup = puntos.map((p) => {
      const t = N.tiempoPermitidoH(p.leq), dosis = N.dosisPct(p.leq, 8);
      return { ...p, t, dosis, twa: N.twa8h(dosis), sobreTabla: N.sobreTabla(p.leq) };
    });
    // ECA por punto y turno
    const ecaMap = new Map();
    sup.forEach((m) => {
      const turno = N.esDiurno(m.ms) ? "Diurno" : "Nocturno", k = m.punto + "||" + turno;
      if (!ecaMap.has(k)) ecaMap.set(k, { punto: m.punto, turno, zona: m.zona_eca, limite: m.limEca, filas: [] });
      ecaMap.get(k).filas.push(m);
    });
    const eca = [...ecaMap.values()].map((g) => {
      const leq = A.leqEnergetico(g.filas.map((m) => m.leq), g.filas.map((m) => m.dur));
      return { ...g, n: g.filas.length, leq, supera: leq > g.limite, sobre: g.filas.filter((m) => m.leq > m.limEca).length };
    }).sort((a, b) => a.punto.localeCompare(b.punto) || a.turno.localeCompare(b.turno));
    const anova = A.anova(puntos.map((p) => p.filas.map((m) => m.leq)));
    const riesgo = puntos.map((p) => ({ p, r: A.pronosticoPunto(p.filas, 30, N.LIMITE_OCUPACIONAL) })).filter((x) => x.r.suficiente);
    const conFotos = meds.filter((m) => m.fotos && m.fotos.length);
    const ms = meds.map((m) => m.ms).filter(Boolean);
    return { meds, puntos, d, proyectos, evaluadores, sup, calibradas, modos, ocup, eca, anova, riesgo, conFotos,
      desde: ms.length ? Math.min(...ms) : null, hasta: ms.length ? Math.max(...ms) : null,
      leqGlobal: meds.length ? A.leqEnergetico(meds.map((m) => m.leq), meds.map((m) => m.dur)) : NaN };
  }

  // ------------------------------------------------------- piezas visuales
  const tabla = (cab, filas, clasesNum) => el("table", { class: "inf-tabla" },
    el("thead", null, el("tr", null, cab.map((c, i) => el("th", { class: clasesNum && clasesNum.includes(i) ? "num" : "", texto: c })))),
    el("tbody", null, filas.map((f) => el("tr", null, f.map((c, i) => el("td", { class: clasesNum && clasesNum.includes(i) ? "num" : "", texto: c === null || c === undefined ? "–" : String(c) }))))));

  function seccion(num, titulo, ...contenido) {
    return el("section", { class: "inf-seccion" }, el("h2", { texto: ROMANOS[num] + ". " + titulo }), ...contenido);
  }
  const parrafo = (t) => el("p", { texto: t });

  // Barras horizontales del Leq por punto (SVG estatico, imprime igual en cualquier pantalla)
  function svgBarras(puntos) {
    const W = 680, fila = 20, sep = 6, izq = 190, der = 60, sup = 18;
    const lista = puntos.slice(0, 30), H = sup + lista.length * (fila + sep) + 24;
    const d0 = Math.max(0, Math.floor((Math.min(...lista.map((p) => p.leq)) - 10) / 10) * 10), d1 = Math.max(100, Math.ceil(Math.max(...lista.map((p) => p.leq)) / 10) * 10);
    const x = (v) => izq + ((v - d0) / (d1 - d0)) * (W - izq - der);
    const s = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Leq por punto" });
    for (let t = d0; t <= d1; t += 10) {
      s.appendChild(sv("line", { x1: x(t), x2: x(t), y1: sup - 4, y2: H - 22, stroke: "#d9d9d9", "stroke-width": 0.8 }));
      s.appendChild(sv("text", { x: x(t), y: H - 8, "text-anchor": "middle", "font-size": 10, fill: "#555" }, String(t)));
    }
    lista.forEach((p, i) => {
      const y = sup + i * (fila + sep), color = p.leq >= 85 ? "#b42318" : p.leq >= 82 ? "#c98a00" : "#2f6f3e";
      s.appendChild(sv("text", { x: izq - 6, y: y + fila / 2 + 4, "text-anchor": "end", "font-size": 10.5, fill: "#222" }, p.punto.length > 30 ? p.punto.slice(0, 29) + "…" : p.punto));
      s.appendChild(sv("rect", { x: izq, y, width: Math.max(1, x(p.leq) - izq), height: fila, fill: color }));
      s.appendChild(sv("text", { x: x(p.leq) + 4, y: y + fila / 2 + 4, "font-size": 10.5, "font-weight": 700, fill: "#222" }, f1(p.leq)));
    });
    [[82, "#c98a00", "4 3", "82 acción"], [85, "#b42318", null, "85 límite"]].forEach(([v, c, dash, etq], i) => {
      if (v <= d0 || v >= d1) return;
      s.appendChild(sv("line", { x1: x(v), x2: x(v), y1: sup - 6, y2: H - 22, stroke: c, "stroke-width": 1.4, "stroke-dasharray": dash }));
      s.appendChild(sv("text", { x: x(v) + (i ? 3 : -3), y: 10, "text-anchor": i ? "start" : "end", "font-size": 9.5, fill: c }, etq));
    });
    return s;
  }

  // Leq por hora del dia (columnas)
  function svgPerfil(meds) {
    const bins = A.perfilHorario(meds);
    const W = 680, H = 200, izq = 36, der = 8, sup = 10, inf = 24;
    const vals = bins.filter((b) => b.n).map((b) => b.leq);
    if (!vals.length) return el("p", { texto: "Sin datos." });
    const d0 = Math.floor((Math.min(...vals) - 5) / 10) * 10, d1 = Math.ceil((Math.max(...vals) + 2) / 10) * 10;
    const y = (v) => sup + (1 - (v - d0) / (d1 - d0)) * (H - sup - inf), ancho = (W - izq - der) / 24;
    const s = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Leq por hora del día" });
    for (let t = d0; t <= d1; t += 10) {
      s.appendChild(sv("line", { x1: izq, x2: W - der, y1: y(t), y2: y(t), stroke: "#d9d9d9", "stroke-width": 0.8 }));
      s.appendChild(sv("text", { x: izq - 4, y: y(t) + 3, "text-anchor": "end", "font-size": 9.5, fill: "#555" }, String(t)));
    }
    bins.forEach((b, h) => {
      const cx = izq + ancho * h + ancho / 2;
      if (h % 2 === 0) s.appendChild(sv("text", { x: cx, y: H - 8, "text-anchor": "middle", "font-size": 9.5, fill: "#555" }, String(h)));
      if (!b.n) return;
      s.appendChild(sv("rect", { x: cx - ancho * 0.35, y: y(b.leq), width: ancho * 0.7, height: y(d0) - y(b.leq), fill: b.leq >= 85 ? "#b42318" : b.leq >= 82 ? "#c98a00" : "#3b6ea8" }));
    });
    if (85 > d0 && 85 < d1) s.appendChild(sv("line", { x1: izq, x2: W - der, y1: y(85), y2: y(85), stroke: "#b42318", "stroke-width": 1.2 }));
    return s;
  }

  // ------------------------------------------------------------ informe
  function construir(S, X, opciones) {
    const hoy = Date.now(), codigo = codigoDocumento();
    const p = S.filtro;
    const alcanceTexto = [p.proyecto || "Todos los proyectos", p.ambito ? (p.ambito === "INTERIOR" ? "interior mina" : "superficie") : "superficie e interior", p.modo ? MODOS[p.modo] : "todos los modos"].join(" · ");
    const doc = el("article", { class: "informe" });
    let n = 0;

    // Encabezado
    doc.appendChild(el("header", { class: "inf-cab" },
      el("div", { class: "inf-logos" }, el("img", { src: "img/logo_una.png", alt: "UNA Puno" }), el("img", { src: "img/fim_logo.png", alt: "FIM" })),
      el("div", { class: "inf-inst" }, el("div", { texto: "UNIVERSIDAD NACIONAL DEL ALTIPLANO · PUNO" }), el("div", { texto: "Facultad de Ingeniería de Minas" }), el("div", { texto: "Sistema SONOMIN · Monitoreo de ruido en minería" })),
      el("div", { class: "inf-codigo" }, el("div", { texto: codigo }), el("div", { texto: fechaLarga(hoy) }))));
    doc.appendChild(el("h1", { class: "inf-titulo", texto: "INFORME TÉCNICO DE MONITOREO DE RUIDO" }));
    doc.appendChild(el("p", { class: "inf-subtitulo", texto: X.proyectos.length === 1 ? X.proyectos[0] : X.proyectos.length + " proyectos" }));
    doc.appendChild(tabla(["Dato", "Detalle"], [
      ["Código del documento", codigo],
      ["Fecha de emisión", fechaLarga(hoy) + ", " + fechaHora(hoy).slice(11) + " (hora de Lima)"],
      ["Proyecto(s)", X.proyectos.join("; ") || "–"],
      ["Periodo de las mediciones", X.desde ? fechaHora(X.desde) + " a " + fechaHora(X.hasta) : "–"],
      ["Alcance (filtro aplicado)", alcanceTexto + (p.dias ? " · últimos " + (p.dias === 1 ? "hoy" : p.dias + " días") : "")],
      ["Mediciones / puntos", X.meds.length + " mediciones en " + X.puntos.length + " puntos"],
      ["Evaluador(es)", X.evaluadores.join("; ") || "–"],
      ["Idea y dirección", "Ing. Lesmes Gabriel Calsina Paricahua"],
      ["Desarrollo del sistema", "Felix Fernando Bautista Layme"],
    ]));

    // I. Objetivo
    doc.appendChild(seccion(n++, "OBJETIVO",
      parrafo("Evaluar los niveles de presión sonora registrados con el sistema SONOMIN en los puntos de monitoreo del alcance indicado, compararlos con los criterios de la normativa peruana de seguridad y salud ocupacional en minería y con los estándares de calidad ambiental para ruido, e identificar los puntos que requieren medidas de control.")));

    // II. Base normativa
    doc.appendChild(seccion(n++, "BASE NORMATIVA",
      tabla(["Norma", "Alcance", "Criterio aplicado"], [
        ["D.S. N° 024-2016-EM y modificatoria D.S. N° 023-2017-EM, Anexo 12", "Exposición ocupacional a ruido en minería", "85 dB(A) para 8 h; tasa de intercambio de 3 dB; nivel de acción 82 dB(A)"],
        ["D.S. N° 024-2016-EM, Guía N° 1", "Cálculo de dosis", "D = Σ (C / T) × 100 %; nivel equivalente de 8 h = 85 + 10·log10(D/100)"],
        ["D.S. N° 085-2003-PCM", "Estándares de calidad ambiental (ECA) para ruido, exterior", "Industrial 80/70, comercial 70/60, residencial 60/50, protección especial 50/40 dB(A) (diurno 07:01–22:00 / nocturno 22:01–07:00)"],
      ])));

    // III. Metodologia
    const modosTxt = Object.entries(X.modos).map(([k, v]) => (MODOS[k] || k) + ": " + v).join("; ");
    doc.appendChild(seccion(n++, "METODOLOGÍA Y EQUIPOS",
      parrafo("Las mediciones se realizaron con teléfonos inteligentes con la aplicación SONOMIN, que calcula el nivel sonoro continuo equivalente (Leq) con ponderación frecuencial A y respuesta rápida (125 ms), además de Lmax, Lmin y los percentiles L10, L50 y L90. Cada medición registra automáticamente la posición (GPS en WGS84 convertido a UTM, o punto de control topográfico en interior mina), la fecha y hora, y una fotografía de evidencia con los datos impresos."),
      parrafo("Modos de medición empleados: " + (modosTxt || "–") + ". Mediciones con el equipo calibrado contra un sonómetro patrón: " + X.calibradas + " de " + X.meds.length + (X.calibradas < X.meds.length ? ". Las mediciones sin calibrar tienen carácter referencial." : ".")),
      parrafo("Las mediciones movidas a la papelera por el administrador no forman parte de este informe.")));

    // IV. Resumen
    const sem = A.cumplimiento(X.meds);
    doc.appendChild(seccion(n++, "RESUMEN DE RESULTADOS",
      tabla(["Indicador", "Valor"], [
        ["Leq energético global (ponderado por duración)", f1(X.leqGlobal) + " dB(A)"],
        ["Nivel máximo registrado (Lmax)", f1(Math.max(...X.meds.map((m) => m.lmax ?? m.leq))) + " dB(A)"],
        ["Mediciones ≥ 85 dB(A) (límite ocupacional)", X.d.sobre85 + " de " + X.d.n + " (" + f1((100 * X.d.sobre85) / X.d.n) + " %)"],
        ["Mediciones entre 82 y 85 dB(A) (nivel de acción)", String(sem.sem.PRECAUCION)],
        ["Puntos que exceden 85 dB(A) (Leq del punto)", X.puntos.filter((q) => q.leq >= 85).length + " de " + X.puntos.length],
        ["Mediciones de superficie comparadas con el ECA", sem.nEca ? sem.sobreEca + " de " + sem.nEca + " superan el ECA" : "ninguna"],
      ], [1])));

    // V. Resultados por punto
    doc.appendChild(seccion(n++, "RESULTADOS POR PUNTO DE MONITOREO",
      tabla(["Punto", "Ámbito", "n", "Leq dB(A)", "Mín", "Máx", "Desv.", "% ≥ 85", "Condición"],
        X.puntos.map((q) => [q.punto, q.ambito === "INTERIOR" ? "Interior" : "Superficie", q.n, f1(q.leq), f1(q.min), f1(q.max), Number.isFinite(q.sd) ? f2(q.sd) : "–", f0(q.pctSobreLimite), TXT_SEM[q.sem]]), [2, 3, 4, 5, 6, 7]),
      el("figure", { class: "inf-figura" }, svgBarras(X.puntos), el("figcaption", { texto: "Figura 1. Leq energético por punto de monitoreo frente al nivel de acción (82 dB(A)) y al límite ocupacional (85 dB(A))." }))));

    // VI. Ocupacional
    doc.appendChild(seccion(n++, "EVALUACIÓN OCUPACIONAL (D.S. N° 024-2016-EM)",
      parrafo("Para cada punto se calcula el tiempo de exposición permitido según el Anexo 12 y la dosis que recibiría un trabajador expuesto 8 horas al Leq del punto. Una dosis mayor a 100 % indica que se supera el límite."),
      tabla(["Punto", "Leq dB(A)", "Tiempo permitido", "Dosis en 8 h", "Nivel equiv. 8 h", "Condición"],
        X.ocup.map((q) => q.leq < N.NIVEL_ACCION
          ? [q.punto, f1(q.leq), "Sin límite (bajo 82 dB(A))", "< 50 %", "< 82 dB(A)", "Conforme"]
          : [q.punto, f1(q.leq), N.formatoTiempo(q.t) + (q.sobreTabla ? " *" : ""), f0(q.dosis) + " %", f1(q.twa) + " dB(A)", q.dosis > 100 ? "Supera el límite" : "Nivel de acción"]), [1, 3, 4]),
      el("p", { class: "inf-nota", texto: "Bajo 82 dB(A) el Anexo 12 no fija tiempo máximo de exposición; la dosis de 8 h resulta menor al 50 %." }),
      X.ocup.some((q) => q.sobreTabla) ? el("p", { class: "inf-nota", texto: "* Nivel fuera de la tabla del Anexo 12: tiempo extrapolado con la tasa de intercambio de 3 dB." }) : null));

    // VII. Ambiental
    doc.appendChild(seccion(n++, "EVALUACIÓN AMBIENTAL (ECA PARA RUIDO, D.S. N° 085-2003-PCM)",
      X.eca.length ? tabla(["Punto", "Turno", "Zona", "n", "Leq dB(A)", "ECA dB(A)", "Resultado"],
        X.eca.map((g) => [g.punto, g.turno, (N.ZONAS_ECA[g.zona] || {}).nombre || g.zona || "–", g.n, f1(g.leq), f0(g.limite), g.supera ? "Supera en " + f1(g.leq - g.limite) + " dB" : "Cumple"]), [3, 4, 5])
        : parrafo("No hay mediciones de superficie con zona ECA en el alcance de este informe."),
      parrafo("El ECA es un referente de calidad ambiental exterior; su superación no constituye por sí sola una infracción (Ley N° 28611, art. 31.4), pero orienta las medidas de control y los compromisos del instrumento de gestión ambiental.")));

    // VIII. Estadistica
    const an = X.anova;
    doc.appendChild(seccion(n++, "ANÁLISIS ESTADÍSTICO",
      tabla(["Estadístico", "Valor"], [
        ["Número de mediciones", String(X.d.n)], ["Media aritmética", f1(X.d.media) + " dB(A)"], ["Desviación estándar", f2(X.d.sd) + " dB"],
        ["Intervalo de confianza 95 % de la media", Number.isFinite(X.d.ic95[0]) ? f1(X.d.ic95[0]) + " a " + f1(X.d.ic95[1]) + " dB(A)" : "–"],
        ["Percentiles 10 / 50 / 90", f1(X.d.p10) + " / " + f1(X.d.mediana) + " / " + f1(X.d.p90) + " dB(A)"],
        ["Mínimo / máximo", f1(X.d.min) + " / " + f1(X.d.max) + " dB(A)"],
        ["ANOVA entre puntos", an.suficiente ? "F(" + an.glb + ", " + an.glw + ") = " + f2(an.F) + "; p " + (an.p < 0.001 ? "< 0,001" : "= " + an.p.toFixed(3)) + "; η² = " + f2(an.eta2) + (an.p < 0.05 ? " (diferencias significativas)" : " (sin diferencias significativas)") : "datos insuficientes"],
      ], [1]),
      el("figure", { class: "inf-figura" }, svgPerfil(X.meds), el("figcaption", { texto: "Figura 2. Leq energético por hora del día (hora de Lima); la línea roja marca 85 dB(A)." }))));

    // IX. Tendencia y riesgo
    doc.appendChild(seccion(n++, "TENDENCIA Y RIESGO A 30 DÍAS",
      X.riesgo.length ? tabla(["Punto", "n", "Tendencia", "Nivel esperado", "P(≥ 85 dB(A))", "Base"],
        X.riesgo.map(({ p: q, r }) => [q.punto, r.n, r.tendencia.suficiente ? (r.tendencia.b >= 0 ? "+" : "") + f2(r.tendencia.b) + " dB/día" + (r.tendencia.p < 0.05 ? " (significativa)" : " (no significativa)") : "–",
          f1(r.mediaProy) + " dB(A)", f0(100 * r.probModelo) + " %", r.usarTendencia ? "tendencia" : "media histórica"]), [1, 3, 4])
        : parrafo("Se necesitan al menos 10 mediciones por punto para estimar la tendencia y el riesgo."),
      el("p", { class: "inf-nota", texto: "Modelo estadístico (regresión lineal con intervalo de predicción, o distribución normal de la media histórica cuando la tendencia no es significativa). Es una estimación, no una medición." })));

    // X. Evidencia fotografica
    const fotosSec = seccion(n++, "EVIDENCIA FOTOGRÁFICA",
      parrafo("Fotografías tomadas automáticamente por la aplicación al terminar cada medición, en orden cronológico. Cada pie de foto proviene del registro de la medición correspondiente."));
    const rejilla = el("div", { class: "inf-fotos" });
    const fotos = X.conFotos.slice(-MAX_FOTOS);
    fotos.forEach((m, i) => {
      const img = el("img", { alt: "Foto de " + m.punto, "data-ruta": m.fotos[0] });
      rejilla.appendChild(el("figure", null, el("div", { class: "inf-foto-caja" }, img),
        el("figcaption", { texto: "Foto " + (i + 1) + ". " + m.punto + " · " + fechaHora(m.ms) + " · Leq " + f1(m.leq) + " dB(A)" + (m.este !== null ? " · E " + f0(m.este) + " N " + f0(m.norte) : "") + " · " + m.proyecto })));
    });
    if (X.conFotos.length > MAX_FOTOS) fotosSec.appendChild(el("p", { class: "inf-nota", texto: "Se incluyen las " + MAX_FOTOS + " fotografías más recientes de " + X.conFotos.length + "." }));
    fotosSec.appendChild(fotos.length ? rejilla : parrafo("Las mediciones del alcance no tienen fotografías."));
    doc.appendChild(fotosSec);

    // XI. Conclusiones
    const exceden = X.puntos.filter((q) => q.leq >= 85), accion = X.puntos.filter((q) => q.leq >= 82 && q.leq < 85);
    const ecaSupera = X.eca.filter((g) => g.supera);
    const concl = [];
    concl.push("Se evaluaron " + X.meds.length + " mediciones en " + X.puntos.length + " puntos" + (X.desde ? ", entre el " + fechaHora(X.desde).slice(0, 10) + " y el " + fechaHora(X.hasta).slice(0, 10) : "") + "; el Leq energético global fue de " + f1(X.leqGlobal) + " dB(A).");
    concl.push(exceden.length ? exceden.length + " punto(s) superan el límite ocupacional de 85 dB(A): " + exceden.map((q) => q.punto + " (" + f1(q.leq) + ")").join(", ") + "." : "Ningún punto supera el límite ocupacional de 85 dB(A) en su Leq energético.");
    if (accion.length) concl.push(accion.length + " punto(s) se encuentran entre el nivel de acción (82 dB(A)) y el límite: " + accion.map((q) => q.punto + " (" + f1(q.leq) + ")").join(", ") + ".");
    if (X.eca.length) concl.push(ecaSupera.length ? "En superficie, " + ecaSupera.length + " combinación(es) de punto y turno superan el ECA: " + ecaSupera.map((g) => g.punto + " " + g.turno.toLowerCase() + " (" + f1(g.leq) + " frente a " + f0(g.limite) + ")").join(", ") + "." : "En superficie, todos los puntos cumplen el ECA aplicable.");
    if (an.suficiente) concl.push(an.p < 0.05 ? "El nivel sonoro difiere significativamente entre puntos (ANOVA, p " + (an.p < 0.001 ? "< 0,001" : "= " + an.p.toFixed(3)) + "): el punto de medición explica el " + f0(100 * an.eta2) + " % de la variación." : "No se encontraron diferencias significativas entre puntos (ANOVA).");
    const sube = X.riesgo.filter(({ r }) => r.usarTendencia && r.tendencia.b > 0);
    if (sube.length) concl.push("Presentan tendencia creciente significativa: " + sube.map(({ p: q, r }) => q.punto + " (+" + f2(r.tendencia.b) + " dB/día)").join(", ") + ".");
    if (X.calibradas < X.meds.length) concl.push((X.meds.length - X.calibradas) + " mediciones se hicieron con el equipo sin calibrar; sus resultados son referenciales.");
    doc.appendChild(seccion(n++, "CONCLUSIONES", el("ol", { class: "inf-lista" }, concl.map((c) => el("li", { texto: c })))));

    // XII. Recomendaciones
    const rec = [];
    if (exceden.length) rec.push("En los puntos que superan 85 dB(A), aplicar la jerarquía de controles del D.S. N° 024-2016-EM: eliminación o sustitución de la fuente, controles de ingeniería (encapsulamiento, silenciadores, barreras), controles administrativos (rotación y reducción del tiempo de exposición) y protección auditiva con atenuación suficiente.");
    if (exceden.length || accion.length) rec.push("Señalizar las áreas con nivel igual o mayor a 82 dB(A) e incluir al personal expuesto en la vigilancia médica (audiometrías).");
    if (ecaSupera.length) rec.push("Revisar los compromisos del instrumento de gestión ambiental para los puntos de superficie que superan el ECA y evaluar medidas de mitigación hacia los receptores.");
    if (sube.length) rec.push("Investigar la causa del aumento sostenido del nivel en los puntos con tendencia creciente (desgaste de equipos, nuevas fuentes, cambios de operación).");
    if (X.calibradas < X.meds.length) rec.push("Calibrar los celulares contra un sonómetro patrón antes de la siguiente campaña y repetir con sonómetro tipo 1 o 2 las mediciones que sustenten decisiones.");
    rec.push("Mantener el monitoreo periódico con SONOMIN para seguir la evolución y verificar la eficacia de los controles.");
    doc.appendChild(seccion(n++, "RECOMENDACIONES", el("ol", { class: "inf-lista" }, rec.map((r) => el("li", { texto: r })))));

    // Firmas
    doc.appendChild(el("div", { class: "inf-firmas" },
      el("div", null, el("div", { class: "inf-linea" }), el("div", { texto: "Elaborado por" }), el("div", { class: "inf-nota", texto: X.evaluadores[0] || "Evaluador" })),
      el("div", null, el("div", { class: "inf-linea" }), el("div", { texto: "Revisado por" }), el("div", { class: "inf-nota", texto: "Ing. Lesmes Gabriel Calsina Paricahua" }))));

    // Anexo
    if (opciones.anexo) {
      const filas = X.meds.slice(-MAX_ANEXO).map((m) => [fechaHora(m.ms), m.punto, m.ambito === "INTERIOR" ? "Int." : "Sup.", MODOS[m.modo] || m.modo || "", f1(m.leq), f1(m.lmax), f0(m.dur), m.este !== null ? f0(m.este) : "–", m.norte !== null ? f0(m.norte) : "–", m.calibrado ? "Sí" : "No"]);
      doc.appendChild(el("section", { class: "inf-seccion inf-anexo" }, el("h2", { texto: "ANEXO A. REGISTRO DE MEDICIONES" }),
        X.meds.length > MAX_ANEXO ? el("p", { class: "inf-nota", texto: "Se listan las " + MAX_ANEXO + " mediciones más recientes de " + X.meds.length + "; el Excel adjunto contiene todas." }) : null,
        tabla(["Fecha y hora", "Punto", "Ámb.", "Modo", "Leq", "Lmax", "Dur. s", "Este", "Norte", "Cal."], filas, [4, 5, 6, 7, 8])));
    }
    doc.appendChild(el("p", { class: "inf-nota inf-pie", texto: "Documento generado por el sistema SONOMIN el " + fechaHora(hoy) + " (hora de Lima) a partir de las mediciones registradas en la nube. Los resultados obtenidos con teléfonos inteligentes son referenciales y no sustituyen a un sonómetro certificado ni a una determinación de la autoridad competente." }));
    return { doc, codigo, fotos };
  }

  async function cargarFotos(doc, alProgreso) {
    const imgs = [...doc.querySelectorAll("img[data-ruta]")];
    if (!imgs.length) return;
    const urls = await D.urlFotos(imgs.map((i) => i.dataset.ruta));
    let listas = 0;
    await Promise.all(imgs.map((img) => new Promise((ok) => {
      const url = urls.get(img.dataset.ruta);
      const fin = () => { listas++; alProgreso(listas, imgs.length); ok(); };
      if (!url) { img.replaceWith(el("div", { class: "inf-sin-foto", texto: "La foto aún no llega desde el celular" })); fin(); return; }
      img.addEventListener("load", fin, { once: true });
      img.addEventListener("error", () => { img.replaceWith(el("div", { class: "inf-sin-foto", texto: "No se pudo cargar la foto" })); fin(); }, { once: true });
      img.src = url;
    })));
  }

  // ---------------------------------------------------------------- Excel
  function libroExcel(S, X) {
    const fh = (ms) => (ms ? fechaHora(ms) : "");
    const hojas = [
      { nombre: "Resumen", columnas: ["Indicador", "Valor"], filas: [
        ["Proyecto(s)", X.proyectos.join("; ")], ["Periodo", X.desde ? fh(X.desde) + " a " + fh(X.hasta) : ""], ["Mediciones", X.meds.length], ["Puntos", X.puntos.length],
        ["Leq energético global dB(A)", +f1(X.leqGlobal)], ["Mediciones >= 85 dB(A)", X.d.sobre85 || 0], ["Mediciones >= 82 dB(A)", X.d.sobre82 || 0],
        ["Media aritmética dB(A)", +f1(X.d.media)], ["Desviación estándar dB", +f2(X.d.sd)], ["Generado", fh(Date.now())]] },
      { nombre: "Mediciones", columnas: ["uuid", "Proyecto", "Fecha y hora (Lima)", "Punto", "Ámbito", "Modo", "Fuente", "Este", "Norte", "Cota", "Zona UTM", "Latitud", "Longitud", "Duración s", "Leq dB(A)", "Lmax", "Lmin", "L10", "L50", "L90", "Zona ECA", "Límite ECA", "Dosis %", "Calibrado", "Evaluador", "Fotos"],
        filas: X.meds.map((m) => [m.uuid, m.proyecto, fh(m.ms), m.punto, m.ambito, m.modo, m.fuente_ruido || "", m.este, m.norte, m.cota, m.zona_utm || "", m.lat, m.lon, m.dur, m.leq, m.lmax, m.lmin, m.l10, m.l50, m.l90, m.zona_eca || "", m.limEca, m.dosis, m.calibrado === true, m.evaluador || "", m.fotos.length]) },
      { nombre: "Por punto", columnas: ["Proyecto", "Punto", "Ámbito", "n", "Leq dB(A)", "Mín", "Máx", "Desv. est.", "% >= 85", "Este", "Norte", "Condición"],
        filas: X.puntos.map((q) => [q.proyecto, q.punto, q.ambito, q.n, +f1(q.leq), q.min, q.max, Number.isFinite(q.sd) ? +f2(q.sd) : null, +f1(q.pctSobreLimite), q.este, q.norte, TXT_SEM[q.sem]]) },
      { nombre: "Ocupacional", columnas: ["Punto", "Leq dB(A)", "Tiempo permitido h", "Dosis 8 h %", "Nivel equivalente 8 h dB(A)", "Condición"],
        filas: X.ocup.map((q) => q.leq < N.NIVEL_ACCION ? [q.punto, +f1(q.leq), "sin límite", "< 50", "< 82", "Conforme"]
          : [q.punto, +f1(q.leq), +q.t.toFixed(3), +f1(q.dosis), +f1(q.twa), q.dosis > 100 ? "Supera el límite" : "Nivel de acción"]) },
      { nombre: "ECA", columnas: ["Punto", "Turno", "Zona", "n", "Leq dB(A)", "ECA dB(A)", "Resultado"],
        filas: X.eca.map((g) => [g.punto, g.turno, g.zona || "", g.n, +f1(g.leq), g.limite, g.supera ? "Supera" : "Cumple"]) },
    ];
    return raiz.SON_XLSX.crear(hojas);
  }

  function descargarBytes(nombre, bytes, tipo) {
    const blob = new Blob([bytes], { type: tipo });
    const a = el("a", { href: URL.createObjectURL(blob), download: nombre });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  function descargarExcel(S) {
    const X = preparar(S);
    if (!X.meds.length) { raiz.SON_UI.aviso("No hay mediciones con el filtro actual.", "grave"); return; }
    descargarBytes(codigoDocumento() + ".xlsx", libroExcel(S, X), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    D.registrar("EXPORTACION_EXCEL", { filas: X.meds.length, proyecto: S.filtro.proyecto || null });
  }

  // ------------------------------------------------------------ vista previa
  async function abrir(S, opciones = { anexo: true }) {
    const X = preparar(S);
    if (!X.meds.length) { raiz.SON_UI.aviso("No hay mediciones con el filtro actual: ajuste el proyecto o el periodo.", "grave"); return; }
    const { doc, codigo, fotos } = construir(S, X, opciones);
    const estado = el("span", { class: "inf-estado", texto: fotos.length ? "Cargando fotos 0/" + fotos.length + "…" : "Listo" });
    const imprimir = el("button", { class: "boton", type: "button", disabled: fotos.length ? true : null, onclick: () => { document.title = codigo; window.print(); } }, "Imprimir / Guardar PDF");
    const capa = el("div", { id: "informe-capa", role: "dialog", "aria-label": "Vista previa del informe técnico" },
      el("div", { class: "informe-barra" },
        el("b", { texto: "Vista previa · " + codigo }), estado,
        el("div", { class: "fila" }, imprimir,
          el("button", { class: "boton sec", type: "button", onclick: () => descargarExcel(S) }, "Descargar Excel"),
          el("button", { class: "boton sec", type: "button", onclick: cerrar }, "Cerrar"))),
      el("div", { class: "informe-hoja" }, doc));
    const tituloPrevio = document.title;
    function cerrar() { capa.remove(); document.body.classList.remove("imprimiendo-informe"); document.title = tituloPrevio; }
    document.body.appendChild(capa);
    document.body.classList.add("imprimiendo-informe");
    capa.querySelector(".informe-hoja").focus && capa.scrollTo(0, 0);
    D.registrar("INFORME_GENERADO", { codigo, proyecto: S.filtro.proyecto || null, mediciones: X.meds.length, puntos: X.puntos.length, fotos: fotos.length });
    try {
      await cargarFotos(doc, (k, t) => { estado.textContent = "Cargando fotos " + k + "/" + t + "…"; });
      estado.textContent = "Listo para imprimir. En el cuadro de impresión elija «Guardar como PDF».";
    } finally { imprimir.disabled = false; }
  }

  raiz.SON_INFORME = { abrir, descargarExcel, _preparar: preparar };
})(window);
