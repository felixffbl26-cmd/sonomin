/* Vista MEDICIONES: tabla filtrable y ficha de cada medicion con fotos y memoria de calculo. */
(function (raiz) {
  "use strict";
  const { el, f0, f1, f2, fechaHora, linea } = raiz.SON_G;
  const U = raiz.SON_U, A = raiz.SON_ANALISIS, N = raiz.SON_NORMAS, D = raiz.SON_DATOS;
  raiz.SON_VISTAS = raiz.SON_VISTAS || {};

  const estado = { orden: "ms", desc: true, pagina: 0, texto: "", verPapelera: false };
  const POR_PAGINA = 40;
  const MODOS = { PUNTUAL: "Punto fijo", RECORRIDO: "Recorrido", JORNADA: "Jornada", CONTINUO: "Monitoreo" };

  // -------------------------------------------------- ficha de una medicion
  async function abrir(m) {
    const sem = N.semaforo(m.leq);
    const t = N.tiempoPermitidoH(m.leq), horas = (m.horas_exposicion ?? 8), dosis = N.dosisPct(m.leq, horas);
    const eca = m.limEca;
    const cuerpo = el("div");
    cuerpo.appendChild(el("div", { class: "fila" }, el("span", { class: "resultado-grande c-" + sem, texto: f1(m.leq) + " dB(A)" }), U.pill(sem),
      el("span", { class: "mudo", texto: (MODOS[m.modo] || m.modo || "") + " · " + (m.ambito || "") + " · " + fechaHora(m.ms) })));
    cuerpo.appendChild(el("p", { class: "mudo", texto: m.proyecto + (m.evaluador ? " · evaluador: " + m.evaluador : "") + (m.fuente_ruido ? " · fuente: " + m.fuente_ruido : "") }));

    const avisos = A.calidad(m);
    avisos.forEach((a) => cuerpo.appendChild(el("div", { class: "caja-aviso" + (/no captó|negativo|saturado/.test(a) ? " grave" : ""), texto: a })));

    // fotos
    if (m.fotos.length) {
      const gal = el("div", { class: "galeria", style: "margin-top:10px" });
      m.fotos.forEach((r) => gal.appendChild(U.foto(r, "Foto de " + m.punto)));
      cuerpo.appendChild(gal);
    }

    // datos
    const dato = (k, v) => el("tr", null, el("td", { texto: k }), el("td", { class: "num", texto: v }));
    const tabla = el("table", null, el("tbody", null,
      dato("Duración", f0(m.dur) + " s"), dato("Lmax / Lmin", f1(m.lmax) + " / " + f1(m.lmin) + " dB(A)"),
      dato("L10 / L50 / L90", f1(m.l10) + " / " + f1(m.l50) + " / " + f1(m.l90) + " dB(A)"),
      dato("Este / Norte", m.este !== null ? f1(m.este) + " / " + f1(m.norte) + " (zona " + (m.zona_utm || "?") + ")" : "sin coordenadas"),
      dato("Cota", m.cota !== null ? f1(m.cota) + " " + (m.tipo_cota || "") : "–"),
      dato("Posición", (m.origen_posicion || "–") + (m.precision_m ? " · precisión " + f0(Number(m.precision_m)) + " m" : "")),
      dato("Equipo", (m.calibrado ? "calibrado (ajuste " + f1(Number(m.offset_cal_db)) + " dB)" : "SIN calibrar") + " · " + (m.fuente_audio || "")),
      dato("Saturación", f1(Number(m.saturacion_pct) || 0) + " %"), dato("Identificador", m.uuid)));
    cuerpo.appendChild(el("div", { class: "tabla-caja", style: "margin-top:10px" }, tabla));

    // memoria de calculo con las dos normas
    const memoria = [
      "OCUPACIONAL · D.S. 024-2016-EM, Anexo 12 y Guía N° 1",
      "  Nivel medido (Leq)............ " + f1(m.leq) + " dB(A)",
      "  Tiempo permitido T (Anexo 12). " + N.formatoTiempo(t) + (N.sobreTabla(m.leq) ? "  (fuera de la tabla: extrapolado con tasa de 3 dB)" : ""),
      "  Exposición C supuesta......... " + f1(horas) + " h",
      "  Dosis D = C / T × 100......... " + f1(dosis) + " %  " + (dosis > 100 ? "(supera el 100 %)" : "(no supera el 100 %)"),
      "  Nivel equivalente de 8 h...... " + f1(N.twa8h(dosis)) + " dB(A)",
      "  Límite 85 dB(A) / 8 h; nivel de acción 82 dB(A)",
      "",
      "AMBIENTAL · D.S. 085-2003-PCM, ECA para ruido",
      m.ambito === "SUPERFICIE" && eca !== null
        ? "  Zona " + (N.ZONAS_ECA[m.zona_eca] ? N.ZONAS_ECA[m.zona_eca].nombre : m.zona_eca) + ", horario " + (N.esDiurno(m.ms) ? "diurno" : "nocturno") + ": límite " + eca + " dB(A)\n  Leq " + f1(m.leq) + " dB(A) " + (m.leq > eca ? "SUPERA el ECA en " + f1(m.leq - eca) + " dB" : "cumple el ECA (margen " + f1(eca - m.leq) + " dB)")
        : "  No aplica: el ECA es un estándar de ruido ambiental exterior (esta medición es de interior de mina).",
    ].join("\n");
    cuerpo.appendChild(el("h3", { style: "margin-top:14px", texto: "Memoria de cálculo" }));
    cuerpo.appendChild(el("div", { class: "formula", texto: memoria }));

    // serie de 1 s
    const grafSerie = el("div", { style: "margin-top:12px" });
    cuerpo.appendChild(el("h3", { style: "margin-top:14px", texto: "Nivel segundo a segundo" }));
    cuerpo.appendChild(grafSerie);
    if (raiz.SON_S && raiz.SON_S.rol === "admin") cuerpo.appendChild(m.eliminada ? cajaEliminada(m) : cajaPapelera(m));
    raiz.SON_UI.dialogo(m.punto + (m.eliminada ? " · EN LA PAPELERA" : ""), cuerpo);
    let serie = m.serie;
    if (!serie.length) { try { const txt = await D.cargarSerie(m.uuid); serie = txt ? txt.split("|").map(Number).filter((x) => !Number.isNaN(x)) : []; } catch (e) { /* sin serie */ } }
    if (serie.length > 1) {
      const lo = Math.min(...serie), hi = Math.max(...serie);
      linea(grafSerie, { series: [{ nombre: "Nivel 1 s", color: raiz.SON_G.css("--serie-1"), puntos: serie.map((y, i) => ({ x: i, y, detalle: ["segundo " + i] })) }],
        dominioY: [Math.floor((lo - 5) / 5) * 5, Math.ceil((hi + 5) / 5) * 5], tiempo: false, alto: 180, formatoX: (v) => v + " s",
        limites: [{ v: 85, etiqueta: "85", color: "#d03b3b" }] });
    } else grafSerie.appendChild(el("p", { class: "mudo", texto: "Esta medición no trae la serie de 1 s." }));
  }
  // ------------------------------------------------------------- papelera
  // Mover a la papelera: oculta la medicion de todos los calculos; pide motivo; se puede restaurar.
  function cajaPapelera(m) {
    const motivo = el("textarea", { rows: 2, maxlength: 300, placeholder: "Ej.: medición hecha sin querer en la oficina; celular tapado; punto equivocado", style: "width:100%;font:inherit;padding:8px;border-radius:8px;border:1px solid var(--borde);background:var(--superficie);color:var(--tinta)" });
    const err = el("div", { class: "error" });
    const boton = el("button", { class: "boton", type: "button", style: "background:var(--grave)" }, "Mover a la papelera");
    boton.addEventListener("click", async () => {
      const txt = motivo.value.trim();
      if (txt.length < 5) { err.textContent = "Escriba el motivo (al menos 5 caracteres). Quedará registrado en la auditoría."; motivo.focus(); return; }
      boton.disabled = true;
      try {
        await D.moverPapelera(m, txt);
        raiz.SON_UI.ubicarMedicion({ ...m, eliminada: true, eliminada_en: new Date().toISOString(), eliminada_motivo: txt, eliminada_por: "usted" });
        raiz.SON_UI.cerrarDialogo();
        raiz.SON_UI.aviso("La medición de " + m.punto + " se movió a la papelera. Ya no entra en ningún cálculo; puede restaurarla desde Mediciones › Papelera.", "info");
      } catch (e) { err.textContent = e.message; boton.disabled = false; }
    });
    return el("details", { class: "seccion caja-borde" },
      el("summary", { texto: "¿Medición hecha por error? Moverla a la papelera" }),
      el("p", { class: "mudo", style: "font-size:13px;margin-top:8px", texto: "Deja de aparecer en el tablero, los mapas, la estadística, los pronósticos y los informes, para todos los usuarios. No se borra: queda en la papelera y se puede restaurar. Quién lo hizo, cuándo y por qué queda en la auditoría." }),
      el("label", { class: "campo" }, el("span", { texto: "Motivo (obligatorio)" }), motivo), err, el("div", { style: "margin-top:8px" }, boton));
  }

  function cajaEliminada(m) {
    return el("div", { class: "caja-aviso grave seccion" },
      el("b", { texto: "Esta medición está en la papelera. " }),
      "La movió " + (m.eliminada_por || "?") + " el " + (m.eliminada_en ? fechaHora(Date.parse(m.eliminada_en)) : "?") + ". Motivo: " + (m.eliminada_motivo || "–"),
      el("div", { class: "fila", style: "margin-top:8px" }, botonRestaurar(m, true), botonDefinitivo(m, true)));
  }

  function botonRestaurar(m, cerrar) {
    return el("button", { class: "boton", type: "button", onclick: async (e) => {
      e.currentTarget.disabled = true;
      try {
        await D.restaurar(m);
        raiz.SON_UI.ubicarMedicion({ ...m, eliminada: false, eliminada_en: null, eliminada_por: null, eliminada_motivo: null });
        if (cerrar) raiz.SON_UI.cerrarDialogo();
        raiz.SON_UI.aviso("Medición de " + m.punto + " restaurada: vuelve a entrar en los cálculos.", "info");
      } catch (ex) { raiz.SON_UI.aviso("No se pudo restaurar: " + ex.message, "grave"); }
    } }, "Restaurar");
  }

  function botonDefinitivo(m, cerrar) {
    const texto = "Borrar para siempre";
    return el("button", { class: "boton sec", type: "button", style: "color:var(--grave-texto)", onclick: async (e) => {
      const b = e.currentTarget;
      if (b.dataset.confirmar !== "1") { b.dataset.confirmar = "1"; b.textContent = "¿Seguro? Se borra con sus fotos. Pulse otra vez"; setTimeout(() => { b.dataset.confirmar = ""; b.textContent = texto; }, 5000); return; }
      b.disabled = true;
      try {
        await D.eliminarDefinitivo(m);
        raiz.SON_UI.quitarMedicion(m.uuid);
        if (cerrar) raiz.SON_UI.cerrarDialogo();
        raiz.SON_UI.aviso("Medición borrada definitivamente. La constancia queda en la auditoría.", "info");
      } catch (ex) { raiz.SON_UI.aviso("No se pudo borrar: " + ex.message, "grave"); b.disabled = false; }
    } }, texto);
  }

  function vistaPapelera(cont, S) {
    const lista = S.papelera.slice().sort((a, b) => Date.parse(b.eliminada_en || 0) - Date.parse(a.eliminada_en || 0));
    const tabla = el("table", null,
      el("thead", null, el("tr", null, ["Fecha de la medición", "Punto", "Proyecto", "Leq dB(A)", "Movida por", "Cuándo", "Motivo", ""].map((t, i) => el("th", { class: i === 3 ? "num" : "", texto: t })))),
      el("tbody", null, lista.map((m) => el("tr", null,
        el("td", { texto: fechaHora(m.ms) }), el("td", { texto: m.punto }), el("td", { texto: m.proyecto }), el("td", { class: "num", texto: f1(m.leq) }),
        el("td", { texto: m.eliminada_por || "–" }), el("td", { texto: m.eliminada_en ? fechaHora(Date.parse(m.eliminada_en)) : "–" }),
        el("td", { texto: m.eliminada_motivo || "–" }),
        el("td", null, el("div", { class: "fila", style: "flex-wrap:nowrap" }, el("button", { class: "boton sec", type: "button", onclick: () => abrir(m) }, "Ver"), botonRestaurar(m, false), botonDefinitivo(m, false)))))));
    cont.replaceChildren(el("div", { class: "tarjeta" },
      el("div", { class: "fila", style: "justify-content:space-between" }, el("h2", { texto: "Papelera (" + lista.length + ")" }),
        el("button", { class: "boton sec", type: "button", onclick: () => { estado.verPapelera = false; render(cont, S); } }, "Volver a las mediciones")),
      el("p", { class: "sub", texto: "Mediciones retiradas de los cálculos. Restaurar las devuelve tal cual; borrar para siempre elimina también sus fotos. Todo queda en la pestaña Registro." }),
      lista.length ? el("div", { class: "tabla-caja", style: "margin-top:10px" }, tabla) : el("p", { class: "mudo", texto: "La papelera está vacía." })));
  }

  raiz.SON_UI = raiz.SON_UI || {};
  raiz.SON_UI.abrirMedicion = abrir;

  // ------------------------------------------------------------------ tabla
  const COLUMNAS = [
    { k: "ms", t: "Fecha y hora", f: (m) => fechaHora(m.ms) },
    { k: "punto", t: "Punto", f: (m) => m.punto },
    { k: "proyecto", t: "Proyecto", f: (m) => m.proyecto },
    { k: "modo", t: "Modo", f: (m) => MODOS[m.modo] || m.modo || "" },
    { k: "ambito", t: "Ámbito", f: (m) => (m.ambito === "INTERIOR" ? "Interior" : "Superficie") },
    { k: "leq", t: "Leq dB(A)", num: true, f: (m) => f1(m.leq) },
    { k: "lmax", t: "Lmax", num: true, f: (m) => f1(m.lmax) },
    { k: "dur", t: "Dur. s", num: true, f: (m) => f0(m.dur) },
    { k: "dosis", t: "Dosis %", num: true, f: (m) => (m.dosis !== null ? f1(m.dosis) : "–") },
  ];

  function render(cont, S) {
    if (estado.verPapelera && S.rol === "admin") { vistaPapelera(cont, S); return; }
    const q = estado.texto.trim().toLowerCase();
    let filas = S.filtradas.filter((m) => m.leq !== null && (!q || (m.punto + " " + m.proyecto + " " + (m.evaluador || "")).toLowerCase().includes(q)));
    filas = U.ordenar(filas, estado.orden, estado.desc);
    const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
    estado.pagina = Math.min(estado.pagina, paginas - 1);
    const visibles = filas.slice(estado.pagina * POR_PAGINA, (estado.pagina + 1) * POR_PAGINA);

    const buscador = el("input", { type: "search", placeholder: "Buscar punto, proyecto o evaluador", value: estado.texto, "aria-label": "Buscar mediciones" });
    buscador.addEventListener("input", () => { estado.texto = buscador.value; estado.pagina = 0; const p = buscador.selectionStart; render(cont, S); const nuevo = cont.querySelector("input[type=search]"); nuevo.focus(); nuevo.setSelectionRange(p, p); });

    const cabecera = el("tr", null, COLUMNAS.map((c) => el("th", { class: c.num ? "num" : "", "data-orden": c.k, onclick: () => { estado.desc = estado.orden === c.k ? !estado.desc : true; estado.orden = c.k; render(cont, S); } },
      c.t + (estado.orden === c.k ? (estado.desc ? " ▼" : " ▲") : ""))), el("th", { texto: "Estado" }), el("th", { class: "num", texto: "Fotos" }), el("th", { texto: "Avisos" }));
    const cuerpo = el("tbody", null, visibles.map((m) => el("tr", { "data-id": m.uuid, tabindex: 0, onclick: () => abrir(m), onkeydown: (e) => { if (e.key === "Enter") abrir(m); } },
      COLUMNAS.map((c) => el("td", { class: c.num ? "num" : "", texto: c.f(m) })),
      el("td", null, U.pill(N.semaforo(m.leq))),
      el("td", { class: "num", texto: String(m.fotos.length) }),
      el("td", { class: "mudo", texto: A.calidad(m).length ? "⚠ " + A.calidad(m).length : "" }))));

    const pie = el("div", { class: "fila", style: "margin-top:10px;justify-content:space-between" },
      el("span", { class: "mudo", texto: filas.length + " mediciones · página " + (estado.pagina + 1) + " de " + paginas }),
      el("div", { class: "fila" },
        el("button", { class: "boton sec", type: "button", disabled: estado.pagina === 0, onclick: () => { estado.pagina--; render(cont, S); } }, "Anterior"),
        el("button", { class: "boton sec", type: "button", disabled: estado.pagina >= paginas - 1, onclick: () => { estado.pagina++; render(cont, S); } }, "Siguiente"),
        el("button", { class: "boton", type: "button", onclick: () => {
          const cols = ["uuid", "proyecto", "modo", "fecha_hora_lima", "punto", "ambito", "este", "norte", "cota", "zona_utm", "latitud", "longitud", "duracion_s", "leq_dba", "lmax_dba", "lmin_dba", "l10_dba", "l50_dba", "l90_dba", "dosis_pct", "calibrado", "evaluador", "fotos"];
          D.registrar("EXPORTACION_CSV", { filas: filas.length, filtro: S.filtro });
          U.descargar("sonomin_mediciones.csv", U.csv(cols, filas.map((m) => [m.uuid, m.proyecto, m.modo, fechaHora(m.ms), m.punto, m.ambito, m.este, m.norte, m.cota, m.zona_utm, m.lat, m.lon, m.dur, m.leq, m.lmax, m.lmin, m.l10, m.l50, m.l90, m.dosis, m.calibrado, m.evaluador, m.fotos.length])));
        } }, "Descargar CSV de lo filtrado")));

    const botonPapelera = S.rol === "admin" ? el("button", { class: "boton sec", type: "button", onclick: () => { estado.verPapelera = true; render(cont, S); } }, "Papelera (" + S.papelera.length + ")") : null;
    cont.replaceChildren(el("div", { class: "tarjeta" }, el("div", { class: "fila", style: "justify-content:space-between" }, el("h2", { texto: "Mediciones" }), el("div", { class: "fila" }, buscador, botonPapelera)),
      S.rol === "admin" ? el("p", { class: "sub", texto: "¿Una medición hecha por error? Ábrala y use «Moverla a la papelera»." }) : null,
      el("div", { class: "tabla-caja", style: "margin-top:10px" }, el("table", null, el("thead", null, cabecera), cuerpo)), pie));
  }

  raiz.SON_VISTAS.mediciones = { render };
})(window);
