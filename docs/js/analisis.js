/* SONOMIN · analisis y pronostico en el navegador.
 * Todo es estadistica clasica y reproducible (sin cajas negras):
 *   - Leq energetico ponderado por duracion
 *   - interpolacion IDW con validacion cruzada leave-one-out
 *   - tendencia lineal con intervalo de confianza
 *   - probabilidad de superar un limite (modelo normal + proporcion empirica con IC de Wilson)
 * Funciona con las filas de la tabla 'mediciones'.
 */
(function (raiz, fabrica) {
  const N = typeof module === "object" && module.exports ? require("./normas.js") : raiz.SON_NORMAS;
  if (typeof module === "object" && module.exports) module.exports = fabrica(N);
  else raiz.SON_ANALISIS = fabrica(N);
})(typeof self !== "undefined" ? self : this, function (N) {
  "use strict";

  // ------------------------------------------------------------ utilidades
  const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
  const suma = (a) => a.reduce((s, x) => s + x, 0);
  const media = (a) => (a.length ? suma(a) / a.length : NaN);
  const desvio = (a) => {
    if (a.length < 2) return NaN;
    const m = media(a);
    return Math.sqrt(suma(a.map((x) => (x - m) * (x - m))) / (a.length - 1));
  };

  function leqEnergetico(niveles, pesos) {
    if (!niveles.length) return NaN;
    let s = 0, w = 0;
    for (let i = 0; i < niveles.length; i++) {
      const p = pesos ? pesos[i] : 1;
      s += p * Math.pow(10, niveles[i] / 10);
      w += p;
    }
    return 10 * Math.log10(s / w);
  }

  // Normal estandar: acumulada con aproximacion de Abramowitz-Stegun 7.1.26 (error < 1.5e-7)
  function erf(x) {
    const s = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  const normalCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

  // Beta incompleta regularizada (Numerical Recipes) para el valor p de la t de Student
  function lnGamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, t = x + 5.5;
    t -= (x + 0.5) * Math.log(t);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -t + Math.log((2.5066282746310005 * ser) / x);
  }
  function betacf(a, b, x) {
    const MAXIT = 200, EPS = 3e-12, FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function betai(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
  }
  // valor p bilateral de una t con 'gl' grados de libertad
  const pT = (t, gl) => betai(gl / 2, 0.5, gl / (gl + t * t));

  // t critica bilateral 95 % (tabla para gl pequenos, normal para gl grandes)
  function t95(gl) {
    const tabla = { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
      12: 2.179, 15: 2.131, 20: 2.086, 25: 2.060, 30: 2.042, 40: 2.021, 60: 2.000, 120: 1.980 };
    if (gl >= 120) return 1.96;
    const claves = Object.keys(tabla).map(Number).sort((a, b) => a - b);
    let prev = claves[0];
    for (const k of claves) { if (gl <= k) return gl === k ? tabla[k] : tabla[prev]; prev = k; }
    return 1.96;
  }

  function wilson(k, n, z = 1.96) {
    if (!n) return [NaN, NaN];
    const p = k / n, z2 = z * z;
    const centro = (p + z2 / (2 * n)) / (1 + z2 / n);
    const mar = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
    return [Math.max(0, centro - mar), Math.min(1, centro + mar)];
  }

  // ------------------------------------------------------- normalizacion
  function normalizar(f) {
    const ms = num(f.inicio_ms) ?? (f.fecha_hora ? Date.parse(f.fecha_hora) : null);
    const hl = ms ? N.horaLima(ms) : { h: 0, m: 0, dia: "" };
    const fotos = Array.isArray(f.fotos) ? f.fotos : [];
    return {
      ...f,
      ms, hora: hl.h + hl.m / 60, dia: hl.dia,
      leq: num(f.leq_dba), lmax: num(f.lmax_dba), lmin: num(f.lmin_dba),
      l10: num(f.l10_dba), l50: num(f.l50_dba), l90: num(f.l90_dba),
      dur: num(f.duracion_s) || 1,
      este: num(f.este), norte: num(f.norte), cota: num(f.cota),
      ...latLonDe(f),
      dosis: num(f.dosis_pct), fotos,
      serie: typeof f.serie_1s === "string" && f.serie_1s ? f.serie_1s.split("|").map(Number).filter((x) => !Number.isNaN(x)) : [],
      limEca: num(f.limite_eca_dba) ?? (ms ? N.limiteEca(f.zona_eca, ms) : null),
    };
  }

  // Posicion geografica: la del GPS o, si no hay (interior mina, punto de control, manual), convertida desde UTM
  function latLonDe(f) {
    const lat = num(f.latitud), lon = num(f.longitud);
    if (lat !== null && lon !== null) return { lat, lon, latDesdeUtm: false };
    const e = num(f.este), n = num(f.norte);
    const ll = e !== null && n !== null ? N.utmALatLon(e, n, f.zona_utm || "19S") : null;
    return ll ? { lat: ll[0], lon: ll[1], latDesdeUtm: true } : { lat: null, lon: null, latDesdeUtm: false };
  }

  // Avisos de calidad del dato (se muestran junto a la medicion)
  function calidad(m) {
    const av = [];
    if (m.leq !== null && m.leq < 28) av.push("Nivel menor a 28 dB(A): el micrófono probablemente no captó señal (¿emulador o micrófono tapado?).");
    if (m.lmin !== null && m.lmin < 0) av.push("Mínimo negativo: hubo silencio digital en parte de la medición.");
    if ((num(m.saturacion_pct) || 0) > 1) av.push("Micrófono saturado en " + Number(m.saturacion_pct).toFixed(0) + " % del tiempo: el nivel real puede ser mayor.");
    if (m.calibrado === false) av.push("Equipo sin calibrar contra un sonómetro patrón: valor referencial.");
    if ((num(m.precision_m) || 0) > 30) av.push("Precisión GPS baja (" + Number(m.precision_m).toFixed(0) + " m).");
    if (m.dur < 30 && m.modo === "PUNTUAL") av.push("Medición corta (" + m.dur.toFixed(0) + " s): la Guía N° 1 pide tiempos de medición representativos.");
    return av;
  }

  // ------------------------------------------------------- agrupaciones
  function porPunto(meds) {
    const grupos = new Map();
    for (const m of meds) {
      if (m.leq === null) continue;
      const clave = m.proyecto + "||" + m.punto;
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(m);
    }
    const salida = [];
    for (const [clave, g] of grupos) {
      const leqs = g.map((x) => x.leq), pesos = g.map((x) => x.dur);
      const geo = g.filter((x) => x.lat !== null && x.lon !== null);
      const utm = g.filter((x) => x.este !== null && x.norte !== null);
      const sobre = g.filter((x) => x.leq >= N.LIMITE_OCUPACIONAL).length;
      salida.push({
        clave, proyecto: g[0].proyecto, punto: g[0].punto, n: g.length,
        leq: leqEnergetico(leqs, pesos), max: Math.max(...g.map((x) => x.lmax ?? x.leq)), min: Math.min(...leqs),
        sd: desvio(leqs), lat: geo.length ? media(geo.map((x) => x.lat)) : null, lon: geo.length ? media(geo.map((x) => x.lon)) : null,
        este: utm.length ? media(utm.map((x) => x.este)) : null, norte: utm.length ? media(utm.map((x) => x.norte)) : null,
        cota: media(g.filter((x) => x.cota !== null).map((x) => x.cota)),
        ambito: g[0].ambito, zona: g[0].zona_eca, ultima: Math.max(...g.map((x) => x.ms || 0)),
        sobreLimite: sobre, pctSobreLimite: (100 * sobre) / g.length,
        sem: N.semaforo(leqEnergetico(leqs, pesos)), filas: g,
      });
    }
    return salida.sort((a, b) => b.leq - a.leq);
  }

  function perfilHorario(meds) {
    const bins = Array.from({ length: 24 }, (_, h) => ({ h, n: 0, leqs: [], pesos: [] }));
    for (const m of meds) {
      if (m.leq === null) continue;
      const b = bins[Math.min(23, Math.floor(m.hora))];
      b.n++; b.leqs.push(m.leq); b.pesos.push(m.dur);
    }
    return bins.map((b) => ({ h: b.h, n: b.n, leq: b.n ? leqEnergetico(b.leqs, b.pesos) : null }));
  }

  // Cumplimiento. ECA solo aplica a ruido ambiental exterior (SUPERFICIE).
  function cumplimiento(meds) {
    const v = meds.filter((m) => m.leq !== null);
    const sem = { CONFORME: 0, PRECAUCION: 0, EXCEDE: 0 };
    v.forEach((m) => sem[N.semaforo(m.leq)]++);
    const exterior = v.filter((m) => m.ambito === "SUPERFICIE" && m.limEca !== null);
    const sobreEca = exterior.filter((m) => m.leq > m.limEca).length;
    return { n: v.length, sem, nEca: exterior.length, sobreEca, pctSobreEca: exterior.length ? (100 * sobreEca) / exterior.length : null };
  }

  // Dosis acumulada por dia y proyecto (jornadas): suma de C/T sobre los tramos de ese dia
  function dosisPorDia(meds) {
    const mapa = new Map();
    for (const m of meds) {
      if (m.leq === null) continue;
      const clave = m.proyecto + "||" + m.dia;
      const horas = m.dur / 3600;
      mapa.set(clave, (mapa.get(clave) || 0) + N.dosisPct(m.leq, horas));
    }
    return [...mapa].map(([k, d]) => ({ proyecto: k.split("||")[0], dia: k.split("||")[1], dosis: d, twa: N.twa8h(d) }));
  }

  // -------------------------------------------------- interpolacion IDW
  function proyeccionLocal(puntos) {
    const lat0 = media(puntos.map((p) => p.lat)), lon0 = media(puntos.map((p) => p.lon));
    const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;
    return { lat0, lon0, aXY: (lat, lon) => [(lon - lon0) * kx, (lat - lat0) * ky], aLL: (x, y) => [lat0 + y / ky, lon0 + x / kx] };
  }

  function idwValor(xs, ys, zs, x, y, p = 2) {
    let sw = 0, sz = 0;
    for (let i = 0; i < xs.length; i++) {
      const d2 = (xs[i] - x) ** 2 + (ys[i] - y) ** 2;
      if (d2 < 1e-6) return zs[i];
      const w = 1 / Math.pow(d2, p / 2);
      sw += w; sz += w * zs[i];
    }
    // interpolacion en dominio energetico (los dB no se promedian aritmeticamente)
    return sz / sw;
  }

  // Interpola en dominio de energia: 10^(L/10)
  function idwDb(xs, ys, dbs, x, y, p = 2) {
    return 10 * Math.log10(idwValor(xs, ys, dbs.map((d) => Math.pow(10, d / 10)), x, y, p));
  }

  function validacionCruzada(pts, p = 2) {
    if (pts.length < 4) return null;
    const proy = proyeccionLocal(pts);
    const xy = pts.map((q) => proy.aXY(q.lat, q.lon));
    const err = [];
    for (let i = 0; i < pts.length; i++) {
      const idx = pts.map((_, j) => j).filter((j) => j !== i);
      const est = idwDb(idx.map((j) => xy[j][0]), idx.map((j) => xy[j][1]), idx.map((j) => pts[j].leq), xy[i][0], xy[i][1], p);
      err.push(est - pts[i].leq);
    }
    return { n: pts.length, rmse: Math.sqrt(media(err.map((e) => e * e))), mae: media(err.map(Math.abs)), sesgo: media(err) };
  }

  function rejillaIdw(pts, resolucion = 60, p = 2, margen = 0.25) {
    if (pts.length < 3) return null;
    const proy = proyeccionLocal(pts);
    const xy = pts.map((q) => proy.aXY(q.lat, q.lon));
    const xs = xy.map((a) => a[0]), ys = xy.map((a) => a[1]);
    const dbs = pts.map((q) => q.leq);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const ancho = Math.max(x1 - x0, 20), alto = Math.max(y1 - y0, 20);
    x0 -= ancho * margen; x1 += ancho * margen; y0 -= alto * margen; y1 += alto * margen;
    const nx = resolucion, ny = Math.max(10, Math.round((resolucion * (y1 - y0)) / (x1 - x0)));
    const z = [];
    for (let j = 0; j < ny; j++) {
      const fila = [];
      for (let i = 0; i < nx; i++) {
        const x = x0 + ((i + 0.5) * (x1 - x0)) / nx;
        const y = y1 - ((j + 0.5) * (y1 - y0)) / ny; // fila 0 = norte
        fila.push(idwDb(xs, ys, dbs, x, y, p));
      }
      z.push(fila);
    }
    const [latSur, lonOeste] = proy.aLL(x0, y0), [latNorte, lonEste] = proy.aLL(x1, y1);
    return { nx, ny, z, limites: [[latSur, lonOeste], [latNorte, lonEste]] };
  }

  // ------------------------------------------------ tendencia y pronostico
  // Regresion lineal Leq ~ tiempo (dias). Devuelve pendiente en dB/dia con IC 95 % y valor p.
  function tendencia(meds) {
    const v = meds.filter((m) => m.leq !== null && m.ms);
    const n = v.length;
    if (n < 5) return { n, suficiente: false };
    const t0 = Math.min(...v.map((m) => m.ms));
    const x = v.map((m) => (m.ms - t0) / 86400000), y = v.map((m) => m.leq);
    const mx = media(x), my = media(y);
    const sxx = suma(x.map((a) => (a - mx) ** 2));
    if (sxx < 1e-9) return { n, suficiente: false, motivo: "Todas las mediciones son del mismo instante." };
    const sxy = suma(x.map((a, i) => (a - mx) * (y[i] - my)));
    const b = sxy / sxx, a = my - b * mx;
    const res = y.map((yi, i) => yi - (a + b * x[i]));
    const sse = suma(res.map((r) => r * r)), gl = n - 2;
    const s2 = sse / gl, seB = Math.sqrt(s2 / sxx);
    const sst = suma(y.map((yi) => (yi - my) ** 2));
    const t = seB > 0 ? b / seB : 0;
    return {
      n, suficiente: true, t0, a, b, seB, s: Math.sqrt(s2), mx, sxx, gl,
      ic95: [b - t95(gl) * seB, b + t95(gl) * seB], p: seB > 0 ? pT(t, gl) : 1,
      r2: sst > 0 ? 1 - sse / sst : 0, diasObservados: Math.max(...x),
    };
  }

  // Pronostico de un punto: nivel esperado dentro de 'dias' y probabilidad de superar 'limite'.
  function pronosticoPunto(filas, dias, limite, opciones = {}) {
    const minN = opciones.minN ?? 10;
    const v = filas.filter((m) => m.leq !== null);
    const n = v.length;
    const k = v.filter((m) => m.leq >= limite).length;
    const [wLo, wHi] = wilson(k, n);
    const base = { n, k, limite, propEmpirica: n ? k / n : null, propIC: [wLo, wHi], suficiente: n >= minN };
    if (n < minN) return { ...base, motivo: "Se necesitan al menos " + minN + " mediciones del punto (hay " + n + ")." };
    const tr = tendencia(v);
    const niveles = v.map((m) => m.leq);
    const mu = media(niveles), sd = desvio(niveles);
    // la tendencia solo se extrapola si es significativa y el horizonte no supera el periodo observado
    const horizonteLargo = tr.suficiente && dias > tr.diasObservados;
    const usarTendencia = tr.suficiente && tr.p < 0.05 && tr.diasObservados >= 2 && !horizonteLargo;
    let mediaProy = mu, sdProy = sd * Math.sqrt(1 + 1 / n);
    if (usarTendencia) {
      const tAhora = Math.max(...v.map((m) => (m.ms - tr.t0) / 86400000)), tObj = tAhora + dias;
      mediaProy = tr.a + tr.b * tObj;
      sdProy = Math.sqrt(tr.s ** 2 * (1 + 1 / n + (tObj - tr.mx) ** 2 / tr.sxx));
    }
    const z = sdProy > 0 ? (limite - mediaProy) / sdProy : (mediaProy >= limite ? -Infinity : Infinity);
    return {
      ...base, mu, sd, mediaProy, sdProy, usarTendencia, horizonteLargo, tendencia: tr,
      probModelo: sdProy > 0 ? 1 - normalCdf(z) : (mediaProy >= limite ? 1 : 0),
    };
  }

  // Perfil horario esperado de un punto (Leq medio por hora del dia, con n)
  function perfilEsperado(filas) {
    return perfilHorario(filas);
  }

  // Simulador "que pasaria si": cambio de nivel y de horas de exposicion
  function simular({ leq, deltaDb = 0, horas = 8 }) {
    const nuevo = leq + deltaDb;
    const dosis = N.dosisPct(nuevo, horas);
    return {
      nivel: nuevo, horas, dosis, twa: N.twa8h(dosis), permitido: N.tiempoPermitidoH(nuevo),
      sem: N.semaforo(nuevo), sobreTabla: N.sobreTabla(nuevo), excedeDosis: dosis > 100,
      horasMaximas: N.tiempoPermitidoH(nuevo),
    };
  }

  // ------------------------------------------------------- estadistica
  // Percentil con interpolacion lineal (tipo 7, el de Excel PERCENTIL.INC y R por defecto)
  function percentil(valores, p) {
    const v = valores.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!v.length) return NaN;
    const h = (v.length - 1) * p, i = Math.floor(h);
    return i + 1 < v.length ? v[i] + (h - i) * (v[i + 1] - v[i]) : v[i];
  }

  // Resumen descriptivo de un grupo de mediciones (niveles en dB(A))
  function descriptiva(meds) {
    const v = meds.map((m) => m.leq).filter(Number.isFinite);
    const n = v.length;
    if (!n) return { n: 0 };
    const mu = media(v), sd = desvio(v), ic = n > 1 ? t95(n - 1) * sd / Math.sqrt(n) : NaN;
    const q1 = percentil(v, 0.25), q3 = percentil(v, 0.75);
    return {
      n, media: mu, sd, cv: mu ? (100 * sd) / mu : NaN, ic95: [mu - ic, mu + ic],
      leq: leqEnergetico(v, meds.filter((m) => Number.isFinite(m.leq)).map((m) => m.dur)),
      min: Math.min(...v), max: Math.max(...v), p10: percentil(v, 0.1), q1, mediana: percentil(v, 0.5), q3, p90: percentil(v, 0.9),
      iqr: q3 - q1, sobre85: v.filter((x) => x >= N.LIMITE_OCUPACIONAL).length,
      sobre82: v.filter((x) => x >= N.NIVEL_ACCION).length,
    };
  }

  // Histograma con clases de ancho fijo (por defecto 2 dB)
  function histograma(valores, ancho = 2) {
    const v = valores.filter(Number.isFinite);
    if (!v.length) return [];
    const a = Math.floor(Math.min(...v) / ancho) * ancho, b = Math.ceil((Math.max(...v) + 1e-9) / ancho) * ancho;
    const clases = [];
    for (let x = a; x < b; x += ancho) clases.push({ desde: x, hasta: x + ancho, n: 0 });
    v.forEach((x) => { const i = Math.min(clases.length - 1, Math.floor((x - a) / ancho)); clases[i].n++; });
    return clases;
  }

  // Valor p de una F de Fisher (cola superior)
  const pF = (F, d1, d2) => (F <= 0 || !Number.isFinite(F) ? 1 : betai(d2 / 2, d1 / 2, d2 / (d2 + d1 * F)));

  // ANOVA de un factor: ¿el nivel medio difiere entre grupos (puntos, fuentes, turnos)?
  function anova(grupos) {
    const g = grupos.map((x) => x.filter(Number.isFinite)).filter((x) => x.length >= 2);
    const k = g.length, n = g.reduce((s, x) => s + x.length, 0);
    if (k < 2 || n - k < 1) return { suficiente: false, k, n };
    const todos = g.flat(), mg = media(todos);
    const ssb = g.reduce((s, x) => s + x.length * (media(x) - mg) ** 2, 0);
    const ssw = g.reduce((s, x) => { const m = media(x); return s + x.reduce((t, y) => t + (y - m) ** 2, 0); }, 0);
    const glb = k - 1, glw = n - k;
    const F = ssw > 0 ? (ssb / glb) / (ssw / glw) : Infinity;
    return { suficiente: true, k, n, F, glb, glw, p: pF(F, glb, glw), eta2: ssb / (ssb + ssw) };
  }

  // Correlacion de Pearson con su valor p (t con n-2 grados de libertad)
  function correlacion(xs, ys) {
    const pares = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    const n = pares.length;
    if (n < 4) return { suficiente: false, n };
    const mx = media(pares.map((p) => p[0])), my = media(pares.map((p) => p[1]));
    let sxy = 0, sxx = 0, syy = 0;
    pares.forEach(([x, y]) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; });
    if (sxx === 0 || syy === 0) return { suficiente: false, n };
    const r = sxy / Math.sqrt(sxx * syy), t = r * Math.sqrt((n - 2) / Math.max(1e-12, 1 - r * r));
    return { suficiente: true, n, r, r2: r * r, p: pT(Math.abs(t), n - 2), pendiente: sxy / sxx };
  }

  // Matriz dia de la semana x hora con el Leq energetico de cada celda
  function mapaCalor(meds) {
    const celdas = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ leqs: [], pesos: [] })));
    meds.forEach((m) => {
      if (!Number.isFinite(m.leq) || !m.ms) return;
      const d = new Date(m.ms - 5 * 3600000).getUTCDay(); // dia en hora de Lima (0 = domingo)
      const h = Math.floor(m.hora) % 24;
      celdas[(d + 6) % 7][h].leqs.push(m.leq); celdas[(d + 6) % 7][h].pesos.push(m.dur);
    });
    return celdas.map((fila) => fila.map((c) => ({ n: c.leqs.length, leq: c.leqs.length ? leqEnergetico(c.leqs, c.pesos) : null })));
  }

  return {
    latLonDe, percentil, descriptiva, histograma, anova, correlacion, mapaCalor, pF, t95,
    num, media, desvio, leqEnergetico, normalCdf, pT, wilson, normalizar, calidad, porPunto, perfilHorario,
    cumplimiento, dosisPorDia, proyeccionLocal, idwDb, validacionCruzada, rejillaIdw, tendencia, pronosticoPunto,
    perfilEsperado, simular,
  };
});
