/* SONOMIN · graficos SVG propios (sin librerias).
 * Reglas: marcas finas, rejilla tenue, etiquetas selectivas, una sola escala por grafico,
 * sugerencia al pasar el puntero o al enfocar con teclado, y una tabla equivalente.
 * Los textos que vienen de la base de datos se insertan siempre con textContent. */
(function (raiz) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const N = raiz.SON_NORMAS;

  // ----------------------------------------------------------------- DOM
  function el(tag, attrs, ...hijos) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "texto") e.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const h of hijos.flat()) {
      if (h === null || h === undefined || h === false) continue;
      e.appendChild(typeof h === "string" || typeof h === "number" ? document.createTextNode(String(h)) : h);
    }
    return e;
  }
  function sv(tag, attrs, ...hijos) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) { if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]); }
    for (const h of hijos.flat()) if (h) e.appendChild(typeof h === "string" ? document.createTextNode(h) : h);
    return e;
  }
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const colorSem = (s) => (s === "EXCEDE" ? "#d03b3b" : s === "PRECAUCION" ? "#fab219" : "#0ca30c");

  // ------------------------------------------------------------ formatos
  const f0 = (x) => (Number.isFinite(x) ? x.toFixed(0) : "–");
  const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "–");
  const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "–");
  const miles = (x) => (Number.isFinite(x) ? x.toLocaleString("es-PE", { maximumFractionDigits: 0 }) : "–");
  const dos = (n) => String(n).padStart(2, "0");
  function fechaHora(ms) { const h = N.horaLima(ms); return h.dia.split("-").reverse().join("/") + " " + dos(h.h) + ":" + dos(h.m); }
  function fechaCorta(ms) { const h = N.horaLima(ms); return dos(+h.dia.slice(8)) + "/" + dos(+h.dia.slice(5, 7)); }
  function horaCorta(ms) { const h = N.horaLima(ms); return dos(h.h) + ":" + dos(h.m); }

  // -------------------------------------------------------- escalas/ejes
  function ticks(min, max, n = 5) {
    const span = max - min || 1, paso0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(paso0))), r = paso0 / mag;
    const paso = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag, out = [];
    for (let t = Math.ceil(min / paso - 1e-9) * paso; t <= max + 1e-9; t += paso) out.push(Math.round(t / paso) * paso);
    return out;
  }
  function ticksTiempo(t0, t1, n = 5) {
    const pasos = [60e3, 300e3, 900e3, 1800e3, 3600e3, 3 * 3600e3, 6 * 3600e3, 12 * 3600e3, 86400e3, 2 * 86400e3, 7 * 86400e3, 14 * 86400e3, 30 * 86400e3];
    const ideal = (t1 - t0) / n;
    const paso = pasos.find((p) => p >= ideal) || pasos[pasos.length - 1], out = [];
    const desfase = 5 * 3600e3; // alinear a medianoche de Lima
    for (let t = Math.ceil((t0 - desfase) / paso) * paso + desfase; t <= t1; t += paso) out.push(t);
    return { ticks: out, formato: paso >= 86400e3 ? fechaCorta : horaCorta };
  }

  // ---------------------------------------------------------- sugerencia
  let sug = null;
  function mostrarSug(evento, lineas) {
    if (!sug) { sug = el("div", { class: "sugerencia", role: "tooltip" }); document.body.appendChild(sug); }
    sug.replaceChildren();
    lineas.forEach((l, i) => {
      if (typeof l === "string") sug.appendChild(el(i === 0 ? "b" : "span", { texto: l }));
      else sug.appendChild(l);
      sug.appendChild(document.createElement("br"));
    });
    sug.style.display = "block";
    const w = sug.offsetWidth, h = sug.offsetHeight;
    let x = evento.clientX + 14, y = evento.clientY + 14;
    if (x + w > innerWidth - 8) x = evento.clientX - w - 14;
    if (y + h > innerHeight - 8) y = evento.clientY - h - 14;
    sug.style.left = Math.max(4, x) + "px"; sug.style.top = Math.max(4, y) + "px";
  }
  function ocultarSug() { if (sug) sug.style.display = "none"; }
  function aEvento(nodo) { const r = nodo.getBoundingClientRect(); return { clientX: r.left + r.width / 2, clientY: r.top }; }

  // ------------------------------------------- montaje que sigue el ancho
  function montar(cont, dibujar) {
    cont.classList.add("grafico");
    const pintar = () => { const w = Math.max(280, Math.floor(cont.clientWidth)); cont.replaceChildren(); dibujar(w); };
    pintar();
    if (typeof ResizeObserver !== "undefined") {
      let ultimo = cont.clientWidth, t = null;
      new ResizeObserver(() => {
        if (Math.abs(cont.clientWidth - ultimo) < 8) return;
        ultimo = cont.clientWidth; clearTimeout(t); t = setTimeout(pintar, 120);
      }).observe(cont);
    }
  }

  function tablaEquivalente(columnas, filas) {
    const t = el("table", null, el("thead", null, el("tr", null, columnas.map((c) => el("th", { class: c.num ? "num" : "", texto: c.t })))),
      el("tbody", null, filas.map((f) => el("tr", null, columnas.map((c, i) => el("td", { class: c.num ? "num" : "", texto: f[i] === null || f[i] === undefined ? "" : String(f[i]) }))))));
    return el("details", { class: "ver-tabla" }, el("summary", { texto: "Ver como tabla" }), el("div", { class: "tabla-caja" }, t));
  }

  function leyenda(items) {
    return el("div", { class: "leyenda" }, items.map((i) => el("span", null, el("i", { class: i.caja ? "caja" : "", style: (i.caja ? "background:" : "border-color:") + i.color + (i.dash ? ";border-top-style:dashed" : "") }), i.texto)));
  }

  // ------------------------------------------------------------- BARRAS
  /* filas: [{etiqueta, valor, color, texto, detalle:[[clave, valor]], onclick}]
   * limites: [{v, etiqueta, color, dash}] lineas verticales de referencia */
  function barras(cont, { filas, dominio, limites = [], unidad = "dB(A)", ariaTitulo = "Gráfico de barras" }) {
    montar(cont, (W) => {
      const alto = 26, sep = 8, izq = Math.min(190, Math.max(96, Math.round(W * 0.28))), der = 52, sup = 22, inf = 22;
      const H = sup + filas.length * (alto + sep) + inf;
      const [d0, d1] = dominio;
      const x = (v) => izq + ((v - d0) / (d1 - d0)) * (W - izq - der);
      const s = sv("svg", { width: W, height: H, role: "img", "aria-label": ariaTitulo });
      ticks(d0, d1, Math.max(3, Math.floor((W - izq - der) / 90))).forEach((t) => {
        s.appendChild(sv("line", { x1: x(t), x2: x(t), y1: sup - 6, y2: H - inf, class: "rej" }));
        s.appendChild(sv("text", { x: x(t), y: H - 6, "text-anchor": "middle" }, String(t)));
      });
      filas.forEach((f, i) => {
        const y = sup + i * (alto + sep), xv = x(Math.max(d0, f.valor));
        const g = sv("g", { tabindex: 0, role: "img", "aria-label": f.etiqueta + ": " + f1(f.valor) + " " + unidad, style: f.onclick ? "cursor:pointer" : "" });
        const etq = f.etiqueta.length > 26 ? f.etiqueta.slice(0, 25) + "…" : f.etiqueta;
        g.appendChild(sv("rect", { x: 0, y: y - sep / 2, width: W, height: alto + sep, fill: "transparent" }));
        g.appendChild(sv("text", { x: izq - 8, y: y + alto / 2 + 4, "text-anchor": "end", style: "fill:" + css("--tinta-2") + ";font-size:12px" }, etq));
        // barra: extremo del dato redondeado 4 px, base cuadrada
        const w = Math.max(2, xv - izq), r = Math.min(4, w);
        g.appendChild(sv("path", { d: `M${izq},${y} H${izq + w - r} Q${izq + w},${y} ${izq + w},${y + r} V${y + alto - r} Q${izq + w},${y + alto} ${izq + w - r},${y + alto} H${izq} Z`, fill: f.color }));
        g.appendChild(sv("text", { x: izq + w + 6, y: y + alto / 2 + 4, style: "fill:" + css("--tinta") + ";font-size:12px;font-weight:700" }, f.texto ?? f1(f.valor)));
        const mostrar = (e) => mostrarSug(e, [f1(f.valor) + " " + unidad, f.etiqueta, ...(f.detalle || []).map(([k, v]) => k + ": " + v)]);
        g.addEventListener("pointermove", mostrar); g.addEventListener("pointerleave", ocultarSug);
        g.addEventListener("focus", () => mostrar(aEvento(g))); g.addEventListener("blur", ocultarSug);
        if (f.onclick) { g.addEventListener("click", f.onclick); g.addEventListener("keydown", (e) => { if (e.key === "Enter") f.onclick(); }); }
        s.appendChild(g);
      });
      const ordenL = limites.slice().sort((a, b) => a.v - b.v);
      ordenL.forEach((l, i) => {
        if (l.v < d0 || l.v > d1) return;
        s.appendChild(sv("line", { x1: x(l.v), x2: x(l.v), y1: sup - 6, y2: H - inf, stroke: l.color, "stroke-width": 1.5, "stroke-dasharray": l.dash ? "4 3" : null }));
        // la etiqueta del limite menor va a su izquierda y la del mayor a su derecha: nunca se solapan
        const izqL = ordenL.length > 1 && i < ordenL.length - 1;
        s.appendChild(sv("text", { x: x(l.v) + (izqL ? -4 : 4), y: 10, "text-anchor": izqL ? "end" : "start", style: "fill:" + css("--tinta-2") + ";font-size:11px" }, l.etiqueta));
      });
      s.appendChild(sv("line", { x1: izq, x2: izq, y1: sup - 6, y2: H - inf, class: "eje" }));
      cont.appendChild(s);
    });
  }

  // ---------------------------------------------------------- COLUMNAS
  /* datos: [{x, valor|null, n, etiqueta}] ; limites horizontales */
  function columnas(cont, { datos, dominio, limites = [], unidad = "dB(A)", alto = 200, colorFn, etiquetaX = (d) => d.x }) {
    montar(cont, (W) => {
      const izq = 38, der = 10, sup = 14, inf = 26, H = alto;
      const [d0, d1] = dominio;
      const y = (v) => sup + (1 - (v - d0) / (d1 - d0)) * (H - sup - inf);
      const ancho = (W - izq - der) / datos.length, grosor = Math.min(24, ancho * 0.7);
      const s = sv("svg", { width: W, height: H, role: "img", "aria-label": "Gráfico de columnas" });
      ticks(d0, d1, 4).forEach((t) => {
        s.appendChild(sv("line", { x1: izq, x2: W - der, y1: y(t), y2: y(t), class: "rej" }));
        s.appendChild(sv("text", { x: izq - 6, y: y(t) + 4, "text-anchor": "end" }, String(t)));
      });
      datos.forEach((d, i) => {
        const cx = izq + ancho * (i + 0.5);
        if (i % Math.ceil(datos.length / Math.max(4, Math.floor(W / 46))) === 0) s.appendChild(sv("text", { x: cx, y: H - 8, "text-anchor": "middle" }, String(etiquetaX(d))));
        const g = sv("g", { tabindex: 0, role: "img", "aria-label": d.etiqueta + (d.valor === null ? ": sin datos" : ": " + f1(d.valor) + " " + unidad) });
        g.appendChild(sv("rect", { x: cx - ancho / 2, y: sup, width: ancho, height: H - sup - inf, fill: "transparent" }));
        if (d.valor !== null) {
          const top = y(Math.max(d0, d.valor)), base = y(d0), r = Math.min(4, grosor / 2);
          g.appendChild(sv("path", { d: `M${cx - grosor / 2},${base} V${top + r} Q${cx - grosor / 2},${top} ${cx - grosor / 2 + r},${top} H${cx + grosor / 2 - r} Q${cx + grosor / 2},${top} ${cx + grosor / 2},${top + r} V${base} Z`, fill: colorFn ? colorFn(d) : css("--serie-1") }));
        }
        const mostrar = (e) => mostrarSug(e, [d.valor === null ? "Sin mediciones" : f1(d.valor) + " " + unidad, d.etiqueta, "Mediciones: " + (d.n ?? 0)]);
        g.addEventListener("pointermove", mostrar); g.addEventListener("pointerleave", ocultarSug);
        g.addEventListener("focus", () => mostrar(aEvento(g))); g.addEventListener("blur", ocultarSug);
        s.appendChild(g);
      });
      const ordenC = limites.slice().sort((a, b) => a.v - b.v);
      ordenC.forEach((l, i) => {
        s.appendChild(sv("line", { x1: izq, x2: W - der, y1: y(l.v), y2: y(l.v), stroke: l.color, "stroke-width": 1.5, "stroke-dasharray": l.dash ? "4 3" : null }));
        const debajo = ordenC.length > 1 && i === 0; // el limite menor rotula debajo de su linea, el mayor encima
        s.appendChild(sv("text", { x: W - der, y: y(l.v) + (debajo ? 13 : -4), "text-anchor": "end", style: "fill:" + css("--tinta-2") }, l.etiqueta));
      });
      s.appendChild(sv("line", { x1: izq, x2: W - der, y1: y(d0), y2: y(d0), class: "eje" }));
      cont.appendChild(s);
    });
  }

  // ------------------------------------------------------------- LINEA
  /* series: [{nombre, color, puntos:[{x, y}]}] con x en ms (tiempo) o numero.
   * banda: {puntos:[{x, lo, hi}], color} ; limites horizontales ; marcas: puntos sueltos [{x,y,color}] */
  function linea(cont, { series, dominioY, limites = [], banda, tiempo = true, alto = 220, unidad = "dB(A)", marcas = [], areaBajo = false, rectas = [], xMin, xMax, formatoX }) {
    montar(cont, (W) => {
      const izq = 40, der = 14, sup = 14, inf = 26, H = alto;
      const todos = series.flatMap((s) => s.puntos).concat(marcas);
      if (!todos.length) { cont.appendChild(el("p", { class: "mudo", texto: "Todavía no hay datos para este gráfico." })); return; }
      const x0 = xMin ?? Math.min(...todos.map((p) => p.x)), x1 = xMax ?? Math.max(...todos.map((p) => p.x)) ;
      const xs = x1 === x0 ? [x0 - 1, x1 + 1] : [x0, x1];
      const x = (v) => izq + ((v - xs[0]) / (xs[1] - xs[0])) * (W - izq - der);
      const [d0, d1] = dominioY;
      const y = (v) => sup + (1 - (Math.min(d1, Math.max(d0, v)) - d0) / (d1 - d0)) * (H - sup - inf);
      const s = sv("svg", { width: W, height: H, role: "img", "aria-label": "Gráfico de líneas" });
      ticks(d0, d1, 4).forEach((t) => {
        s.appendChild(sv("line", { x1: izq, x2: W - der, y1: y(t), y2: y(t), class: "rej" }));
        s.appendChild(sv("text", { x: izq - 6, y: y(t) + 4, "text-anchor": "end" }, String(t)));
      });
      let fx = formatoX;
      if (tiempo) {
        const tt = ticksTiempo(xs[0], xs[1], Math.max(3, Math.floor(W / 110)));
        fx = fx || tt.formato;
        tt.ticks.forEach((t) => s.appendChild(sv("text", { x: x(t), y: H - 8, "text-anchor": "middle" }, fx(t))));
      } else ticks(xs[0], xs[1], 5).forEach((t) => s.appendChild(sv("text", { x: x(t), y: H - 8, "text-anchor": "middle" }, String(t))));
      if (banda && banda.puntos.length > 1) {
        const arriba = banda.puntos.map((p) => `${x(p.x)},${y(p.hi)}`), abajo = banda.puntos.slice().reverse().map((p) => `${x(p.x)},${y(p.lo)}`);
        s.appendChild(sv("polygon", { points: arriba.concat(abajo).join(" "), fill: banda.color, opacity: 0.14 }));
      }
      const ordenLn = limites.slice().sort((a, b) => a.v - b.v);
      ordenLn.forEach((l, i) => {
        s.appendChild(sv("line", { x1: izq, x2: W - der, y1: y(l.v), y2: y(l.v), stroke: l.color, "stroke-width": 1.5, "stroke-dasharray": l.dash ? "4 3" : null }));
        const debajo = ordenLn.length > 1 && i === 0;
        s.appendChild(sv("text", { x: W - der, y: y(l.v) + (debajo ? 13 : -4), "text-anchor": "end", style: "fill:" + css("--tinta-2") }, l.etiqueta));
      });
      rectas.forEach((r) => s.appendChild(sv("line", { x1: x(r.x0), y1: y(r.y0), x2: x(r.x1), y2: y(r.y1), stroke: r.color, "stroke-width": 2, "stroke-dasharray": r.dash ? "6 4" : null, "stroke-linecap": "round" })));
      series.forEach((se) => {
        if (se.puntos.length < 1) return;
        if (se.soloPuntos) return;
        const d = se.puntos.map((p, i) => (i ? "L" : "M") + x(p.x).toFixed(1) + "," + y(p.y).toFixed(1)).join(" ");
        if (areaBajo) s.appendChild(sv("path", { d: d + ` L${x(se.puntos[se.puntos.length - 1].x)},${y(d0)} L${x(se.puntos[0].x)},${y(d0)} Z`, fill: se.color, opacity: 0.1 }));
        s.appendChild(sv("path", { d, fill: "none", stroke: se.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      });
      // puntos (series de solo puntos y marcas)
      series.filter((se) => se.soloPuntos).forEach((se) => se.puntos.forEach((p) => {
        s.appendChild(sv("circle", { cx: x(p.x), cy: y(p.y), r: 4, fill: p.color || se.color, stroke: css("--superficie"), "stroke-width": 2 }));
      }));
      marcas.forEach((p) => s.appendChild(sv("circle", { cx: x(p.x), cy: y(p.y), r: 5, fill: p.color, stroke: css("--superficie"), "stroke-width": 2 })));
      // punto final de la serie principal
      const ult = series[0] && !series[0].soloPuntos && series[0].puntos[series[0].puntos.length - 1];
      if (ult) s.appendChild(sv("circle", { cx: x(ult.x), cy: y(ult.y), r: 4.5, fill: series[0].color, stroke: css("--superficie"), "stroke-width": 2 }));
      s.appendChild(sv("line", { x1: izq, x2: W - der, y1: y(d0), y2: y(d0), class: "eje" }));
      // cruz y sugerencia: ancla al punto mas cercano en x
      const guia = sv("line", { y1: sup, y2: H - inf, stroke: css("--mudo"), "stroke-width": 1, visibility: "hidden" });
      s.appendChild(guia);
      const cap = sv("rect", { x: izq, y: sup, width: W - izq - der, height: H - sup - inf, fill: "transparent", tabindex: 0 });
      const buscar = (px) => {
        const v = xs[0] + ((px - izq) / (W - izq - der)) * (xs[1] - xs[0]);
        let mejor = null, dm = Infinity;
        series.forEach((se) => se.puntos.forEach((p) => { const d = Math.abs(p.x - v); if (d < dm) { dm = d; mejor = { se, p }; } }));
        return mejor;
      };
      cap.addEventListener("pointermove", (e) => {
        const r = s.getBoundingClientRect(), m = buscar(e.clientX - r.left);
        if (!m) return;
        guia.setAttribute("x1", x(m.p.x)); guia.setAttribute("x2", x(m.p.x)); guia.setAttribute("visibility", "visible");
        const lineas = [f1(m.p.y) + " " + unidad, tiempo ? fechaHora(m.p.x) : (formatoX ? formatoX(m.p.x) : String(m.p.x))];
        if (m.p.detalle) lineas.push(...m.p.detalle);
        mostrarSug(e, lineas);
      });
      cap.addEventListener("pointerleave", () => { guia.setAttribute("visibility", "hidden"); ocultarSug(); });
      s.appendChild(cap);
      cont.appendChild(s);
    });
  }

  // ----------------------------------------------------- BARRA APILADA
  /* partes: [{etiqueta, valor, color}] -> una barra horizontal con huecos de 2 px */
  function apilada(cont, { partes }) {
    const total = partes.reduce((s, p) => s + p.valor, 0) || 1;
    const caja = el("div", { style: "display:flex;gap:2px;height:22px", role: "img", "aria-label": partes.map((p) => p.etiqueta + " " + p.valor).join(", ") });
    partes.forEach((p, i) => {
      if (p.valor <= 0) return;
      const seg = el("div", { style: `flex:${p.valor} 1 0;background:${p.color};min-width:3px;${i === 0 || partes.slice(0, i).every((q) => q.valor <= 0) ? "border-radius:4px 0 0 4px;" : ""}${i === partes.length - 1 ? "border-radius:0 4px 4px 0;" : ""}`, tabindex: 0 });
      const mostrar = (e) => mostrarSug(e, [p.valor + " (" + ((100 * p.valor) / total).toFixed(0) + " %)", p.etiqueta]);
      seg.addEventListener("pointermove", mostrar); seg.addEventListener("pointerleave", ocultarSug);
      seg.addEventListener("focus", () => mostrar(aEvento(seg))); seg.addEventListener("blur", ocultarSug);
      caja.appendChild(seg);
    });
    cont.replaceChildren(caja, leyenda(partes.map((p) => ({ caja: true, color: p.color, texto: p.etiqueta + ": " + p.valor }))));
  }

  // ------------------------------------------------------------- medidor
  function medidor(cont, { valor, min = 30, max = 110, marcas = [], color }) {
    const pct = (v) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
    cont.replaceChildren(
      el("div", { class: "medidor", role: "meter", "aria-valuemin": min, "aria-valuemax": max, "aria-valuenow": Math.round(valor) },
        el("i", { style: `width:${pct(valor)}%;background:${color}` }),
        marcas.map((m) => el("b", { style: `left:${pct(m)}%` }))),
      el("div", { class: "medidor-escala" }, el("span", { texto: String(min) }), el("span", { texto: marcas.length ? marcas.join(" · ") + " dB(A)" : "" }), el("span", { texto: String(max) }))
    );
  }

  raiz.SON_G = { el, sv, css, colorSem, f0, f1, f2, miles, fechaHora, fechaCorta, horaCorta, ticks, montar, barras, columnas, linea, apilada, medidor, leyenda, tablaEquivalente, mostrarSug, ocultarSug };
})(window);
