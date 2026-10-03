/* Vista EN VIVO: centro de control. Que celular esta midiendo, donde, a cuanto, en que proyecto,
 * y todo lo que ocurre al segundo (inicio, fin, mediciones guardadas y alertas). */
(function (raiz) {
  "use strict";
  const { el, f1, f0, linea, fechaHora, colorSem, css } = raiz.SON_G;
  const U = raiz.SON_U, A = raiz.SON_ANALISIS, N = raiz.SON_NORMAS;
  raiz.SON_VISTAS = raiz.SON_VISTAS || {};

  let refs = {}, mapa = null, capas = null, ultimoPintado = 0, pendiente = null, filtroEv = "todo", encuadrado = false;
  const dos = (n) => String(n).padStart(2, "0");
  const horaSeg = (ms) => { const h = N.horaLima(ms); const s = Math.floor((ms / 1000) % 60); return dos(h.h) + ":" + dos(h.m) + ":" + dos(s); };
  const inicioHoy = () => Date.parse(N.horaLima(Date.now()).dia + "T05:00:00Z");
  const coloresSerie = () => [css("--serie-1"), css("--serie-2"), css("--serie-3"), "#8a63d2", "#c2417a", "#3d8f8f"];
  const MODO = { PUNTUAL: "Punto fijo", RECORRIDO: "Recorrido", JORNADA: "Jornada (dosimetría)", CONTINUO: "Monitoreo continuo" };

  // posicion del celular: GPS o, en interior mina, la del punto de control (UTM convertido)
  function posEquipo(v) {
    const la = Number(v.latitud), lo = Number(v.longitud);
    if (v.latitud !== null && v.latitud !== undefined && Number.isFinite(la) && Number.isFinite(lo)) return [la, lo];
    const e = Number(v.este), n = Number(v.norte);
    return v.este !== null && v.este !== undefined && Number.isFinite(e) && Number.isFinite(n) ? N.utmALatLon(e, n, "19S") : null;
  }

  function equiposVisibles(S) {
    const p = S.filtro.proyecto;
    const lista = [...S.vivos.values()].filter((v) => !p || v.proyecto === p);
    const peso = (v) => (S.activos().includes(v) ? 0 : S.conectadoReciente(v) ? 1 : 2);
    return lista.sort((a, b) => peso(a) - peso(b) || (Date.parse(b.actualizado || 0) - Date.parse(a.actualizado || 0)));
  }
  function colorEquipo(S, id) {
    const ids = [...S.vivos.keys()].sort();
    const c = coloresSerie();
    return c[Math.max(0, ids.indexOf(id)) % c.length];
  }

  // ------------------------------------------------------------- cifras
  function pintarKpis(S) {
    if (!refs.kpis) return;
    const desde = inicioHoy(), p = S.filtro.proyecto;
    const hoy = S.todas.filter((m) => (m.ms || 0) >= desde && (!p || m.proyecto === p));
    const act = S.activos().filter((v) => !p || v.proyecto === p);
    const proyHoy = new Set(hoy.map((m) => m.proyecto).concat(act.map((v) => v.proyecto)));
    const alertas = S.eventos.filter((e) => /^ALERTA/.test(e.tipo) && Date.parse(e.creado) >= desde && (!p || e.proyecto === p));
    const leqHoy = hoy.filter((m) => Number.isFinite(m.leq));
    const lg = leqHoy.length ? A.leqEnergetico(leqHoy.map((m) => m.leq), leqHoy.map((m) => m.dur)) : NaN;
    refs.kpis.replaceChildren(
      U.kpi("Celulares midiendo ahora", String(act.length), S.vivos.size + " equipo(s) registrados", act.length ? "c-EXCEDE" : ""),
      U.kpi("Mediciones de hoy", String(hoy.length), Number.isFinite(lg) ? "Leq energético del día " + f1(lg) + " dB(A)" : "todavía ninguna hoy"),
      U.kpi("Proyectos con actividad hoy", String(proyHoy.size), [...proyHoy].slice(0, 2).join(" · ") || "ninguno"),
      U.kpi("Alertas de hoy", String(alertas.length), "≥ 85 dB(A) o sobre el ECA", alertas.length ? "c-EXCEDE" : "c-CONFORME"));
  }

  // ------------------------------------------------------------ equipos
  function tarjetaEquipo(S, v) {
    const midiendo = S.activos().includes(v), conectado = S.conectadoReciente(v);
    const nivel = Number(v.nivel_dba), sem = Number.isFinite(nivel) ? N.semaforo(nivel) : null;
    const recibido = S.vivoRecibido.get(v.id) || 0;
    const estado = midiendo ? "Midiendo" : conectado ? "Conectado, sin medir" : "Sin señal " + (recibido ? U.hace(recibido) : (v.actualizado ? U.hace(Date.parse(v.actualizado)) : ""));
    const dl = el("dl", { class: "datos-equipo" });
    const fila = (k, val) => { if (val !== null && val !== undefined && val !== "") dl.append(el("dt", { texto: k }), el("dd", { texto: String(val) })); };
    fila("Proyecto", v.proyecto);
    fila("Punto", v.punto);
    fila("Modo", (MODO[v.modo] || v.modo || "") + (v.ambito ? " · " + v.ambito.toLowerCase() : ""));
    fila("Evaluador", v.evaluador);
    if (midiendo) {
      fila("Leq parcial", f1(Number(v.leq_parcial)) + " dB(A) · Lmax " + f1(Number(v.lmax_parcial)));
      fila("Tiempo", f0(Number(v.transcurrido_s)) + " s" + (Number(v.objetivo_s) > 0 ? " de " + f0(Number(v.objetivo_s)) + " s" : ""));
      if (Number(v.tramos) > 0) fila("Tramos guardados", v.tramos);
      if (Number(v.dosis_pct) > 0) fila("Dosis acumulada", f1(Number(v.dosis_pct)) + " %");
    } else if (Number.isFinite(Number(v.leq_parcial))) fila("Último Leq", f1(Number(v.leq_parcial)) + " dB(A)");
    if (v.este !== null && v.este !== undefined) fila("UTM", "E " + f1(Number(v.este)) + "  N " + f1(Number(v.norte)) + (v.cota !== null && v.cota !== undefined ? "  Cota " + f1(Number(v.cota)) : ""));
    if (v.latitud !== null && v.latitud !== undefined) fila("Lat / Lon", Number(v.latitud).toFixed(6) + ", " + Number(v.longitud).toFixed(6) + (v.precision_m ? " (±" + f0(Number(v.precision_m)) + " m)" : ""));
    fila("Último dato", recibido ? U.hace(recibido) : v.actualizado ? fechaHora(Date.parse(v.actualizado)) : "–");

    const graf = el("div", { style: "margin-top:8px" });
    const objetivo = Number(v.objetivo_s), trans = Number(v.transcurrido_s);
    const card = el("div", { class: "tarjeta equipo " + (midiendo ? "midiendo" : conectado ? "conectado" : "") },
      el("div", { class: "equipo-cab" },
        el("div", null, el("span", { style: "display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;background:" + colorEquipo(S, v.id) }), el("b", { texto: v.dispositivo || (v.id === "celular" ? "Celular" : "Celular " + String(v.id).slice(0, 6)) })),
        el("span", { class: "estado-equipo " + (midiendo ? "midiendo" : ""), texto: estado })),
      midiendo && sem ? el("div", { class: "fila", style: "align-items:baseline" },
        el("div", { class: "nivel-equipo c-" + sem }, f0(nivel), el("small", { texto: "dB(A)" })), U.pill(sem)) : null,
      midiendo && objetivo > 0 ? el("div", { class: "progreso", title: "Avance de la medición" }, el("i", { style: "width:" + Math.min(100, (100 * trans) / objetivo) + "%" })) : null,
      dl, midiendo ? graf : null,
      el("div", { class: "fila", style: "margin-top:8px" },
        posEquipo(v) ? el("button", { class: "boton sec", type: "button", onclick: () => centrar(v) }, "Ver en el mapa") : null));
    if (midiendo) {
      const h = S.hist.get(v.id) || [];
      if (h.length >= 2) requestAnimationFrame(() => linea(graf, {
        series: [{ nombre: "Nivel", color: colorEquipo(S, v.id), puntos: h.map((p) => ({ x: p.x, y: p.y, detalle: [p.punto || ""] })) }],
        dominioY: [40, 110], tiempo: true, alto: 120, xMin: Date.now() - 180000, xMax: Date.now(), areaBajo: true,
        limites: [{ v: 82, etiqueta: "82", color: "#fab219", dash: true }, { v: 85, etiqueta: "85", color: "#d03b3b" }],
      }));
      else graf.appendChild(el("p", { class: "mudo", style: "font-size:12px", texto: "El gráfico de los últimos 3 minutos aparece con los siguientes datos." }));
    }
    return card;
  }

  function pintarEquipos(S) {
    if (!refs.equipos) return;
    const lista = equiposVisibles(S);
    if (!lista.length) {
      refs.equipos.replaceChildren(el("div", { class: "tarjeta" },
        el("p", null, el("b", { texto: "Ningún celular se ha conectado todavía" + (S.filtro.proyecto ? " en este proyecto." : ".") })),
        el("p", { class: "mudo", texto: "Cuando un celular con SONOMIN empiece a medir, aquí aparecerá al instante: su nivel cada 2 segundos, el punto, el proyecto, las coordenadas y su posición en el mapa." })));
      return;
    }
    refs.equipos.replaceChildren(...lista.map((v) => tarjetaEquipo(S, v)));
  }
  function pintarEquiposPronto(S) {
    const ahora = Date.now();
    if (ahora - ultimoPintado > 1200) { ultimoPintado = ahora; pintarEquipos(S); return; }
    if (!pendiente) pendiente = setTimeout(() => { pendiente = null; ultimoPintado = Date.now(); pintarEquipos(S); }, 1200);
  }

  // ---------------------------------------------------------------- mapa
  function iconoEquipo(color, midiendo) {
    return L.divIcon({ className: "", iconSize: [18, 18], iconAnchor: [9, 9], html: '<div class="marcador-equipo' + (midiendo ? " midiendo" : "") + '" style="background:' + color + '"></div>' });
  }
  function centrar(v) {
    if (!mapa) return;
    const ll = posEquipo(v); if (!ll) return;
    mapa.setView(ll, Math.max(mapa.getZoom(), 17));
    refs.mapaCaja.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function pintarMapa(S) {
    if (!mapa) return;
    capas.equipos.clearLayers(); capas.rastros.clearLayers(); capas.medidas.clearLayers();
    const p = S.filtro.proyecto, desde = inicioHoy(), limites = [];
    S.todas.filter((m) => (m.ms || 0) >= desde && m.lat !== null && m.lon !== null && Number.isFinite(m.leq) && (!p || m.proyecto === p)).forEach((m) => {
      const c = L.circleMarker([m.lat, m.lon], { radius: 6, color: "#ffffff", weight: 2, fillColor: colorSem(N.semaforo(m.leq)), fillOpacity: 0.95 });
      c.bindTooltip(m.punto + " · " + f1(m.leq) + " dB(A) · " + fechaHora(m.ms), { direction: "top" });
      c.on("click", () => raiz.SON_UI.abrirMedicion && raiz.SON_UI.abrirMedicion(m));
      c.addTo(capas.medidas); limites.push([m.lat, m.lon]);
    });
    equiposVisibles(S).forEach((v, iv) => {
      const color = colorEquipo(S, v.id);
      const r = (S.rastro.get(v.id) || []).filter((q) => q[3] >= Date.now() - 12 * 3600000);
      if (r.length >= 2) L.polyline(r.map((q) => [q[0], q[1]]), { color, weight: 3, opacity: 0.85 }).addTo(capas.rastros);
      const ll = posEquipo(v);
      if (!ll) return;
      const midiendo = S.activos().includes(v);
      const mk = L.marker(ll, { icon: iconoEquipo(color, midiendo), zIndexOffset: 1000 });
      mk.bindTooltip((v.dispositivo || "Celular") + (midiendo ? " · " + f0(Number(v.nivel_dba)) + " dB(A)" : " · sin medir") + " · " + (v.punto || ""), { direction: iv % 2 ? "bottom" : "top", permanent: midiendo, offset: [0, iv % 2 ? 10 : -10] });
      mk.bindPopup(el("div", { style: "min-width:200px" }, el("b", { texto: v.dispositivo || "Celular" }), el("br"),
        el("span", { texto: (v.proyecto || "") + " · " + (v.punto || "") }), el("br"),
        el("span", { class: "mudo", texto: midiendo ? "Nivel " + f1(Number(v.nivel_dba)) + " dB(A) · Leq parcial " + f1(Number(v.leq_parcial)) : "No está midiendo" }), el("br"),
        el("span", { class: "mudo", texto: ll[0].toFixed(6) + ", " + ll[1].toFixed(6) })));
      mk.addTo(capas.equipos); limites.push(ll);
    });
    if (!encuadrado && limites.length) { mapa.fitBounds(L.latLngBounds(limites).pad(0.3), { maxZoom: 18 }); encuadrado = true; }
  }
  function montarMapa(S) {
    if (mapa) { mapa.remove(); mapa = null; }
    encuadrado = false;
    mapa = L.map(refs.mapaCaja, { zoomControl: true, scrollWheelZoom: false }).setView([-15.84, -70.02], 16);
    const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imágenes © Esri, Maxar, Earthstar Geographics" });
    const calle = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© colaboradores de OpenStreetMap" });
    sat.addTo(mapa);
    capas = { medidas: L.featureGroup().addTo(mapa), rastros: L.featureGroup().addTo(mapa), equipos: L.featureGroup().addTo(mapa) };
    L.control.layers({ "Satélite": sat, "Calles": calle }, { "Mediciones de hoy": capas.medidas, "Rastro (12 h)": capas.rastros, "Celulares": capas.equipos }, { collapsed: true }).addTo(mapa);
    pintarMapa(S);
    setTimeout(() => mapa && mapa.invalidateSize(), 150);
  }

  // ----------------------------------------------------------- actividad
  const TIPO = { INICIO: "Inicio", FIN: "Fin", MEDICION: "Medición", ALERTA_OCUPACIONAL: "≥ 85 dB(A)", ALERTA_ECA: "Sobre ECA" };
  function pasaFiltro(e, S) {
    if (S.filtro.proyecto && e.proyecto !== S.filtro.proyecto) return false;
    if (filtroEv === "alertas") return /^ALERTA/.test(e.tipo);
    if (filtroEv === "mediciones") return e.tipo === "MEDICION";
    if (filtroEv === "sesiones") return e.tipo === "INICIO" || e.tipo === "FIN";
    return true;
  }
  function itemEvento(S, e, nuevo) {
    const ms = Date.parse(e.creado);
    const quien = e.dispositivo || e.evaluador || "";
    const partes = [quien, e.proyecto, e.punto].filter(Boolean).join(" · ");
    const nivel = Number.isFinite(Number(e.nivel_dba)) && e.nivel_dba !== null ? " · " + f1(Number(e.nivel_dba)) + " dB(A)" : "";
    const coord = e.este !== null && e.este !== undefined ? "E " + f0(Number(e.este)) + " N " + f0(Number(e.norte)) : (e.latitud !== null && e.latitud !== undefined ? Number(e.latitud).toFixed(5) + ", " + Number(e.longitud).toFixed(5) : "");
    const m = e.medicion_uuid ? S.todas.find((x) => x.uuid === e.medicion_uuid) : null;
    const li = el("li", { class: nuevo ? "nuevo" : "", style: m ? "cursor:pointer" : "", title: m ? "Abrir la medición" : "" },
      el("time", { datetime: e.creado, texto: horaSeg(ms) }),
      el("div", null, el("span", { class: "tipo-ev " + e.tipo, texto: TIPO[e.tipo] || e.tipo }), el("span", { texto: partes + nivel }),
        el("div", { class: "mudo", style: "font-size:12px", texto: [e.detalle, coord, ms < inicioHoy() ? fechaHora(ms).slice(0, 10) : ""].filter(Boolean).join(" · ") })));
    if (m) li.addEventListener("click", () => raiz.SON_UI.abrirMedicion && raiz.SON_UI.abrirMedicion(m));
    return li;
  }
  function pintarActividad(S) {
    if (!refs.lista) return;
    const evs = S.eventos.filter((e) => pasaFiltro(e, S)).slice(0, 120);
    if (!evs.length) { refs.lista.replaceChildren(el("li", { style: "display:block" }, el("span", { class: "mudo", texto: "Sin actividad registrada con este filtro." }))); return; }
    refs.lista.replaceChildren(...evs.map((e) => itemEvento(S, e, false)));
  }

  // ----------------------------------------------------- ultima medicion
  function pintarUltima(S) {
    if (!refs.ultima) return;
    const m = S.filtradas[0];
    const cont = el("div", { class: "tarjeta" }, el("h2", { texto: "Última medición guardada" }));
    if (!m) cont.appendChild(el("p", { class: "mudo", texto: "Aún no hay mediciones con este filtro." }));
    else {
      const sem = N.semaforo(m.leq);
      cont.append(
        el("div", { class: "foto-grande", style: "margin-top:10px" }, U.foto(m.fotos[0], "Foto de " + m.punto)),
        el("div", { class: "fila", style: "margin-top:10px" }, el("span", { class: "resultado-grande c-" + sem, texto: f1(m.leq) + " dB(A)" }), U.pill(sem)),
        el("p", { style: "margin-top:6px" }, el("b", { texto: m.punto }), " · ", MODO[m.modo] || m.modo || "", " · ", m.ambito || ""),
        el("p", { class: "mudo", texto: fechaHora(m.ms) + " (" + U.hace(m.ms) + ") · " + f0(m.dur) + " s · Lmax " + f1(m.lmax) + " · " + m.proyecto }),
        el("p", { class: "mudo", texto: m.este !== null ? "E " + f1(m.este) + "  N " + f1(m.norte) + "  Cota " + f1(m.cota) + " (" + (m.zona_utm || "") + ")" : "Sin coordenadas" }),
        el("button", { class: "boton sec", type: "button", style: "margin-top:8px", onclick: () => raiz.SON_UI.abrirMedicion(m) }, "Ver memoria de cálculo"));
    }
    const conFoto = S.filtradas.filter((x) => x.fotos.length).slice(0, 14);
    const tira = el("div", { class: "tira" });
    conFoto.forEach((x) => tira.appendChild(el("figure", null, U.foto(x.fotos[0], "Foto de " + x.punto), el("figcaption", { texto: x.punto + " · " + f1(x.leq) + " dB(A) · " + fechaHora(x.ms) }))));
    const v = S.filtradas.filter((x) => x.leq !== null);
    const conAviso = v.filter((x) => A.calidad(x).length);
    refs.ultima.replaceChildren(el("div", { class: "rejilla cols-65" },
      el("div", { class: "tarjeta" }, el("h2", { texto: "Evidencia fotográfica" }),
        el("p", { class: "sub", texto: "Cada foto se toma sola al terminar la medición y lleva impresos el proyecto, el punto, las coordenadas y el nivel." }),
        conFoto.length ? tira : el("p", { class: "mudo", texto: "Todavía no llegan fotos." }),
        conAviso.length ? el("div", { class: "caja-aviso " + (conAviso.some((x) => x.leq < 28) ? "grave" : "") },
          el("b", { texto: conAviso.length + " de " + v.length + " mediciones tienen avisos de calidad. " }),
          "Pueden ser equipos sin calibrar, micrófono saturado o sin señal, o GPS impreciso. Abra una medición para ver el detalle.") : null),
      cont));
  }

  // ------------------------------------------------------------- render
  function render(cont, S) {
    refs = {};
    refs.kpis = el("div", { class: "rejilla cols-4" });
    refs.equipos = el("div", { class: "equipos" });
    refs.mapaCaja = el("div", { id: "mapa-vivo" });
    refs.lista = el("ul", { class: "actividad", "aria-live": "polite" });
    refs.ultima = el("div", { class: "seccion" });
    const selEv = el("select", { "aria-label": "Filtrar actividad", onchange: (e) => { filtroEv = e.target.value; pintarActividad(S); } },
      [["todo", "Toda la actividad"], ["alertas", "Solo alertas"], ["mediciones", "Mediciones guardadas"], ["sesiones", "Inicio y fin"]].map(([v, t]) => el("option", { value: v, texto: t, selected: v === filtroEv ? true : null })));

    cont.replaceChildren(el("div", null,
      refs.kpis,
      el("div", { class: "seccion" }, el("div", { class: "fila", style: "justify-content:space-between;margin-bottom:10px" },
        el("h2", { texto: "Celulares en campo" }), el("span", { class: "mudo", style: "font-size:13px", texto: "Se actualiza solo cada 2 segundos. No hace falta recargar la página." })), refs.equipos),
      el("div", { class: "rejilla cols-65 seccion" },
        el("div", { class: "tarjeta" }, el("h2", { texto: "Dónde están midiendo" }),
          el("p", { class: "sub", texto: "Celulares en tiempo real (círculo con borde blanco; late cuando está midiendo), su rastro de las últimas 12 horas y las mediciones de hoy coloreadas por semáforo." }),
          refs.mapaCaja,
          el("div", { class: "leyenda-mapa", style: "margin-top:8px" },
            el("span", null, el("span", { class: "cuadro", style: "background:#0ca30c" }), "Conforme (menos de 82)  "),
            el("span", null, el("span", { class: "cuadro", style: "background:#fab219" }), "Precaución (82 a 85)  "),
            el("span", null, el("span", { class: "cuadro", style: "background:#d03b3b" }), "Excede (85 o más) · dB(A)"))),
        el("div", { class: "tarjeta" }, el("div", { class: "fila", style: "justify-content:space-between" }, el("h2", { texto: "Actividad al segundo" }), selEv),
          el("p", { class: "sub", texto: "Inicio y fin de cada medición, mediciones guardadas y alertas. Queda registrado en el servidor aunque nadie tenga abierta esta página." }),
          refs.lista)),
      refs.ultima));

    pintarKpis(S); pintarEquipos(S); pintarActividad(S); pintarUltima(S);
    montarMapa(S);
  }

  raiz.SON_VISTAS.vivo = {
    render,
    actualizar(S) { pintarEquiposPronto(S); pintarMapa(S); pintarKpis(S); },
    tic(S) { pintarEquiposPronto(S); pintarKpis(S); },
    alEvento(S) {
      pintarKpis(S);
      const e = S.eventos[0];
      if (!refs.lista || !e || !pasaFiltro(e, S)) return;
      const vacio = refs.lista.querySelector("li[style*='block']");
      if (vacio) refs.lista.replaceChildren();
      refs.lista.prepend(itemEvento(S, e, true));
      while (refs.lista.children.length > 120) refs.lista.lastChild.remove();
    },
    alMedicion(S) { pintarKpis(S); pintarUltima(S); pintarMapa(S); },
  };
})(window);
