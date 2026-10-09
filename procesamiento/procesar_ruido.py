#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SONOMIN - Procesamiento y prediccion de ruido en mineria
=========================================================
Desarrollo       : Felix Fernando Bautista Layme
Asesor           : Ing. Lesmes Gabriel Calsina Paricahua
                   Facultad de Ingenieria de Minas - UNA Puno

Lee los CSV exportados por la app SONOMIN (Android) y genera:
  - Excel con tablas de resultados (por medicion, punto, fuente, hora, modelo)
  - Figuras PNG (niveles por punto, mapas de ruido, perfil horario, modelo)
  - Informe PDF con todas las figuras y el resumen normativo
  - Rejilla de prediccion (CSV) para GIS / AutoCAD / Surfer

Uso:
  python procesar_ruido.py datos/                    # carpeta con uno o varios CSV
  python procesar_ruido.py SONOMIN_mediciones.csv    # un archivo
  python procesar_ruido.py --demo                    # genera datos de prueba y los procesa
  python procesar_ruido.py datos/ --predecir 430150 8438120 --cota 3620 --hora 10 --ambito SUPERFICIE --fuente Compresora

Criterios:
  Ocupacional: D.S. 024-2016-EM (mod. D.S. 023-2017-EM): 85 dB(A) / 8 h, tasa de intercambio 3 dB.
  Ambiental  : D.S. 085-2003-PCM (ECA ruido): industrial 80/70, comercial 70/60,
               residencial 60/50, proteccion especial 50/40 dB(A) (diurno/nocturno).
