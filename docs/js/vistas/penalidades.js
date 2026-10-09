/* Vista PENALIDADES: estimacion referencial de multas por ruido (ambiental y ocupacional). */
(function (raiz) {
  "use strict";
  const { el, f1, f2 } = raiz.SON_G;
  const U = raiz.SON_U, A = raiz.SON_ANALISIS, N = raiz.SON_NORMAS, P = raiz.SON_PENALIDADES;
  raiz.SON_VISTAS = raiz.SON_VISTAS || {};

  const E = {
    // ambiental
    compromiso: "no", metodologia: "2026", filaId: "043-1.2", escId: "pot_flora", B: 11000, pId: "media",
    gen: [], usarImpacto: false, impacto: {}, i5: 0, f13: {}, f2: 0, f3: 0, f4: 0, f5: 0, f6: 0, f7: 0, reconocimiento: "ninguno",
    // ocupacional
    refId: "ninguna", baseUIT: 0, o_rec: "ninguno", o_sub: "no", o_reinc: "ninguna", o_pp: "no",
    // valor esperado
    ambito: "eca", horizonte: 30, probSancion: 100,
  };

  const soles = (x) => "S/ " + x.toLocaleString("es-PE", { maximumFractionDigits: 0 });
  const uit = (x) => x.toLocaleString("es-PE", { maximumFractionDigits: 2 }) + " UIT";
  const etiquetaEstado = (e) => el("span", { class: "etiqueta-estado " + e.replace(/ /g, ""), texto: e });
  function campo(titulo, control, ancho) { return el("label", { class: "campo" + (ancho ? " ancho" : "") }, el("span", { texto: titulo }), control); }
  function select(opciones, valor, alCambiar, aria) {
    const s = el("select", { "aria-label": aria }, opciones.map(([v, t]) => el("option", { value: v, texto: t, selected: String(v) === String(valor) })));
    s.addEventListener("change", () => alCambiar(s.value));
    return s;
  }

  function render(cont, S) {
    const nodo = el("div");
    nodo.appendChild(el("div", { class: "caja-aviso grave" }, el("b", { texto: "Estimación referencial. " }),
      "Esta sección dimensiona el riesgo económico y compara escenarios. No es una determinación de multa: la imponen OEFA u Osinergmin en un procedimiento sancionador. Valor de la UIT 2026: " + soles(P.UIT) + " (D.S. 301-2025-EF)."));

    nodo.appendChild(el("div", { class: "tarjeta" }, el("h2", { texto: "Qué dice la normativa hoy (revisión de octubre de 2026)" }),
      el("ul", { style: "margin:8px 0 0 18px;padding:0" },
        el("li", null, el("b", { texto: "Ambiental (OEFA). " }), "El ECA de ruido no se sanciona por sí mismo: la Ley General del Ambiente (art. 31.4) lo impide salvo causalidad demostrada. La multa nace del incumplimiento de una obligación concreta, por ejemplo un compromiso del instrumento de gestión ambiental o el monitoreo. La tipificación minera (R.C.D. 043-2015-OEFA/CD) nombra el ruido en su numeral 1.1. La metodología de multas cambió con la R.C.D. 00005-2026-OEFA/CD (27-mar-2026); los procedimientos iniciados antes usan la de 2013/2017."),
        el("li", null, el("b", { texto: "Ocupacional (Osinergmin). " }), "No se halló una fila específica de ruido en el cuadro de tipificación vigente (R.C.D. 123-2024-OS/CD). La fila 3.8.2 \"Ruido\" (hasta 30 UIT) era de la R.C.D. 286-2010-OS/CD, ya derogada. Por eso esta herramienta mide la exposición (dosis y nivel equivalente de 8 h) y no inventa un monto."),
        el("li", null, el("b", { texto: "Cada dato lleva su estado: " }), etiquetaEstado("VERIFICADO"), " leído en el texto, ", etiquetaEstado("RESUMEN"), " leído en un resumen o extracto (contrastar con el PDF oficial), ", etiquetaEstado("NO CONFIRMADO"), " no se pudo comprobar y no se usa para calcular."))));

    // =============================================================== AMBIENTAL
    const resA = el("div"), zonaFactores = el("div");
    const filaOpts = P.FILAS_OEFA.map((f) => [f.id, f.norma + " · " + f.numeral]);
    const escOpts = () => (P.FILAS_OEFA.find((f) => f.id === E.filaId) || P.FILAS_OEFA[0]).escenarios.map((e) => [e.id, e.etiqueta + " (" + e.gravedad + (e.max ? ", hasta " + e.max + " UIT" : "") + ")"]);
    const escSel = el("div");
    function pintarEscenarios() {
      const opts = escOpts();
      if (!opts.find(([v]) => v === E.escId)) E.escId = opts[0][0];
      escSel.replaceChildren(campo("Escenario de la escala", select(opts, E.escId, (v) => { E.escId = v; calcularA(); }, "Escenario")));
    }
    function pintarFactores() {
      zonaFactores.replaceChildren();
      const F = P.FACTORES[E.metodologia];
      if (E.metodologia === "2026") {
        const gen = el("div", { class: "ancho" }, el("span", { class: "mudo", style: "font-size:12px;font-weight:600", texto: "Factores de graduación (F)" }),
          F.generales.map((f) => el("label", { style: "display:flex;gap:8px;align-items:center;font-size:13.5px;margin-top:4px" },
            el("input", { type: "checkbox", checked: E.gen.includes(f.valor) && true, onchange: (e) => { E.gen = e.target.checked ? E.gen.concat(f.valor) : E.gen.filter((v) => v !== f.valor); calcularA(); } }),
            f.etiqueta + " (" + (f.valor > 0 ? "+" : "") + Math.round(f.valor * 100) + " %)")));
        const imp = el("div", { class: "ancho" },
          el("label", { style: "display:flex;gap:8px;align-items:center;font-size:13.5px" },
            el("input", { type: "checkbox", checked: E.usarImpacto, onchange: (e) => { E.usarImpacto = e.target.checked; pintarFactores(); calcularA(); } }), "Hubo impacto ambiental negativo (Regla 2: se suma el factor de impacto I)"));
        zonaFactores.append(gen, imp);
        if (E.usarImpacto) {
          const caja = el("div", { class: "formulario ancho" });
          Object.entries(F.impacto).forEach(([id, def]) => {
            caja.appendChild(campo(def.etiqueta, select([["", "No aplica"]].concat(def.opciones.map(([t, v]) => [String(v), t + " (" + (v > 0 ? "+" : "") + Math.round(v * 100) + " %)"])), E.impacto[id] ?? "", (v) => { if (v === "") delete E.impacto[id]; else E.impacto[id] = Number(v); calcularA(); }, def.etiqueta)));
          });
          const i5 = el("input", { type: "number", step: "0.01", value: E.i5, "aria-label": "Factor i5" });
          i5.addEventListener("change", () => { E.i5 = Number(i5.value) || 0; calcularA(); });
          caja.appendChild(campo("i5 · Reversibilidad y recuperabilidad (fracción, p. ej. 0.12 = 12 %). Los siete niveles no están confirmados: ingrese el valor", i5));
          zonaFactores.appendChild(caja);
        }
      } else {
        const caja = el("div", { class: "formulario ancho" });
        Object.entries(F.f1).forEach(([id, def]) => caja.appendChild(campo("f1 · " + def.etiqueta, select([["", "No aplica"]].concat(def.opciones.map(([t, v]) => [String(v), t + " (+" + Math.round(v * 100) + " %)"])), E.f13[id] ?? "", (v) => { if (v === "") delete E.f13[id]; else E.f13[id] = Number(v); calcularA(); }, id))));
        ["f2", "f3", "f4", "f5", "f6", "f7"].forEach((id) => {
          const def = F[id];
          caja.appendChild(campo(id + " · " + def.etiqueta, select([["0", "No aplica"]].concat(def.opciones.map(([t, v]) => [String(v), t + " (" + (v > 0 ? "+" : "") + Math.round(v * 100) + " %)"])), String(E[id]), (v) => { E[id] = Number(v); calcularA(); }, id)));
        });
        zonaFactores.appendChild(caja);
      }
      zonaFactores.appendChild(el("p", { class: "mudo ancho", style: "font-size:12px", texto: F.nota }));
    }
    function calcularA() {
      const r = P.calcularOefa({
        compromisoIGA: E.compromiso === "si", metodologia: E.metodologia, filaId: E.filaId, escenarioId: E.escId, B_soles: E.B, pId: E.pId,
        factores: E.metodologia === "2026" ? { generales: E.gen, usarImpacto: E.usarImpacto, impacto: E.impacto, i5_manual: E.i5 } : { f1: E.f13, f2: E.f2, f3: E.f3, f4: E.f4, f5: E.f5, f6: E.f6, f7: E.f7 },
        reconocimiento: E.reconocimiento,
      });
      E.resA = r;
      resA.replaceChildren();
      if (!r.sancionable) { resA.appendChild(el("div", { class: "caja-aviso info" }, el("b", { texto: "No se calcula multa. " }), r.motivo)); }
      else {
        resA.appendChild(el("div", { class: "fila" }, el("span", { class: "resultado-grande", texto: uit(r.multaUIT) }), el("span", { class: "resultado-grande mudo", style: "font-size:20px", texto: "≈ " + soles(r.multaSoles) })));
        resA.appendChild(el("div", { class: "formula", style: "margin-top:8px", texto: r.pasos.join("\n") }));
        resA.appendChild(el("p", { style: "margin-top:8px;font-size:13px" }, el("b", { texto: r.fila.norma + " · numeral " + r.fila.numeral + " " }), etiquetaEstado(r.fila.estado), el("br"), r.fila.descripcion, el("br"),
          el("span", { class: "mudo", texto: "Base: " + r.fila.base + ". " + r.fila.nota + " " }), el("a", { href: r.fila.fuente, target: "_blank", rel: "noopener", texto: "Fuente" })));
        r.avisos.forEach((a) => resA.appendChild(el("div", { class: "caja-aviso", texto: a })));
      }
      pintarEsperado();
    }

    const bInput = el("input", { type: "number", min: 0, step: 100, value: E.B, "aria-label": "Beneficio ilícito en soles" });
    bInput.addEventListener("change", () => { E.B = Number(bInput.value) || 0; calcularA(); });
    const formA = el("div", { class: "formulario", style: "margin-top:10px" },
      campo("¿El ruido o su mitigación es un compromiso del IGA, o hay una obligación específica incumplida con causalidad demostrada?", select([["no", "No"], ["si", "Sí"]], E.compromiso, (v) => { E.compromiso = v; calcularA(); }, "Compromiso"), true),
      campo("Metodología de cálculo", select([["2026", "2026 · R.C.D. 00005-2026-OEFA/CD (procedimientos nuevos)"], ["2013", "2013/2017 · R.P.C.D. 035-2013 y R.C.D. 024-2017 (procedimientos anteriores)"]], E.metodologia, (v) => { E.metodologia = v; if (!P.P_DETECCION[v].find((x) => x.id === E.pId)) E.pId = "media"; pintarProb(); pintarFactores(); calcularA(); }, "Metodología")),
      campo("Infracción tipificada", select(filaOpts, E.filaId, (v) => { E.filaId = v; pintarEscenarios(); calcularA(); }, "Infracción")),
      escSel,
      campo("Beneficio ilícito B (soles): costo evitado o postergado actualizado, p. ej. monitoreo no hecho o barrera acústica no instalada", bInput, true),
      el("div", { id: "zona-prob" }),
      campo("Reconocimiento de responsabilidad", select(P.RECONOCIMIENTO.map((r) => [r.id, r.etiqueta]), E.reconocimiento, (v) => { E.reconocimiento = v; calcularA(); }, "Reconocimiento")));
    function pintarProb() {
      const z = formA.querySelector("#zona-prob");
      z.replaceChildren(campo("Probabilidad de detección p", select(P.P_DETECCION[E.metodologia].map((x) => [x.id, x.etiqueta]), E.pId, (v) => { E.pId = v; calcularA(); }, "p")));
    }
    nodo.appendChild(el("div", { class: "tarjeta seccion" }, el("h2", { texto: "A · Multa ambiental por ruido (OEFA)" }),
      el("p", { class: "sub", texto: "Multa = (B / p) × (1 + F) con la metodología 2026; M = (B / p) × F con 2013/2017. Se limita al tope de la escala y se aplica el reconocimiento de responsabilidad (" + P.RECONOCIMIENTO_FUENTE + ")" }),
      formA, zonaFactores, el("div", { style: "margin-top:12px" }, resA)));
    pintarEscenarios(); pintarProb(); pintarFactores();

    // ============================================================ OCUPACIONAL
    const resO = el("div");
    function calcularO() {
      const r = P.calcularOsinergmin({ refId: E.refId, baseUIT: E.baseUIT, reconocimiento: E.o_rec, subsanacion: E.o_sub, reincidencia: E.o_reinc, pronto_pago: E.o_pp });
      E.resO = r;
      resO.replaceChildren();
      if (!r.calculable) {
        resO.appendChild(el("div", { class: "caja-aviso info" }, el("b", { texto: "No se calcula un monto. " }), r.motivo));
        // indicador de exposicion real, que si es calculable
        const v = S.filtradas.filter((m) => m.leq !== null);
        if (v.length) {
          const sobre = v.filter((m) => m.leq >= N.LIMITE_OCUPACIONAL).length, dosisMax = Math.max(...v.map((m) => N.dosisPct(m.leq, m.horas_exposicion ?? 8)));
          resO.appendChild(el("p", { style: "margin-top:8px" }, el("b", { texto: "Indicadores de exposición (filtro actual): " }), sobre + " de " + v.length + " mediciones llegan a 85 dB(A) o más; la mayor dosis supuesta para 8 h es " + f1(dosisMax) + " %."));
        }
      } else {
        resO.appendChild(el("div", { class: "fila" }, el("span", { class: "resultado-grande", texto: uit(r.multaUIT) }), el("span", { class: "resultado-grande mudo", style: "font-size:20px", texto: "≈ " + soles(r.multaSoles) })));
        resO.appendChild(el("div", { class: "formula", style: "margin-top:8px", texto: r.pasos.join("\n") }));
      }
      resO.appendChild(el("p", { style: "margin-top:8px;font-size:13px" }, etiquetaEstado(r.ref.estado), " ", r.ref.nota));
      (r.avisos || []).filter((a) => a !== r.ref.nota).forEach((a) => resO.appendChild(el("div", { class: "caja-aviso", texto: a })));
      pintarEsperado();
    }
    const baseIn = el("input", { type: "number", min: 0, step: 0.5, value: E.baseUIT, "aria-label": "Multa base estimada en UIT" });
    baseIn.addEventListener("change", () => { E.baseUIT = Number(baseIn.value) || 0; calcularO(); });
    const aj = P.OSINERGMIN_AJUSTES;
    const formO = el("div", { class: "formulario", style: "margin-top:10px" },
      campo("Fila del cuadro de tipificación que se estima aplicable", select(P.OSINERGMIN_REFERENCIAS.map((r) => [r.id, r.etiqueta + (r.tope ? " (hasta " + r.tope + " UIT)" : "")]), E.refId, (v) => { E.refId = v; calcularO(); }, "Fila"), true),
      campo("Multa base estimada (UIT). La fija Osinergmin con su metodología", baseIn),
      campo("Reincidencia", select(aj.reincidencia.map((x) => [x.id, x.etiqueta]), E.o_reinc, (v) => { E.o_reinc = v; calcularO(); }, "Reincidencia")),
      campo("Reconocimiento de responsabilidad", select(aj.reconocimiento.map((x) => [x.id, x.etiqueta]), E.o_rec, (v) => { E.o_rec = v; calcularO(); }, "Reconocimiento")),
      campo("Subsanación", select(aj.subsanacion.map((x) => [x.id, x.etiqueta]), E.o_sub, (v) => { E.o_sub = v; calcularO(); }, "Subsanación")),
      campo("Pronto pago", select(aj.pronto_pago.map((x) => [x.id, x.etiqueta]), E.o_pp, (v) => { E.o_pp = v; calcularO(); }, "Pronto pago")));
    nodo.appendChild(el("div", { class: "tarjeta seccion" }, el("h2", { texto: "B · Riesgo ocupacional por ruido (Osinergmin)" }),
      el("p", { class: "sub", texto: "Ajustes de la R.C.D. 208-2020-OS/CD. " + aj.fuente }), formO, el("div", { style: "margin-top:12px" }, resO)));

    // ============================================================ VALOR ESPERADO
    const resV = el("div");
    function pintarEsperado() {
      const meds = S.filtradas.filter((m) => m.leq !== null);
      const pts = A.porEstacion(meds);
      const multa = E.ambito === "eca" ? (E.resA && E.resA.sancionable ? E.resA.multaUIT : null) : (E.resO && E.resO.calculable ? E.resO.multaUIT : null);
      resV.replaceChildren();
      if (multa === null) {
        resV.appendChild(el("div", { class: "caja-aviso info", texto: E.ambito === "eca"
          ? "Para calcular el valor esperado ambiental, en la sección A responda \"Sí\" a la pregunta del compromiso o la causalidad y complete el beneficio ilícito B."
          : "No hay una multa ocupacional calculable: la sección B no tiene una fila específica de ruido confirmada." }));
        return;
      }
      const filas = pts.filter((p) => (E.ambito === "eca" ? p.ambito === "SUPERFICIE" : true)).map((p) => {
        let filasP = p.filas, limite = N.LIMITE_OCUPACIONAL;
        if (E.ambito === "eca") {
          const zona = N.ZONAS_ECA[p.zona] || N.ZONAS_ECA.INDUSTRIAL;
          // el ECA nocturno es el mas exigente; se evalua el turno con mas mediciones del punto
          const dia = filasP.filter((m) => N.esDiurno(m.ms)).length >= filasP.length / 2;
          filasP = filasP.filter((m) => N.esDiurno(m.ms) === dia); limite = dia ? zona.diurno : zona.nocturno;
        }
        const r = A.pronosticoPunto(filasP, E.horizonte, limite, { minN: 5 });
        return { p, r, limite, ev: r.suficiente ? P.valorEsperado({ probExceso: r.probModelo, probSancion: E.probSancion / 100, multaUIT: multa }) : null };
      }).sort((a, b) => (b.ev ? b.ev.uit : -1) - (a.ev ? a.ev.uit : -1));
      const total = filas.reduce((s, f) => s + (f.ev ? f.ev.soles : 0), 0);
      resV.appendChild(el("p", null, "Multa estimada usada: ", el("b", { texto: uit(multa) + " (" + soles(multa * P.UIT) + ")" }), " · suma de valores esperados de los puntos con datos suficientes: ", el("b", { texto: soles(total) }), "."));
      resV.appendChild(el("div", { class: "tabla-caja" }, el("table", null,
        el("thead", null, el("tr", null, ["Punto", "Límite dB(A)", "n", "Prob. de superar", "Valor esperado"].map((t, i) => el("th", { class: i ? "num" : "", texto: t })))),
        el("tbody", null, filas.map(({ p, r, limite, ev }) => el("tr", null, el("td", { texto: p.punto }), el("td", { class: "num", texto: String(limite) }), el("td", { class: "num", texto: String(r.n) }),
          r.suficiente ? [el("td", { class: "num", texto: (r.probModelo * 100).toFixed(1) + " %" }), el("td", { class: "num", texto: soles(ev.soles) })] : el("td", { class: "mudo", colspan: 2, texto: "datos insuficientes" })))))));
    }
    const selAmb = select([["eca", "Ambiental · superar el ECA (puntos de superficie)"], ["ocup", "Ocupacional · superar 85 dB(A)"]], E.ambito, (v) => { E.ambito = v; pintarEsperado(); }, "Ámbito");
    const selHor = select([[7, "7 días"], [30, "30 días"], [90, "90 días"]], E.horizonte, (v) => { E.horizonte = Number(v); pintarEsperado(); }, "Horizonte");
    const rango = el("input", { type: "range", min: 0, max: 100, step: 5, value: E.probSancion, "aria-label": "Probabilidad de que el exceso sea sancionado", style: "width:100%" });
    const rotulo = el("span", { texto: "Probabilidad de que un exceso se convierta en sanción: " + E.probSancion + " %" });
    rango.addEventListener("input", () => { E.probSancion = Number(rango.value); rotulo.textContent = "Probabilidad de que un exceso se convierta en sanción: " + E.probSancion + " %"; pintarEsperado(); });
    nodo.appendChild(el("div", { class: "tarjeta seccion" }, el("h2", { texto: "C · Valor esperado de la multa por punto" }),
      el("p", { class: "sub", texto: "Valor esperado = probabilidad de superar el límite en el horizonte × probabilidad de que el exceso sea sancionado × multa estimada. La primera sale del pronóstico estadístico (pestaña Pronóstico); la segunda es un supuesto suyo, porque superar un límite no implica por sí solo una infracción." }),
      el("div", { class: "formulario", style: "margin-top:10px" }, campo("Qué riesgo evaluar", selAmb), campo("Horizonte", selHor), el("label", { class: "campo ancho" }, rotulo, rango)),
      el("div", { style: "margin-top:12px" }, resV)));

    // ================================================================= FUENTES
    const fuentes = [
      ["UIT 2026 = S/ 5,500", "D.S. 301-2025-EF", "VERIFICADO", "https://lpderecho.pe/valor-uit-2026-decreto-supremo-301-2025-ef/"],
      ["Estándares de calidad ambiental para ruido", "D.S. 085-2003-PCM", "VERIFICADO", "https://sinia.minam.gob.pe/sites/default/files/sinia/archivos/public/docs/ds.085.2003.pcm_.pdf"],
      ["El ECA no se sanciona por sí mismo", "Ley 28611, art. 31.4", "VERIFICADO", "https://www.minam.gob.pe/wp-content/uploads/2017/04/Ley-N%C2%B0-28611.pdf"],
      ["Tipificación minera OEFA (fila 1.1 nombra el ruido)", "R.C.D. 043-2015-OEFA/CD", "RESUMEN", "https://cdn.www.gob.pe/uploads/document/file/7888173/216242-6643287-resolucion-de-consejo-directivo-n-043-2015-oefa-cd-version-el-peruano.pdf"],
      ["Incumplimiento del IGA (3.1, hasta 15,000 UIT)", "R.C.D. 006-2018-OEFA/CD", "VERIFICADO", "https://faolex.fao.org/docs/pdf/per177738.pdf"],
      ["Nueva metodología de multas OEFA", "R.C.D. 00005-2026-OEFA/CD", "RESUMEN", "https://busquedas.elperuano.pe/dispositivo/NL/2500479-1"],
      ["Metodología anterior (2013/2017)", "R.P.C.D. 035-2013-OEFA/PCD; R.C.D. 024-2017-OEFA/CD", "RESUMEN", "https://sni.org.pe/modifican-la-res-n-035-2013-oefa-pcd-que-aprueba-metodologia-para-el-calculo-de-multas-base-y-la-aplicacion-de-factores-agravantes-y-atenuantes-a-utilizarse-en-la-graduacion-de-sanciones/"],
      ["Reconocimiento de responsabilidad (-50 % / -30 %)", "R.C.D. 027-2017-OEFA/CD, art. 13", "RESUMEN", "https://www.oefa.gob.pe/be-oefa/wp-content/uploads/2021/04/Reconocimiento-de-responsabilidad-ambiental-Hacia-una-comunicacion-efectiva-que-simplifique-la-fiscalizacion.pdf"],
      ["Cuadro de tipificación de seguridad minera vigente", "R.C.D. 123-2024-OS/CD", "RESUMEN", "https://busquedas.elperuano.pe/dispositivo/NL/2301242-1"],
      ["Graduación y descuentos de Osinergmin", "R.C.D. 208-2020-OS/CD", "RESUMEN", "https://busquedas.elperuano.pe/normaslegales/aprueban-reglamento-de-fiscalizacion-y-sancion-de-las-activ-resolucion-n-208-2020-oscd-1912901-1"],
      ["Fila 3.8.2 Ruido (hasta 30 UIT), DEROGADA", "R.C.D. 286-2010-OS/CD", "VERIFICADO", "https://faolex.fao.org/docs/pdf/per143311.pdf"],
      ["Anexo 12 del D.S. 024-2016-EM: tabla completa de tiempos", "D.S. 024-2016-EM", "NO CONFIRMADO", "https://faolex.fao.org/docs/pdf/per160277.pdf"],
    ];
    nodo.appendChild(el("div", { class: "tarjeta seccion" }, el("h2", { texto: "Fuentes y estado de verificación" }),
      el("div", { class: "tabla-caja", style: "margin-top:8px" }, el("table", null,
        el("thead", null, el("tr", null, ["Dato", "Norma", "Estado", "Fuente"].map((t) => el("th", { texto: t })))),
        el("tbody", null, fuentes.map(([d, n, e, u]) => el("tr", null, el("td", { texto: d }), el("td", { texto: n }), el("td", null, etiquetaEstado(e)), el("td", null, el("a", { href: u, target: "_blank", rel: "noopener", texto: "abrir" }))))))),
      el("p", { class: "mudo", style: "font-size:12.5px;margin-top:8px", texto: "Pendiente de confirmar con los PDF oficiales: texto del art. 103 y Anexo 12 del D.S. 024-2016-EM; cuadro completo de la R.C.D. 123-2024-OS/CD (solo se leyó hasta el numeral 6.1.3 del Rubro B); vigencia en octubre de 2026 de las normas citadas; porcentajes de los siete niveles del factor i5; y competencia de Osinergmin frente a SUNAFIL en higiene ocupacional minera." })));

    cont.replaceChildren(nodo);
    calcularA(); calcularO();
  }

  raiz.SON_VISTAS.penalidades = { render };
})(window);
