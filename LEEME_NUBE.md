# SONOMIN en internet · guía paso a paso

Idea y dirección: Ing. Lesmes Gabriel Calsina Paricahua · Desarrollo: Felix Fernando Bautista Layme

Con esta carpeta el tablero de la computadora queda en un **enlace de internet**. El ingeniero, su jefe o quien usted autorice entra con correo y contraseña y ve, en tiempo real, las mediciones, las fotos, el análisis, los pronósticos y el cálculo de penalidades.

## Ya está publicado (3 de octubre de 2026)

| Qué | Dónde |
|---|---|
| **Tablero en internet** (el enlace para su jefe) | https://felixffbl26-cmd.github.io/sonomin/ |
| Código del tablero | https://github.com/felixffbl26-cmd/sonomin |
| Base de datos y fotos | Supabase, proyecto `sonomin` (región São Paulo, plan gratis) · https://supabase.com/dashboard/project/aequrttaopjfzlpntwlv |
| URL del proyecto (para el celular) | `https://aequrttaopjfzlpntwlv.supabase.co` |
| Clave anon (para el celular, es pública) | está en `docs/config.js` y en Supabase › Project Settings › API Keys › Legacy |
| Administrador | felixffbl.26@gmail.com |

**Cómo entra una persona nueva:** abre el enlace, pulsa «Solicitar acceso» y crea su cuenta. Usted la aprueba en la pestaña **Accesos** como lector (solo mira), celular (el teléfono que mide) o administrador. Sin su aprobación no ve nada.

**Qué se ve en tiempo real (sin recargar):** cada celular que está midiendo, con nivel cada 2 s, punto, proyecto, modo, coordenadas UTM y geográficas, avance de la medición y gráfico de 3 minutos; su posición y rastro en el mapa satelital; el registro de actividad al segundo (inicio, fin, mediciones guardadas, alertas de 85 dB(A) y del ECA) con sonido y notificación; el avance de cada proyecto frente a su plan; y la estadística completa (descriptiva, distribución, rangos por punto, mapa de calor día × hora, ANOVA y correlaciones).

**Nuevo en la versión 4 (4 de octubre):**
- **Informe técnico al instante** en la pestaña Informes: pulse «Generar informe técnico» y luego «Imprimir / Guardar PDF». También «Descargar Excel». Usa el filtro de arriba (proyecto, periodo, ámbito).
- **Eliminar una medición hecha por error:** abra la medición en la pestaña Mediciones, pulse «¿Medición hecha por error? Moverla a la papelera», escriba el motivo y confirme. Sale de todos los cálculos. Desde Mediciones › Papelera se puede restaurar o borrar para siempre. Solo administradores.
- **Registro** (solo administrador): quién hizo qué y cuándo, incluidos los ingresos al tablero. No se puede editar ni borrar.
- El historial completo de versiones está en `HISTORIAL.md`.

**Pendiente de su parte:**
1. Informes automáticos: en GitHub › sonomin › Settings › Secrets and variables › Actions, cree el secreto `SUPABASE_SERVICE_KEY` y pegue la clave **service_role** (Supabase › Project Settings › API Keys › Legacy › Reveal). `SUPABASE_URL` ya está creado. Luego Actions › Informe SONOMIN › Run workflow.
2. Celular: abra `SONOMIN_android` en Android Studio, compile e instale. En Más › Nube y tiempo real ponga la URL, la clave anon y el correo y contraseña de una cuenta con rol celular (o la suya de administrador mientras prueba). Pulse «Probar conexión».
3. La contraseña de la base de datos la generó Supabase al crear el proyecto; si la necesita, cámbiela en Project Settings › Database.

## Cómo funciona (en una línea)

El celular envía a **Supabase** (base de datos y fotos, gratis) → el tablero web publicado en **GitHub Pages** (gratis) lee de Supabase → una tarea de **GitHub Actions** genera cada 6 horas el informe en Excel y PDF y lo deja en la pestaña Informes.

```
Celular ──► Supabase (datos + fotos) ◄── Tablero web (GitHub Pages)  ◄── su jefe, con enlace + contraseña
                  ▲
                  └── GitHub Actions (informe Excel/PDF cada 6 h)
```

## Antes de empezar: pruébelo sin configurar nada

Abra la carpeta `docs` con un servidor local (`python -m http.server` dentro de `docs`, y luego `http://localhost:8000/?demo=1`). Verá el tablero completo con **datos de demostración inventados** y un aviso amarillo que lo dice. Sirve para mostrárselo al ingeniero antes de crear las cuentas. Nunca los mezcle con datos reales.

