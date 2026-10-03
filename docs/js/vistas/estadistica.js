/* Vista ESTADISTICA: descriptiva, distribucion, rangos por punto, mapa de calor, ANOVA y correlaciones. */
(function (raiz) {
  "use strict";
  const { el, sv, f1, f2, f0, columnas, css, colorSem, montar, mostrarSug, ocultarSug, ticks } = raiz.SON_G;
  const U = raiz.SON_U, A = raiz.SON_ANALISIS, N = raiz.SON_NORMAS;
  raiz.SON_VISTAS = raiz.SON_VISTAS || {};

  const pTexto = (p) => (p < 0.001 ? "p < 0,001" : "p = " + p.toFixed(3).replace(".", ","));
  const veredicto = (p) => (p < 0.05 ? "La diferencia es estadísticamente significativa (95 % de confianza)." : "No hay evidencia suficiente de diferencia (95 % de confianza).");

  function tablaDescriptiva(d) {
    const filas = [
      ["Número de mediciones", String(d.n)], ["Media aritmética", f1(d.media) + " dB(A)"], ["Leq energético (ponderado por duración)", f1(d.leq) + " dB(A)"],
      ["Desviación estándar", f2(d.sd) + " dB"], ["Coeficiente de variación", f1(d.cv) + " %"],
      ["Intervalo de confianza 95 % de la media", Number.isFinite(d.ic95[0]) ? f1(d.ic95[0]) + " a " + f1(d.ic95[1]) + " dB(A)" : "–"],
      ["Mínimo / Máximo", f1(d.min) + " / " + f1(d.max) + " dB(A)"], ["Percentil 10 / 90", f1(d.p10) + " / " + f1(d.p90) + " dB(A)"],
      ["Cuartil 1 / Mediana / Cuartil 3", f1(d.q1) + " / " + f1(d.mediana) + " / " + f1(d.q3) + " dB(A)"], ["Rango intercuartil", f2(d.iqr) + " dB"],
      ["Mediciones ≥ 82 dB(A) (nivel de acción)", d.sobre82 + " (" + f1((100 * d.sobre82) / d.n) + " %)"],
      ["Mediciones ≥ 85 dB(A) (límite)", d.sobre85 + " (" + f1((100 * d.sobre85) / d.n) + " %)"],
    ];
    return el("table", null, el("tbody", null, filas.map(([k, v]) => el("tr", null, el("td", { texto: k }), el("td", { class: "num", texto: v })))));
  }

  // Rango por punto: bigotes P10-P90, caja Q1-Q3, mediana y Leq energetico
  function rangos(cont, grupos) {
    montar(cont, (W) => {
      const alto = 22, sep = 10, izq = Math.min(190, Math.max(100, Math.round(W * 0.28))), der = 16, sup = 10, inf = 24;
      const H = sup + grupos.length * (alto + sep) + inf;
      const d0 = Math.floor(Math.min(...grupos.map((g) => g.d.p10)) / 5) * 5 - 5, d1 = Math.ceil(Math.max(...grupos.map((g) => g.d.p90)) / 5) * 5 + 5;
      const x = (v) => izq + ((v - d0) / (d1 - d0)) * (W - izq - der);
      const s = sv("svg", { width: W, height: H, role: "img", "aria-label": "Rango de niveles por punto" });
      ticks(d0, d1, Math.max(3, Math.floor((W - izq) / 80))).forEach((t) => {
        s.appendChild(sv("line", { x1: x(t), x2: x(t), y1: sup, y2: H - inf, class: "rej" }));
        s.appendChild(sv("text", { x: x(t), y: H - 6, "text-anchor": "middle" }, String(t)));
      });
      [[82, "#fab219", "4 3"], [85, "#d03b3b", null]].forEach(([v, c, dash]) => { if (v > d0 && v < d1) s.appendChild(sv("line", { x1: x(v), x2: x(v), y1: sup, y2: H - inf, stroke: c, "stroke-width": 1.5, "stroke-dasharray": dash })); });
      grupos.forEach((g, i) => {
        const y = sup + i * (alto + sep), cy = y + alto / 2, d = g.d, color = colorSem(N.semaforo(d.leq));
        const grupo = sv("g", { tabindex: 0 });
        grupo.appendChild(sv("rect", { x: 0, y: y - sep / 2, width: W, height: alto + sep, fill: "transparent" }));
        grupo.appendChild(sv("text", { x: izq - 8, y: cy + 4, "text-anchor": "end", style: "fill:" + css("--tinta-2") + ";font-size:12px" }, g.nombre.length > 26 ? g.nombre.slice(0, 25) + "…" : g.nombre));
        grupo.appendChild(sv("line", { x1: x(d.p10), x2: x(d.p90), y1: cy, y2: cy, stroke: css("--tinta-2"), "stroke-width": 1.5 }));
        grupo.appendChild(sv("rect", { x: x(d.q1), y: y + 3, width: Math.max(2, x(d.q3) - x(d.q1)), height: alto - 6, rx: 4, fill: color, opacity: 0.35, stroke: color, "stroke-width": 1.5 }));
        grupo.appendChild(sv("line", { x1: x(d.mediana), x2: x(d.mediana), y1: y + 2, y2: y + alto - 2, stroke: css("--tinta"), "stroke-width": 2 }));
        grupo.appendChild(sv("circle", { cx: x(d.leq), cy, r: 4.5, fill: color, stroke: css("--superficie"), "stroke-width": 2 }));
        const sug = (e) => mostrarSug(e, ["Leq " + f1(d.leq) + " dB(A)", g.nombre, "n = " + d.n, "P10–P90: " + f1(d.p10) + " a " + f1(d.p90), "Q1–Q3: " + f1(d.q1) + " a " + f1(d.q3), "Mediana " + f1(d.mediana)]);
        grupo.addEventListener("pointermove", sug); grupo.addEventListener("pointerleave", ocultarSug);
        s.appendChild(grupo);
      });
      cont.appendChild(s);
    });
  }

  // Mapa de calor dia x hora (rampa azul de una sola tonalidad)
  const RAMPA = [[222, 235, 250], [158, 199, 240], [80, 145, 220], [30, 92, 175], [12, 52, 110]];
  function colorCalor(t) {
    t = Math.max(0, Math.min(1, t));
    const p = t * (RAMPA.length - 1), i = Math.min(RAMPA.length - 2, Math.floor(p)), f = p - i;
    const c = RAMPA[i].map((v, k) => Math.round(v + (RAMPA[i + 1][k] - v) * f));
    return { fondo: "rgb(" + c.join(",") + ")", texto: t > 0.55 ? "#ffffff" : "#13243a" };
  }
  function mapaCalor(meds) {
    const m = A.mapaCalor(meds);
    const vals = m.flat().filter((c) => c.leq !== null).map((c) => c.leq);
    if (!vals.length) return el("p", { class: "mudo", texto: "Sin datos." });
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const t = el("table", { class: "calor" },
      el("thead", null, el("tr", null, el("th"), Array.from({ length: 24 }, (_, h) => el("th", { texto: h % 3 === 0 ? String(h) : "" })))),
      el("tbody", null, m.map((fila, d) => el("tr", null, el("th", { texto: dias[d] }), fila.map((c, h) => {
        if (c.leq === null) return el("td", { style: "background:var(--superficie-2)", title: dias[d] + " " + h + ":00 · sin datos" });
        const col = colorCalor(hi > lo ? (c.leq - lo) / (hi - lo) : 0.5);
        return el("td", { style: "background:" + col.fondo + ";color:" + col.texto, title: dias[d] + " " + h + ":00 a " + h + ":59 · Leq " + f1(c.leq) + " dB(A) · " + c.n + " medición(es)", texto: f0(c.leq) });
      })))));
    return el("div", null, el("div", { class: "tabla-caja" }, t),
      el("div", { class: "fila", style: "font-size:11.5px;margin-top:6px;gap:6px" }, el("span", { texto: f0(lo) + " dB(A)" }),
        el("span", { style: "display:inline-block;width:160px;height:10px;border-radius:5px;background:linear-gradient(90deg," + RAMPA.map((c) => "rgb(" + c.join(",") + ")").join(",") + ")" }),
        el("span", { texto: f0(hi) + " dB(A)" }), el("span", { class: "mudo", texto: "· hora de Lima · cada celda es el Leq energético de esa hora" })));
  }

  function bloqueAnova(titulo, grupos, pregunta) {
    const validos = grupos.filter((g) => g.valores.length >= 2);
    const r = A.anova(validos.map((g) => g.valores));
    const tabla = el("table", null,
      el("thead", null, el("tr", null, ["Grupo", "n", "Media", "Desv. est.", "Leq"].map((t, i) => el("th", { class: i ? "num" : "", texto: t })))),
      el("tbody", null, grupos.slice().sort((a, b) => A.media(b.valores) - A.media(a.valores)).map((g) => el("tr", null,
        el("td", { texto: g.nombre }), el("td", { class: "num", texto: String(g.valores.length) }), el("td", { class: "num", texto: f1(A.media(g.valores)) }),
        el("td", { class: "num", texto: f2(A.desvio(g.valores)) }), el("td", { class: "num", texto: f1(A.leqEnergetico(g.valores)) })))));
    return el("div", { class: "tarjeta" }, el("h2", { texto: titulo }), el("p", { class: "sub", texto: pregunta }),
      r.suficiente ? el("div", { class: "caja-aviso " + (r.p < 0.05 ? "grave" : "ok") },
        el("span", { class: "cifra-test", texto: "ANOVA: F(" + r.glb + ", " + r.glw + ") = " + f2(r.F) + " · " + pTexto(r.p) + " · η² = " + f2(r.eta2) + ". " }),
        veredicto(r.p) + (r.suficiente ? " El factor explica el " + f0(100 * r.eta2) + " % de la variación del nivel." : "")) :
        el("div", { class: "caja-aviso info", texto: "Se necesitan al menos dos grupos con dos o más mediciones cada uno." }),
      el("div", { class: "tabla-caja" }, tabla));
  }

  function render(cont, S) {
    const meds = S.filtradas.filter((m) => Number.isFinite(m.leq));
    const nodo = el("div");
    if (meds.length < 3) { cont.replaceChildren(U.vacio("Se necesitan al menos 3 mediciones con el filtro actual para la estadística.")); return; }
    const d = A.descriptiva(meds);

    // descriptiva + distribucion
    const histo = el("div");
    const clases = A.histograma(meds.map((m) => m.leq), 2);
    nodo.appendChild(el("div", { class: "rejilla cols-2" },
      el("div", { class: "tarjeta" }, el("h2", { texto: "Estadística descriptiva" }), el("p", { class: "sub", texto: "Del filtro actual. El Leq energético promedia la energía sonora (no los decibeles) y es el que se compara con la norma." }), tablaDescriptiva(d)),
      el("div", { class: "tarjeta" }, el("h2", { texto: "Distribución de niveles" }), el("p", { class: "sub", texto: "Cuántas mediciones caen en cada intervalo de 2 dB. Color según el semáforo del intervalo." }), histo,
        el("p", { class: "mudo", style: "font-size:12.5px", texto: "Asimetría visual: si la cola derecha es larga, hay eventos de ruido alto esporádicos (voladura, perforación) que suben el Leq aunque la mediana sea baja." }))));
    requestAnimationFrame(() => columnas(histo, {
      datos: clases.map((c) => ({ x: c.desde, valor: c.n, n: c.n, etiqueta: f0(c.desde) + " a " + f0(c.hasta) + " dB(A)" })),
      dominio: [0, Math.max(...clases.map((c) => c.n)) + 1], unidad: "mediciones", alto: 240, etiquetaX: (q) => String(q.x),
      colorFn: (q) => colorSem(N.semaforo(q.x + 1)),
    }));

    // por punto
    const grupos = A.porPunto(meds).map((p) => ({ nombre: p.punto, proyecto: p.proyecto, filas: p.filas, d: A.descriptiva(p.filas) }));
    const cajaR = el("div");
    const filasT = grupos.map((g) => [g.proyecto, g.nombre, g.d.n, f1(g.d.media), f1(g.d.leq), f2(g.d.sd), Number.isFinite(g.d.ic95[0]) ? f1(g.d.ic95[0]) + "–" + f1(g.d.ic95[1]) : "–", f1(g.d.min), f1(g.d.p10), f1(g.d.mediana), f1(g.d.p90), f1(g.d.max), g.d.sobre85]);
    const cab = ["Proyecto", "Punto", "n", "Media", "Leq", "Desv.", "IC 95 % media", "Mín", "P10", "Mediana", "P90", "Máx", "≥ 85"];
    nodo.appendChild(el("div", { class: "tarjeta seccion" }, el("div", { class: "fila", style: "justify-content:space-between" }, el("h2", { texto: "Por punto de monitoreo" }),
      el("button", { class: "boton sec", type: "button", onclick: () => U.descargar("SONOMIN_estadistica_por_punto.csv", U.csv(["proyecto", "punto", "n", "media", "leq", "desv", "ic95", "min", "p10", "mediana", "p90", "max", "n_85"], filasT)) }, "Descargar CSV")),
      el("p", { class: "sub", texto: "Rango de cada punto: línea de P10 a P90, caja del cuartil 1 al 3, raya negra = mediana, círculo = Leq energético. Líneas verticales: 82 (acción) y 85 dB(A) (límite)." }),
      cajaR,
      el("div", { class: "tabla-caja", style: "margin-top:10px" }, el("table", null, el("thead", null, el("tr", null, cab.map((t, i) => el("th", { class: i >= 2 && i !== 6 ? "num" : "", texto: t })))),
        el("tbody", null, filasT.map((f) => el("tr", null, f.map((c, i) => el("td", { class: i >= 2 && i !== 6 ? "num" : "", texto: String(c) })))))))));
    requestAnimationFrame(() => rangos(cajaR, grupos.slice(0, 25)));

    // mapa de calor
    nodo.appendChild(el("div", { class: "tarjeta seccion" }, el("h2", { texto: "¿Cuándo hay más ruido? Día de la semana × hora" }),
      el("p", { class: "sub", texto: "Sirve para programar trabajos ruidosos, rotar al personal y elegir las horas del monitoreo ambiental." }), mapaCalor(meds)));

    // comparaciones
    const porClave = (fn) => { const m = new Map(); meds.forEach((x) => { const k = fn(x); if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(x.leq); }); return [...m].map(([nombre, valores]) => ({ nombre, valores })); };
    nodo.appendChild(el("h2", { class: "seccion", style: "margin-bottom:10px", texto: "Comparaciones con prueba estadística" }));
    nodo.appendChild(el("div", { class: "rejilla cols-2" },
      bloqueAnova("Entre puntos", porClave((x) => x.punto), "¿El nivel medio cambia de un punto a otro?"),
      bloqueAnova("Entre fuentes de ruido", porClave((x) => x.fuente_ruido || null), "¿Qué fuente genera más ruido? (según lo registrado en la app)"),
      bloqueAnova("Turno diurno frente a nocturno", porClave((x) => (x.ms ? (N.esDiurno(x.ms) ? "Diurno (07:01–22:00)" : "Nocturno (22:01–07:00)") : null)), "Turnos del ECA de ruido (D.S. 085-2003-PCM)."),
      bloqueAnova("Superficie frente a interior mina", porClave((x) => x.ambito || null), "¿El interior es más ruidoso que la superficie?")));

    // correlaciones
    const cH = A.correlacion(meds.map((m) => m.hora), meds.map((m) => m.leq));
    const t0 = Math.min(...meds.map((m) => m.ms || Infinity));
    const cT = A.correlacion(meds.map((m) => ((m.ms || 0) - t0) / 86400000), meds.map((m) => m.leq));
    const cD = A.correlacion(meds.map((m) => m.dur), meds.map((m) => m.leq));
    const fila = (nombre, c, unidad) => el("tr", null, el("td", { texto: nombre }),
      el("td", { class: "num", texto: c.suficiente ? f2(c.r) : "–" }), el("td", { class: "num", texto: c.suficiente ? f2(c.r2) : "–" }),
      el("td", { class: "num", texto: c.suficiente ? f2(c.pendiente) + " " + unidad : "–" }), el("td", { texto: c.suficiente ? pTexto(c.p) + (c.p < 0.05 ? " · significativa" : " · no significativa") : "datos insuficientes" }));
    nodo.appendChild(el("div", { class: "tarjeta seccion" }, el("h2", { texto: "Correlaciones (Pearson)" }),
      el("p", { class: "sub", texto: "r va de −1 a 1; r² es la fracción de la variación del nivel que explica la variable. Correlación no es causa: úsela para orientar el análisis." }),
      el("div", { class: "tabla-caja" }, el("table", null, el("thead", null, el("tr", null, ["Variable frente al Leq", "r", "r²", "Pendiente", "Prueba"].map((t, i) => el("th", { class: i && i < 4 ? "num" : "", texto: t })))),
        el("tbody", null, fila("Hora del día", cH, "dB/h"), fila("Días transcurridos (tendencia)", cT, "dB/día"), fila("Duración de la medición", cD, "dB/s"))))));

    cont.replaceChildren(nodo);
  }

  raiz.SON_VISTAS.estadistica = { render };
})(window);
