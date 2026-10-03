/* SONOMIN · datos SINTETICOS para el modo demostracion.
 * No son mediciones reales: sirven para probar el tablero antes de conectar la nube.
 * Generador con semilla fija (siempre los mismos datos). */
(function (raiz) {
  "use strict";

  function azar(semilla) {
    let a = semilla >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }

  // Puntos ficticios alrededor de (-15.84, -70.02), zona 19S. Coordenadas inventadas.
  const PUNTOS = [
    { p: "P-01 Bocamina", amb: "SUPERFICIE", base: 71, fuente: "Ventilador principal", dx: 0, dy: 0 },
    { p: "P-02 Planta chancado", amb: "SUPERFICIE", base: 84, fuente: "Chancadora", dx: 120, dy: 60 },
    { p: "P-03 Campamento", amb: "SUPERFICIE", base: 52, fuente: "Ambiente", dx: -180, dy: 90 },
    { p: "P-04 Compresora", amb: "SUPERFICIE", base: 80, fuente: "Compresora", dx: 60, dy: -110 },
    { p: "P-05 Almacén", amb: "SUPERFICIE", base: 58, fuente: "Ambiente", dx: -90, dy: -70 },
    { p: "P-06 Taller", amb: "SUPERFICIE", base: 76, fuente: "Taller mecánico", dx: 170, dy: -40 },
    { p: "I-01 Galería 4300", amb: "INTERIOR", base: 79, fuente: "Ventilación", dx: 10, dy: 20 },
    { p: "I-02 Frente de perforación", amb: "INTERIOR", base: 96, fuente: "Perforadora jackleg", dx: 25, dy: 35 },
    { p: "I-03 Cruce", amb: "INTERIOR", base: 83, fuente: "Locomotora", dx: -15, dy: 15 },
    { p: "I-04 Chimenea", amb: "INTERIOR", base: 88, fuente: "Winche", dx: 35, dy: -10 },
  ];

  // Tres proyectos ficticios para ver el avance por proyecto
  function proyectoDe(pt) {
    if (pt.amb === "INTERIOR") return "DEMO · Interior mina Nv 4300";
    if (["P-02 Planta chancado", "P-04 Compresora", "P-06 Taller"].includes(pt.p)) return "DEMO · Planta y talleres";
    return "DEMO · Ambiental campamento";
  }
  const LAT0 = -15.8412, LON0 = -70.0231;
  function latLonDe(pt) {
    return [LAT0 + pt.dy / 110574, LON0 + pt.dx / (111320 * Math.cos((LAT0 * Math.PI) / 180))];
  }

  function proyectosMeta() {
    const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const dias = (d) => new Date(Date.now() - 5 * 3600000 + d * 86400000).toISOString().slice(0, 10);
    return [
      { proyecto: "DEMO · Interior mina Nv 4300", unidad_minera: "Unidad ficticia", responsable: "Evaluador B (demo)", objetivo_puntos: 6, objetivo_mediciones: 160, fecha_inicio: dias(-14), fecha_fin: dias(10), estado: "EN CURSO", notas: "Dosimetría y puntos fijos en labores." },
      { proyecto: "DEMO · Planta y talleres", unidad_minera: "Unidad ficticia", responsable: "Evaluador A (demo)", objetivo_puntos: 4, objetivo_mediciones: 100, fecha_inicio: dias(-14), fecha_fin: dias(3), estado: "EN CURSO", notas: "" },
      { proyecto: "DEMO · Ambiental campamento", unidad_minera: "Unidad ficticia", responsable: "Evaluador A (demo)", objetivo_puntos: 5, objetivo_mediciones: 90, fecha_inicio: dias(-14), fecha_fin: hoy, estado: "EN CURSO", notas: "Comparar con el ECA (zona industrial)." },
    ];
  }

  function usuarios() {
    const t = (h) => new Date(Date.now() - h * 3600000).toISOString();
    return [
      { user_id: "u-demo-5", email: "supervisor.drem@ejemplo.pe", nombre: "Supervisor (demo)", motivo: "Revisar el monitoreo para el concurso", rol: null, creado: t(2), ultimo_ingreso: null, confirmado: true },
      { user_id: "u-demo-1", email: "celular1@ejemplo.pe", nombre: "Celular 1", motivo: "", rol: "celular", creado: t(400), ultimo_ingreso: t(0.1), confirmado: true },
      { user_id: "u-demo-2", email: "celular2@ejemplo.pe", nombre: "Celular 2", motivo: "", rol: "celular", creado: t(400), ultimo_ingreso: t(0.2), confirmado: true },
      { user_id: "u-demo-3", email: "ingeniero@ejemplo.pe", nombre: "Ingeniero (demo)", motivo: "", rol: "lector", creado: t(300), ultimo_ingreso: t(5), confirmado: true },
      { user_id: "u-demo-4", email: "admin@ejemplo.pe", nombre: "Administrador (demo)", motivo: "", rol: "admin", creado: t(500), ultimo_ingreso: t(0), confirmado: true },
    ];
  }

  // Eventos de las ultimas 24 h a partir de las mediciones sinteticas (como harian los triggers)
  function eventosDe(filas) {
    const desde = Date.now() - 86400000, ev = [];
    let id = 1;
    filas.filter((f) => f.inicio_ms >= desde).forEach((f) => {
      const base = { proyecto: f.proyecto, punto: f.punto, modo: f.modo, ambito: f.ambito, evaluador: f.evaluador, latitud: f.latitud, longitud: f.longitud, este: f.este, norte: f.norte, medicion_uuid: f.uuid };
      ev.push({ id: id++, creado: new Date(f.inicio_ms).toISOString(), tipo: "INICIO", nivel_dba: null, detalle: "Empezó a medir", ...base });
      const fin = new Date(f.inicio_ms + f.duracion_s * 1000).toISOString();
      ev.push({ id: id++, creado: fin, tipo: "MEDICION", nivel_dba: f.leq_dba, detalle: "Medición guardada · " + f.duracion_s + " s", ...base });
      if (f.leq_dba >= 85) ev.push({ id: id++, creado: fin, tipo: "ALERTA_OCUPACIONAL", nivel_dba: f.leq_dba, detalle: "Leq igual o mayor al límite ocupacional de 85 dB(A)", ...base });
    });
    return ev.sort((a, b) => Date.parse(b.creado) - Date.parse(a.creado));
  }

  function generar() {
    const r = azar(20260930);
    const ahora = Date.now();
    const inicio = ahora - 13 * 86400000;
    const lat0 = -15.8412, lon0 = -70.0231;
    const filas = [];
    let k = 0;
    PUNTOS.forEach((pt, ip) => {
      const n = 26 + Math.floor(r() * 10);
      for (let i = 0; i < n; i++) {
        const dia = Math.floor(r() * 13);
        const horaLocal = pt.amb === "INTERIOR" ? 6 + r() * 12 : 6 + r() * 16;
        // medianoche de Lima en UTC + dias + hora local
        const base0 = Math.floor((inicio - 5 * 3600000) / 86400000) * 86400000 + 5 * 3600000;
        const ms = Math.round(base0 + dia * 86400000 + horaLocal * 3600000);
        if (ms > ahora - 60000) continue;
        const tendencia = ip === 1 ? 0.18 * dia : ip === 3 ? 0.07 * dia : 0; // dos puntos que empeoran
        const ciclo = pt.amb === "SUPERFICIE" ? 1.5 * Math.sin(((horaLocal - 9) / 24) * 2 * Math.PI) : 0;
        const leq = pt.base + tendencia + ciclo + normal(r) * 2.1;
        const dur = [60, 120, 300, 600][Math.floor(r() * 4)];
        const modo = r() < 0.2 ? "RECORRIDO" : "PUNTUAL";
        const uuid = "demo-" + (k++).toString(16).padStart(8, "0");
        const lat = lat0 + (pt.dy + normal(r) * 3) / 110574;
        const lon = lon0 + (pt.dx + normal(r) * 3) / (111320 * Math.cos((lat0 * Math.PI) / 180));
        const serie = [];
        for (let s = 0; s < Math.min(dur, 60); s++) serie.push((leq + normal(r) * 3).toFixed(1));
        const zonaEca = "INDUSTRIAL";
        filas.push({
          uuid, proyecto: proyectoDe(pt), proyecto_id: 1, modo, recorrido_id: modo === "RECORRIDO" ? "demo" + dia : "",
          secuencia: 1, inicio_ms: ms, ambito: pt.amb, punto: pt.p, labor: "", fuente_ruido: pt.fuente,
          este: 392000 + pt.dx + 0, norte: 8248000 + pt.dy, cota: 4300 + ip * 3, tipo_cota: "msnm", zona_utm: "19S",
          latitud: lat, longitud: lon, origen_posicion: "GPS", precision_m: 4 + r() * 8, duracion_s: dur,
          leq_dba: +leq.toFixed(1), lmax_dba: +(leq + 6 + r() * 8).toFixed(1), lmin_dba: +(leq - 6 - r() * 5).toFixed(1),
          l10_dba: +(leq + 2.5).toFixed(1), l50_dba: +(leq - 0.5).toFixed(1), l90_dba: +(leq - 3).toFixed(1),
          zona_eca: zonaEca, limite_eca_dba: null, limite_ocupacional_dba: 85, horas_exposicion: 8,
          offset_cal_db: 108.4, calibrado: true, saturacion_pct: r() < 0.05 ? 3 : 0, fuente_audio: "UNPROCESSED",
          evaluador: pt.amb === "INTERIOR" ? "Evaluador B (demo)" : "Evaluador A (demo)", observacion: "", serie_1s: serie.join("|"),
          fotos: ["demo/" + uuid + ".jpg"],
        });
      }
    });
    return filas.sort((a, b) => b.inicio_ms - a.inicio_ms);
  }

  // Foto de relleno (SVG) con banda de datos, para ver como luciria la evidencia
  function fotoDemo(uuid, fila) {
    const e = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const t = fila ? ["SONOMIN · " + fila.proyecto, "Punto " + fila.punto, "Leq " + fila.leq_dba.toFixed(1) + " dB(A)   " + fila.duracion_s + " s", "E " + fila.este.toFixed(1) + "  N " + fila.norte.toFixed(1) + "  Cota " + fila.cota.toFixed(1) + " (19S)", fila.ambito + "   GPS"] : ["Foto de demostración"];
    const tono = fila && fila.ambito === "INTERIOR" ? ["#3a342b", "#1f1b16"] : ["#7d8f9e", "#3f4a55"];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tono[0]}"/><stop offset="1" stop-color="${tono[1]}"/></linearGradient></defs><rect width="640" height="480" fill="url(#g)"/><text x="320" y="190" fill="#ffffff55" font-family="sans-serif" font-size="28" text-anchor="middle">FOTO DE DEMOSTRACIÓN</text><rect y="${480 - 30 * (t.length + 1)}" width="640" height="${30 * (t.length + 1)}" fill="#08142399"/><rect y="${480 - 30 * (t.length + 1)}" width="640" height="3" fill="#2ecc71"/>${t.map((l, i) => `<text x="12" y="${480 - 30 * (t.length + 1) + 28 + i * 27}" fill="#fff" font-family="monospace" font-size="17" font-weight="${i ? 400 : 700}">${e(l)}</text>`).join("")}</svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  raiz.SON_DEMO = { generar, fotoDemo, azar, normal, proyectosMeta, usuarios, eventosDe, PUNTOS, latLonDe, proyectoDe };
})(window);
