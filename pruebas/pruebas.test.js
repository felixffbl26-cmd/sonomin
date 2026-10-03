const test = require("node:test");
const assert = require("node:assert");
const N = require("../docs/js/normas.js");
const A = require("../docs/js/analisis.js");
const P = require("../docs/js/penalidades.js");

const cerca = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);

test("Anexo 12: filas de la tabla", () => {
  [[82, 16], [83, 12], [85, 8], [88, 4], [91, 1.5], [94, 1], [97, 0.5], [100, 0.25]].forEach(([l, t]) => cerca(N.tiempoPermitidoH(l), t));
  cerca(N.tiempoPermitidoH(105), 0.25 / Math.pow(2, 5 / 3), 1e-9);
  assert.ok(N.sobreTabla(101) && !N.sobreTabla(100));
});
test("dosis y TWA", () => {
  cerca(N.dosisPct(85, 8), 100);
  cerca(N.twa8h(100), 85);
  cerca(N.twa8h(200), 85 + 10 * Math.log10(2));
  assert.equal(N.semaforo(84.9), "PRECAUCION"); assert.equal(N.semaforo(85), "EXCEDE"); assert.equal(N.semaforo(81.9), "CONFORME");
});
test("ECA y horario Lima", () => {
  // 2026-09-30 12:00 Lima = 17:00 UTC
  const dia = Date.UTC(2026, 8, 30, 17, 0);
  const noche = Date.UTC(2026, 8, 30, 4, 0); // 23:00 Lima del 29
  assert.equal(N.esDiurno(dia), true); assert.equal(N.esDiurno(noche), false);
  assert.equal(N.limiteEca("INDUSTRIAL", dia), 80); assert.equal(N.limiteEca("INDUSTRIAL", noche), 70);
  assert.equal(N.limiteEca("RESIDENCIAL", dia), 60);
  // limites del horario: 07:01 diurno, 07:00 nocturno, 22:00 diurno, 22:01 nocturno
  const lima = (h, m) => Date.UTC(2026, 8, 30, h + 5, m);
  assert.equal(N.esDiurno(lima(7, 0)), false); assert.equal(N.esDiurno(lima(7, 1)), true);
  assert.equal(N.esDiurno(lima(22, 0)), true); assert.equal(N.esDiurno(lima(22, 1)), false);
});
test("Leq energetico", () => {
  cerca(A.leqEnergetico([80, 80]), 80);
  cerca(A.leqEnergetico([90, 80]), 10 * Math.log10((1e9 + 1e8) / 2));
  cerca(A.leqEnergetico([90, 80], [1, 3]), 10 * Math.log10((1e9 + 3e8) / 4));
});
test("t de Student: valores de tabla", () => {
  cerca(A.pT(2.228, 10), 0.05, 0.001);
  cerca(A.pT(2.0, 60), 0.0500, 0.002);
  cerca(A.pT(0, 10), 1, 1e-9);
  cerca(A.normalCdf(1.96), 0.975, 1e-3);
});
test("Wilson", () => {
  const [lo, hi] = A.wilson(5, 10);
  cerca(lo, 0.2366, 1e-3); cerca(hi, 0.7634, 1e-3);
  assert.deepEqual(A.wilson(0, 0).map(Number.isNaN), [true, true]);
});
test("tendencia: recta exacta con ruido determinista", () => {
  const filas = [];
  for (let i = 0; i < 30; i++) filas.push(A.normalizar({ inicio_ms: Date.UTC(2026, 8, 1) + i * 86400000, leq_dba: 70 + 0.5 * i + (i % 2 ? 0.3 : -0.3), proyecto: "X", punto: "P" }));
  const t = A.tendencia(filas);
  cerca(t.b, 0.5, 0.02); assert.ok(t.p < 1e-6); assert.ok(t.ic95[0] < 0.5 && t.ic95[1] > 0.5); assert.ok(t.r2 > 0.99);
});
test("pronostico: sin datos suficientes y con datos", () => {
  const pocos = [A.normalizar({ inicio_ms: 1e12, leq_dba: 80 })];
  assert.equal(A.pronosticoPunto(pocos, 30, 85).suficiente, false);
  const filas = [];
  for (let i = 0; i < 40; i++) filas.push(A.normalizar({ inicio_ms: Date.UTC(2026, 8, 1) + i * 86400000, leq_dba: 80 + (i % 5) - 2, proyecto: "X", punto: "P" }));
  const r = A.pronosticoPunto(filas, 30, 85);
  assert.equal(r.suficiente, true); assert.ok(r.probModelo >= 0 && r.probModelo < 0.1); assert.equal(r.k, 0);
  const alto = filas.map((f) => ({ ...f, leq: f.leq + 6 }));
  assert.ok(A.pronosticoPunto(alto, 30, 85).probModelo > 0.5);
});
test("IDW: reproduce los puntos y validacion cruzada", () => {
  const pts = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) pts.push({ lat: -15.8 + i * 0.0003, lon: -70.0 + j * 0.0003, leq: 70 + i * 2 + j });
  const proy = A.proyeccionLocal(pts);
  const xy = pts.map((p) => proy.aXY(p.lat, p.lon));
  cerca(A.idwDb(xy.map((a) => a[0]), xy.map((a) => a[1]), pts.map((p) => p.leq), xy[3][0], xy[3][1]), pts[3].leq, 1e-6);
  const cv = A.validacionCruzada(pts);
  assert.ok(cv.rmse < 3); assert.equal(cv.n, 24);
  const g = A.rejillaIdw(pts, 20); assert.equal(g.z.length, g.ny); assert.equal(g.z[0].length, 20);
});
test("OEFA 2026: formula, tope y compuerta del ECA", () => {
  const sin = P.calcularOefa({ compromisoIGA: false });
  assert.equal(sin.sancionable, false);
  // B = 11000 soles = 2 UIT, p = 0.5, F = 0 -> M = 4 UIT
  const r = P.calcularOefa({ compromisoIGA: true, metodologia: "2026", filaId: "043-1.2", escenarioId: "pot_flora", B_soles: 11000, pId: "media", factores: { generales: [] }, reconocimiento: "ninguno" });
  cerca(r.multaUIT, 4, 1e-9); cerca(r.multaSoles, 22000, 1e-6);
  // con reincidencia +20 % y reconocimiento -50 %
  const r2 = P.calcularOefa({ compromisoIGA: true, metodologia: "2026", filaId: "043-1.2", escenarioId: "pot_flora", B_soles: 11000, pId: "media", factores: { generales: [0.2] }, reconocimiento: "r50" });
  cerca(r2.multaUIT, 4 * 1.2 * 0.5, 1e-9);
  // tope
  const r3 = P.calcularOefa({ compromisoIGA: true, metodologia: "2026", filaId: "043-1.3", escenarioId: "leve", B_soles: 5500 * 1000, pId: "baja", factores: { generales: [] } });
  cerca(r3.multaUIT, 100, 1e-9);
  // metodologia 2013: M = B/p * F
  const r4 = P.calcularOefa({ compromisoIGA: true, metodologia: "2013", filaId: "043-1.2", escenarioId: "pot_flora", B_soles: 5500, pId: "media", factores: { f1: { f11: 0.1 }, f2: 0, f3: 0.06, f4: 0, f5: 0, f6: 0.3, f7: 0 } });
  cerca(r4.multaUIT, (1 / 0.5) * (1 + 0.1 + 0.06 + 0.3), 1e-9);
});
test("Osinergmin: no inventa montos sin fila", () => {
  assert.equal(P.calcularOsinergmin({ refId: "ninguna" }).calculable, false);
  const r = P.calcularOsinergmin({ refId: "libro", baseUIT: 150, reconocimiento: "r50", reincidencia: "1" });
  cerca(r.multaUIT, 100 * 0.5 * 1.25, 1e-9);
});
test("valor esperado", () => {
  const v = P.valorEsperado({ probExceso: 0.2, probSancion: 0.5, multaUIT: 10 });
  cerca(v.uit, 1); cerca(v.soles, 5500);
});
test("estadistica: ANOVA, Pearson y percentiles contra SciPy/NumPy", () => {
  const an = A.anova([[80.1, 82.3, 79.5, 81.0, 83.2], [85.4, 87.1, 86.0, 88.2], [78.0, 77.5, 79.9, 80.4, 78.8, 79.1]]);
  cerca(an.F, 43.65958830444456, 1e-6); cerca(an.p, 3.110919789665128e-06, 1e-9);
  const co = A.correlacion([1, 2, 3, 4, 5, 6, 7, 8], [70.2, 71.0, 73.5, 72.8, 75.1, 74.9, 77.2, 78.0]);
  cerca(co.r, 0.97302564635024, 1e-9); cerca(co.p, 4.8080095775061005e-05, 1e-8);
  const v = [50, 61, 72, 55, 90, 81, 66];
  cerca(A.percentil(v, 0.25), 58); cerca(A.percentil(v, 0.5), 66); cerca(A.percentil(v, 0.9), 84.6, 1e-9);
  const d = A.descriptiva([{ leq: 80, dur: 1 }, { leq: 90, dur: 1 }]);
  cerca(d.media, 85); cerca(d.leq, 10 * Math.log10((1e8 + 1e9) / 2), 1e-9); assert.strictEqual(d.sobre85, 1);
  const h = A.histograma([80.5, 81.2, 83.9, 84.0], 2);
  assert.deepStrictEqual(h.map((c) => c.n), [2, 1, 1]);
  assert.strictEqual(A.anova([[1, 2]]).suficiente, false);
});
test("UTM a geograficas contra pyproj (EPSG:32719 y 32718)", () => {
  let ll = N.utmALatLon(392000, 8248000, "19S"); cerca(ll[0], -15.844549601503147, 1e-7); cerca(ll[1], -70.0086045261724, 1e-7);
  ll = N.utmALatLon(430150, 8438120, "19S"); cerca(ll[0], -14.12710637645786, 1e-7); cerca(ll[1], -69.64715957242896, 1e-7);
  ll = N.utmALatLon(300000, 8600000, "18S"); cerca(ll[0], -12.657817352068887, 1e-7); cerca(ll[1], -76.84153544071079, 1e-7);
  const m = A.normalizar({ este: 392000, norte: 8248000, zona_utm: "19S", leq_dba: 80 });
  assert.ok(m.latDesdeUtm); cerca(m.lat, -15.8445496, 1e-6);
  assert.strictEqual(A.normalizar({ latitud: -15.1, longitud: -70.1 }).lat, -15.1);
});
