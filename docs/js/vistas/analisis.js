/* Vista ANALISIS: resultados por punto, perfil horario, cumplimiento y dosis. */
(function (raiz) {
  "use strict";
  const { el, f0, f1, barras, columnas, apilada, tablaEquivalente, colorSem, css } = raiz.SON_G;
  const U = raiz.SON_U, A = raiz.SON_ANALISIS, N = raiz.SON_NORMAS;
  raiz.SON_VISTAS = raiz.SON_VISTAS || {};

  function render(cont, S) {
    const meds = S.filtradas.filter((m) => m.leq !== null);
    if (!meds.length) { cont.replaceChildren(U.vacio("No hay mediciones con este filtro.")); return; }
    const nodo = el("div");
    const pts = A.porPunto(meds);

    // 1. Leq por punto
    const gPuntos = el("div");
    nodo.appendChild(el("div", { class: "tarjeta" }, el("h2", { texto: "Nivel equivalente (Leq) por punto" }),
      el("p", { class: "sub", texto: "Leq energético de todas las mediciones del punto, ponderado por duración. La barra toma el color del semáforo del Anexo 12." }),
      gPuntos, tablaEquivalente(
        [{ t: "Punto" }, { t: "Proyecto" }, { t: "n", num: true }, { t: "Leq dB(A)", num: true }, { t: "Máx", num: true }, { t: "Desv. est.", num: true }, { t: "% ≥ 85", num: true }, { t: "Estado" }],
        pts.map((p) => [p.punto, p.proyecto, p.n, f1(p.leq), f1(p.max), f1(p.sd), f1(p.pctSobreLimite), U.TEXTO_SEM[p.sem]]))));
    const maxV = Math.max(...pts.map((p) => p.leq));
    barras(gPuntos, {
      filas: pts.map((p) => ({ etiqueta: p.punto, valor: p.leq, color: colorSem(p.sem), detalle: [["Mediciones", p.n], ["Máximo", f1(p.max) + " dB(A)"], ["≥ 85 dB(A)", f1(p.pctSobreLimite) + " %"], ["Estado", U.TEXTO_SEM[p.sem]]] })),
      dominio: [30, Math.max(100, Math.ceil(maxV / 10) * 10)],
      limites: [{ v: 82, etiqueta: "82 acción", color: "#fab219", dash: true }, { v: 85, etiqueta: "85 límite", color: "#d03b3b" }],
      ariaTitulo: "Leq por punto",
    });
    gPuntos.after(raiz.SON_G.leyenda([{ caja: true, color: "#0ca30c", texto: "Conforme" }, { caja: true, color: "#fab219", texto: "Precaución" }, { caja: true, color: "#d03b3b", texto: "Excede" }]));

    // 2. perfil horario + 3. cumplimiento
    const cum = A.cumplimiento(meds);
    const gHora = el("div"), gCum = el("div");
    const perfil = A.perfilHorario(meds);
    nodo.appendChild(el("div", { class: "rejilla cols-2 seccion" },
      el("div", { class: "tarjeta" }, el("h2", { texto: "Perfil horario" }),
        el("p", { class: "sub", texto: "Leq por hora del día (hora de Lima). Muestra en qué turnos se concentra el ruido." }),
        gHora, tablaEquivalente([{ t: "Hora" }, { t: "n", num: true }, { t: "Leq dB(A)", num: true }], perfil.map((b) => [b.h + ":00", b.n, b.leq === null ? "" : f1(b.leq)]))),
      el("div", { class: "tarjeta" }, el("h2", { texto: "Cumplimiento" }),
        el("p", { class: "sub", texto: "Mediciones según el semáforo ocupacional (D.S. 024-2016-EM) y frente al ECA de ruido (D.S. 085-2003-PCM)." }),
        gCum,
        el("p", { style: "margin-top:12px" }, el("b", { texto: "ECA ambiental: " }),
          cum.nEca ? cum.sobreEca + " de " + cum.nEca + " mediciones de superficie superan el ECA de su zona (" + f1(cum.pctSobreEca) + " %)." : "no hay mediciones de superficie con límite ECA."),
        el("p", { class: "mudo", style: "font-size:12.5px", texto: "Importante: superar el ECA es una alerta técnica; no es una infracción por sí mismo (Ley General del Ambiente, art. 31.4). Ver la pestaña Penalidades." }))));
    columnas(gHora, { datos: perfil.map((b) => ({ x: b.h, valor: b.leq, n: b.n, etiqueta: String(b.h).padStart(2, "0") + ":00–" + String(b.h).padStart(2, "0") + ":59" })), dominio: [30, Math.max(100, Math.ceil(Math.max(...perfil.map((b) => b.leq ?? 0)) / 10) * 10)], limites: [{ v: 85, etiqueta: "85", color: "#d03b3b" }, { v: 82, etiqueta: "82", color: "#fab219", dash: true }], etiquetaX: (d) => d.x, alto: 210 });
    apilada(gCum, { partes: [{ etiqueta: "Conforme", valor: cum.sem.CONFORME, color: "#0ca30c" }, { etiqueta: "Precaución", valor: cum.sem.PRECAUCION, color: "#fab219" }, { etiqueta: "Excede", valor: cum.sem.EXCEDE, color: "#d03b3b" }] });

    // 4. superficie vs interior
    const filasAmb = ["SUPERFICIE", "INTERIOR"].map((a) => {
      const g = meds.filter((m) => m.ambito === a);
      return [a === "INTERIOR" ? "Interior de mina" : "Superficie", g.length, g.length ? f1(A.leqEnergetico(g.map((m) => m.leq), g.map((m) => m.dur))) : "–", g.length ? f1(Math.max(...g.map((m) => m.lmax ?? m.leq))) : "–", g.length ? f1((100 * g.filter((m) => m.leq >= 85).length) / g.length) : "–"];
    });
    nodo.appendChild(el("div", { class: "tarjeta seccion" }, el("h2", { texto: "Superficie e interior de mina" }),
      el("div", { class: "tabla-caja", style: "margin-top:8px" }, el("table", null,
        el("thead", null, el("tr", null, ["Ámbito", "n", "Leq dB(A)", "Lmax dB(A)", "% ≥ 85"].map((t, i) => el("th", { class: i ? "num" : "", texto: t })))),
        el("tbody", null, filasAmb.map((f) => el("tr", null, f.map((c, i) => el("td", { class: i ? "num" : "", texto: String(c) })))))))));

    // 5. dosis diaria (jornadas)
    const jor = meds.filter((m) => m.modo === "JORNADA");
    if (jor.length) {
      const dd = A.dosisPorDia(jor).sort((a, b) => (a.dia < b.dia ? 1 : -1));
      nodo.appendChild(el("div", { class: "tarjeta seccion" }, el("h2", { texto: "Dosis diaria (mediciones de jornada)" }),
        el("p", { class: "sub", texto: "D = Σ (C / T) × 100 sobre todos los bloques del día (Guía N° 1). Es la dosis de la jornada solo si se midió la jornada completa o, como mínimo, el 70 % según la Guía." }),
        el("div", { class: "tabla-caja" }, el("table", null,
          el("thead", null, el("tr", null, ["Día", "Proyecto", "Dosis %", "Nivel equivalente de 8 h", "Estado"].map((t, i) => el("th", { class: i > 1 && i < 4 ? "num" : "", texto: t })))),
          el("tbody", null, dd.map((d) => el("tr", null, el("td", { texto: d.dia.split("-").reverse().join("/") }), el("td", { texto: d.proyecto }), el("td", { class: "num", texto: f1(d.dosis) }), el("td", { class: "num", texto: f1(d.twa) + " dB(A)" }), el("td", null, U.pill(d.dosis > 100 ? "EXCEDE" : d.dosis >= 50 ? "PRECAUCION" : "CONFORME")))))))));
    }

    // tabla por punto
    nodo.appendChild(el("div", { class: "tarjeta seccion" }, el("h2", { texto: "Resumen por punto" }),
      el("div", { class: "tabla-caja", style: "margin-top:8px" }, el("table", null,
        el("thead", null, el("tr", null, ["Punto", "Ámbito", "n", "Leq dB(A)", "Máx", "Desv.", "% ≥ 85", "Última", "Estado"].map((t, i) => el("th", { class: i >= 2 && i <= 6 ? "num" : "", texto: t })))),
        el("tbody", null, pts.map((p) => el("tr", null, el("td", { texto: p.punto }), el("td", { texto: p.ambito === "INTERIOR" ? "Interior" : "Superficie" }), el("td", { class: "num", texto: String(p.n) }), el("td", { class: "num", texto: f1(p.leq) }), el("td", { class: "num", texto: f1(p.max) }), el("td", { class: "num", texto: f1(p.sd) }), el("td", { class: "num", texto: f1(p.pctSobreLimite) }), el("td", { texto: U.hace(p.ultima) }), el("td", null, U.pill(p.sem)))))))));

    cont.replaceChildren(nodo);
  }

  raiz.SON_VISTAS.analisis = { render };
})(window);
