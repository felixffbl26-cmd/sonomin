/* SONOMIN · normas de ruido (mismas reglas que la app del celular y el procesador en Python).
 *
 * Ocupacional : D.S. 024-2016-EM, Anexo 12 (nivel de ruido) y Guia N° 1 de medicion de ruido.
 * Ambiental   : D.S. 085-2003-PCM, ECA para ruido (Anexo 1).
 *
 * ESTADO DE VERIFICACION (importante para quien presente esto):
 *  - Limite 85 dB(A) / 8 h y regla de dosis D = C/T x 100 %: confirmados en la Guia N° 1 (dos copias).
 *  - Tabla completa del Anexo 12: transcrita de una copia secundaria. Las copias consultadas no
 *    coinciden del todo (p. ej. la fila 83 dB(A) = 12 h). Contrastar con el texto oficial del
 *    D.S. 024-2016-EM antes de usarla en un informe formal. Esta tabla es el unico lugar donde se
 *    corrige: ANEXO_12.
 *  - Valores del ECA de ruido: concordantes en el D.S. y en dos informes del OEFA.
 */
(function (raiz, fabrica) {
  if (typeof module === "object" && module.exports) module.exports = fabrica();
  else raiz.SON_NORMAS = fabrica();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const LIMITE_OCUPACIONAL = 85.0; // dB(A) para 8 h
  const NIVEL_ACCION = 82.0; // primer nivel del Anexo 12 (16 h)
  const JORNADA_REF_H = 8.0;
  const UIT_2026 = 5500; // soles, D.S. 301-2025-EF

  // nivel dB(A) -> horas permitidas por dia
  const ANEXO_12 = [
    [82, 16.0], [83, 12.0], [85, 8.0], [88, 4.0],
    [91, 1.5], [94, 1.0], [97, 0.5], [100, 0.25],
  ];

  // ECA ruido, D.S. 085-2003-PCM. LAeqT en dB(A). Diurno 07:01-22:00, nocturno 22:01-07:00.
  const ZONAS_ECA = {
    PROTECCION_ESPECIAL: { nombre: "Protección especial", diurno: 50, nocturno: 40 },
    RESIDENCIAL: { nombre: "Residencial", diurno: 60, nocturno: 50 },
    COMERCIAL: { nombre: "Comercial", diurno: 70, nocturno: 60 },
    INDUSTRIAL: { nombre: "Industrial", diurno: 80, nocturno: 70 },
  };

  function tiempoPermitidoH(nivel) {
    const t = ANEXO_12;
    if (nivel <= t[0][0]) return t[0][1];
    const [lUlt, tUlt] = t[t.length - 1];
    if (nivel >= lUlt) return tUlt / Math.pow(2, (nivel - lUlt) / 3); // extrapolacion con tasa de 3 dB
    for (let i = 0; i < t.length - 1; i++) {
      const [l1, t1] = t[i];
      const [l2, t2] = t[i + 1];
      if (nivel >= l1 && nivel <= l2) {
        const f = (nivel - l1) / (l2 - l1);
        return Math.pow(10, Math.log10(t1) + f * (Math.log10(t2) - Math.log10(t1)));
      }
    }
    return tUlt;
  }

  const sobreTabla = (nivel) => nivel > ANEXO_12[ANEXO_12.length - 1][0];
  const dosisPct = (nivel, horas) => (100 * horas) / tiempoPermitidoH(nivel);
  const twa8h = (dosis) => (dosis <= 0 ? 0 : LIMITE_OCUPACIONAL + 10 * Math.log10(dosis / 100));

  function semaforo(nivel) {
    if (nivel >= LIMITE_OCUPACIONAL) return "EXCEDE";
    if (nivel >= NIVEL_ACCION) return "PRECAUCION";
    return "CONFORME";
  }

  // Hora y minuto en Lima (UTC-5, sin horario de verano), a partir de epoch ms.
  function horaLima(ms) {
    const d = new Date(ms - 5 * 3600 * 1000);
    return { h: d.getUTCHours(), m: d.getUTCMinutes(), dia: d.toISOString().slice(0, 10) };
  }

  function esDiurno(ms) {
    const { h, m } = horaLima(ms);
    const min = h * 60 + m;
    return min >= 7 * 60 + 1 && min <= 22 * 60;
  }

  function limiteEca(zona, ms) {
    const z = ZONAS_ECA[zona] || ZONAS_ECA.INDUSTRIAL;
    return esDiurno(ms) ? z.diurno : z.nocturno;
  }

  function formatoTiempo(horas) {
    if (horas >= 16) return "16 h o más";
    if (horas >= 1) return horas.toFixed(1) + " h";
    if (horas * 60 >= 1) return (horas * 60).toFixed(0) + " min";
    return (horas * 3600).toFixed(0) + " s";
  }

  // UTM (WGS84) a latitud/longitud. zona: "19S", "18S", "19L"... ('S' = hemisferio sur, como se usa en Peru).
  function utmALatLon(este, norte, zona) {
    const m = /^(\d{1,2})\s*([A-Za-z])?/.exec(String(zona || "19S").trim());
    if (!m || !Number.isFinite(este) || !Number.isFinite(norte)) return null;
    const z = Number(m[1]), letra = (m[2] || "S").toUpperCase();
    const sur = letra === "S" || (letra !== "N" && letra < "N");
    const a = 6378137, f = 1 / 298.257223563, e2 = f * (2 - f), ep2 = e2 / (1 - e2), k0 = 0.9996;
    const x = este - 500000, y = sur ? norte - 10000000 : norte;
    const mu = y / k0 / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const p1 = mu + (1.5 * e1 - (27 / 32) * e1 ** 3) * Math.sin(2 * mu) + ((21 / 16) * e1 * e1 - (55 / 32) * e1 ** 4) * Math.sin(4 * mu)
      + ((151 / 96) * e1 ** 3) * Math.sin(6 * mu) + ((1097 / 512) * e1 ** 4) * Math.sin(8 * mu);
    const s1 = Math.sin(p1), c1 = Math.cos(p1), t1 = Math.tan(p1);
    const N1 = a / Math.sqrt(1 - e2 * s1 * s1), T1 = t1 * t1, C1 = ep2 * c1 * c1, R1 = (a * (1 - e2)) / Math.pow(1 - e2 * s1 * s1, 1.5), D = x / (N1 * k0);
    const lat = p1 - ((N1 * t1) / R1) * (D * D / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24
      + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
    const lon = ((z * 6 - 183) * Math.PI) / 180 + (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) / c1;
    return [(lat * 180) / Math.PI, (lon * 180) / Math.PI];
  }

  return {
    utmALatLon,
    LIMITE_OCUPACIONAL, NIVEL_ACCION, JORNADA_REF_H, UIT_2026, ANEXO_12, ZONAS_ECA,
    tiempoPermitidoH, sobreTabla, dosisPct, twa8h, semaforo, horaLima, esDiurno, limiteEca, formatoTiempo,
  };
});
