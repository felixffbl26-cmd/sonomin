# SONOMIN · Auditoría técnica de la aplicación y la página

Revisión de la versión 4 hecha el 8 de octubre de 2026, desde el punto de vista de la ingeniería de minas (seguridad y salud ocupacional y ambiente) y de la seguridad informática. Los cambios aplicados quedaron en la versión 5.

Desarrollo: Felix Fernando Bautista Layme · Asesor: Ing. Lesmes Gabriel Calsina Paricahua · FIM – UNA Puno

---

## I. Alcance y método

- **Qué se revisó:**
  - la app Android (Kotlin);
  - la app iOS (Expo);
  - la página web publicada en GitHub Pages;
  - la base de datos Supabase: esquema, permisos por fila y funciones;
  - el informe técnico.
- **Contra qué se comparó:**
  - D.S. 024-2016-EM (Anexo 12 y Guía N° 1, modificado por D.S. 023-2017-EM);
  - D.S. 085-2003-PCM (ECA para ruido);
  - la práctica habitual de monitoreo de ruido en operaciones mineras.
- **Cómo se verificó:**
  - pruebas numéricas (17 de 17 correctas);
  - pruebas de permisos en PostgreSQL 16 con cuentas de administrador, lector, celular, cuenta sin rol y visitante anónimo;
  - recorrido de la página en computadora y celular, en modo claro y oscuro;
  - lectura del código de las dos apps.

## II. Hallazgos corregidos en la versión 5

| N° | Área | Hallazgo | Consecuencia | Corrección |
|---|---|---|---|---|
| 1 | Pronóstico | En recorrido, jornada y monitoreo continuo cada lectura recibe un nombre propio (P-02-T004, P-02-H03, P-02-M012). La página tomaba cada nombre como un punto distinto. | Todas las filas con n = 1 y «datos insuficientes», aunque se midiera mucho. | Agrupación por **estación de monitoreo** (punto base). Opciones: unir lecturas a menos de 15 m, o usar solo puntos fijos. Mínimo 5 mediciones (preliminar) y 10 (firme). La página dice cuántas faltan. Lo mismo en el informe y en penalidades. |
| 2 | Pronóstico | Con una tendencia significativa y un horizonte mayor que el periodo observado, el texto decía «sin tendencia significativa». | Interpretación equivocada. | El texto explica que la tendencia no se extrapola más allá de los días observados. |
| 3 | Evidencia fotográfica (Android) | El sello se dibujaba abriendo la foto a resolución completa. Además se ignoraba la orientación EXIF. | En celulares de 48–108 MP (Xiaomi, Redmi, Poco y otros) se agota la memoria y la foto sale sin rótulo, o sale girada con el rótulo de costado. | Foto reducida antes de abrirla, giro EXIF aplicado, reintento a menor tamaño y aviso al operador. Nueva columna `foto_sellada`. |
| 4 | Evidencia fotográfica (iOS) | Un solo intento con Skia, fuente Menlo fija (no existe en Android) y foto sin normalizar. | Foto sin rótulo, sin aviso al operador. | Normalización con `expo-image-manipulator`, fuente según el sistema, reintento y aviso. Nueva columna `foto_sellada`. |
| 5 | Evidencia fotográfica (página) | Si la foto no traía rótulo, no había forma de ver sus datos sobre ella. | Evidencia sin trazabilidad visual. | La página dibuja el rótulo con los datos guardados de la medición e indica que lo agregó la página. La ficha muestra si el rótulo está impreso. |
| 6 | Mapas (página) | Cada dato en vivo borraba y volvía a crear todo el mapa, y cualquier cambio lo volvía a encuadrar. | Imposible quedarse en un lugar o abrir un punto: el mapa «saltaba». | El mapa recuerda la vista y los celulares se actualizan en su sitio. Agrupación de puntos cercanos, lista «Ir a un punto» con buscador y vista por estación o por punto. |
| 7 | Mapas (apps) | Mapa fijo, sin zoom, con todas las etiquetas encimadas. | Ilegible con muchos puntos. | Zoom y desplazamiento con los dedos, «Reajustar», etiquetas sin choques y lista de estaciones para ir a cada una. |
| 8 | Seguridad | Un lector o un celular podía leer **todas** las mediciones, fotos, informes y posiciones de **todos** los proyectos. La página solo ocultaba las pestañas. | Fuga de información entre proyectos o empresas. | Acceso por proyecto en la base de datos: `acceso_proyectos`, `puede_ver()` y `asignar_proyectos()`. Se aplica a mediciones, vivo, posiciones, eventos, planes, informes y fotos. El administrador ve todo. |
| 9 | Seguridad | La función interna `auditar()` podía llamarse desde fuera, incluso sin sesión, porque Supabase da permiso de ejecución a toda función nueva. | Alguien podía escribir registros falsos en la auditoría. | Se retiró el permiso. Las funciones públicas quedan solo para usuarios con sesión. |
| 10 | Seguridad | Cualquier celular podía modificar la fila en vivo de otro celular. | Suplantación de un equipo en el tablero. | Cada celular solo actualiza su propia fila. El servidor fija quién envió cada medición (`usuario_id`). |
| 11 | Seguridad | Los textos de los mapas (nombre del punto o del equipo) se insertaban como HTML. | Un nombre de punto malicioso podía ejecutar código en la página de quien la abriera. | Todos los textos de los mapas se insertan como texto. Se agregó una política de seguridad de contenido (CSP). |
| 12 | Seguridad | Las mediciones en la papelera seguían visibles para lectores consultando directamente la base. | Datos retirados aún expuestos. | La base solo muestra la papelera al administrador. |
| 13 | Calidad de datos | No había aviso para muestras cortas en puntos ruidosos. | Dosis estimada con una muestra no representativa. | Aviso cuando una medición en punto fijo de 80 dB(A) o más dura menos de 5 minutos. |
| 14 | Créditos | Decía «Idea y dirección». | — | «Desarrollo: Felix Fernando Bautista Layme · Asesor: Ing. Lesmes Gabriel Calsina Paricahua» en la página, el informe, las apps, los programas de Python y los documentos. |

