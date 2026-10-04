# SONOMIN · historial de cambios

Idea y dirección: **Ing. Lesmes Gabriel Calsina Paricahua** · Desarrollo: **Felix Fernando Bautista Layme** · FIM – UNA Puno

Cada versión anota qué se hizo, por qué y qué quedó pendiente. Las fechas son de 2026.

---

## v4.0.1 · 4 de octubre · ajustes tras la prueba en la nube

- El ingreso al tablero se registra después de conectar el tiempo real, y la pestaña Registro recarga la auditoría cada vez que se abre (antes un ingreso podía no aparecer en pantalla hasta recargar).
- Verificado en la nube real: papelera, borrado definitivo y su constancia en la auditoría; informe automático de GitHub en verde con los dos secretos.

## v4.0 · 4 de octubre · registro de todo, papelera e informe al instante

**Por qué:** el informe automático de GitHub fallaba y no había forma de corregir una medición hecha por error; además se pidió que todo lo que se haga quede registrado.

- **Informe técnico al instante** (pestaña Informes): con los datos del filtro actual arma un informe con logos, datos del documento, base normativa, metodología, resultados por punto, evaluación ocupacional (Anexo 12 y dosis) y ambiental (ECA), estadística (descriptiva y ANOVA), tendencia y riesgo a 30 días, evidencia fotográfica en orden cronológico, conclusiones, recomendaciones, firmas y anexo. Se imprime o guarda en PDF (A4).
- **Excel al instante** (.xlsx real con hojas Resumen, Mediciones, Por punto, Ocupacional y ECA), generado en el navegador sin librerías externas.
- **Papelera de mediciones** (solo administrador): una medición hecha por error se mueve a la papelera con motivo obligatorio; sale de todos los cálculos para todos los usuarios, se puede restaurar o borrar para siempre (con sus fotos). El borrado definitivo solo es posible desde la papelera.
- **Auditoría** (pestaña Registro, solo administrador): el servidor anota quién, qué y cuándo: ingresos al tablero, papelera, restauraciones, borrados, accesos otorgados o quitados, cambios de rol, planes de proyecto, informes generados y descargas. Nadie puede editarla ni borrarla.
- **Registro de ingresos**: cada vez que alguien abre el tablero queda anotado con su navegador y pantalla.
- **Informe automático de GitHub**: el fallo era la falta del secreto `SUPABASE_SERVICE_KEY`. Se agregó un paso que lo explica con claridad si falta, se actualizaron las acciones (checkout v5, setup-python v6) y el proceso ya no incluye mediciones de la papelera.
- Corrección: bajo 82 dB(A) el informe muestra "sin límite" en vez de una dosis engañosa de 50 %.
- Base de datos: tabla `auditoria`, columnas de papelera en `mediciones`, funciones `papelera_medicion`, `restaurar_medicion`, `eliminar_medicion_definitiva` y `registrar_accion`. Probado en PostgreSQL 16.

## v3.1 · 3 de octubre · tiempo real completo y publicación

**Por qué:** se pidió saber en tiempo real qué se hace, dónde, en qué proyecto, y dar acceso a otras personas con cuenta.

- Publicado en internet: tablero en GitHub Pages (`felixffbl26-cmd.github.io/sonomin`) y base de datos en Supabase (São Paulo, plan gratis).
- **Varios celulares a la vez**, cada uno con su nivel cada 2 s, punto, proyecto, coordenadas y avance; mapa con su rastro de 12 h.
- **Actividad al segundo** registrada por el servidor (inicio, fin, mediciones, alertas de 85 dB(A) y ECA), con aviso sonoro y notificación.
- Pestaña **Proyectos** (avance frente al plan, ritmo, fecha estimada), **Estadística** (descriptiva, distribución, rangos, mapa de calor, ANOVA, correlaciones) y **Accesos** (solicitud de cuenta y aprobación por rol).
- Interior mina en el mapa: conversión UTM → geográficas (verificada contra pyproj).
- App Android: identificador de equipo y posición en el latido en vivo.

## v3.0 · 3 de octubre · la computadora pasa a internet

- Esquema Supabase con seguridad por filas (roles celular, lector, admin), fotos en almacenamiento privado y tiempo real.
- Tablero web con 7 pestañas (En vivo, Mapa, Mediciones, Análisis, Pronóstico, Penalidades, Informes) y modo demostración.
- Penalidades OEFA y Osinergmin por separado, sin inventar montos, con el estado de verificación de cada dato.
- App Android: cliente de Supabase (`Nube.kt`): primero fotos y luego la fila; se marca enviada solo si todo subió.
- Informes automáticos con GitHub Actions (Python: kriging, Random Forest, Excel y PDF).

## v2.1 · 30 de septiembre · pruebas en emulador

- Corrección de una carrera: una medición podía enviarse antes de tener su foto. Ahora la foto se toma antes de guardar.
- Diagnóstico: niveles bajo 28 dB(A) en el emulador se deben a que no hay micrófono real; se agregaron avisos de calidad.

## v2.0 · 29 de septiembre · más fácil y en tiempo real

- Proyectos separados, foto automática con datos impresos, envío en tiempo real a la computadora, cuatro modos (punto fijo, recorrido, jornada, monitoreo continuo) e interfaz más simple.
- Normas: D.S. 024-2016-EM (Anexo 12, Guía N° 1) y D.S. 085-2003-PCM.

## v1.0 · 19 de septiembre · primera versión

- App Android en Kotlin con el estilo de AERO FILEX, cálculo de Leq con ponderación A y exportación.
- Procesamiento en Python (`procesar_ruido.py`): Excel, figuras, informe PDF y modelo predictivo.

---

### Pendientes conocidos

- Compilar la app Android en Android Studio (no se pudo compilar en el entorno de desarrollo) y probar en un celular real calibrado.
- Contrastar la tabla del Anexo 12, la fila de ruido de Osinergmin y las cifras OEFA marcadas "RESUMEN" con los textos oficiales.
- Las estimaciones de multas son referenciales.
