/* Vista MAPA: puntos coloreados por semaforo sobre imagen satelital + superficie IDW. */
(function (raiz) {
  "use strict";
  const { el, f1, f0, colorSem } = raiz.SON_G;
  const A = raiz.SON_ANALISIS, N = raiz.SON_NORMAS, U = raiz.SON_U;
  raiz.SON_VISTAS = raiz.SON_VISTAS || {};

  let mapa = null, capaPuntos = null, capaIdw = null, capaVivo = null, base = null, ultimaClave = "";
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

  function fondo(tipo) {
    if (base) { mapa.removeLayer(base); base = null; }
    if (tipo === "satelite") base = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imágenes © Esri, Maxar, Earthstar Geographics" });
    else if (tipo === "calle") base = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© colaboradores de OpenStreetMap" });
    if (base) base.addTo(mapa);
  }

  function dibujar(S, ajustarVista) {
    const meds = S.filtradas.filter((m) => m.leq !== null && m.lat !== null);
    const pts = A.porPunto(meds).filter((p) => p.lat !== null);
    capaPuntos.clearLayers();
    if (capaIdw) { mapa.removeLayer(capaIdw); capaIdw = null; }

    pts.forEach((p) => {
      const c = L.circleMarker([p.lat, p.lon], { radius: 9, color: "#ffffff", weight: 2.5, fillColor: colorSem(p.sem), fillOpacity: 0.95 });
      const caja = el("div", { style: "min-width:180px" },
        el("b", { texto: p.punto }), el("br"),
        el("span", { texto: f1(p.leq) + " dB(A) · " + p.n + " medición(es)" }), el("br"),
        el("span", { class: "mudo", texto: "Máx " + f1(p.max) + " · " + f1(p.pctSobreLimite) + " % ≥ 85" }), el("br"),
        el("span", { class: "mudo", texto: (p.ambito || "") + " · " + (p.proyecto || "") }), el("br"),
        el("button", { class: "boton sec", type: "button", style: "margin-top:6px;padding:4px 10px", onclick: () => { raiz.SON_UI.irA("mediciones"); } }, "Ver mediciones"));
      c.bindPopup(caja);
      c.bindTooltip(p.punto + " · " + f1(p.leq) + " dB(A)", { direction: "top" });
      c.addTo(capaPuntos);
    });

    const nota = document.getElementById("mapa-nota");
    const sup = pts.filter((p) => p.ambito === "SUPERFICIE");
    // el interior de mina no se interpola: sus labores estan a otra cota y el ruido no se propaga hasta la superficie
    const ptsIdw = pts.filter((p) => p.ambito !== "INTERIOR");
    if (estado.idw && ptsIdw.length >= 4) {
      const grid = A.rejillaIdw(ptsIdw, 70);
      if (grid) {
        const d0 = Math.floor(Math.min(...ptsIdw.map((p) => p.leq)) / 5) * 5, d1 = Math.ceil(Math.max(...ptsIdw.map((p) => p.leq)) / 5) * 5;
        capaIdw = L.imageOverlay(lienzoIdw(grid, d0, d1), grid.limites, { opacity: estado.opacidad, interactive: false }).addTo(mapa);
        capaPuntos.bringToFront();
        const cv = A.validacionCruzada(ptsIdw);
        document.getElementById("mapa-rampa").replaceChildren(
          el("div", { class: "rampa" }),
          el("div", { class: "fila", style: "justify-content:space-between;font-size:11px" }, el("span", { texto: d0 + " dB(A)" }), el("span", { texto: d1 + " dB(A)" })));
        if (nota) nota.textContent = "Superficie interpolada (IDW, potencia 2, en dominio de energía) solo con los " + ptsIdw.length + " puntos de superficie; el interior de mina no se interpola" +
          (cv ? ". Validación cruzada leave-one-out: error medio cuadrático " + f1(cv.rmse) + " dB, error medio absoluto " + f1(cv.mae) + " dB." : ".") +
          " Úsela como guía, no como mapa de isófonas certificado.";
      }
    } else if (nota) {
      document.getElementById("mapa-rampa").replaceChildren();
      nota.textContent = estado.idw ? "Se necesitan al menos 4 puntos de superficie con coordenadas para interpolar el nivel." : "";
    }

    if (pts.length && ajustarVista) {
      const b = L.latLngBounds(pts.map((p) => [p.lat, p.lon]));
      mapa.fitBounds(b.pad(0.35), { maxZoom: 18 });
    }
    if (!pts.length) { if (nota) nota.textContent = "Ninguna medición del filtro tiene coordenadas."; }
  }

  // Celulares en tiempo real y su rastro de las ultimas 12 h
  function dibujarVivo(S) {
    if (!mapa || !capaVivo) return;
    capaVivo.clearLayers();
    const colores = [raiz.SON_G.css("--serie-1"), raiz.SON_G.css("--serie-2"), raiz.SON_G.css("--serie-3"), "#8a63d2", "#c2417a"];
    const ids = [...S.vivos.keys()].sort();
    [...S.vivos.values()].filter((v) => !S.filtro.proyecto || v.proyecto === S.filtro.proyecto).forEach((v) => {
      const color = colores[ids.indexOf(v.id) % colores.length];
      const r = (S.rastro.get(v.id) || []).filter((q) => q[3] >= Date.now() - 12 * 3600000);
      if (r.length >= 2) L.polyline(r.map((q) => [q[0], q[1]]), { color, weight: 3, opacity: 0.8 }).addTo(capaVivo);
      const ll = v.latitud !== null && v.latitud !== undefined && Number.isFinite(Number(v.latitud)) ? [Number(v.latitud), Number(v.longitud)]
        : (v.este !== null && v.este !== undefined && Number.isFinite(Number(v.este)) ? N.utmALatLon(Number(v.este), Number(v.norte), "19S") : null);
      if (!ll) return;
      const midiendo = S.activos().includes(v);
      L.marker(ll, { zIndexOffset: 1000, icon: L.divIcon({ className: "", iconSize: [18, 18], iconAnchor: [9, 9], html: '<div class="marcador-equipo' + (midiendo ? " midiendo" : "") + '" style="background:' + color + '"></div>' }) })
        .bindTooltip((v.dispositivo || "Celular") + " · " + (midiendo ? f0(Number(v.nivel_dba)) + " dB(A) · " : "sin medir · ") + (v.punto || ""), { direction: "top", offset: [0, -10] })
        .addTo(capaVivo);
    });
  }

  function render(cont, S) {
    const botones = (opciones, actual, alElegir) => el("div", { class: "grupo-botones" }, opciones.map(([v, t]) => el("button", { type: "button", "aria-pressed": String(actual === v), onclick: (e) => { alElegir(v); e.target.parentNode.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false")); e.target.setAttribute("aria-pressed", "true"); } }, t)));
    const barra = el("div", { class: "fila", style: "margin-bottom:10px" },
      botones([["satelite", "Satélite"], ["calle", "Calles"], ["ninguno", "Sin mapa"]], estado.fondo, (v) => { estado.fondo = v; fondo(v); }),
      botones([["si", "Superficie de nivel"], ["no", "Solo puntos"]], estado.idw ? "si" : "no", (v) => { estado.idw = v === "si"; dibujar(raiz.SON_S, false); }),
      el("button", { class: "boton sec", type: "button", onclick: () => dibujar(raiz.SON_S, true) }, "Encuadrar"));
    const leyenda = el("div", { class: "leyenda-mapa", style: "margin-top:10px" },
      el("span", null, el("span", { class: "cuadro", style: "background:#0ca30c" }), "Conforme (menos de 82 dB(A))  "),
      el("span", null, el("span", { class: "cuadro", style: "background:#fab219" }), "Precaución (82 a 85)  "),
      el("span", null, el("span", { class: "cuadro", style: "background:#d03b3b" }), "Excede (85 o más)"));
    const caja = el("div", { id: "mapa" });
    cont.replaceChildren(el("div", { class: "tarjeta" }, el("h2", { texto: "Mapa de mediciones" }),
      el("p", { class: "sub", texto: "Cada círculo es un punto de medición, coloreado por el Leq del punto frente al límite de 85 dB(A) y el nivel de acción de 82 dB(A). Los celulares que están en campo aparecen en tiempo real con su rastro." }),
      barra, caja, leyenda, el("div", { id: "mapa-rampa", style: "max-width:320px;margin-top:8px" }), el("p", { id: "mapa-nota", class: "mudo", style: "font-size:12.5px;margin-top:8px" })));

    if (mapa) { mapa.remove(); mapa = null; }
    mapa = L.map(caja, { zoomControl: true, scrollWheelZoom: true }).setView([-15.84, -70.02], 16);
    capaPuntos = L.featureGroup().addTo(mapa);
    capaVivo = L.featureGroup().addTo(mapa);
    fondo(estado.fondo);
    dibujar(S, true);
    dibujarVivo(S);
    setTimeout(() => mapa && mapa.invalidateSize(), 150);
  }

  raiz.SON_VISTAS.mapa = { render, actualizar: dibujarVivo, tic: dibujarVivo };
})(window);
