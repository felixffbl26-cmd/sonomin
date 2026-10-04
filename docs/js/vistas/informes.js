/* Vista INFORMES: PDF, Excel y mapas generados por el procesamiento automatico. */
(function (raiz) {
  "use strict";
  const { el, fechaHora } = raiz.SON_G;
  const U = raiz.SON_U, D = raiz.SON_DATOS;
  raiz.SON_VISTAS = raiz.SON_VISTAS || {};

  const ICONO = { pdf: "PDF", xlsx: "Excel", csv: "CSV", png: "Imagen" };
  const tipo = (n) => ICONO[(n.split(".").pop() || "").toLowerCase()] || "Archivo";

  function render(cont, S) {
    const nodo = el("div");
    const repo = (raiz.SONOMIN_CONFIG || {}).GITHUB_REPO;

    // informe tecnico al instante (no depende de GitHub)
    const filtroTxt = [S.filtro.proyecto || "todos los proyectos", S.filtro.dias ? (S.filtro.dias === 1 ? "hoy" : "últimos " + S.filtro.dias + " días") : "todo el periodo", S.filtro.ambito ? S.filtro.ambito.toLowerCase() : "superficie e interior"].join(" · ");
    const anexo = el("input", { type: "checkbox", checked: true, id: "inf-anexo" });
    nodo.appendChild(el("div", { class: "tarjeta" }, el("h2", { texto: "Informe técnico al instante" }),
      el("p", { class: "sub", texto: "Arma ahora mismo un informe técnico con los datos del filtro actual (" + filtroTxt + "): datos del documento, base normativa, metodología, resultados por punto, evaluación ocupacional y ambiental, estadística, tendencias, evidencia fotográfica en orden cronológico, conclusiones, recomendaciones y firmas. Desde la vista previa se imprime o se guarda en PDF. Cambie el proyecto o el periodo arriba para otro alcance." }),
      el("div", { class: "fila", style: "margin-top:8px" },
        el("button", { class: "boton", type: "button", onclick: () => raiz.SON_INFORME.abrir(S, { anexo: anexo.checked }) }, "Generar informe técnico (" + S.filtradas.length + " mediciones)"),
        el("button", { class: "boton sec", type: "button", onclick: () => raiz.SON_INFORME.descargarExcel(S) }, "Descargar Excel"),
        el("label", { class: "fila", style: "gap:6px;font-size:13px" }, anexo, "Incluir anexo con todas las mediciones"))));

    nodo.appendChild(el("div", { class: "tarjeta seccion" }, el("h2", { texto: "Informes automáticos del procesamiento en Python" }),
      el("p", { class: "sub", texto: "El procesamiento en Python (mapas por kriging, modelo Random Forest, Excel y PDF) corre solo en la nube cada 6 horas y también a pedido. Cada corrida aparece aquí con sus archivos." }),
      repo ? el("p", null, el("a", { href: "https://github.com/" + repo + "/actions/workflows/informe.yml", target: "_blank", rel: "noopener", texto: "Generar un informe ahora (GitHub Actions)" }), " · pulse «Run workflow». Requiere el secreto SUPABASE_SERVICE_KEY en el repositorio (Settings › Secrets and variables › Actions).") : el("p", { class: "mudo", texto: "Para mostrar aquí el enlace «Generar informe ahora», escriba el repositorio en GITHUB_REPO dentro de config.js." })));

    const lista = el("div", { class: "seccion" });
    if (!D.enNube) {
      lista.appendChild(el("div", { class: "caja-aviso info", texto: "En modo demostración no hay informes. Al conectar la nube, el proceso automático los publicará aquí." }));
    } else if (!S.informes.length) {
      lista.appendChild(el("div", { class: "caja-aviso info", texto: "Aún no hay informes. La primera corrida ocurre cuando haya datos y el proceso automático se ejecute." }));
    } else {
      S.informes.forEach((inf) => {
        const archivos = Array.isArray(inf.archivos) ? inf.archivos : [];
        const caja = el("div", { class: "tarjeta", style: "margin-bottom:12px" },
          el("div", { class: "fila", style: "justify-content:space-between" }, el("h2", { texto: inf.titulo }), el("span", { class: "mudo", texto: fechaHora(Date.parse(inf.creado)) })),
          el("p", { class: "mudo", texto: (inf.proyecto ? "Proyecto: " + inf.proyecto + " · " : "Todos los proyectos · ") + (inf.n_mediciones ?? "?") + " mediciones" }));
        const res = inf.resumen || {};
        if (res.puntos) caja.appendChild(el("p", { texto: res.puntos + " puntos analizados" + (res.leq_global ? " · Leq global " + Number(res.leq_global).toFixed(1) + " dB(A)" : "") + (res.sobre_85 !== undefined ? " · " + res.sobre_85 + " mediciones ≥ 85 dB(A)" : "") }));
        const chips = el("div", { class: "chips" });
        archivos.forEach((a) => {
          const b = el("button", { class: "boton sec", type: "button", style: "padding:5px 10px", onclick: async () => {
            b.disabled = true;
            try {
              const url = await D.urlInforme(a.ruta);
              if (!url) throw new Error("sin permiso");
              if (/\.png$/i.test(a.nombre)) raiz.SON_UI.verFoto(url); else window.open(url, "_blank", "noopener");
            } catch (e) { alert("No se pudo abrir el archivo: " + e.message); }
            finally { b.disabled = false; }
          } }, tipo(a.nombre) + " · " + a.nombre);
          chips.appendChild(b);
        });
        caja.appendChild(chips);
        lista.appendChild(caja);
      });
    }
    nodo.appendChild(lista);

    // descarga de datos completos
    nodo.appendChild(el("div", { class: "tarjeta seccion" }, el("h2", { texto: "Datos completos" }),
      el("p", { class: "sub", texto: "Todas las mediciones cargadas (sin aplicar los filtros) para procesarlas en su computadora con procesar_ruido.py." }),
      el("button", { class: "boton", type: "button", onclick: () => {
        const cols = ["uuid", "proyecto", "modo", "recorrido_id", "secuencia", "fecha_hora", "inicio_ms", "ambito", "punto", "labor", "fuente_ruido", "este", "norte", "cota", "zona_utm", "latitud", "longitud", "precision_m", "duracion_s", "leq_dba", "lmax_dba", "lmin_dba", "l10_dba", "l50_dba", "l90_dba", "zona_eca", "dosis_pct", "calibrado", "saturacion_pct", "evaluador", "observacion", "fotos"];
        D.registrar("EXPORTACION_CSV", { filas: S.todas.length, tabla: "mediciones completas" });
        U.descargar("sonomin_datos_completos.csv", U.csv(cols, S.todas.map((m) => cols.map((c) => c === "fotos" ? m.fotos.length : c === "fecha_hora" ? fechaHora(m.ms) : m[c]))));
      } }, "Descargar CSV (" + S.todas.length + " mediciones)")));

    cont.replaceChildren(nodo);
  }

  raiz.SON_VISTAS.informes = { render };
})(window);
