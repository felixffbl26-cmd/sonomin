/* SONOMIN · estimacion referencial de multas por ruido (Peru).
 *
 * ESTO NO ES UNA DETERMINACION DE MULTA. Sirve para dimensionar riesgo y comparar escenarios.
 * Todo dato normativo vive en las tablas de este archivo, cada uno con su fuente y su estado de
 * verificacion, para poder corregirlo sin tocar la logica. Estados:
 *   VERIFICADO  : leido en el texto de la norma.
 *   RESUMEN     : leido en un resumen o extracto de la norma; contrastar con el PDF oficial.
 *   NO CONFIRMADO: no se pudo comprobar; el modulo no lo usa para calcular montos.
 *
 * Hallazgos de la revision normativa (octubre 2026):
 *  - OEFA: el ECA de ruido no se sanciona por si mismo (Ley General del Ambiente, Art. 31.4).
 *    La multa se origina en el incumplimiento de una obligacion concreta (p. ej. un compromiso
 *    del IGA o el monitoreo), no en el exceso del estandar.
 *  - OEFA cambio su metodologia de multas con la R.C.D. 00005-2026-OEFA/CD (27-mar-2026).
 *    Los procedimientos iniciados antes siguen con la metodologia 2013/2017.
 *  - Osinergmin: no se encontro una fila especifica de ruido ocupacional en el cuadro vigente
 *    (R.C.D. 123-2024-OS/CD). La fila 3.8.2 "Ruido" (hasta 30 UIT) pertenecia a la R.C.D.
 *    286-2010-OS/CD, derogada. Por eso el modulo no inventa una multa ocupacional por ruido.
 */
