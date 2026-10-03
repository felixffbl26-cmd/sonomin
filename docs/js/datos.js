/* SONOMIN · acceso a datos: Supabase (nube) o datos sinteticos (demostracion).
 * Todo lo que llega de la base de datos se trata como texto: las vistas lo insertan con textContent. */
(function (raiz) {
  "use strict";
  const CFG = raiz.SONOMIN_CONFIG || {};
  const params = new URLSearchParams(location.search);
  const forzarDemo = params.get("demo") === "1";
  const enNube = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) && !forzarDemo;

  // Se omite serie_1s del listado (pesa) y se pide al abrir una medicion.
  const COLUMNAS = [
    "uuid", "proyecto", "proyecto_id", "modo", "recorrido_id", "secuencia", "inicio_ms", "fecha_hora", "turno_eca", "ambito", "punto", "labor",
    "fuente_ruido", "este", "norte", "cota", "tipo_cota", "zona_utm", "latitud", "longitud", "origen_posicion", "precision_m", "duracion_s",
    "leq_dba", "lmax_dba", "lmin_dba", "l10_dba", "l50_dba", "l90_dba", "zona_eca", "limite_eca_dba", "limite_ocupacional_dba",
    "tiempo_permitido_h", "horas_exposicion", "dosis_pct", "offset_cal_db", "calibrado", "saturacion_pct", "fuente_audio", "evaluador",
    "observacion", "fotos",
  ].join(",");

  const D = { modo: enNube ? "nube" : "demo", cliente: null, _cacheFotos: new Map(), _demo: null, usuarioId: null };

  if (enNube) {
    D.cliente = raiz.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  const exigir = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

  // --------------------------------------------------------------- sesion
  D.sesionActual = async function () {
    if (!enNube) return { demo: true, email: "demostración", rol: "admin" };
    const { data } = await D.cliente.auth.getSession();
    if (!data || !data.session) return null;
    D.usuarioId = data.session.user.id;
    return { email: data.session.user.email, userId: data.session.user.id };
  };

  /** Rol del usuario que inicio sesion (null si aun no fue aprobado). */
  D.miRol = async function () {
    if (!enNube) return "admin";
    const { data, error } = await D.cliente.from("perfiles").select("rol").eq("user_id", D.usuarioId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? data.rol : null;
  };

  D.entrar = async function (correo, clave) {
    if (!enNube) return { email: "demostración", rol: "admin" };
    const { data, error } = await D.cliente.auth.signInWithPassword({ email: correo, password: clave });
    if (error) {
      const m = error.message || "";
      if (/invalid login credentials/i.test(m)) throw new Error("Correo o contraseña incorrectos.");
      if (/email not confirmed/i.test(m)) throw new Error("Primero confirme su correo: revise su bandeja de entrada (y la carpeta de spam).");
      throw new Error(m);
    }
    D.usuarioId = data.user.id;
    const rol = await D.miRol();
    if (!rol) {
      await D.cliente.auth.signOut();
      throw new Error("Su cuenta existe, pero el administrador todavía no le dio acceso. Cuando lo apruebe podrá entrar.");
    }
    D.rol = rol;
    return { email: data.user.email, rol };
  };

  /** Crea la cuenta; queda sin rol (no ve nada) hasta que el administrador la apruebe. */
  D.solicitarAcceso = async function ({ nombre, correo, clave, motivo }) {
    if (!enNube) return { confirmar: false, demo: true };
    const { data, error } = await D.cliente.auth.signUp({
      email: correo, password: clave,
      options: { data: { nombre, motivo }, emailRedirectTo: location.origin + location.pathname },
    });
    if (error) {
      if (/already registered|already exists/i.test(error.message)) throw new Error("Ese correo ya tiene una cuenta. Use «Entrar» o pida al administrador que la apruebe.");
      if (/password/i.test(error.message)) throw new Error("La contraseña debe tener al menos 8 caracteres.");
      if (/signups not allowed|signup is disabled/i.test(error.message)) throw new Error("El registro está cerrado. Pida al administrador que le cree una cuenta.");
      throw new Error(error.message);
    }
    const confirmar = !data.session;
    if (data.session) await D.cliente.auth.signOut();
    return { confirmar };
  };

  D.salir = async function () { if (enNube) await D.cliente.auth.signOut(); };

  // ---------------------------------------------------------- mediciones
  D.cargarMediciones = async function () {
    if (!enNube) {
      if (!D._demo) D._demo = raiz.SON_DEMO.generar();
      return D._demo.slice();
    }
    const todas = [], bloque = 1000;
    for (let desde = 0; ; desde += bloque) {
      const data = exigir(await D.cliente.from("mediciones").select(COLUMNAS)
        .order("inicio_ms", { ascending: false }).range(desde, desde + bloque - 1));
      todas.push(...data);
      if (data.length < bloque) break;
    }
    return todas;
  };

  D.cargarSerie = async function (uuid) {
    if (!enNube) { const f = (D._demo || []).find((x) => x.uuid === uuid); return f ? f.serie_1s : ""; }
    const { data } = await D.cliente.from("mediciones").select("serie_1s").eq("uuid", uuid).maybeSingle();
    return data ? data.serie_1s || "" : "";
  };

  D.cargarInformes = async function () {
    if (!enNube) return [];
    return exigir(await D.cliente.from("informes").select("*").order("creado", { ascending: false }).limit(50));
  };

  // ------------------------------------------------- tiempo real: estado
  D.cargarVivos = async function () {
    if (!enNube) return [];
    return exigir(await D.cliente.from("vivo").select("*"));
  };

  D.cargarEventos = async function () {
    if (!enNube) { if (!D._demo) D._demo = raiz.SON_DEMO.generar(); return raiz.SON_DEMO.eventosDe(D._demo); }
    return exigir(await D.cliente.from("eventos").select("*").order("id", { ascending: false }).limit(500));
  };

  D.cargarPosiciones = async function (horas = 12) {
    if (!enNube) return [];
    const desde = new Date(Date.now() - horas * 3600000).toISOString();
    return exigir(await D.cliente.from("posiciones").select("dispositivo_id,proyecto,punto,latitud,longitud,nivel_dba,creado")
      .gte("creado", desde).order("creado", { ascending: true }).limit(8000));
  };

  // ------------------------------------------------------------ proyectos
  D.cargarProyectosMeta = async function () {
    if (!enNube) { if (!D._meta) D._meta = raiz.SON_DEMO.proyectosMeta(); return D._meta.slice(); }
    return exigir(await D.cliente.from("proyectos_meta").select("*"));
  };

  D.guardarProyectoMeta = async function (m) {
    const fila = { ...m, actualizado: new Date().toISOString() };
    if (!enNube) {
      D._meta = (D._meta || []).filter((x) => x.proyecto !== m.proyecto).concat([fila]);
      return fila;
    }
    exigir(await D.cliente.from("proyectos_meta").upsert(fila, { onConflict: "proyecto" }));
    return fila;
  };

  // ------------------------------------------------------------- accesos
  D.usuarios = async function () {
    if (!enNube) { if (!D._usuarios) D._usuarios = raiz.SON_DEMO.usuarios(); return D._usuarios.map((u) => ({ ...u })); }
    return exigir(await D.cliente.rpc("usuarios_acceso"));
  };

  D.asignarRol = async function (usuario, rol) {
    if (!enNube) {
      const u = (D._usuarios || []).find((x) => x.user_id === usuario);
      if (u) u.rol = rol || null;
      return;
    }
    exigir(await D.cliente.rpc("asignar_rol", { p_usuario: usuario, p_rol: rol || null }));
  };

  // --------------------------------------------------------------- fotos
  D.urlFotos = async function (rutas) {
    const ahora = Date.now(), salida = new Map(), faltan = [];
    for (const r of rutas) {
      const c = D._cacheFotos.get(r);
      if (c && c.vence > ahora) salida.set(r, c.url);
      else faltan.push(r);
    }
    if (!faltan.length) return salida;
    if (!enNube) {
      faltan.forEach((r) => {
        const uuid = r.replace(/^demo\//, "").replace(/\.jpg$/, "");
        const fila = (D._demo || []).find((x) => x.uuid === uuid);
        const url = raiz.SON_DEMO.fotoDemo(uuid, fila);
        D._cacheFotos.set(r, { url, vence: ahora + 3.6e6 }); salida.set(r, url);
      });
      return salida;
    }
    const { data, error } = await D.cliente.storage.from("fotos").createSignedUrls(faltan, 3600);
    if (!error && data) data.forEach((d) => {
      if (d.signedUrl) { D._cacheFotos.set(d.path, { url: d.signedUrl, vence: ahora + 3.3e6 }); salida.set(d.path, d.signedUrl); }
    });
    return salida;
  };

  D.urlInforme = async function (ruta) {
    if (!enNube) return null;
    const { data } = await D.cliente.storage.from("informes").createSignedUrl(ruta, 3600);
    return data ? data.signedUrl : null;
  };

  // ------------------------------------------------------------ tiempo real
  /* cb: { onMedicion, onVivo, onEvento, onInforme, onProyectoMeta, onEstado(texto, bueno) } */
  D.suscribir = function (cb) {
    if (!enNube) return iniciarSimulacion(cb);
    let conectado = false, ultimoEvento = 0, ultimaMedicion = 0;
    D._marcas = (ev, med) => { ultimoEvento = Math.max(ultimoEvento, ev || 0); ultimaMedicion = Math.max(ultimaMedicion, med || 0); };
    const canal = D.cliente.channel("sonomin-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "vivo" }, (p) => p.new && p.new.id && cb.onVivo(p.new))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mediciones" }, (p) => { ultimaMedicion = Math.max(ultimaMedicion, p.new.inicio_ms || 0); cb.onMedicion(p.new); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "eventos" }, (p) => { ultimoEvento = Math.max(ultimoEvento, p.new.id || 0); cb.onEvento && cb.onEvento(p.new); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "informes" }, (p) => cb.onInforme && cb.onInforme(p.new))
      .on("postgres_changes", { event: "*", schema: "public", table: "proyectos_meta" }, (p) => cb.onProyectoMeta && cb.onProyectoMeta(p.new && p.new.proyecto ? p.new : null, p.old))
      .subscribe((estado) => {
        conectado = estado === "SUBSCRIBED";
        if (conectado) cb.onEstado("En línea · tiempo real", true);
        else if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") cb.onEstado("Tiempo real interrumpido · reintentando", false);
        else if (estado === "CLOSED") cb.onEstado("Desconectado", false);
      });
    // Respaldo: el estado de los celulares se relee cada 15 s; si el canal cae, tambien eventos y mediciones nuevas.
    const respaldo = setInterval(async () => {
      try {
        const vivos = await D.cargarVivos();
        vivos.forEach((v) => cb.onVivo(v, true));
        if (!conectado) {
          const ev = exigir(await D.cliente.from("eventos").select("*").gt("id", ultimoEvento).order("id").limit(200));
          ev.forEach((e) => { ultimoEvento = Math.max(ultimoEvento, e.id); cb.onEvento && cb.onEvento(e); });
          const meds = exigir(await D.cliente.from("mediciones").select(COLUMNAS).gt("inicio_ms", ultimaMedicion).order("inicio_ms").limit(200));
          meds.forEach((m) => { ultimaMedicion = Math.max(ultimaMedicion, m.inicio_ms || 0); cb.onMedicion(m); });
        }
      } catch (e) { /* sin red: se reintenta en el siguiente ciclo */ }
    }, 15000);
    return () => { clearInterval(respaldo); D.cliente.removeChannel(canal); };
  };

  // ----------------------------------------------------- simulacion (demo)
  // Dos celulares imaginarios: uno camina por la planta (recorrido) y otro mide puntos fijos en interior mina.
  function iniciarSimulacion(cb) {
    const R = raiz.SON_DEMO;
    const r = R.azar((Date.now() & 0xffff) + 7);
    const P = Object.fromEntries(R.PUNTOS.map((p) => [p.p, p]));
    let idEv = 1e6;
    const ahoraIso = () => new Date().toISOString();
    const metros = (a, b) => { const dy = (a[0] - b[0]) * 110574, dx = (a[1] - b[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180); return Math.hypot(dx, dy); };
    const nivelEn = (ll, puntos) => {
      // suma energetica de las fuentes cercanas con atenuacion geometrica de 6 dB por duplicar la distancia
      let e = 0;
      puntos.forEach((p) => { const d = Math.max(8, metros(ll, R.latLonDe(p))); e += Math.pow(10, (p.base - 20 * Math.log10(d / 8)) / 10); });
      return 10 * Math.log10(e + Math.pow(10, 5.2));
    };
    const evento = (tipo, c, extra) => cb.onEvento({ id: ++idEv, creado: ahoraIso(), tipo, dispositivo_id: c.id, dispositivo: c.nombre, evaluador: c.evaluador,
      proyecto: c.proyecto, punto: c.punto, modo: c.modo, ambito: c.ambito, latitud: c.ll[0], longitud: c.ll[1], ...extra });

    function guardar(c, leqs, dur) {
      const leq = 10 * Math.log10(leqs.reduce((s, x) => s + Math.pow(10, x / 10), 0) / leqs.length);
      const uuid = "demo-vivo-" + Date.now().toString(16) + c.id;
      const fila = {
        uuid, proyecto: c.proyecto, proyecto_id: 1, modo: c.modo, recorrido_id: c.modo === "RECORRIDO" ? "demo-rec" : "", secuencia: c.seq, inicio_ms: Date.now() - dur * 1000,
        ambito: c.ambito, punto: c.punto, labor: "", fuente_ruido: c.fuente, este: 392000 + (c.ll[1] - R.latLonDe(R.PUNTOS[0])[1]) * 107000, norte: 8248000 + (c.ll[0] - R.latLonDe(R.PUNTOS[0])[0]) * 110574,
        cota: c.ambito === "INTERIOR" ? 4300 : 4312, tipo_cota: "msnm", zona_utm: "19S", latitud: c.ll[0], longitud: c.ll[1], origen_posicion: c.ambito === "INTERIOR" ? "PUNTO DE CONTROL" : "GPS",
        precision_m: c.ambito === "INTERIOR" ? null : 4, duracion_s: dur, leq_dba: +leq.toFixed(1), lmax_dba: +(Math.max(...leqs) + 2).toFixed(1), lmin_dba: +(Math.min(...leqs) - 1).toFixed(1),
        l10_dba: +(leq + 2).toFixed(1), l50_dba: +(leq - 0.4).toFixed(1), l90_dba: +(leq - 2.8).toFixed(1),
        zona_eca: "INDUSTRIAL", limite_ocupacional_dba: 85, horas_exposicion: 8, offset_cal_db: 108.4, calibrado: true, saturacion_pct: 0, fuente_audio: "UNPROCESSED",
        evaluador: c.evaluador, observacion: "", serie_1s: leqs.map((x) => x.toFixed(1)).join("|"), fotos: ["demo/" + uuid + ".jpg"],
      };
      D._demo.unshift(fila);
      cb.onMedicion(fila);
      evento("MEDICION", c, { nivel_dba: fila.leq_dba, medicion_uuid: uuid, detalle: "Medición guardada · " + dur + " s" });
      if (fila.leq_dba >= 85) evento("ALERTA_OCUPACIONAL", c, { nivel_dba: fila.leq_dba, medicion_uuid: uuid, detalle: "Leq igual o mayor al límite ocupacional de 85 dB(A)" });
    }

    // Celular 1: recorrido por la planta, guarda un tramo cada 20 s
    const ruta = ["P-02 Planta chancado", "P-04 Compresora", "P-06 Taller", "P-02 Planta chancado"].map((n) => R.latLonDe(P[n]));
    const fuentesPlanta = ["P-02 Planta chancado", "P-04 Compresora", "P-06 Taller"].map((n) => P[n]);
    const c1 = { id: "demo-cel-1", nombre: "Celular 1 · Samsung A54", evaluador: "Evaluador A (demo)", proyecto: "DEMO · Planta y talleres", modo: "RECORRIDO",
      ambito: "SUPERFICIE", punto: "Recorrido planta", fuente: "Varias", ll: ruta[0].slice(), tramo: 0, seq: 0, t: 0, fase: "descanso", leqs: [], todos: [], dist: 0 };
    // Celular 2: puntos fijos en interior mina, 40 s por punto
    const interior = ["I-01 Galería 4300", "I-02 Frente de perforación", "I-03 Cruce", "I-04 Chimenea"];
    const c2 = { id: "demo-cel-2", nombre: "Celular 2 · Motorola G84", evaluador: "Evaluador B (demo)", proyecto: "DEMO · Interior mina Nv 4300", modo: "PUNTUAL",
      ambito: "INTERIOR", punto: interior[0], fuente: "", ll: R.latLonDe(P[interior[0]]), i: 0, seq: 0, t: 0, fase: "descanso", leqs: [], nivel: 80 };

    const vivoDe = (c, nivel, extra) => ({ id: c.id, dispositivo: c.nombre, evaluador: c.evaluador, proyecto: c.proyecto, punto: c.punto, modo: c.modo, ambito: c.ambito,
      nivel_dba: nivel, latitud: c.ll[0], longitud: c.ll[1], precision_m: c.ambito === "INTERIOR" ? null : 4, ts: Date.now(), actualizado: ahoraIso(), calibrado: true, ...extra });

    cb.onEstado("Demostración · simulación en vivo", true);
    const id = setInterval(() => {
      // ---- celular 1 (recorrido)
      c1.t += 2;
      if (c1.fase === "descanso" && c1.t >= 6) {
        c1.fase = "midiendo"; c1.t = 0; c1.leqs = []; c1.todos = []; c1.tramo = 0; c1.dist = 0;
        evento("INICIO", c1, { nivel_dba: null, detalle: "Empezó a medir" });
      }
      if (c1.fase === "midiendo") {
        // avanza 2.6 m cada 2 s por la ruta
        let avance = 2.6, k = c1.segmento || 0;
        while (avance > 0 && k < ruta.length - 1) {
          const dest = ruta[k + 1], d = metros(c1.ll, dest);
          if (d <= avance) { c1.ll = dest.slice(); avance -= d; k++; }
          else { const f = avance / d; c1.ll = [c1.ll[0] + (dest[0] - c1.ll[0]) * f, c1.ll[1] + (dest[1] - c1.ll[1]) * f]; avance = 0; }
        }
        c1.segmento = k >= ruta.length - 1 ? 0 : k;
        c1.dist += 2.6;
        const nivel = nivelEn(c1.ll, fuentesPlanta) + R.normal(r) * 1.5;
        c1.leqs.push(nivel); c1.todos.push(nivel);
        const leqP = 10 * Math.log10(c1.todos.reduce((s, x) => s + Math.pow(10, x / 10), 0) / c1.todos.length);
        cb.onVivo(vivoDe(c1, nivel, { midiendo: true, leq_parcial: leqP, lmax_parcial: Math.max(...c1.todos), transcurrido_s: c1.t, objetivo_s: 0, tramos: c1.tramo, inicio_ms: Date.now() - c1.t * 1000 }));
        if (c1.t % 20 === 0) { c1.tramo++; c1.seq++; guardar(c1, c1.leqs, 20); c1.leqs = []; }
        if (c1.t >= 120) {
          c1.fase = "descanso"; c1.t = 0;
          cb.onVivo(vivoDe(c1, nivel, { midiendo: false, leq_parcial: leqP }));
          evento("FIN", c1, { nivel_dba: +leqP.toFixed(1), detalle: "Terminó de medir" });
        }
      }
      // ---- celular 2 (puntos fijos)
      c2.t += 2;
      if (c2.fase === "descanso" && c2.t >= 8) {
        c2.fase = "midiendo"; c2.t = 0; c2.leqs = []; c2.seq++;
        c2.i = (c2.i + 1) % interior.length; c2.punto = interior[c2.i]; c2.ll = R.latLonDe(P[c2.punto]); c2.nivel = P[c2.punto].base;
        evento("INICIO", c2, { nivel_dba: null, detalle: "Empezó a medir" });
      }
      if (c2.fase === "midiendo") {
        const base = P[c2.punto].base;
        c2.nivel = Math.max(45, base + (c2.nivel - base) * 0.6 + R.normal(r) * 2.5);
        c2.leqs.push(c2.nivel);
        const leqP = 10 * Math.log10(c2.leqs.reduce((s, x) => s + Math.pow(10, x / 10), 0) / c2.leqs.length);
        cb.onVivo(vivoDe(c2, c2.nivel, { midiendo: true, leq_parcial: leqP, lmax_parcial: Math.max(...c2.leqs), transcurrido_s: c2.t, objetivo_s: 40, tramos: 0, inicio_ms: Date.now() - c2.t * 1000 }));
        if (c2.t >= 40) {
          c2.fase = "descanso"; c2.t = 0;
          cb.onVivo(vivoDe(c2, c2.nivel, { midiendo: false, leq_parcial: leqP }));
          guardar(c2, c2.leqs, 40);
          evento("FIN", c2, { nivel_dba: +leqP.toFixed(1), detalle: "Terminó de medir" });
        }
      }
    }, 2000);
    return () => clearInterval(id);
  }

  D.enNube = enNube;
  raiz.SON_DATOS = D;
})(window);