"""

import argparse
import glob
import os
import sys
import warnings
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.colors import LinearSegmentedColormap

warnings.filterwarnings("ignore")

LIMITE_OCUP = 85.0
NIVEL_ACCION = 82.0        # primer nivel del Anexo 12 (16 h)
TASA = 3.0                 # solo para extrapolar sobre 100 dB(A)
# Anexo 12 del D.S. 024-2016-EM: nivel dB(A) -> horas permitidas
ANEXO_12 = [(82, 16.0), (83, 12.0), (85, 8.0), (88, 4.0), (91, 1.5), (94, 1.0), (97, 0.5), (100, 0.25)]
ECA = {"INDUSTRIAL": (80, 70), "COMERCIAL": (70, 60), "RESIDENCIAL": (60, 50), "PROTECCION_ESPECIAL": (50, 40)}

AZUL = "#0C2D5C"
VERDE = "#1E9E57"
AMBAR = "#E69A0B"
ROJO = "#C0392B"
GRIS = "#6B7785"
MAPA_RUIDO = LinearSegmentedColormap.from_list("ruido", ["#2ECC71", "#F4C542", "#E74C3C", "#7B1E12"])

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 10, "axes.titlesize": 12, "axes.titleweight": "bold",
    "axes.edgecolor": "#333333", "axes.linewidth": 0.8, "axes.grid": True, "grid.color": "#DDDDDD",
    "grid.linewidth": 0.5, "axes.spines.top": False, "axes.spines.right": False, "figure.dpi": 110,
    "savefig.dpi": 200, "savefig.bbox": "tight",
})


# =============================================================== acustica

def leq(niveles):
    niveles = np.asarray(list(niveles), dtype=float)
    niveles = niveles[~np.isnan(niveles)]
    if niveles.size == 0:
        return np.nan
    return 10 * np.log10(np.mean(10 ** (niveles / 10)))


def tiempo_permitido_h(nivel):
    """Tiempo maximo de exposicion diaria segun el Anexo 12 (interpolado entre filas)."""
    nivel = np.asarray(nivel, dtype=float)
    escalar = nivel.ndim == 0
    n = np.atleast_1d(nivel)
    ls = np.array([x[0] for x in ANEXO_12], dtype=float)
    ts = np.array([x[1] for x in ANEXO_12], dtype=float)
    t = np.empty_like(n)
    bajo = n <= ls[0]
    alto = n >= ls[-1]
    medio = ~(bajo | alto)
    t[bajo] = ts[0]
    t[alto] = ts[-1] / 2 ** ((n[alto] - ls[-1]) / TASA)
    if medio.any():
        t[medio] = 10 ** np.interp(n[medio], ls, np.log10(ts))
    return float(t[0]) if escalar else t


def dosis_pct(nivel, horas):
    return 100.0 * horas / tiempo_permitido_h(nivel)


def twa(dosis):
    return LIMITE_OCUP + 10 * np.log10(np.maximum(dosis, 1e-9) / 100.0)


def semaforo(nivel):
    if nivel >= LIMITE_OCUP:
        return "EXCEDE"
    if nivel >= NIVEL_ACCION:
        return "NIVEL DE ACCION"
    return "CONFORME"


def fotos_de(df, carpeta_csv):
    """Rutas de las fotos que acompanan a las mediciones (carpeta 'fotos' del servidor)."""
    dirf = os.path.join(carpeta_csv, "fotos")
    if not os.path.isdir(dirf):
        return {}
    archivos = sorted(glob.glob(os.path.join(dirf, "*.jpg")) + glob.glob(os.path.join(dirf, "*.jpeg")))
    salida = {}
    for _, r in df.iterrows():
        punto = str(r.get("punto", "")).replace(" ", "_")
        coincide = [a for a in archivos if punto and punto[:14] in os.path.basename(a)]
        if coincide:
            salida[r["punto"]] = coincide[:2]
    return salida


def color_nivel(nivel):
    return ROJO if nivel >= LIMITE_OCUP else (AMBAR if nivel >= NIVEL_ACCION else VERDE)


def fmt_tiempo(h):
    if h >= 24:
        return "> 24 h"
    if h >= 1:
        return f"{h:.1f} h"
    if h * 60 >= 1:
        return f"{h * 60:.0f} min"
    return f"{h * 3600:.0f} s"


# =============================================================== lectura

def leer_csv(rutas):
    archivos = []
    for r in rutas:
        if os.path.isdir(r):
            archivos += sorted(glob.glob(os.path.join(r, "*.csv")))
        else:
            archivos.append(r)
    archivos = [a for a in archivos if "puntos" not in os.path.basename(a).lower()]
    if not archivos:
        sys.exit("No se encontraron CSV de mediciones.")
    tablas = []
    for a in archivos:
        df = pd.read_csv(a, encoding="utf-8-sig")
        df["archivo_origen"] = os.path.basename(a)
        tablas.append(df)
        print(f"  leido {a}: {len(df)} filas")
    df = pd.concat(tablas, ignore_index=True)
    df["fecha_hora"] = pd.to_datetime(df["fecha_hora"], errors="coerce")
    antes = len(df)
    df = df.drop_duplicates(subset=["fecha_hora", "punto", "leq_dba"]).sort_values("fecha_hora").reset_index(drop=True)
    if len(df) < antes:
        print(f"  {antes - len(df)} filas duplicadas eliminadas")
    for c in ["este", "norte", "cota", "leq_dba", "lmax_dba", "lmin_dba", "l10_dba", "l50_dba", "l90_dba",
              "duracion_s", "horas_exposicion", "saturacion_pct", "precision_m"]:
        if c in df:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    df["hora_dia"] = df["fecha_hora"].dt.hour + df["fecha_hora"].dt.minute / 60
    df["dia"] = df["fecha_hora"].dt.date
    df["fuente_ruido"] = df["fuente_ruido"].fillna("").replace("", "Sin especificar")
    if "proyecto" not in df:
        df["proyecto"] = ""
    df["proyecto"] = df["proyecto"].fillna("").replace("", "Sin proyecto")
    if "modo" not in df:
        df["modo"] = "PUNTUAL"
    df["modo"] = df["modo"].fillna("PUNTUAL")
    df["horas_exposicion"] = df["horas_exposicion"].fillna(8.0)
    df["tiempo_permitido_h"] = tiempo_permitido_h(df["leq_dba"])
    df["dosis_pct"] = dosis_pct(df["leq_dba"], df["horas_exposicion"])
    df["semaforo"] = df["leq_dba"].apply(semaforo)
    return df


# =============================================================== tablas

def tabla_puntos(df):
    filas = []
    for (punto, ambito), g in df.groupby(["punto", "ambito"]):
        n = leq(g["leq_dba"])
        h = g["horas_exposicion"].mean()
        filas.append({
            "punto": punto, "ambito": ambito, "n": len(g),
            "este": g["este"].mean(), "norte": g["norte"].mean(), "cota": g["cota"].mean(),
            "leq_dba": round(n, 1), "lmax_dba": round(g["lmax_dba"].max(), 1),
            "l90_dba": round(leq(g["l90_dba"]), 1),
            "desv_std_db": round(g["leq_dba"].std(ddof=0), 2) if len(g) > 1 else 0.0,
            "tiempo_permitido": fmt_tiempo(tiempo_permitido_h(n)),
            "horas_exposicion": round(h, 1), "dosis_pct": round(dosis_pct(n, h), 0),
            "twa_8h_dba": round(twa(dosis_pct(n, h)), 1),
            "semaforo": semaforo(n), "fuente_principal": g["fuente_ruido"].mode().iat[0],
        })
    return pd.DataFrame(filas).sort_values("leq_dba", ascending=False).reset_index(drop=True)


def tabla_fuentes(df):
    t = df.groupby("fuente_ruido").agg(n=("leq_dba", "size"), leq_dba=("leq_dba", leq),
                                       lmax_dba=("lmax_dba", "max")).reset_index()
    t["leq_dba"] = t["leq_dba"].round(1)
    return t.sort_values("leq_dba", ascending=False)


def tabla_horaria(df):
    t = df.groupby(df["fecha_hora"].dt.hour).agg(n=("leq_dba", "size"), leq_dba=("leq_dba", leq)).reset_index()
    t.columns = ["hora", "n", "leq_dba"]
    t["leq_dba"] = t["leq_dba"].round(1)
    return t


def tabla_cumplimiento(df):
    filas = []
    for _, r in df.iterrows():
        zona = str(r.get("zona_eca", "INDUSTRIAL")) or "INDUSTRIAL"
        d, n = ECA.get(zona, ECA["INDUSTRIAL"])
        lim = d if str(r.get("turno_eca", "DIURNO")) == "DIURNO" else n
        filas.append({"fecha_hora": r["fecha_hora"], "punto": r["punto"], "leq_dba": r["leq_dba"],
                      "zona_eca": zona, "limite_eca": lim, "cumple_eca": "SI" if r["leq_dba"] <= lim else "NO",
                      "cumple_ocupacional": "SI" if r["leq_dba"] < LIMITE_OCUP else "NO"})
    return pd.DataFrame(filas)


# =============================================================== interpolacion

def idw(xs, ys, vs, xg, yg, p=2.0):
    d = np.sqrt((xg[..., None] - xs) ** 2 + (yg[..., None] - ys) ** 2)
    d = np.maximum(d, 0.01)
    w = 1 / d ** p
    return (w * vs).sum(-1) / w.sum(-1)


def validar_idw(xs, ys, vs):
    err = []
    for i in range(len(xs)):
        m = np.arange(len(xs)) != i
        err.append(idw(xs[m], ys[m], vs[m], np.array([xs[i]]), np.array([ys[i]]))[0] - vs[i])
    err = np.array(err)
    return float(np.sqrt(np.mean(err ** 2))), float(np.mean(np.abs(err)))


def mapa_ruido(pts, titulo, ruta, n=160):
    """Kriging ordinario (si hay >= 6 puntos y pykrige) o IDW. Devuelve (metodo, rmse, rejilla)."""
    xs, ys, vs = pts["este"].values, pts["norte"].values, pts["leq_dba"].values
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    m = max(x1 - x0, y1 - y0, 20) * 0.15
    gx = np.linspace(x0 - m, x1 + m, n)
    gy = np.linspace(y0 - m, y1 + m, n)
    XX, YY = np.meshgrid(gx, gy)
    metodo, rmse = "IDW (p = 2)", None
    Z = None
    if len(pts) >= 6:
        try:
            from pykrige.ok import OrdinaryKriging
            ok = OrdinaryKriging(xs, ys, vs, variogram_model="spherical", enable_plotting=False, verbose=False)
            Z, _ = ok.execute("grid", gx, gy)
            Z = np.asarray(Z)
            metodo = "Kriging ordinario (variograma esferico)"
            # validacion cruzada del kriging
            err = []
            for i in range(len(xs)):
                mk = np.arange(len(xs)) != i
                oki = OrdinaryKriging(xs[mk], ys[mk], vs[mk], variogram_model="spherical", verbose=False)
                zi, _ = oki.execute("points", np.array([xs[i]]), np.array([ys[i]]))
                err.append(float(zi[0]) - vs[i])
            rmse = float(np.sqrt(np.mean(np.square(err))))
        except Exception as e:  # pykrige ausente o variograma inestable
            print(f"  kriging no disponible ({e}); se usa IDW")
            Z = None
    if Z is None:
        Z = idw(xs, ys, vs, XX, YY)
        if len(pts) >= 4:
            rmse = validar_idw(xs, ys, vs)[0]

    fig, ax = plt.subplots(figsize=(8.2, 7.2))
    niveles = np.arange(np.floor(min(Z.min(), vs.min()) / 2) * 2, np.ceil(max(Z.max(), vs.max()) / 2) * 2 + 2, 2)
    cf = ax.contourf(XX, YY, Z, levels=niveles, cmap=MAPA_RUIDO, alpha=0.9)
    cs = ax.contour(XX, YY, Z, levels=[80, 85], colors=[AMBAR, "#000000"], linewidths=[1.2, 2.0], linestyles=["--", "-"])
    ax.clabel(cs, fmt=lambda v: f"{v:.0f} dB(A)", fontsize=8)
    ax.scatter(xs, ys, c="white", edgecolors="black", s=46, zorder=5)
    for _, r in pts.iterrows():
        ax.annotate(f"{r['punto']}\n{r['leq_dba']:.1f}", (r["este"], r["norte"]), xytext=(6, 6),
                    textcoords="offset points", fontsize=7.5, fontweight="bold")
    cb = fig.colorbar(cf, ax=ax, shrink=0.85)
    cb.set_label("Leq dB(A)")
    ax.set_title(titulo)
    ax.set_xlabel("Este (m) - UTM WGS84 19S")
    ax.set_ylabel("Norte (m)")
    ax.set_aspect("equal")
    ax.ticklabel_format(useOffset=False, style="plain")
    nota = metodo + (f" | validacion cruzada RMSE = {rmse:.2f} dB" if rmse is not None else "")
    ax.text(0.01, -0.12, nota + " | linea negra: 85 dB(A); discontinua: 80 dB(A)", transform=ax.transAxes, fontsize=8, color=GRIS)
    fig.savefig(ruta)
    plt.close(fig)
    rej = pd.DataFrame({"este": XX.ravel(), "norte": YY.ravel(), "leq_predicho_dba": Z.ravel().round(2)})
    return metodo, rmse, rej, ruta


# =============================================================== modelo de aprendizaje

def preparar_x(df, columnas_fuente=None):
    X = pd.DataFrame({
        "este": df["este"], "norte": df["norte"], "cota": df["cota"],
        "hora_sin": np.sin(2 * np.pi * df["hora_dia"] / 24), "hora_cos": np.cos(2 * np.pi * df["hora_dia"] / 24),
        "interior": (df["ambito"] == "INTERIOR").astype(int),
    })
    fuentes = pd.get_dummies(df["fuente_ruido"], prefix="fuente").astype(int)
    if columnas_fuente is not None:
        fuentes = fuentes.reindex(columns=columnas_fuente, fill_value=0)
    return pd.concat([X.reset_index(drop=True), fuentes.reset_index(drop=True)], axis=1)


def entrenar_modelo(df, carpeta):
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.model_selection import KFold, cross_val_predict
    from sklearn.metrics import mean_absolute_error, r2_score, mean_squared_error

    d = df.dropna(subset=["este", "norte", "cota", "leq_dba"]).reset_index(drop=True)
    if len(d) < 15:
        print(f"  modelo no entrenado: {len(d)} mediciones con coordenadas (minimo 15)")
        return None
    X = preparar_x(d)
    y = d["leq_dba"].values
    modelo = RandomForestRegressor(n_estimators=400, min_samples_leaf=2, random_state=42, n_jobs=-1)
    kf = KFold(n_splits=min(5, len(d)), shuffle=True, random_state=42)
    pred = cross_val_predict(modelo, X, y, cv=kf)
    metricas = {
        "n_mediciones": len(d), "R2_validacion": r2_score(y, pred),
        "MAE_db": mean_absolute_error(y, pred), "RMSE_db": float(np.sqrt(mean_squared_error(y, pred))),
        "metodo": "Random Forest (400 arboles), validacion cruzada 5 particiones",
    }
    modelo.fit(X, y)
    imp = pd.DataFrame({"variable": X.columns, "importancia": modelo.feature_importances_}).sort_values("importancia", ascending=False)

    # figura: observado vs predicho + importancias
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(12, 5))
    a1.scatter(y, pred, c=[color_nivel(v) for v in y], edgecolors="black", linewidths=0.4, s=34)
    lo, hi = min(y.min(), pred.min()) - 2, max(y.max(), pred.max()) + 2
    a1.plot([lo, hi], [lo, hi], color="black", lw=1)
    a1.fill_between([lo, hi], [lo - 3, hi - 3], [lo + 3, hi + 3], color="#DDDDDD", alpha=0.5, label="+/- 3 dB")
    a1.set_xlim(lo, hi); a1.set_ylim(lo, hi)
    a1.set_xlabel("Leq medido dB(A)"); a1.set_ylabel("Leq predicho dB(A)")
    a1.set_title(f"Validacion cruzada  R2 = {metricas['R2_validacion']:.2f}  MAE = {metricas['MAE_db']:.2f} dB")
    a1.legend(loc="upper left")
    top = imp.head(10).iloc[::-1]
    a2.barh(top["variable"], top["importancia"], color=AZUL)
    a2.set_title("Importancia de variables")
    a2.set_xlabel("Importancia relativa")
    fig.tight_layout()
    fig.savefig(os.path.join(carpeta, "06_modelo_random_forest.png"))
    plt.close(fig)
    return {"modelo": modelo, "columnas": list(X.columns), "metricas": metricas, "importancias": imp,
            "columnas_fuente": [c for c in X.columns if c.startswith("fuente_")]}


def predecir(res_modelo, este, norte, cota, hora, ambito, fuente):
    fila = pd.DataFrame([{"este": este, "norte": norte, "cota": cota, "hora_dia": hora,
                          "ambito": ambito, "fuente_ruido": fuente}])
    X = preparar_x(fila, res_modelo["columnas_fuente"])
    X = X.reindex(columns=res_modelo["columnas"], fill_value=0)
    arboles = np.array([t.predict(X.values)[0] for t in res_modelo["modelo"].estimators_])
    return float(np.mean(arboles)), float(np.percentile(arboles, 10)), float(np.percentile(arboles, 90))


# =============================================================== figuras

def fig_puntos(tp, ruta):
    fig, ax = plt.subplots(figsize=(10, max(3.5, 0.42 * len(tp) + 1.5)))
    t = tp.iloc[::-1]
    ax.barh(t["punto"] + "  (" + t["ambito"].str[:3] + ")", t["leq_dba"], color=[color_nivel(v) for v in t["leq_dba"]])
    ax.axvline(LIMITE_OCUP, color="black", lw=1.6, label="85 dB(A) - D.S. 024-2016-EM")
    ax.axvline(NIVEL_ACCION, color=AMBAR, lw=1.2, ls="--", label="80 dB(A) - nivel de accion")
    for i, (v, tp_) in enumerate(zip(t["leq_dba"], t["tiempo_permitido"])):
        ax.text(v + 0.4, i, f"{v:.1f}  |  T = {tp_}", va="center", fontsize=8)
    ax.set_xlim(max(30, tp["leq_dba"].min() - 10), tp["leq_dba"].max() + 12)
    ax.set_xlabel("Leq dB(A) (media energetica)")
    ax.set_title("Nivel de presion sonora equivalente por punto de monitoreo")
    ax.legend(loc="lower right", fontsize=8)
    fig.savefig(ruta); plt.close(fig)


def fig_temporal(df, ruta):
    fig, ax = plt.subplots(figsize=(11, 4.2))
    for amb, mk in [("SUPERFICIE", "o"), ("INTERIOR", "s")]:
        g = df[df["ambito"] == amb]
        if len(g):
            ax.scatter(g["fecha_hora"], g["leq_dba"], c=[color_nivel(v) for v in g["leq_dba"]], marker=mk,
                       edgecolors="black", linewidths=0.3, s=30, label=amb.capitalize())
    ax.axhline(LIMITE_OCUP, color="black", lw=1.2)
    ax.axhline(NIVEL_ACCION, color=AMBAR, lw=1, ls="--")
    ax.set_ylabel("Leq dB(A)")
    ax.set_title("Registro cronologico de mediciones")
    ax.legend(fontsize=8)
    fig.autofmt_xdate()
    fig.savefig(ruta); plt.close(fig)


def fig_horario(th, ruta):
    fig, ax = plt.subplots(figsize=(10, 3.8))
    ax.bar(th["hora"], th["leq_dba"], color=[color_nivel(v) for v in th["leq_dba"]], width=0.75)
    for h, v, n in zip(th["hora"], th["leq_dba"], th["n"]):
        ax.text(h, v + 0.5, f"{v:.0f}\nn={n}", ha="center", fontsize=7)
    ax.axhline(LIMITE_OCUP, color="black", lw=1.2)
    ax.set_xticks(range(0, 24))
    ax.set_xlim(-0.6, 23.6)
    ax.set_ylim(max(30, th["leq_dba"].min() - 10), th["leq_dba"].max() + 8)
    ax.set_xlabel("Hora del dia"); ax.set_ylabel("Leq dB(A)")
    ax.set_title("Perfil horario del ruido (media energetica por hora)")
    fig.savefig(ruta); plt.close(fig)


def fig_fuentes(df, ruta):
    orden = df.groupby("fuente_ruido")["leq_dba"].apply(leq).sort_values().index
    datos = [df.loc[df["fuente_ruido"] == f, "leq_dba"].values for f in orden]
    fig, ax = plt.subplots(figsize=(10, max(3.5, 0.45 * len(orden) + 1.5)))
    b = ax.boxplot(datos, vert=False, patch_artist=True, widths=0.6)
    for caja, f in zip(b["boxes"], orden):
        caja.set_facecolor(color_nivel(leq(df.loc[df["fuente_ruido"] == f, "leq_dba"])))
        caja.set_alpha(0.8)
    ax.set_yticks(range(1, len(orden) + 1))
    ax.set_yticklabels(orden)
    ax.axvline(LIMITE_OCUP, color="black", lw=1.2)
    ax.set_xlabel("Leq dB(A)")
    ax.set_title("Distribucion del nivel por fuente de ruido dominante")
    fig.savefig(ruta); plt.close(fig)


def fig_series(df, ruta, k=6):
    sel = df.sort_values("leq_dba", ascending=False).head(k)
    fig, axs = plt.subplots(len(sel), 1, figsize=(10, 1.7 * len(sel) + 0.6), sharex=False)
    axs = np.atleast_1d(axs)
    for ax, (_, r) in zip(axs, sel.iterrows()):
        serie = [float(x) for x in str(r.get("serie_1s", "")).split("|") if x not in ("", "nan")]
        if serie:
            ax.plot(range(len(serie)), serie, color=AZUL, lw=1)
        ax.axhline(LIMITE_OCUP, color="black", lw=0.8)
        ax.set_ylabel("dB(A)", fontsize=8)
        ax.set_title(f"{r['punto']} - {r['fecha_hora']:%d/%m/%Y %H:%M} - Leq {r['leq_dba']:.1f} dB(A)", fontsize=9, loc="left")
    axs[-1].set_xlabel("Tiempo (s)")
    fig.tight_layout()
    fig.savefig(ruta); plt.close(fig)


# =============================================================== informe PDF

def pagina_texto(pdf, titulo, lineas):
    fig = plt.figure(figsize=(8.27, 11.69))
    fig.text(0.08, 0.95, "SONOMIN - INFORME DE MONITOREO DE RUIDO", fontsize=13, fontweight="bold", color=AZUL)
    fig.text(0.08, 0.93, "Desarrollo: Felix Fernando Bautista Layme  |  Asesor: Ing. Lesmes Gabriel Calsina Paricahua",
             fontsize=7.5, color=GRIS)
    fig.add_artist(plt.Line2D([0.08, 0.92], [0.922, 0.922], color=AZUL, lw=1))
    fig.text(0.08, 0.89, titulo, fontsize=12, fontweight="bold")
    y = 0.86
    for l in lineas:
        negrita = l.startswith("**")
        fig.text(0.08, y, l.strip("*"), fontsize=9.2, fontweight="bold" if negrita else "normal",
                 family="DejaVu Sans Mono" if l.startswith("  ") else "DejaVu Sans")
        y -= 0.021
        if y < 0.06:
            break
    pdf.savefig(fig); plt.close(fig)


def pagina_figura(pdf, titulo, ruta_png, nota=""):
    fig = plt.figure(figsize=(8.27, 11.69))
    fig.text(0.08, 0.95, "SONOMIN - INFORME DE MONITOREO DE RUIDO", fontsize=13, fontweight="bold", color=AZUL)
    fig.add_artist(plt.Line2D([0.08, 0.92], [0.94, 0.94], color=AZUL, lw=1))
    fig.text(0.08, 0.91, titulo, fontsize=12, fontweight="bold")
    img = plt.imread(ruta_png)
    ax = fig.add_axes([0.06, 0.18, 0.88, 0.70])
    ax.imshow(img); ax.axis("off")
    if nota:
        fig.text(0.08, 0.14, nota, fontsize=9, wrap=True)
    pdf.savefig(fig); plt.close(fig)


# =============================================================== datos demo

def generar_demo(ruta):
    """Datos sinteticos para probar el flujo (NO son mediciones reales)."""
    rng = np.random.default_rng(7)
    fuentes = [  # nombre, E, N, Lw aproximado, ambito
        ("Compresora", 430120, 8438150, 112, "SUPERFICIE"),
        ("Grupo electrogeno", 430260, 8438060, 108, "SUPERFICIE"),
        ("Chancadora", 429980, 8437930, 115, "SUPERFICIE"),
        ("Ventilador principal", 430200, 8438240, 110, "SUPERFICIE"),
    ]
    puntos_sup = [(f"P-{i:02d}", 429900 + rng.uniform(0, 450), 8437880 + rng.uniform(0, 420)) for i in range(1, 15)]
    puntos_int = [("Nv4480-EST01", "Perforadora jackleg / stoper", 104), ("Nv4480-EST02", "Scooptram / LHD", 98),
                  ("Nv4480-EST03", "Ventilador auxiliar", 95), ("Nv4450-EST05", "Perforadora jackleg / stoper", 106),
                  ("Nv4450-EST07", "Winche de izaje / arrastre", 92), ("Nv4450-EST09", "Locomotora", 90)]
    filas = []
    t0 = datetime(2026, 9, 1, 7, 0)
    for dia in range(12):
        for nombre, e, n in puntos_sup:
            if rng.random() < 0.55:
                continue
            hora = rng.choice([8, 9, 10, 11, 14, 15, 16, 20, 23])
            e2, n2 = e + rng.normal(0, 3), n + rng.normal(0, 3)
            energia = 10 ** (45 / 10)
            dominante, lmax_f = "Ruido de fondo (sin fuente dominante)", 0
            for fn, fe, fnn, lw, _ in fuentes:
                r = max(np.hypot(e2 - fe, n2 - fnn), 3)
                activo = 1.0 if 6 <= hora <= 18 or fn == "Ventilador principal" else 0.15
                li = lw - 20 * np.log10(r) - 8 + 10 * np.log10(activo)
                energia += 10 ** (li / 10)
                if li > lmax_f:
                    dominante, lmax_f = fn, li
            L = 10 * np.log10(energia) + rng.normal(0, 1.5)
            filas.append(_fila(t0 + timedelta(days=dia, hours=int(hora - 7), minutes=int(rng.integers(0, 50))),
                               "SUPERFICIE", nombre, "Superficie", dominante, e2, n2, 3620 + rng.normal(0, 4), L, rng, 4.0))
        for i, (nombre, fuente, base) in enumerate(puntos_int):
            if rng.random() < 0.35:
                continue
            hora = rng.choice([8, 10, 13, 15, 21, 2])
            factor = 0 if hora in (8, 10, 13, 15, 21) else -6
            L = base + factor + rng.normal(0, 2.0)
            e, n = 430050 + i * 38, 8438010 + (i % 3) * 25
            filas.append(_fila(t0 + timedelta(days=dia, hours=int((hora - 7) % 24), minutes=int(rng.integers(0, 50))),
                               "INTERIOR", nombre, nombre[:6], fuente, e, n, 4480 - 30 * (i >= 3), L, rng, 6.0))
    df = pd.DataFrame(filas)
    df.to_csv(ruta, index=False, encoding="utf-8-sig")
    return ruta


def _fila(fh, ambito, punto, labor, fuente, e, n, z, L, rng, horas):
    serie = L + rng.normal(0, 2.2, 60)
    serie = serie - (leq(serie) - L)  # conserva el Leq
    diurno = 7 * 60 + 1 <= fh.hour * 60 + fh.minute <= 22 * 60
    return {
        "id": 0, "fecha_hora": fh.strftime("%Y-%m-%d %H:%M:%S"), "fecha": fh.strftime("%Y-%m-%d"),
        "hora": fh.strftime("%H:%M:%S"), "turno_eca": "DIURNO" if diurno else "NOCTURNO", "ambito": ambito,
        "punto": punto, "labor": labor, "fuente_ruido": fuente, "este": round(e, 3), "norte": round(n, 3),
        "cota": round(z, 2), "tipo_cota": "topografica" if ambito == "INTERIOR" else "msnm", "zona_utm": "19S",
        "origen_posicion": "PUNTO DE CONTROL" if ambito == "INTERIOR" else "GPS", "precision_m": 4.0,
        "latitud": "", "longitud": "", "duracion_s": 60.0, "leq_dba": round(L, 1),
        "lmax_dba": round(serie.max() + 2, 1), "lmin_dba": round(serie.min() - 1, 1),
        "l10_dba": round(np.percentile(serie, 90), 1), "l50_dba": round(np.percentile(serie, 50), 1),
        "l90_dba": round(np.percentile(serie, 10), 1), "zona_eca": "INDUSTRIAL",
        "limite_eca_dba": 80 if diurno else 70, "cumple_eca": "", "limite_ocupacional_dba": 85,
        "cumple_ocupacional": "SI" if L < 85 else "NO", "tiempo_permitido_h": round(tiempo_permitido_h(L), 3),
        "horas_exposicion": horas, "dosis_pct": round(dosis_pct(L, horas), 1), "offset_cal_db": 108.4,
        "calibrado": "SI", "saturacion_pct": 0.0, "fuente_audio": "DEMO", "evaluador": "DATOS DE PRUEBA",
        "observacion": "dato sintetico", "serie_1s": "|".join(f"{v:.1f}" for v in serie),
    }


# =============================================================== principal

def main():
    ap = argparse.ArgumentParser(description="Procesa los CSV de SONOMIN y genera resultados y predicciones.")
    ap.add_argument("entradas", nargs="*", help="Carpeta(s) o archivo(s) CSV exportados por la app")
    ap.add_argument("--salida", default=None, help="Carpeta de resultados (por defecto: resultados_AAAAMMDD_HHMM)")
    ap.add_argument("--demo", action="store_true", help="Genera datos sinteticos de prueba y los procesa")
    ap.add_argument("--proyecto", default=None, help="Procesa solo las mediciones de ese proyecto")
    ap.add_argument("--predecir", nargs=2, type=float, metavar=("ESTE", "NORTE"), help="Predice el Leq en una coordenada")
    ap.add_argument("--cota", type=float, default=None)
    ap.add_argument("--hora", type=float, default=10.0)
    ap.add_argument("--ambito", default="SUPERFICIE", choices=["SUPERFICIE", "INTERIOR"])
    ap.add_argument("--fuente", default="Sin especificar")
    a = ap.parse_args()

    salida = a.salida or f"resultados_{datetime.now():%Y%m%d_%H%M}"
    os.makedirs(salida, exist_ok=True)
    entradas = a.entradas
    if a.demo:
        entradas = [generar_demo(os.path.join(salida, "DEMO_mediciones.csv"))]
        print("Datos DEMO generados (sinteticos, solo para probar).")
    if not entradas:
        ap.print_help(); sys.exit(1)

    print("Leyendo datos...")
    df = leer_csv(entradas)
    if a.proyecto:
        antes = len(df)
        df = df[df["proyecto"].str.contains(a.proyecto, case=False, na=False)].reset_index(drop=True)
        print(f"  filtro de proyecto '{a.proyecto}': {len(df)} de {antes} mediciones")
        if df.empty:
            sys.exit("Ningun dato con ese proyecto.")
    print(f"  {len(df)} mediciones | {df['punto'].nunique()} puntos | {df['fecha_hora'].min()} a {df['fecha_hora'].max()}")

    if df["proyecto"].nunique() > 1:
        print("  proyectos: " + ", ".join(f"{p} ({n})" for p, n in df["proyecto"].value_counts().items()))
    tp = tabla_puntos(df)
    tf = tabla_fuentes(df)
    th = tabla_horaria(df)
    tc = tabla_cumplimiento(df)

    print("Generando figuras...")
    figs = []
    r = os.path.join(salida, "01_leq_por_punto.png"); fig_puntos(tp, r); figs.append(("I. Nivel por punto de monitoreo", r, ""))
    r = os.path.join(salida, "02_registro_temporal.png"); fig_temporal(df, r); figs.append(("II. Registro cronologico", r, ""))
    r = os.path.join(salida, "03_perfil_horario.png"); fig_horario(th, r); figs.append(("III. Perfil horario", r, ""))
    r = os.path.join(salida, "04_por_fuente.png"); fig_fuentes(df, r); figs.append(("IV. Nivel por fuente de ruido", r, ""))

    rejillas, notas_mapa = [], []
    for amb in ["SUPERFICIE", "INTERIOR"]:
        pts = tp[(tp["ambito"] == amb)].dropna(subset=["este", "norte"])
        if len(pts) >= 3:
            ruta = os.path.join(salida, f"05_mapa_ruido_{amb.lower()}.png")
            metodo, rmse, rej, _ = mapa_ruido(pts, f"Mapa de ruido - {amb.capitalize()}", ruta)
            rej["ambito"] = amb
            rejillas.append(rej)
            nota = f"Metodo: {metodo}." + (f" Error de validacion cruzada (RMSE): {rmse:.2f} dB." if rmse is not None else "")
            notas_mapa.append((amb, metodo, rmse))
            figs.append((f"V. Mapa de ruido - {amb.capitalize()}", ruta, nota))
        else:
            print(f"  mapa {amb}: se necesitan >= 3 puntos con coordenadas (hay {len(pts)})")

    r = os.path.join(salida, "07_series_1s.png"); fig_series(df, r)
    print("Entrenando modelo predictivo...")
    mod = entrenar_modelo(df, salida)
    if mod:
        m = mod["metricas"]
        figs.append(("VI. Modelo predictivo (Random Forest)", os.path.join(salida, "06_modelo_random_forest.png"),
                     f"R2 de validacion = {m['R2_validacion']:.2f}; error medio absoluto = {m['MAE_db']:.2f} dB; "
                     f"RMSE = {m['RMSE_db']:.2f} dB con {m['n_mediciones']} mediciones."))
    figs.append(("VII. Series de 1 s de las mediciones mas altas", r, ""))

    if a.predecir:
        if not mod:
            print("No hay modelo para predecir (faltan datos).")
        else:
            e, n = a.predecir
            cota = a.cota if a.cota is not None else float(df["cota"].median())
            p, p10, p90 = predecir(mod, e, n, cota, a.hora, a.ambito, a.fuente)
            print(f"\nPREDICCION  E={e:.1f} N={n:.1f} cota={cota:.1f} hora={a.hora:.1f} {a.ambito} fuente={a.fuente}")
            print(f"  Leq estimado = {p:.1f} dB(A)  (intervalo 10-90 %: {p10:.1f} - {p90:.1f})")
            print(f"  Tiempo permitido = {fmt_tiempo(tiempo_permitido_h(p))}  |  {semaforo(p)}")

    # ---------------- Excel
    print("Escribiendo Excel...")
    xlsx = os.path.join(salida, "SONOMIN_resultados.xlsx")
    with pd.ExcelWriter(xlsx, engine="openpyxl") as w:
        resumen = pd.DataFrame([
            ("Mediciones", len(df)), ("Puntos", df["punto"].nunique()),
            ("Periodo", f"{df['fecha_hora'].min():%d/%m/%Y} - {df['fecha_hora'].max():%d/%m/%Y}"),
            ("Leq global dB(A)", round(leq(df["leq_dba"]), 1)), ("Maximo Lmax dB(A)", round(df["lmax_dba"].max(), 1)),
            ("Mediciones >= 85 dB(A)", int((df["leq_dba"] >= 85).sum())),
            ("Mediciones 80-85 dB(A)", int(((df["leq_dba"] >= 80) & (df["leq_dba"] < 85)).sum())),
            ("Incumplen ECA", int((tc["cumple_eca"] == "NO").sum())),
            ("Sin calibrar", int((df.get("calibrado", "SI") == "NO").sum())),
            ("Proyectos", ", ".join(sorted(df["proyecto"].unique()))),
            ("Criterio ocupacional", "D.S. 024-2016-EM, Anexo 12 (82->16 h, 85->8 h, 88->4 h, 91->1.5 h, 94->1 h, 97->30 min, 100->15 min)"),
            ("Criterio ambiental", "D.S. 085-2003-PCM (ECA ruido)"),
        ], columns=["Indicador", "Valor"])
        resumen.to_excel(w, sheet_name="Resumen", index=False)
        tp.to_excel(w, sheet_name="Por_punto", index=False)
        por_proy = df.groupby("proyecto").agg(mediciones=("leq_dba", "size"), leq_dba=("leq_dba", leq),
                                              lmax_dba=("lmax_dba", "max")).reset_index()
        por_proy["leq_dba"] = por_proy["leq_dba"].round(1)
        por_proy.to_excel(w, sheet_name="Por_proyecto", index=False)
        df.groupby("modo").agg(mediciones=("leq_dba", "size"), leq_dba=("leq_dba", leq)).round(1) \
            .reset_index().to_excel(w, sheet_name="Por_modo", index=False)
        tf.to_excel(w, sheet_name="Por_fuente", index=False)
        th.to_excel(w, sheet_name="Perfil_horario", index=False)
        tc.to_excel(w, sheet_name="Cumplimiento", index=False)
        df.drop(columns=["serie_1s"], errors="ignore").to_excel(w, sheet_name="Mediciones", index=False)
        if mod:
            pd.DataFrame([mod["metricas"]]).T.reset_index().rename(columns={"index": "Metrica", 0: "Valor"}).to_excel(w, sheet_name="Modelo", index=False)
            mod["importancias"].to_excel(w, sheet_name="Importancias", index=False)
        for ws in w.book.worksheets:
            for col in ws.columns:
                ancho = max(len(str(c.value)) if c.value is not None else 0 for c in col)
                ws.column_dimensions[col[0].column_letter].width = min(max(10, ancho + 2), 60)
            ws.freeze_panes = "A2"
    if rejillas:
        pd.concat(rejillas).to_csv(os.path.join(salida, "rejilla_prediccion_ruido.csv"), index=False)

    # ---------------- PDF
    print("Escribiendo informe PDF...")
    with PdfPages(os.path.join(salida, "SONOMIN_informe.pdf")) as pdf:
        lineas = [
            f"Fecha de procesamiento: {datetime.now():%d/%m/%Y %H:%M}",
            f"Archivos: {', '.join(df['archivo_origen'].unique())}",
            f"Periodo: {df['fecha_hora'].min():%d/%m/%Y %H:%M} a {df['fecha_hora'].max():%d/%m/%Y %H:%M}",
            f"Mediciones: {len(df)}   Puntos: {df['punto'].nunique()}   Evaluador: {', '.join(map(str, df['evaluador'].dropna().unique()[:3]))}",
            "",
            "**RESULTADOS",
            f"Leq global (media energetica): {leq(df['leq_dba']):.1f} dB(A)    Lmax registrado: {df['lmax_dba'].max():.1f} dB(A)",
            f"Mediciones >= 85 dB(A): {(df['leq_dba'] >= 85).sum()}    entre 80 y 85: {((df['leq_dba'] >= 80) & (df['leq_dba'] < 85)).sum()}    < 80: {(df['leq_dba'] < 80).sum()}",
            f"Mediciones que no cumplen el ECA: {(tc['cumple_eca'] == 'NO').sum()} de {len(tc)}",
            "",
            "**PUNTOS CON MAYOR NIVEL",
        ]
        for _, rr in tp.head(12).iterrows():
            lineas.append(f"  {rr['punto'][:22]:<22} {rr['ambito'][:3]}  Leq {rr['leq_dba']:5.1f}  T {rr['tiempo_permitido']:>7}  dosis {rr['dosis_pct']:5.0f} %  {rr['semaforo']}")
        lineas += ["", "**METODO"]
        lineas += ["Nivel ponderado A (IEC 61672) con respuesta Fast de 125 ms, medido con la app SONOMIN.",
                   "T: Anexo 12 del D.S. 024-2016-EM (82->16 h, 83->12 h, 85->8 h, 88->4 h, 91->1.5 h, 94->1 h, 97->30 min, 100->15 min),",
                   "interpolado entre filas. Dosis (Guia N 1) = suma(C/T) x 100 %. Nivel equivalente 8 h = 85 + 10 log10(Dosis/100).",
                   "Mapas: kriging ordinario o IDW sobre coordenadas UTM WGS84 zona 19S."]
        for amb, met, rm in notas_mapa:
            lineas.append(f"  Mapa {amb.lower()}: {met}" + (f", RMSE validacion {rm:.2f} dB" if rm is not None else ""))
        if mod:
            m = mod["metricas"]
            lineas.append(f"Modelo: {m['metodo']}; R2 = {m['R2_validacion']:.2f}, MAE = {m['MAE_db']:.2f} dB.")
            lineas.append("Variables mas influyentes: " + ", ".join(mod["importancias"]["variable"].head(4)))
        if (df["archivo_origen"].str.contains("DEMO")).any():
            lineas += ["", "**ATENCION: este informe usa DATOS SINTETICOS DE PRUEBA, no mediciones reales."]
        pagina_texto(pdf, "RESUMEN EJECUTIVO", lineas)
        for titulo, ruta, nota in figs:
            if os.path.exists(ruta):
                pagina_figura(pdf, titulo, ruta, nota)

    print(f"\nListo. Resultados en: {os.path.abspath(salida)}")
    for f in sorted(os.listdir(salida)):
        print("  -", f)


if __name__ == "__main__":
    main()