## III. Observaciones de ingeniería (para el criterio del evaluador)

Son condiciones de uso que el código no puede resolver por sí solo. Conviene tenerlas en cuenta al presentar resultados.

1. **El celular no es un sonómetro certificado.**
   - La Guía N° 1 se basa en sonómetros o dosímetros con calibración vigente.
   - SONOMIN es una herramienta de tamizaje y vigilancia: sirve para ubicar zonas críticas, seguir tendencias y priorizar controles.
   - Las mediciones cercanas al límite (entre 82 y 88 dB(A)) deben tomarse como **no concluyentes** hasta confirmarlas con un sonómetro.
   - El informe ya declara que los resultados son referenciales.
2. **Calibración.**
   - Ajuste cada celular contra un sonómetro de referencia, en el mismo punto y al mismo tiempo, en al menos dos niveles (uno moderado y uno alto).
   - Repita la verificación al cambiar de celular o de funda y al inicio de cada campaña.
   - Una medición «SIN CALIBRAR» no debería entrar a un informe formal.
3. **Exposición ocupacional y nivel en un punto no son lo mismo.**
   - El Anexo 12 limita la exposición de la **persona** durante su jornada.
   - Un Leq medido junto a una perforadora describe la fuente, no la dosis del trabajador.
   - Para dosis use el modo **Jornada** con el celular en el trabajador (micrófono cerca del oído, sin tapar) y registre el puesto en el campo «Labor».
4. **Duración representativa.**
   - En punto fijo, mida al menos 5 a 15 minutos o un ciclo completo de la operación (carga, acarreo, perforación).
   - Las muestras de 20 a 30 s solo sirven como referencia rápida.
5. **Nivel pico.** El D.S. 024-2016-EM también limita el pico. El micrófono del celular satura antes y no mide el pico ponderado C, así que SONOMIN no evalúa ese criterio.
6. **ECA de ruido ambiental.**
   - El ECA se evalúa en los **receptores**: límite de la concesión, centros poblados y zona de influencia. No dentro de la planta, donde rige el criterio ocupacional.
   - Para monitoreo ambiental formal siga el Protocolo Nacional de Monitoreo de Ruido Ambiental (R.M. N° 227-2013-MINAM): altura del micrófono, distancia a superficies reflectantes, sin lluvia ni viento fuerte, y horario diurno o nocturno.
   - Recomendación: crear un proyecto aparte, «Ambiental», con esos puntos.
7. **Estaciones de monitoreo con nombre fijo.**
   - El pronóstico depende de que la misma estación se mida siempre con el mismo nombre y en el mismo lugar.
   - Cargue las estaciones en la app (Más › Puntos de control) y elíjalas de la lista en vez de escribirlas cada vez.
8. **Tabla del Anexo 12.** Las copias consultadas no coinciden del todo (por ejemplo, 83 dB(A) = 12 h y 91 dB(A) = 1,5 h). Contrastar con el texto oficial antes de un informe formal. Es una sola tabla en `normas.js` y en `Acustica.kt`.
9. **Zona UTM.**
   - Todo Puno está en la zona 19 Sur.
   - Si se mide en otra región (por ejemplo, el oeste del Cusco, zona 18 Sur), la app debe guardar la zona correcta. La conversión de la página usa la zona de cada medición.
10. **Multas.** Siguen siendo estimaciones referenciales. Las determina la autoridad (OEFA u Osinergmin) en un procedimiento sancionador.

## IV. Seguridad: cómo queda y qué falta

**Cómo queda:**

| Rol | Qué ve | Qué puede hacer |
|---|---|---|
| Administrador | Todos los proyectos, usuarios, registro de auditoría y papelera | Aprobar cuentas, asignar roles y proyectos, editar planes, papelera y borrado definitivo |
| Lector | Solo sus proyectos asignados | Mirar y descargar informes y CSV de sus proyectos |
| Celular | Sus proyectos asignados y lo que él mismo envió | Enviar mediciones, fotos y nivel en vivo de cualquier proyecto (nunca se pierde un dato de campo) |
| Cuenta sin rol / sin proyectos | Nada | Nada |

Todo se verifica en la base de datos. Aunque alguien manipule la página o use la clave pública, no puede leer proyectos ajenos. Cada asignación o retiro de proyecto queda en la auditoría.

**Recomendaciones que dependen de usted:**

1. Active la verificación en dos pasos (MFA) de su cuenta de administrador en Supabase y en GitHub.
2. La clave `service_role` vive solo en los secretos de GitHub. Si algún día se expone, regenérela en Supabase y actualice el secreto.
3. Asigne proyectos a las cuentas lector y celular existentes: desde la versión 5 no ven datos hasta que lo haga.
4. Al cerrar cada campaña, descargue el CSV completo. El plan gratuito de Supabase no guarda copias de seguridad recuperables.
5. Revise cada cierto tiempo la pestaña Registro: ingresos de personas desconocidas, descargas masivas o cambios de rol.
