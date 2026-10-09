/* Vista MAPA: puntos coloreados por semaforo sobre imagen satelital + superficie IDW. */
(function (raiz) {
  "use strict";
  const { el, f1, f0, colorSem } = raiz.SON_G;
  const A = raiz.SON_ANALISIS, N = raiz.SON_NORMAS, U = raiz.SON_U;
  raiz.SON_VISTAS = raiz.SON_VISTAS || {};

  let mapa = null, capaIdw = null;
  const estado = { fondo: "satelite", idw: true, opacidad: 0.55 };

  // rampa secuencial azul (una sola tonalidad, claro -> oscuro) para el nivel interpolado
  const RAMPA = [[205, 226, 251], [109, 167, 236], [37, 106, 191], [13, 54, 107]];
  function colorRampa(t) {
    t = Math.max(0, Math.min(1, t));
    const p = t * (RAMPA.length - 1), i = Math.min(RAMPA.length - 2, Math.floor(p)), f = p - i;
    return RAMPA[i].map((c, k) => Math.round(c + (RAMPA[i + 1][k] - c) * f));
  }

  function lienzoIdw(grid, d0, d1) {
    const c = document.createElement("canvas");
    c.width = grid.nx; c.height = grid.ny;
    const g = c.getContext("2d"), img = g.createImageData(grid.nx, grid.ny);
    for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
      const [r, gg, b] = colorRampa((grid.z[j][i] - d0) / (d1 - d0)), k = (j * grid.nx + i) * 4;
      img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }

  const M = raiz.SON_MAPAS;
  let fondoFn = null, puntosCapa = null, equiposCapa = null, listaCaja = null;
  const estadoLista = { agrupar: "estacion" };

  // Puntos del mapa: por estacion de monitoreo (une los tramos de un recorrido con su punto base)
  // o cada punto tal como se guardo.
  function puntosDe(S) {
    const meds = S.filtradas.filter((m) => m.leq !== null && m.lat !== null);
    const pts = estadoLista.agrupar === "estacion" ? A.porEstacion(meds) : A.porPunto(meds);
    return pts.filter((p) => p.lat !== null);
  }

  function dibujar(S, ajustarVista) {
    const pts = puntosDe(S);
    if (capaIdw) { mapa.removeLayer(capaIdw); capaIdw = null; }
    puntosCapa.poner(pts.map((p) => ({
      clave: p.clave, lat: p.lat, lon: p.lon, leq: p.leq, titulo: p.punto,
      detalle: [f1(p.leq) + " dB(A) · " + p.n + " medición(es) · máx " + f1(p.max), f1(p.pctSobreLimite) + " % de lecturas ≥ 85 dB(A)", (p.ambito || "") + " · " + (p.proyecto || ""),
        p.nombres && p.nombres.length > 1 ? "Une: " + p.nombres.slice(0, 6).join(", ") + (p.nombres.length > 6 ? "…" : "") : ""].filter(Boolean),
      alAbrir: () => { raiz.SON_UI.irA("mediciones"); },
    })));
    if (listaCaja) listaCaja.replaceChildren(M.listaPuntos(pts.map((p) => ({ clave: p.clave, nombre: p.punto, leq: p.leq,
      sub: p.n + " med. · " + (p.ambito === "INTERIOR" ? "interior" : "superficie") + (S.filtro.proyecto ? "" : " · " + p.proyecto) })),
      (clave) => { puntosCapa.ir(clave); caja().scrollIntoView({ behavior: "smooth", block: "nearest" }); },
      { unidad: estadoLista.agrupar === "estacion" ? " estaciones" : " puntos" }));

    const nota = document.getElementById("mapa-nota");
    // el interior de mina no se interpola: sus labores estan a otra cota y el ruido no se propaga hasta la superficie
    const ptsIdw = pts.filter((p) => p.ambito !== "INTERIOR");
    if (estado.idw && ptsIdw.length >= 4) {
      const grid = A.rejillaIdw(ptsIdw, 70);
      if (grid) {
        const d0 = Math.floor(Math.min(...ptsIdw.map((p) => p.leq)) / 5) * 5, d1 = Math.ceil(Math.max(...ptsIdw.map((p) => p.leq)) / 5) * 5;
        capaIdw = L.imageOverlay(lienzoIdw(grid, d0, d1), grid.limites, { opacity: estado.opacidad, interactive: false }).addTo(mapa);
        puntosCapa.capa.bringToFront();
        const cv = A.validacionCruzada(ptsIdw);
        document.getElementById("mapa-rampa").replaceChildren(
          el("div", { class: "rampa", style: "background:linear-gradient(90deg,rgb(205,226,251),rgb(109,167,236),rgb(37,106,191),rgb(13,54,107))" }),
          el("div", { class: "fila", style: "justify-content:space-between;font-size:11px" }, el("span", { texto: d0 + " dB(A)" }), el("span", { texto: d1 + " dB(A)" })));
        if (nota) nota.textContent = "Superficie interpolada (IDW, potencia 2, en dominio de energía) solo con los " + ptsIdw.length + " puntos de superficie; el interior de mina no se interpola" +
          (cv ? ". Validación cruzada leave-one-out: error medio cuadrático " + f1(cv.rmse) + " dB, error medio absoluto " + f1(cv.mae) + " dB." : ".") +
          " Úsela como guía, no como mapa de isófonas certificado.";
      }
    } else if (nota) {
      document.getElementById("mapa-rampa").replaceChildren();
      nota.textContent = estado.idw ? "Se necesitan al menos 4 puntos de superficie con coordenadas para interpolar el nivel." : "";
    }
    if (pts.length && ajustarVista) M.encuadrar(mapa, pts.map((p) => [p.lat, p.lon]));
    if (!pts.length && nota) nota.textContent = "Ninguna medición del filtro tiene coordenadas.";
  }
  const caja = () => document.getElementById("mapa");

  // Celulares en tiempo real y su rastro de las ultimas 12 h (se actualizan en su sitio)
  function dibujarVivo(S) {
    if (!mapa || !equiposCapa) return;
    const colores = [raiz.SON_G.css("--serie-1"), raiz.SON_G.css("--serie-2"), raiz.SON_G.css("--serie-3"), "#8a63d2", "#c2417a"];
    const ids = [...S.vivos.keys()].sort();
    equiposCapa.actualizar([...S.vivos.values()].filter((v) => !S.filtro.proyecto || v.proyecto === S.filtro.proyecto).map((v) => {
      const ll = v.latitud !== null && v.latitud !== undefined && Number.isFinite(Number(v.latitud)) ? [Number(v.latitud), Number(v.longitud)]
        : (v.este !== null && v.este !== undefined && Number.isFinite(Number(v.este)) ? N.utmALatLon(Number(v.este), Number(v.norte), "19S") : null);
      const midiendo = S.activos().includes(v);
      return {
        id: v.id, ll, color: colores[ids.indexOf(v.id) % colores.length], midiendo,
        etiqueta: (v.dispositivo || "Celular") + " · " + (midiendo ? f0(Number(v.nivel_dba)) + " dB(A)" : "sin medir") + (v.punto ? " · " + v.punto : ""),
        rastro: (S.rastro.get(v.id) || []).filter((q) => q[3] >= Date.now() - 12 * 3600000).map((q) => [q[0], q[1]]),
        popup: () => el("div", null, el("b", { texto: v.dispositivo || "Celular" }), el("div", { class: "mudo", texto: (v.proyecto || "") + " · " + (v.punto || "") })),
      };
    }));
  }

  function render(cont, S) {
    const botones = (opciones, actual, alElegir) => el("div", { class: "grupo-botones" }, opciones.map(([v, t]) => el("button", { type: "button", "aria-pressed": String(actual === v), onclick: (e) => { alElegir(v); e.currentTarget.parentNode.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false")); e.currentTarget.setAttribute("aria-pressed", "true"); } }, t)));
    const barra = el("div", { class: "fila", style: "margin-bottom:10px" },
      botones([["satelite", "Satélite"], ["calle", "Calles"], ["ninguno", "Sin mapa"]], estado.fondo, (v) => { estado.fondo = v; fondoFn(v); }),
      botones([["si", "Superficie de nivel"], ["no", "Solo puntos"]], estado.idw ? "si" : "no", (v) => { estado.idw = v === "si"; dibujar(raiz.SON_S, false); }),
      botones([["estacion", "Por estación"], ["punto", "Cada punto"]], estadoLista.agrupar, (v) => { estadoLista.agrupar = v; dibujar(raiz.SON_S, false); }),
      el("button", { class: "boton sec", type: "button", onclick: () => dibujar(raiz.SON_S, true) }, "Encuadrar todo"));
    const leyenda = el("div", { class: "leyenda-mapa", style: "margin-top:10px" },
      el("span", null, el("span", { class: "cuadro", style: "background:#1e9e57" }), "Conforme (menos de 82 dB(A))  "),
      el("span", null, el("span", { class: "cuadro", style: "background:#e69a0b" }), "Precaución (82 a 85)  "),
      el("span", null, el("span", { class: "cuadro", style: "background:#e74c3c" }), "Excede (85 o más)  "),
      el("span", null, el("span", { class: "cuadro", style: "background:#6b7785" }), "Número = mediciones agrupadas (pulse para separarlas)"));
    const cajaMapa = el("div", { id: "mapa" });
    listaCaja = el("div");
    cont.replaceChildren(el("div", { class: "rejilla cols-65" },
      el("div", { class: "tarjeta" }, el("h2", { texto: "Mapa de mediciones" }),
        el("p", { class: "sub", texto: "Cada círculo es una estación o punto de medición, coloreado por su Leq frente al límite de 85 dB(A) y el nivel de acción de 82 dB(A). El mapa se queda donde usted lo deja aunque lleguen datos nuevos." }),
        barra, cajaMapa, leyenda, el("div", { id: "mapa-rampa", style: "max-width:320px;margin-top:8px" }), el("p", { id: "mapa-nota", class: "mudo", style: "font-size:12.5px;margin-top:8px" })),
      el("div", { class: "tarjeta" }, el("h2", { texto: "Ir a un punto" }), el("p", { class: "sub", texto: "Busque y pulse un punto: el mapa va al lugar exacto y lo resalta." }), listaCaja)));

    if (mapa) { mapa.remove(); mapa = null; }
    const m = M.crear(cajaMapa, "mapa", { fondo: estado.fondo });
    mapa = m.mapa; fondoFn = m.fondo;
    puntosCapa = M.capaAgrupada(mapa, { radioPunto: 9, textoAbrir: "Ver mediciones" });
    equiposCapa = M.capaEquipos(mapa);
    dibujar(S, !m.tieneVista);
    dibujarVivo(S);
  }

  raiz.SON_VISTAS.mapa = { render, actualizar: dibujarVivo, tic: dibujarVivo };
})(window);
