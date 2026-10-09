/* SONOMIN · piezas de interfaz compartidas por las vistas. */
(function (raiz) {
  "use strict";
  const { el, f1 } = raiz.SON_G;
  const D = raiz.SON_DATOS;

  const TEXTO_SEM = { CONFORME: "Conforme", PRECAUCION: "Precaución", EXCEDE: "Excede" };
  const pill = (sem) => el("span", { class: "sem " + sem, texto: TEXTO_SEM[sem] });

  function hace(ms) {
    if (!ms) return "–";
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return "hace " + Math.round(s) + " s";
    if (s < 3600) return "hace " + Math.round(s / 60) + " min";
    if (s < 86400) return "hace " + Math.round(s / 3600) + " h";
    return "hace " + Math.round(s / 86400) + " d";
  }

  function kpi(etiqueta, valor, nota, claseValor) {
    return el("div", { class: "tarjeta kpi" },
      el("div", { class: "etq", texto: etiqueta }),
      el("div", { class: "valor " + (claseValor || ""), texto: valor }),
      nota ? el("div", { class: "nota", texto: nota }) : null);
  }

  /* Lineas del rotulo de evidencia, iguales a las que la app imprime sobre la foto. */
  function lineasRotulo(m) {
    if (!m) return [];
    const { fechaHora } = raiz.SON_G;
    const n1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "-");
    return [
      "SONOMIN · " + (m.proyecto || ""),
      "Punto " + (m.punto || "") + (m.labor ? "  " + m.labor : ""),
      "Leq " + n1(m.leq) + " dB(A)   Lmax " + n1(m.lmax) + "   " + (Number.isFinite(m.dur) ? Math.round(m.dur) : "-") + " s",
      "E " + n1(m.este) + "  N " + n1(m.norte) + "  Cota " + n1(m.cota) + " (" + (m.zona_utm || "19S") + ")",
      (m.ms ? fechaHora(m.ms) : "") + "   " + (m.ambito || "") + "   " + (m.origen_posicion || ""),
      (m.evaluador || "evaluador s/n") + " · " + (m.calibrado ? "calibrado " + n1(Number(m.offset_cal_db)) + " dB" : "SIN CALIBRAR"),
    ];
  }

  /* Foto de evidencia con rotulo de respaldo.
   * Si la app no pudo imprimir el rotulo (foto_sellada = false) se dibujan encima los datos guardados
   * de la medicion; si no se sabe (registros antiguos) se muestra un rotulo breve. */
  function foto(ruta, alt, m) {
    const caja = el("div");
    if (!ruta) { caja.appendChild(el("div", { class: "foto-vacia", texto: "Esta medición no tiene foto" })); return caja; }
    caja.appendChild(el("div", { class: "foto-vacia", texto: "Cargando foto…" }));
    D.urlFotos([ruta]).then((mapa) => {
      const url = mapa.get(ruta);
      if (!url) { caja.replaceChildren(el("div", { class: "foto-vacia", texto: "La foto aún no llega desde el celular" })); return; }
      const lineas = lineasRotulo(m);
      const img = el("img", { src: url, alt: alt || "Foto de evidencia", loading: "lazy" });
      img.addEventListener("click", () => raiz.SON_UI.verFoto(url, lineas.join("\n")));
      img.addEventListener("error", () => caja.replaceChildren(el("div", { class: "foto-vacia", texto: "La foto aún no llega desde el celular" })));
      const sellada = m && m.foto_sellada === true;
      // solo cuando la app avisa que no pudo imprimirlo; en registros antiguos (sin dato) no se tapa la foto:
      // los datos aparecen al ampliarla
      const rotulo = m && m.foto_sellada === false
        ? el("div", { class: "foto-rotulo" }, el("b", { texto: lineas[0] }), el("span", { class: "sin-sello", texto: "(rótulo agregado por la página)" }), lineas.slice(1).map((l) => el("div", { texto: l })))
        : null;
      caja.replaceChildren(el("div", { class: "foto-caja" + (sellada ? " sellada" : "") }, img, rotulo));
    });
    return caja;
  }

  function descargar(nombre, texto, tipo) {
    const blob = new Blob([texto], { type: tipo || "text/csv;charset=utf-8" });
    const a = el("a", { href: URL.createObjectURL(blob), download: nombre });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function csv(columnas, filas) {
    const esc = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return "﻿" + [columnas.join(",")].concat(filas.map((f) => f.map(esc).join(","))).join("\r\n");
  }

  const ordenar = (arr, clave, desc) => arr.slice().sort((a, b) => {
    const x = a[clave], y = b[clave];
    if (x === y) return 0;
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    return (x < y ? -1 : 1) * (desc ? -1 : 1);
  });

  const vacio = (txt) => el("div", { class: "tarjeta" }, el("p", { class: "mudo", texto: txt }));

  /** Hay algun celular midiendo ahora (dato nuevo hace menos de 12 s). */
  function vivoReciente(S) { return typeof S.activos === "function" && S.activos().length > 0; }

  raiz.SON_U = { vivoReciente, pill, hace, kpi, foto, lineasRotulo, descargar, csv, ordenar, vacio, TEXTO_SEM, f1 };
})(window);
