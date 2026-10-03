/* SONOMIN · conexion con la nube.
 *
 * Pega aqui los dos datos de tu proyecto de Supabase
 * (Project Settings > API): la URL y la clave "anon public".
 * Son datos publicos por diseno: lo que protege la informacion son los permisos
 * de la base de datos (esquema.sql), no el secreto de estas dos lineas.
 *
 * NUNCA pegues aqui la clave "service_role".
 *
 * Si se dejan vacios, el tablero abre en MODO DEMOSTRACION con datos sinteticos.
 * Tambien se puede forzar con  ?demo=1  al final de la direccion.
 */
window.SONOMIN_CONFIG = {
  SUPABASE_URL: "https://aequrttaopjfzlpntwlv.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlcXVydHRhb3BqZnpscG50d2x2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNjA0MDQsImV4cCI6MjEwNjYzNjQwNH0.MhOfLm1j4CwTSolNpR0dh69KTMulHVOKyt9d7N8T_wc",
  // Opcional: usuario/repositorio de GitHub (para el enlace "Generar informe ahora" en la pestaña Informes)
  GITHUB_REPO: "felixffbl26-cmd/sonomin",
};
