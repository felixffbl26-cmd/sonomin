#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SONOMIN - Informes automaticos desde la nube (Supabase)
Lee las mediciones, corre procesar_ruido.py, sube Excel/PDF/figuras al bucket
'informes' y registra el informe en la tabla 'informes' para que el tablero lo muestre.

Variables de entorno (secretos del repositorio, nunca en el codigo):
  SUPABASE_URL           https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY   clave service_role (solo servidor; jamas en el celular ni en la web)
"""
import argparse
import csv
import json
import math
import mimetypes
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import requests

AQUI = os.path.dirname(os.path.abspath(__file__))
LIMA = timezone(timedelta(hours=-5))
PAGINA = 1000

# Columnas que espera procesar_ruido.py (las mismas del CSV que exporta la app)
COLUMNAS = [
    "id", "fecha_hora", "fecha", "hora", "turno_eca", "ambito", "proyecto", "modo", "punto", "labor",
    "fuente_ruido", "este", "norte", "cota", "tipo_cota", "zona_utm", "origen_posicion", "precision_m",
    "latitud", "longitud", "duracion_s", "leq_dba", "lmax_dba", "lmin_dba", "l10_dba", "l50_dba", "l90_dba",
    "zona_eca", "limite_eca_dba", "cumple_eca", "limite_ocupacional_dba", "cumple_ocupacional",
    "tiempo_permitido_h", "horas_exposicion", "dosis_pct", "offset_cal_db", "calibrado", "saturacion_pct",
    "fuente_audio", "evaluador", "observacion", "fotos", "serie_1s",
]


def salir(msg):
    print("ERROR: " + msg, file=sys.stderr)
    sys.exit(1)


def cabeceras(clave, extra=None):
    h = {"apikey": clave, "Authorization": "Bearer " + clave}
    if extra:
        h.update(extra)
    return h


def comprobar(r, que):
    if r.status_code >= 300:
        salir(f"{que}: HTTP {r.status_code} {r.text[:300]}")
    return r


def leer_mediciones(url, clave, proyecto):
    filas, desde = [], 0
    while True:
        params = {"select": "*", "order": "inicio_ms.asc", "limit": PAGINA, "offset": desde}
        if proyecto:
            params["proyecto"] = "ilike.*" + proyecto + "*"
        r = comprobar(requests.get(url + "/rest/v1/mediciones", params=params, headers=cabeceras(clave), timeout=60),
                      "leer mediciones")
        lote = r.json()
        filas += lote
        if len(lote) < PAGINA:
            break
        desde += PAGINA
    return filas


def si_no(v):
    return "" if v is None else ("SI" if v else "NO")


def a_fila_csv(m, i):
    ms = m.get("inicio_ms")
    fh = datetime.fromtimestamp(ms / 1000.0, LIMA)
    leq = m.get("leq_dba")
    lim_eca = m.get("limite_eca_dba")
    lim_oc = m.get("limite_ocupacional_dba")
    f = dict(m)
    f.update({
        "id": i,
        "fecha_hora": fh.strftime("%Y-%m-%d %H:%M:%S"),
        "fecha": fh.strftime("%Y-%m-%d"),
        "hora": fh.strftime("%H:%M:%S"),
        "calibrado": si_no(m.get("calibrado")),
        "cumple_eca": "" if lim_eca is None or leq is None else ("SI" if leq <= lim_eca else "NO"),
        "cumple_ocupacional": "" if lim_oc is None or leq is None else ("SI" if leq < lim_oc else "NO"),
        "fotos": len(m.get("fotos") or []),
    })
    return {c: ("" if f.get(c) is None else f.get(c)) for c in COLUMNAS}


def leq_global(filas):
    """Leq energetico global ponderado por duracion."""
    num = den = 0.0
    for m in filas:
        L, d = m.get("leq_dba"), m.get("duracion_s") or 1.0
        if L is None:
            continue
        num += d * 10 ** (L / 10.0)
        den += d
    return round(10 * math.log10(num / den), 1) if den > 0 else None


def subir(url, clave, ruta, archivo):
    tipo = mimetypes.guess_type(archivo)[0] or "application/octet-stream"
    with open(archivo, "rb") as f:
        r = requests.post(url + "/storage/v1/object/informes/" + quote(ruta),
                          headers=cabeceras(clave, {"Content-Type": tipo, "x-upsert": "true"}),
                          data=f.read(), timeout=120)
    comprobar(r, "subir " + ruta)


def main():
    ap = argparse.ArgumentParser(description="Genera el informe SONOMIN desde Supabase")
    ap.add_argument("--proyecto", default=None, help="solo mediciones de este proyecto (texto contenido)")
    a = ap.parse_args()
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    clave = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not clave:
        salir("faltan las variables SUPABASE_URL y SUPABASE_SERVICE_KEY (secretos del repositorio).")

    # Limpieza: el rastro en vivo de mas de 60 dias no se necesita (las mediciones y eventos se conservan)
    corte = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    r = requests.delete(url + "/rest/v1/posiciones", params={"creado": "lt." + corte}, headers=cabeceras(clave, {"Prefer": "return=minimal"}), timeout=60)
    if r.status_code >= 300:
        print(f"Aviso: no se pudo limpiar el rastro antiguo (HTTP {r.status_code}).")

    print("Leyendo mediciones de la nube...")
    med = leer_mediciones(url, clave, a.proyecto)
    print(f"  {len(med)} mediciones")
    if not med:
        print("No hay mediciones; no se genera informe.")
        return

    with tempfile.TemporaryDirectory() as tmp:
        ruta_csv = os.path.join(tmp, "SONOMIN_nube_mediciones.csv")
        with open(ruta_csv, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=COLUMNAS)
            w.writeheader()
            for i, m in enumerate(med, 1):
                w.writerow(a_fila_csv(m, i))
        salida = os.path.join(tmp, "salida")
        os.makedirs(salida)
        cmd = [sys.executable, os.path.join(AQUI, "procesar_ruido.py"), ruta_csv, "--salida", salida]
        if a.proyecto:
            cmd += ["--proyecto", a.proyecto]
        env = dict(os.environ, MPLBACKEND="Agg")
        env.pop("SUPABASE_SERVICE_KEY", None)
        p = subprocess.run(cmd, env=env, capture_output=True, text=True)
        print(p.stdout[-1500:])
        if p.returncode != 0:
            salir("fallo procesar_ruido.py: " + p.stderr[-800:])

        sello = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        archivos = []
        for nombre in sorted(os.listdir(salida)):
            ruta = f"{sello}/{nombre}"
            subir(url, clave, ruta, os.path.join(salida, nombre))
            archivos.append({"nombre": nombre, "ruta": ruta})
        subir(url, clave, f"{sello}/mediciones.csv", ruta_csv)
        archivos.append({"nombre": "mediciones.csv", "ruta": f"{sello}/mediciones.csv"})
        print(f"  {len(archivos)} archivos subidos a informes/{sello}/")

    puntos = len({m.get("punto") for m in med})
    resumen = {"puntos": puntos, "leq_global": leq_global(med),
               "sobre_85": sum(1 for m in med if (m.get("leq_dba") or 0) >= 85)}
    titulo = "Informe SONOMIN " + datetime.now(LIMA).strftime("%d/%m/%Y %H:%M") + (f" · {a.proyecto}" if a.proyecto else "")
    fila = {"titulo": titulo, "proyecto": a.proyecto, "n_mediciones": len(med), "resumen": resumen, "archivos": archivos}
    r = requests.post(url + "/rest/v1/informes", json=fila,
                      headers=cabeceras(clave, {"Content-Type": "application/json", "Prefer": "return=minimal"}), timeout=60)
    comprobar(r, "registrar informe")
    print("Informe registrado:", json.dumps(resumen))


if __name__ == "__main__":
    main()