(function (raiz, fabrica) {
  const N = typeof module === "object" && module.exports ? require("./normas.js") : raiz.SON_NORMAS;
  if (typeof module === "object" && module.exports) module.exports = fabrica(N);
  else raiz.SON_PENALIDADES = fabrica(N);
})(typeof self !== "undefined" ? self : this, function (N) {
  "use strict";

  const UIT = N.UIT_2026;

  // ============================================================ AMBIENTAL (OEFA)
  const FILAS_OEFA = [
    {
      id: "043-1.1", norma: "R.C.D. 043-2015-OEFA/CD", numeral: "1.1",
      descripcion: "No evitar o impedir que las emisiones, efluentes, vertimientos, residuos sólidos, ruido, vibraciones y cualquier otro aspecto de las operaciones generen o puedan generar efectos adversos al ambiente",
      base: "Art. 74 Ley General del Ambiente; Art. 16 del Reglamento de Protección y Gestión Ambiental (minería)",
      escenarios: [
        { id: "pot_flora", etiqueta: "Daño potencial a flora o fauna", gravedad: "GRAVE", min: 25, max: 2500 },
        { id: "pot_salud", etiqueta: "Daño potencial a la salud o la vida", gravedad: "GRAVE", min: 35, max: 3500 },
        { id: "real_flora", etiqueta: "Daño real a flora o fauna", gravedad: "MUY GRAVE", min: 55, max: 5500 },
        { id: "real_salud", etiqueta: "Daño real a la salud o la vida", gravedad: "MUY GRAVE", min: 75, max: 7500 },
      ],
      estado: "RESUMEN", nota: "Es la única fila de la tipificación minera que nombra el ruido. Confirmar el formato de la columna de sanción (mínimo y máximo) en el PDF oficial.",
      fuente: "https://cdn.www.gob.pe/uploads/document/file/7888173/216242-6643287-resolucion-de-consejo-directivo-n-043-2015-oefa-cd-version-el-peruano.pdf",
    },
    {
      id: "043-1.2", norma: "R.C.D. 043-2015-OEFA/CD", numeral: "1.2",
      descripcion: "No realizar el monitoreo y control permanente de las operaciones para verificar el cumplimiento de las obligaciones y compromisos a su cargo, así como la calidad ambiental",
      base: "Art. 18, literal b), Reglamento de Protección y Gestión Ambiental (minería)",
      escenarios: [
        { id: "pot_flora", etiqueta: "Daño potencial a flora o fauna", gravedad: "GRAVE", min: 15, max: 1500 },
        { id: "pot_salud", etiqueta: "Daño potencial a la salud o la vida", gravedad: "GRAVE", min: 25, max: 2500 },
        { id: "real_flora", etiqueta: "Daño real a flora o fauna", gravedad: "MUY GRAVE", min: 35, max: 3500 },
        { id: "real_salud", etiqueta: "Daño real a la salud o la vida", gravedad: "MUY GRAVE", min: 45, max: 4500 },
      ],
      estado: "RESUMEN", nota: "Aplica si la unidad no monitorea el ruido que su instrumento de gestión ambiental exige.",
      fuente: "https://cdn.www.gob.pe/uploads/document/file/7888173/216242-6643287-resolucion-de-consejo-directivo-n-043-2015-oefa-cd-version-el-peruano.pdf",
    },
    {
      id: "043-1.3", norma: "R.C.D. 043-2015-OEFA/CD", numeral: "1.3 / 1.4",
      descripcion: "No conservar por cinco años los registros de monitoreo, o no remitirlos al OEFA",
      base: "Art. 18, literal b), Reglamento de Protección y Gestión Ambiental (minería)",
      escenarios: [{ id: "leve", etiqueta: "Infracción leve", gravedad: "LEVE", min: 0, max: 100, nota: "Amonestación o multa hasta 100 UIT" }],
      estado: "RESUMEN", nota: "Aplica a la custodia y envío de los registros que genera esta aplicación.",
      fuente: "https://cdn.www.gob.pe/uploads/document/file/7888173/216242-6643287-resolucion-de-consejo-directivo-n-043-2015-oefa-cd-version-el-peruano.pdf",
    },
    {
      id: "006-3.1", norma: "R.C.D. 006-2018-OEFA/CD", numeral: "3.1",
      descripcion: "Incumplir lo establecido en el Instrumento de Gestión Ambiental aprobado (por ejemplo, compromisos de monitoreo o mitigación de ruido del EIA)",
      base: "Arts. 13 y 29 del Reglamento de la Ley del SEIA",
      escenarios: [{ id: "muy_grave", etiqueta: "Incumplimiento del IGA", gravedad: "MUY GRAVE", min: 0, max: 15000 }],
      estado: "VERIFICADO", nota: "Texto leído. Es la vía habitual cuando el ruido o su mitigación son compromisos del IGA.",
      fuente: "https://faolex.fao.org/docs/pdf/per177738.pdf",
    },
  ];

  // Probabilidad de deteccion p
  const P_DETECCION = {
    "2026": [
      { id: "muy_alta", etiqueta: "Muy alta (100 %): autorreporte previo, excesos detectados en reportes de monitoreo", p: 1.0 },
      { id: "alta", etiqueta: "Alta (75 %): supervisión especial (denuncia, emergencia)", p: 0.75 },
      { id: "media", etiqueta: "Media (50 %): supervisión regular programada", p: 0.5 },
      { id: "baja", etiqueta: "Baja (10 %): negativa de acceso, información falsa", p: 0.1 },
    ],
    "2013": [
      { id: "muy_alta", etiqueta: "Muy alta (1.00)", p: 1.0 },
      { id: "alta", etiqueta: "Alta (0.75)", p: 0.75 },
      { id: "media", etiqueta: "Media (0.50): supervisión regular", p: 0.5 },
      { id: "baja", etiqueta: "Baja (0.25)", p: 0.25 },
      { id: "muy_baja", etiqueta: "Muy baja (0.10)", p: 0.1 },
    ],
  };

  // Factores de graduacion (fracciones: 0.20 = +20 %)
  const FACTORES = {
    "2026": {
      generales: [
        { id: "f1", etiqueta: "Reincidencia (misma infracción, mismo año)", valor: 0.20 },
        { id: "f2", etiqueta: "Cumplimiento posterior al inicio del PAS y antes de la primera instancia", valor: -0.20 },
        { id: "f3", etiqueta: "Intencionalidad acreditada", valor: 0.72 },
      ],
      impacto: {
        i1: { etiqueta: "Aspectos ambientales afectados", opciones: [["1", 0.06], ["2", 0.12], ["3", 0.18], ["4", 0.24], ["5 o más", 0.30]] },
        i2: { etiqueta: "Componentes ambientales afectados", opciones: [["1", 0.10], ["2", 0.20], ["3", 0.30], ["4", 0.40], ["5 o más", 0.50]] },
        i3: { etiqueta: "Incidencia en el ambiente", opciones: [["Mínima", 0.06], ["Regular", 0.12], ["Alta", 0.18], ["Total", 0.24]] },
        i4: { etiqueta: "Extensión", opciones: [["Área de influencia directa", 0.10], ["Área de influencia indirecta", 0.20]] },
        i6: { etiqueta: "Áreas protegidas o ecosistemas frágiles", opciones: [["Sí", 0.40]] },
        i7: { etiqueta: "Comunidades afectadas", opciones: [["Una", 0.15], ["Varias", 0.30]] },
        i8: { etiqueta: "Salud de las personas", opciones: [["Sí", 0.60]] },
        i9: { etiqueta: "Medidas de mitigación o restauración (atenuante)", opciones: [["Aplicadas", -0.38]] },
      },
      estado: "RESUMEN",
      nota: "Los porcentajes salen de extractos de la R.C.D. 00005-2026-OEFA/CD; verificar contra el PDF de El Peruano. Falta el factor i5 (reversibilidad): se ingresa a mano.",
    },
    "2013": {
      f1: {
        f11: { etiqueta: "Componentes afectados", opciones: [["1", 0.10], ["2", 0.20], ["3", 0.30], ["4", 0.40], ["5 o más", 0.50]] },
        f12: { etiqueta: "Incidencia", opciones: [["Mínima", 0.06], ["Regular", 0.12], ["Alta", 0.18], ["Total", 0.24]] },
        f13: { etiqueta: "Extensión", opciones: [["Directa", 0.10], ["Indirecta", 0.20]] },
        f14: { etiqueta: "Reversibilidad", opciones: [["Corto plazo, reversible", 0.06], ["Corto plazo, recuperable", 0.12], ["Mediano plazo", 0.18], ["Largo plazo o irrecuperable", 0.24]] },
        f15: { etiqueta: "Áreas protegidas o especies amenazadas", opciones: [["Sí", 0.40]] },
        f16: { etiqueta: "Comunidades", opciones: [["Una", 0.15], ["Varias", 0.30]] },
        f17: { etiqueta: "Salud humana", opciones: [["Sí", 0.60]] },
      },
      f2: { etiqueta: "Perjuicio económico (incidencia de pobreza)", opciones: [["Tramo 1", 0.04], ["Tramo 2", 0.08], ["Tramo 3", 0.12], ["Tramo 4", 0.16], ["Tramo 5", 0.20]] },
      f3: { etiqueta: "Aspectos ambientales", opciones: [["1", 0.06], ["2", 0.12], ["3", 0.18], ["4", 0.24], ["5 o más", 0.30]] },
      f4: { etiqueta: "Reincidencia (1 año desde resolución firme)", opciones: [["Sí", 0.20]] },
      f5: { etiqueta: "Corrección de la conducta", opciones: [["Voluntaria antes del PAS (-40 %; puede ser eximente)", -0.40], ["Requerida y grave, antes del PAS", -0.40], ["Después del inicio y antes de la primera instancia", -0.20]] },
      f6: { etiqueta: "Medidas ejecutadas", opciones: [["No ejecutadas", 0.30], ["Tardías", 0.20], ["Parciales", 0.10], ["Inmediatas", -0.10]] },
      f7: { etiqueta: "Intencionalidad acreditada", opciones: [["Sí", 0.72]] },
      estado: "RESUMEN",
      nota: "Metodología R.P.C.D. 035-2013-OEFA/PCD modificada por la R.C.D. 024-2017-OEFA/CD. Valores de daño potencial; la tabla de daño real (triple) no está confirmada. Solo para procedimientos iniciados antes de la entrada en vigencia de la metodología 2026.",
    },
  };

  const RECONOCIMIENTO = [
    { id: "ninguno", etiqueta: "Sin reconocimiento de responsabilidad", factor: 1 },
    { id: "r50", etiqueta: "Reconocimiento hasta los descargos iniciales (-50 %)", factor: 0.5 },
    { id: "r30", etiqueta: "Reconocimiento después de los descargos y antes de la resolución (-30 %)", factor: 0.7 },
  ];
  const RECONOCIMIENTO_FUENTE = "Art. 13 del RPAS, R.C.D. 027-2017-OEFA/CD (resumen). Solo cuando la sanción es multa. No confirmado si fue modificado después de 2021.";

  const sumaOpciones = (sel) => sel.reduce((s, v) => s + (Number(v) || 0), 0);

  /**
   * Multa OEFA referencial.
   * p = { metodologia: "2026"|"2013", filaId, escenarioId, B_soles, pId, factores:{...}, reconocimiento }
   * factores 2026 : { generales:[ids marcados], impacto:{i1:valor,...}, i5_manual:0.xx, usarImpacto:boolean }
   * factores 2013 : { f1:{f11:valor,...}, f2, f3, f4, f5, f6, f7 } (valores numericos o null)
   */
  function calcularOefa(p) {
    const aviso = [];
    if (!p.compromisoIGA) {
      return {
        sancionable: false, multaUIT: 0, multaSoles: 0, avisos: [],
        motivo: "El exceso del ECA de ruido no es sancionable por sí mismo (Ley General del Ambiente, Art. 31.4). Se sanciona el incumplimiento de una obligación específica (compromiso del IGA, monitoreo) y debe demostrarse la causalidad entre la actividad y la transgresión.",
      };
    }
    const fila = FILAS_OEFA.find((f) => f.id === p.filaId) || FILAS_OEFA[0];
    const esc = fila.escenarios.find((e) => e.id === p.escenarioId) || fila.escenarios[0];
    const tabla = P_DETECCION[p.metodologia] || P_DETECCION["2026"];
    const prob = (tabla.find((x) => x.id === p.pId) || tabla.find((x) => x.id === "media")).p;
    const B = (Number(p.B_soles) || 0) / UIT;
    const pasos = [];
    let multa;

    if (p.metodologia === "2013") {
      const f = p.factores || {};
      const f1 = sumaOpciones(Object.values(f.f1 || {}));
      const F = 1 + f1 + (Number(f.f2) || 0) + (Number(f.f3) || 0) + (Number(f.f4) || 0) + (Number(f.f5) || 0) + (Number(f.f6) || 0) + (Number(f.f7) || 0);
      multa = (B / prob) * F;
      pasos.push("B (beneficio ilícito) = " + B.toFixed(3) + " UIT", "p = " + prob, "F = 1 + f1 + … + f7 = " + F.toFixed(3), "M = (B / p) × F = " + multa.toFixed(3) + " UIT");
      aviso.push("Metodología 2013/2017: solo aplica a procedimientos iniciados antes de la entrada en vigencia de la R.C.D. 00005-2026-OEFA/CD.");
    } else {
      const f = p.factores || {};
      const gen = sumaOpciones(f.generales || []);
      let I = 0;
      if (f.usarImpacto) I = sumaOpciones(Object.values(f.impacto || {})) + (Number(f.i5_manual) || 0);
      const F = gen;
      multa = f.usarImpacto ? (B / prob) * (1 + F + I) : (B / prob) * (1 + F);
      pasos.push("B (beneficio ilícito) = " + B.toFixed(3) + " UIT", "p = " + prob,
        "F (factores generales) = " + F.toFixed(2) + (f.usarImpacto ? "; I (impacto) = " + I.toFixed(2) : ""),
        f.usarImpacto ? "M = (B / p) × (1 + F + I) = " + multa.toFixed(3) + " UIT" : "M = (B / p) × (1 + F) = " + multa.toFixed(3) + " UIT");
    }
    if (B <= 0) aviso.push("Falta el beneficio ilícito (B). Ingréselo: es el costo evitado o postergado actualizado, p. ej. el monitoreo no hecho o la barrera acústica no instalada.");

    if (multa > esc.max) { aviso.push("La multa calculada supera el tope de la escala (" + esc.max + " UIT): se aplica el tope."); multa = esc.max; pasos.push("Tope de la escala: " + esc.max + " UIT"); }
    if (esc.min && multa > 0 && multa < esc.min) aviso.push("La multa calculada está por debajo del mínimo de la escala (" + esc.min + " UIT). Verifique en el PDF oficial si se aplica ese mínimo como piso.");

    const rec = RECONOCIMIENTO.find((r) => r.id === p.reconocimiento) || RECONOCIMIENTO[0];
    if (rec.factor !== 1) { multa *= rec.factor; pasos.push("Reconocimiento de responsabilidad × " + rec.factor + " = " + multa.toFixed(3) + " UIT"); }
    if (fila.estado !== "VERIFICADO") aviso.push("La fila " + fila.norma + " " + fila.numeral + " proviene de un " + fila.estado.toLowerCase() + ": contrastar con el PDF oficial.");

    return { sancionable: true, fila, escenario: esc, multaUIT: multa, multaSoles: multa * UIT, pasos, avisos: aviso, prob };
  }

  // ================================================== OCUPACIONAL (Osinergmin)
  const OSINERGMIN_REFERENCIAS = [
    { id: "ninguna", etiqueta: "Ninguna fila específica de ruido confirmada", tope: null, estado: "NO CONFIRMADO", nota: "No se encontró en el cuadro vigente (R.C.D. 123-2024-OS/CD, leído solo hasta el numeral 6.1.3 del Rubro B)." },
    { id: "iperc", etiqueta: "Rubro B 3.3 · Identificación de peligros, evaluación y control de riesgos (IPERC)", tope: 500, estado: "RESUMEN", nota: "Interpretación: podría invocarse si falta el control del riesgo de ruido. No se halló un caso que lo confirme." },
    { id: "pets", etiqueta: "Rubro B 3.5 · Estándares y PETS", tope: 1500, estado: "RESUMEN", nota: "Interpretación, sin caso hallado." },
    { id: "libro", etiqueta: "Rubro A 3.7 · Libro de Seguridad y Salud Ocupacional", tope: 100, estado: "RESUMEN", nota: "Interpretación, sin caso hallado." },
  ];

  const OSINERGMIN_AJUSTES = {
    reconocimiento: [
      { id: "ninguno", etiqueta: "Sin reconocimiento", factor: 1 },
      { id: "r50", etiqueta: "Reconocimiento hasta los descargos iniciales (-50 %)", factor: 0.5 },
      { id: "r30", etiqueta: "Hasta el informe final de instrucción (-30 %)", factor: 0.7 },
      { id: "r10", etiqueta: "Antes de la resolución de sanción (-10 %)", factor: 0.9 },
    ],
    subsanacion: [{ id: "no", etiqueta: "No", factor: 1 }, { id: "si", etiqueta: "Subsanó después de iniciado el procedimiento (-5 %)", factor: 0.95 }],
    reincidencia: [
      { id: "ninguna", etiqueta: "Sin reincidencia", factor: 1 },
      { id: "1", etiqueta: "Primera reincidencia en un año (+25 %)", factor: 1.25 },
      { id: "2", etiqueta: "Segunda reincidencia (+50 %)", factor: 1.5 },
      { id: "3", etiqueta: "Tercera o más (+100 %)", factor: 2 },
    ],
    pronto_pago: [{ id: "no", etiqueta: "No", factor: 1 }, { id: "si", etiqueta: "Pronto pago sin apelar (-10 %)", factor: 0.9 }],
    fuente: "R.C.D. 208-2020-OS/CD, arts. 26.4, 26.5 y 27.3 (resumen). Subsanación voluntaria y previa a la notificación es eximente (art. 16 e).",
  };

  /**
   * Escenario ocupacional. El modulo no determina la multa base de Osinergmin (su metodologia
   * usa gravedad, perjuicio economico, beneficio ilicito, capacidad economica y probabilidad de
   * deteccion). El usuario ingresa la multa base estimada; el modulo la limita al tope de la
   * fila elegida y aplica los ajustes de la R.C.D. 208-2020-OS/CD.
   */
  function calcularOsinergmin(p) {
    const ref = OSINERGMIN_REFERENCIAS.find((r) => r.id === p.refId) || OSINERGMIN_REFERENCIAS[0];
    const avisos = [];
    if (ref.tope === null) {
      return {
        calculable: false, ref, avisos: [ref.nota],
        motivo: "Sin una fila específica de ruido no se calcula un monto. Use la exposición medida (dosis, nivel equivalente de 8 h) como indicador de riesgo, y confirme con un especialista en el cuadro de tipificación vigente.",
      };
    }
    let multa = Number(p.baseUIT) || 0;
    const pasos = [];
    if (multa <= 0) avisos.push("Ingrese la multa base estimada. Tope de la fila: " + ref.tope + " UIT.");
    if (multa > ref.tope) { multa = ref.tope; avisos.push("Se aplicó el tope de la fila (" + ref.tope + " UIT)."); }
    pasos.push("Multa base estimada (limitada al tope) = " + multa.toFixed(3) + " UIT");
    const pick = (lista, id) => lista.find((x) => x.id === id) || lista[0];
    for (const [clave, nombre] of [["reincidencia", "Reincidencia"], ["reconocimiento", "Reconocimiento"], ["subsanacion", "Subsanación"], ["pronto_pago", "Pronto pago"]]) {
      const a = pick(OSINERGMIN_AJUSTES[clave], p[clave]);
      if (a.factor !== 1) { multa *= a.factor; pasos.push(nombre + " × " + a.factor + " = " + multa.toFixed(3) + " UIT"); }
    }
    avisos.push("Estimación referencial: la multa base real la fija Osinergmin con su propia metodología.");
    return { calculable: true, ref, multaUIT: multa, multaSoles: multa * UIT, pasos, avisos };
  }

  // ============================================================ valor esperado
  /**
   * Valor esperado referencial = P(superar el limite en el horizonte) x P(que el exceso sea
   * sancionado) x multa estimada. Ambos factores son supuestos explicitos; superar un limite
   * no implica por si solo una infraccion.
   */
  function valorEsperado({ probExceso, probSancion = 1, multaUIT }) {
    if (!Number.isFinite(probExceso) || !Number.isFinite(multaUIT)) return null;
    const uit = probExceso * probSancion * multaUIT;
    return { uit, soles: uit * UIT };
  }

  return {
    UIT, FILAS_OEFA, P_DETECCION, FACTORES, RECONOCIMIENTO, RECONOCIMIENTO_FUENTE,
    OSINERGMIN_REFERENCIAS, OSINERGMIN_AJUSTES, calcularOefa, calcularOsinergmin, valorEsperado,
  };
});
