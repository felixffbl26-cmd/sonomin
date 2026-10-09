/* SONOMIN · piezas comunes de los mapas (En vivo y Mapa).
 *  - El mapa recuerda donde lo dejo la persona: no vuelve a encuadrarse solo cuando llegan datos.
 *  - Los puntos cercanos se agrupan en un circulo con el numero de mediciones (se separan al acercarse).
 *  - Los celulares se actualizan sin borrar y volver a crear sus marcadores (no parpadean ni cierran el globo abierto).
 *  - Lista de puntos con buscador y boton "Ir": lleva el mapa al punto exacto y lo resalta.
 * Todo texto que viene de la base de datos se inserta como texto (nunca como HTML). */
(function (raiz) {
  "use strict";
  const { el } = raiz.SON_G;
  const N = raiz.SON_NORMAS;

  const ATRIB_SAT = "Imágenes © Esri, Maxar, Earthstar Geographics";
  const ATRIB_OSM = "© colaboradores de OpenStreetMap";
  const COLOR = { CONFORME: "#1e9e57", PRECAUCION: "#e69a0b", EXCEDE: "#e74c3c" };
  const colorNivel = (leq) => COLOR[N.semaforo(leq)] || "#6b7785";
  const vistas = new Map(); // id del mapa -> { centro, zoom } (se conserva al cambiar de pestaña o al llegar datos)
  const texto = (t) => el("span", { texto: t });

  function crear(caja, id, opciones = {}) {
    const mapa = L.map(caja, { zoomControl: true, scrollWheelZoom: opciones.rueda !== false, maxZoom: 21, zoomSnap: 0.5 });
    const guardada = vistas.get(id);
    if (guardada) mapa.setView(guardada.centro, guardada.zoom, { animate: false });
    else mapa.setView([-15.84, -70.02], 15);
    const fondos = {
      satelite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 21, maxNativeZoom: 19, attribution: ATRIB_SAT }),
      calle: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 21, maxNativeZoom: 19, attribution: ATRIB_OSM }),
    };
    let actual = null;
    function fondo(tipo) {
      if (actual) mapa.removeLayer(actual);
      actual = fondos[tipo] || null;
      if (actual) actual.addTo(mapa).bringToBack();
    }
    fondo(opciones.fondo || "satelite");
    mapa.on("moveend", () => vistas.set(id, { centro: mapa.getCenter(), zoom: mapa.getZoom() }));
    setTimeout(() => mapa.invalidateSize(), 150);
    return { mapa, fondo, tieneVista: !!guardada };
  }

  /** Encuadra una lista de [lat, lon] (si hay uno solo, se acerca a el). */
  function encuadrar(mapa, puntos) {
    if (!puntos.length) return;
    if (puntos.length === 1) { mapa.setView(puntos[0], 18); return; }
    mapa.fitBounds(L.latLngBounds(puntos).pad(0.25), { maxZoom: 19 });
  }

  /* ---------------------------------------------------------- capa agrupada
   * items: { clave, lat, lon, leq, titulo, detalle: [lineas], alAbrir?: fn }
   * Los items a menos de 'radio' pixeles se unen. Al hacer clic en un grupo se acerca; si ya no se puede
   * acercar mas (mediciones en el mismo lugar) muestra la lista de ese lugar. */
  function capaAgrupada(mapa, opciones = {}) {
    const capa = L.featureGroup().addTo(mapa);
    const radio = opciones.radio || 34;
    let items = [], porClave = new Map(), resaltada = null;

    function popupDe(it) {
      return el("div", { style: "min-width:190px" },
        el("b", { texto: it.titulo }), it.detalle.map((l) => el("div", { class: "mudo", style: "font-size:12.5px", texto: l })),
        it.alAbrir ? el("button", { class: "boton sec", type: "button", style: "margin-top:6px;padding:4px 10px;font-size:13px", onclick: it.alAbrir }, opciones.textoAbrir || "Abrir") : null);
    }
    function marcador(it) {
      const r = opciones.radioPunto || 8;
      const m = L.circleMarker([it.lat, it.lon], { radius: r, color: "#ffffff", weight: 2.5, fillColor: colorNivel(it.leq), fillOpacity: 0.95 });
      m.bindTooltip(texto(it.titulo + " · " + (Number.isFinite(it.leq) ? it.leq.toFixed(1) + " dB(A)" : "")), { direction: "top", offset: [0, -4] });
      m.bindPopup(popupDe(it));
      porClave.set(it.clave, m);
      return m;
    }
    function iconoGrupo(gs) {
      const max = Math.max(...gs.map((g) => (Number.isFinite(g.leq) ? g.leq : 0)));
      const n = gs.length, lado = n < 10 ? 30 : n < 100 ? 36 : 42;
      const div = document.createElement("div");
      div.className = "grupo-marcas";
      div.style.cssText = "width:" + lado + "px;height:" + lado + "px;background:" + colorNivel(max);
      div.textContent = String(n);
      return L.divIcon({ className: "", html: div, iconSize: [lado, lado], iconAnchor: [lado / 2, lado / 2] });
    }
    function listaDe(gs) {
      return el("div", { style: "min-width:220px;max-height:240px;overflow:auto" },
        el("b", { texto: gs.length + " mediciones en este lugar" }),
        gs.slice().sort((a, b) => (b.leq || 0) - (a.leq || 0)).map((it) => el("div", { style: "padding:4px 0;border-bottom:1px solid var(--rejilla);font-size:12.5px" },
          el("span", { style: "display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:" + colorNivel(it.leq) }),
          el("span", { texto: it.titulo + " · " + (Number.isFinite(it.leq) ? it.leq.toFixed(1) : "–") + " dB(A)" }),
          it.alAbrir ? el("button", { class: "enlace", type: "button", style: "margin-left:6px;font-size:12px", onclick: it.alAbrir }, "abrir") : null)));
    }
    function dibujar() {
      capa.clearLayers(); porClave = new Map();
      const z = mapa.getZoom(), grupos = [];
      items.slice().sort((a, b) => (b.leq || 0) - (a.leq || 0)).forEach((it) => {
        const p = mapa.project([it.lat, it.lon], z);
        const g = grupos.find((x) => Math.abs(x.p.x - p.x) < radio && Math.abs(x.p.y - p.y) < radio);
        if (g) g.items.push(it); else grupos.push({ p, items: [it] });
      });
      grupos.forEach((g) => {
        if (g.items.length === 1) { marcador(g.items[0]).addTo(capa); return; }
        const lat = g.items.reduce((s, i) => s + i.lat, 0) / g.items.length, lon = g.items.reduce((s, i) => s + i.lon, 0) / g.items.length;
        const mk = L.marker([lat, lon], { icon: iconoGrupo(g.items), zIndexOffset: 400 });
        mk.bindTooltip(texto(g.items.length + " mediciones · máx " + Math.max(...g.items.map((i) => i.leq || 0)).toFixed(1) + " dB(A) · clic para acercar"), { direction: "top" });
        mk.on("click", () => {
          const b = L.latLngBounds(g.items.map((i) => [i.lat, i.lon]));
          const mismoLugar = mapa.distance(b.getNorthEast(), b.getSouthWest()) < 0.5;
          if (mismoLugar || mapa.getZoom() >= mapa.getMaxZoom() - 0.5) mk.bindPopup(listaDe(g.items)).openPopup();
          else mapa.fitBounds(b.pad(0.5), { maxZoom: mapa.getMaxZoom() });
        });
        g.items.forEach((i) => porClave.set(i.clave, mk));
        mk.addTo(capa);
      });
      if (resaltada) resaltar(resaltada, false);
    }
    function resaltar(clave, abrir) {
      resaltada = clave;
      const m = porClave.get(clave);
      if (!m) return;
      if (m.setStyle) m.setStyle({ color: "#0c2d5c", weight: 4, radius: (opciones.radioPunto || 8) + 4 });
      if (abrir) m.openPopup();
    }
    mapa.on("zoomend", dibujar);
    return {
      capa,
      poner(nuevos) { items = nuevos.filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lon)); dibujar(); },
      items: () => items,
      /** Lleva el mapa al item y lo resalta. */
      ir(clave) {
        const it = items.find((i) => i.clave === clave);
        if (!it) return;
        const destino = Math.max(mapa.getZoom(), 19);
        resaltada = clave;
        mapa.once("moveend", () => setTimeout(() => resaltar(clave, true), 60));
        mapa.flyTo([it.lat, it.lon], destino, { duration: 0.6 });
      },
      limites: () => items.map((i) => [i.lat, i.lon]),
    };
  }

  /* ---------------------------------------------------------- celulares en vivo
   * Actualiza marcadores y rastros en su sitio (sin borrar y crear de nuevo). */
  function capaEquipos(mapa) {
    const capaR = L.featureGroup().addTo(mapa), capaE = L.featureGroup().addTo(mapa);
    const marcas = new Map(), rastros = new Map();
    function icono(color, midiendo) {
      const d = document.createElement("div");
      d.className = "marcador-equipo" + (midiendo ? " midiendo" : "");
      d.style.background = color;
      return L.divIcon({ className: "", html: d, iconSize: [18, 18], iconAnchor: [9, 9] });
    }
    return {
      capaR, capaE,
      /** lista: [{ id, ll, color, midiendo, etiqueta, popup: fn->Node, rastro: [[lat,lon],...] }] */
      actualizar(lista) {
        const vistos = new Set();
        lista.forEach((e, i) => {
          vistos.add(e.id);
          if (e.rastro && e.rastro.length >= 2) {
            let pl = rastros.get(e.id);
            if (!pl) { pl = L.polyline(e.rastro, { color: e.color, weight: 3, opacity: 0.85 }).addTo(capaR); rastros.set(e.id, pl); }
            else { pl.setLatLngs(e.rastro); pl.setStyle({ color: e.color }); }
          } else if (rastros.has(e.id)) { capaR.removeLayer(rastros.get(e.id)); rastros.delete(e.id); }
          if (!e.ll) { if (marcas.has(e.id)) { capaE.removeLayer(marcas.get(e.id).m); marcas.delete(e.id); } return; }
          let r = marcas.get(e.id);
          if (!r) {
            const m = L.marker(e.ll, { icon: icono(e.color, e.midiendo), zIndexOffset: 1000 });
            m.bindTooltip(texto(e.etiqueta), { direction: i % 2 ? "bottom" : "top", permanent: e.midiendo, offset: [0, i % 2 ? 10 : -10] });
            const reg = { m, midiendo: e.midiendo, color: e.color, datos: e };
            m.bindPopup(() => reg.datos.popup());
            m.addTo(capaE);
            r = reg;
            marcas.set(e.id, r);
          }
          r.m.setLatLng(e.ll);
          if (r.midiendo !== e.midiendo || r.color !== e.color) {
            r.m.setIcon(icono(e.color, e.midiendo));
            const tt = r.m.getTooltip();
            r.m.unbindTooltip();
            r.m.bindTooltip(texto(e.etiqueta), { direction: tt ? tt.options.direction : "top", permanent: e.midiendo, offset: tt ? tt.options.offset : [0, -10] });
            if (e.midiendo) r.m.openTooltip();
            r.midiendo = e.midiendo; r.color = e.color;
          } else r.m.setTooltipContent(texto(e.etiqueta));
          r.datos = e;
        });
        for (const [id, r] of marcas) if (!vistos.has(id)) { capaE.removeLayer(r.m); marcas.delete(id); }
        for (const [id, pl] of rastros) if (!vistos.has(id)) { capaR.removeLayer(pl); rastros.delete(id); }
      },
      posiciones: () => [...marcas.values()].map((r) => r.m.getLatLng()),
      ir(id) { const r = marcas.get(id); if (r) { mapa.flyTo(r.m.getLatLng(), Math.max(mapa.getZoom(), 18), { duration: 0.6 }); setTimeout(() => r.m.openPopup(), 700); } },
    };
  }

  /* ---------------------------------------------------------- lista "Ir al punto"
   * grupos: [{ clave, nombre, sub, leq, n }] ; alElegir(clave) */
  function listaPuntos(grupos, alElegir, opciones = {}) {
    const buscar = el("input", { type: "search", placeholder: opciones.placeholder || "Buscar punto o estación…", "aria-label": "Buscar punto", style: "width:100%;min-width:0" });
    const ul = el("ul", { class: "lista-puntos" });
    const cuenta = el("p", { class: "mudo", style: "font-size:12.5px;margin:6px 0 0" });
    function pintar() {
      const q = buscar.value.trim().toLowerCase();
      const vis = grupos.filter((g) => !q || (g.nombre + " " + (g.sub || "")).toLowerCase().includes(q));
      cuenta.textContent = vis.length + " de " + grupos.length + (opciones.unidad || " puntos") + " · pulse uno para ir al lugar exacto";
      ul.replaceChildren(...vis.slice(0, 400).map((g) => {
        const li = el("li", { tabindex: "0", role: "button", title: "Ir a " + g.nombre },
          el("span", { class: "chip-color", style: "background:" + colorNivel(g.leq) }),
          el("span", null, el("span", { texto: g.nombre }), g.sub ? el("small", { class: "mudo", texto: g.sub }) : null),
          el("span", { class: "num", texto: Number.isFinite(g.leq) ? g.leq.toFixed(1) : "–" }));
        const ir = () => { ul.querySelectorAll("li.activo").forEach((x) => x.classList.remove("activo")); li.classList.add("activo"); alElegir(g.clave); };
        li.addEventListener("click", ir);
        li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(); } });
        return li;
      }));
    }
    buscar.addEventListener("input", pintar);
    pintar();
    return el("div", null, buscar, cuenta, ul);
  }

  raiz.SON_MAPAS = { crear, encuadrar, capaAgrupada, capaEquipos, listaPuntos, colorNivel };
})(window);
