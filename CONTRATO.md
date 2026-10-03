# Contrato SONOMIN nube (celular -> Supabase -> tablero / Actions)

Fuente de verdad: `supabase/esquema.sql`. Ningun cliente envia `fecha_hora` (columna generada desde `inicio_ms`).
Cabeceras siempre: `apikey: <ANON_KEY>`; con sesion: `Authorization: Bearer <access_token>`.

## Auth (rol `celular`)
- Login: `POST {URL}/auth/v1/token?grant_type=password` JSON `{email,password}` -> `access_token`, `refresh_token`, `expires_in`.
- Refresco: `POST {URL}/auth/v1/token?grant_type=refresh_token` JSON `{refresh_token}`.
- Cachear token hasta `expires_in - 60 s`. Ante HTTP 401: borrar token, reloguear, reintentar UNA vez.
- Prueba de conexion: login y luego `GET {URL}/rest/v1/perfiles?select=rol`; correcto solo si algun rol es `celular` o `admin`.

## Medicion
`POST {URL}/rest/v1/mediciones?on_conflict=uuid`
Cabeceras: `Prefer: resolution=ignore-duplicates,return=minimal`, `Content-Type: application/json`.
Cuerpo: mismos campos y nombres que el CSV/JSON actual (`json(m)` de `Envio.kt`), mas `inicio_ms` (bigint), `fotos` = arreglo de rutas `"<uuid>/<archivo>.jpg"`, `serie_1s` = cadena con `|`. NO enviar `fecha_hora`.

## Foto
`POST {URL}/storage/v1/object/fotos/<uuid>/<archivo>.jpg` con `x-upsert: true`, `Content-Type: image/jpeg`, cuerpo = bytes.

## En vivo
`POST {URL}/rest/v1/vivo?on_conflict=id`, `Prefer: resolution=merge-duplicates,return=minimal`.
Cuerpo: `id:"celular"`, `midiendo` true/false, `proyecto,punto,modo,nivel_dba,leq_parcial,lmax_parcial,transcurrido_s,objetivo_s,tramos,dosis_pct,este,norte,cota,evaluador,calibrado,ts`.
Al terminar o cancelar: enviar `{id:"celular", midiendo:false}`.

## Regla de entrega
Una medicion se marca `enviado` solo cuando la fila Y todas sus fotos subieron (200/201/204; 409 en fila = duplicado = exito).

## Informes (GitHub Actions, service_role)
Lee `mediciones` paginado; sube resultados al bucket privado `informes` en `<sello>/...`; inserta fila en `informes` con `resumen` jsonb `{puntos, leq_global, sobre_85}` y `archivos` jsonb.
Secretos del repo: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`. La clave service_role nunca va al navegador ni al celular.