---

## Paso 1 · Crear el proyecto en Supabase (10 minutos)

1. Entre a **supabase.com**, cree una cuenta (puede usar su cuenta de GitHub) y pulse **New project**.
2. Nombre: `sonomin`. Región: la más cercana (por ejemplo *South America (São Paulo)*). Anote la contraseña de la base de datos en un lugar seguro.
3. Cuando el proyecto esté listo, vaya a **SQL Editor › New query**, pegue **todo** el contenido de `supabase/esquema.sql` y pulse **Run**. Debe terminar sin errores. Se puede volver a ejecutar sin problema.
4. Vaya a **Authentication › Users › Add user › Create new user** y cree tres usuarios, marcando **Auto Confirm User**:
   - uno para el celular (por ejemplo `celular.sonomin@gmail.com`)
   - uno para el ingeniero o su jefe (su correo real)
   - uno para usted (administrador)
5. En **Authentication**, desactive el registro libre (**Sign In / Providers › Allow new users to sign up: apagado**). Así nadie más puede crearse una cuenta por su cuenta.
6. Vuelva al **SQL Editor** y dé los roles. Cambie los tres correos por los reales y ejecute:

```sql
insert into public.perfiles (user_id, rol)
  select id, 'celular' from auth.users where email = 'celular.sonomin@gmail.com'
  on conflict (user_id) do update set rol = excluded.rol;
insert into public.perfiles (user_id, rol)
  select id, 'lector'  from auth.users where email = 'CORREO_DEL_JEFE'
  on conflict (user_id) do update set rol = excluded.rol;
insert into public.perfiles (user_id, rol)
  select id, 'admin'   from auth.users where email = 'felixffbl.26@gmail.com'
  on conflict (user_id) do update set rol = excluded.rol;
```

   Roles: `celular` envía datos, `lector` solo mira, `admin` hace todo. **Una cuenta sin rol no ve nada**, aunque tenga contraseña.
7. En **Project Settings › API** copie dos cosas: la **Project URL** y la clave **anon public** (en proyectos nuevos puede llamarse *publishable*). Para el Paso 3 también necesitará la clave **service_role** (puede llamarse *secret*).

> La clave `anon` es pública por diseño: lo que protege los datos son los permisos de la base de datos (ya incluidos en `esquema.sql`). La clave `service_role` **nunca** va en el celular ni en la página web: solo como secreto de GitHub (Paso 3).

## Paso 2 · Subir el tablero a GitHub y obtener el enlace

**Opción A (conectada a Claude).** Conecte GitHub en  
`https://claude.ai/customize/connectors?auth_start=github&auth_start_force=1`  
y avise: Claude crea el repositorio, sube todo y activa Pages.

**Opción B (a mano).**

1. En **github.com** pulse **New repository**. Nombre: `sonomin`. Visibilidad: **Public** (GitHub Pages gratis lo exige en cuentas gratuitas). Sin README.
2. Entre a la carpeta `docs` y edite `config.js`: pegue la URL y la clave anon, y en `GITHUB_REPO` escriba `su-usuario/sonomin`. Guarde.
3. En el repositorio: **Add file › Upload files** y arrastre **todo el contenido** de `SONOMIN_nube` (arrastre `docs`, `procesamiento`, `supabase` y los archivos sueltos). Para los informes automáticos falta una carpeta que las herramientas no pudieron escribir en su disco: en GitHub pulse **Add file › Create new file**, escriba como nombre `.github/workflows/informe.yml` (al teclear las barras se crean las carpetas) y pegue el contenido de `informe_workflow.yml`. El archivo `SONOMIN_nube.zip` que se entregó en el chat ya trae esa carpeta. Pulse **Commit changes**.
4. **Settings › Pages**: *Source* = **Deploy from a branch**, rama **main**, carpeta **/docs** › **Save**.
5. En 1–2 minutos aparece el enlace: `https://su-usuario.github.io/sonomin/`. **Ese es el enlace para su jefe.**

> Al ser un repositorio público, el *código* es visible, pero **los datos no**: están en Supabase detrás de usuario y contraseña. Por eso `config.js` solo lleva la clave anon.

## Paso 3 · Informes automáticos (GitHub Actions)

1. En el repositorio: **Settings › Secrets and variables › Actions › New repository secret**. Cree dos:
   - `SUPABASE_URL` = la Project URL
   - `SUPABASE_SERVICE_KEY` = la clave service_role
2. Pestaña **Actions › Informe SONOMIN › Run workflow** (puede escribir un proyecto o dejarlo vacío para todos). Tarda unos minutos. El informe aparece luego en la pestaña **Informes** del tablero.
3. Después se ejecuta solo cada 6 horas. Esa actividad también ayuda a que Supabase no pause el proyecto por inactividad.

## Paso 4 · Configurar el celular

En la app: **Más › Nube y tiempo real** y llene: URL del proyecto, clave anon, correo del usuario del celular y su contraseña. Pulse **Probar conexión**. Los mensajes dicen exactamente qué falta (contraseña, rol, esquema sin ejecutar, sin internet). Desde ese momento cada medición viaja con sus fotos y, mientras mide, se ve el nivel en vivo en el tablero.

## Paso 5 · Compartir con el jefe

Envíele el enlace de GitHub Pages y su correo y contraseña de Supabase (rol `lector`). Entra, ve todo y no puede borrar ni modificar nada.

---

## Qué ve el tablero

| Pestaña | Contenido |
|---|---|
| En vivo | Nivel en este momento (semáforo), gráfico de 3 minutos, última medición con foto, cifras clave, avisos de calidad |
| Mapa | Puntos sobre imagen satelital con semáforo y superficie interpolada (solo superficie) |
| Mediciones | Tabla ordenable y filtrable, detalle con fotos y memoria de cálculo, descarga CSV |
| Análisis | Leq por punto, perfil horario, cumplimiento, superficie frente a interior, dosis diaria |
| Pronóstico | Tendencia por punto con intervalo, probabilidad de superar un límite, simulador de dosis |
| Penalidades | Calculadora OEFA (ambiental) y riesgo Osinergmin (ocupacional) por separado, valor esperado, fuentes con su estado |
| Informes | Excel, PDF y figuras generados; descarga del CSV completo |

## Límites y cuidados

- **Supabase gratis** pausa un proyecto sin actividad durante una semana; la tarea de las 6 horas lo evita. Incluye 500 MB de base de datos y 1 GB de archivos: revise en **Storage** cuánto pesan sus fotos y, si hace falta, baje la calidad de la foto en la app.
- **GitHub** desactiva las tareas programadas de un repositorio público tras unos 60 días sin ninguna actividad. Si pasa, pulse **Enable workflow** en la pestaña Actions.
- **Mapa satelital:** las imágenes son de Esri (World Imagery) y se piden al abrir el mapa. Para uso académico y ligero está bien; revise sus condiciones si lo usa comercialmente. Hay mapa de calles como alternativa.
- **Si cambia la contraseña** del usuario del celular, actualícela en la app.
- **Copia de seguridad:** la pestaña Mediciones descarga el CSV completo. Hágalo al cerrar cada campaña.

## Lo que está probado y lo que no

Probado en este entorno: las pruebas numéricas del tablero (12 de 12), todas las pestañas en navegador con datos de demostración (escritorio, móvil, modo oscuro), el esquema SQL en un PostgreSQL real (se ejecuta dos veces sin error y los permisos por rol funcionan como se describe), y el generador de informes contra un servidor Supabase simulado.

**No probado** (no hay un proyecto Supabase ni GitHub real conectado aquí): el inicio de sesión real, el tiempo real real, la subida de fotos reales y el flujo de GitHub Actions en la nube. Tampoco se pudo **compilar la app Android**: puede marcar algún error de compilación la primera vez en Android Studio (en ese caso, mire primero `Nube.kt`). Haga una medición de prueba de punta a punta antes de la fecha del concurso.

## Penalidades: cómo leerlas

- Son **estimaciones referenciales**, no una determinación de multa; las impone OEFA u Osinergmin en un procedimiento sancionador.
- Superar el ECA de ruido **no se sanciona por sí mismo** (Ley General del Ambiente, art. 31.4). El cálculo ambiental solo se hace si hay un compromiso de la certificación ambiental o una obligación incumplida con causalidad demostrada.
- No se encontró una fila específica de ruido confirmada en el cuadro de tipificación de Osinergmin vigente: por eso no se inventa un monto; se muestra la exposición (dosis, nivel equivalente de 8 h) y usted ingresa la multa base si el especialista la confirma.
- Cada dato lleva su estado: **VERIFICADO**, **RESUMEN** (leído en un extracto, contrastar con el PDF oficial) o **NO CONFIRMADO**. La tabla completa de tiempos permitidos del Anexo 12 está **sin confirmar** contra el texto oficial; contrástela antes de presentarla.
- Los datos de demostración son sintéticos.
