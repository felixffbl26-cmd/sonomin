/* Vista ACCESOS (solo administrador): aprobar solicitudes, cambiar roles, asignar proyectos, quitar accesos y ver equipos.
 * La base de datos vuelve a verificar todo: aunque alguien manipule esta pagina, un lector o celular
 * solo puede leer los proyectos que tiene asignados. */
(function (raiz) {
  "use strict";
  const { el, fechaHora } = raiz.SON_G;
  const U = raiz.SON_U, D = raiz.SON_DATOS;
  raiz.SON_VISTAS = raiz.SON_VISTAS || {};

  const ROLES = {
    lector: { t: "Lector", d: "Ve en tiempo real solo los proyectos que usted le asigne. No puede cambiar nada ni ver usuarios." },
    celular: { t: "Celular", d: "Cuenta de los teléfonos que miden: envía mediciones, fotos y nivel en vivo; en la página ve sus proyectos asignados y lo que envió." },
    admin: { t: "Administrador", d: "Ve todos los proyectos, aprueba accesos, asigna proyectos, edita planes y maneja la papelera." },
  };
  const fecha = (iso) => (iso ? fechaHora(Date.parse(iso)) : "nunca");

  function botonRol(u, rol, texto, alTerminar) {
    return el("button", { class: rol && rol !== "admin" ? "boton" : "boton sec", type: "button", onclick: async (e) => {
      const b = e.currentTarget;
      if (!rol && b.dataset.confirmar !== "1") { b.dataset.confirmar = "1"; b.textContent = "¿Seguro? Pulse otra vez"; setTimeout(() => { b.dataset.confirmar = ""; b.textContent = texto; }, 4000); return; }
      b.disabled = true;
      try {
        await D.asignarRol(u.user_id, rol);
        raiz.SON_UI.aviso(rol ? (u.email + " ahora tiene acceso como " + ROLES[rol].t.toLowerCase() + ".") : ("Se quitó el acceso a " + u.email + "."), "info");
        alTerminar(rol && rol !== "admin" && !u.rol ? { ...u, rol } : null);
      } catch (ex) { raiz.SON_UI.aviso("No se pudo cambiar el acceso: " + ex.message, "grave"); b.disabled = false; }
    } }, texto);
  }

  /** Dialogo para elegir los proyectos que vera una persona. */
  function dialogoProyectos(u, S, alTerminar) {
    const elegidos = new Set(u.proyectos || []);
    const nombres = [...new Set(S.nombresProyectos().concat(u.proyectos || []))].sort();
    const lista = el("div", { class: "casillas" });
    const pintarLista = () => lista.replaceChildren(...(nombres.length ? nombres.map((n) => {
      const c = el("input", { type: "checkbox", checked: elegidos.has(n) ? true : null });
      c.addEventListener("change", () => { if (c.checked) elegidos.add(n); else elegidos.delete(n); });
      return el("label", null, c, el("span", { texto: n }));
    }) : [el("p", { class: "mudo", texto: "Todavía no hay proyectos con mediciones. Puede escribir el nombre exacto abajo." })]));
    pintarLista();
    const nuevo = el("input", { type: "text", placeholder: "Nombre exacto del proyecto (como lo escribe el celular)", maxlength: "120", style: "flex:1" });
    const agregar = el("button", { class: "boton sec", type: "button", onclick: () => {
      const n = nuevo.value.trim(); if (!n) return;
      if (!nombres.includes(n)) nombres.push(n);
      nombres.sort(); elegidos.add(n); nuevo.value = ""; pintarLista();
    } }, "Agregar");
    const guardar = el("button", { class: "boton", type: "button", onclick: async () => {
      guardar.disabled = true;
      try {
        await D.asignarProyectos(u.user_id, [...elegidos]);
        raiz.SON_UI.aviso(elegidos.size ? u.email + " ahora ve " + elegidos.size + (elegidos.size === 1 ? " proyecto." : " proyectos.") : u.email + " no ve ningún proyecto.", "info");
        raiz.SON_UI.cerrarDialogo(); alTerminar();
      } catch (ex) { raiz.SON_UI.aviso("No se pudo guardar: " + ex.message, "grave"); guardar.disabled = false; }
    } }, "Guardar proyectos");
    raiz.SON_UI.dialogo("Proyectos que ve " + (u.nombre || u.email), el("div", null,
      el("p", { texto: (u.rol === "celular" ? "El celular puede enviar mediciones de cualquier proyecto (no se pierde ningún dato de campo), pero en la página solo verá estos proyectos y lo que él mismo envió." : "Solo verá mediciones, mapa, estadística, pronóstico e informes de estos proyectos.") + " Los cambios quedan en el registro de auditoría." }),
      el("div", { class: "tarjeta", style: "margin:10px 0" }, lista),
      el("div", { class: "fila" }, nuevo, agregar),
      el("div", { class: "fila", style: "margin-top:14px;justify-content:flex-end" }, el("button", { class: "boton sec", type: "button", onclick: () => raiz.SON_UI.cerrarDialogo() }, "Cancelar"), guardar)));
  }

  function chipsProyectos(u) {
    if (u.rol === "admin") return el("span", { class: "chip activo", texto: "Todos (administrador)" });
    const p = u.proyectos || [];
    return p.length ? el("div", { class: "chips" }, p.map((n) => el("span", { class: "chip", texto: n }))) : el("span", { class: "c-PRECAUCION", style: "font-weight:700;font-size:13px", texto: "Ninguno: no ve datos" });
  }

  async function cargar(cont, S) {
    cont.replaceChildren(el("div", { class: "tarjeta" }, el("p", { class: "mudo", texto: "Cargando usuarios…" })));
    let usuarios;
    try { usuarios = await D.usuarios(); }
    catch (e) { cont.replaceChildren(el("div", { class: "caja-aviso grave", texto: "No se pudo leer la lista de usuarios: " + e.message })); return; }
    const recargar = (asignarA) => { cargar(cont, S); if (asignarA) dialogoProyectos(asignarA, S, () => cargar(cont, S)); };
    const pendientes = usuarios.filter((u) => !u.rol), conAcceso = usuarios.filter((u) => u.rol);
    const enlace = location.origin + location.pathname;
    const nodo = el("div");

    nodo.appendChild(el("div", { class: "tarjeta" }, el("h2", { texto: "Cómo dar acceso a una persona" }),
      el("ol", { style: "margin:8px 0 0;padding-left:20px;font-size:14px" },
        el("li", null, "Envíele este enlace: ", el("code", { texto: enlace }), " ",
          el("button", { class: "boton sec", type: "button", style: "padding:3px 10px", onclick: async (e) => { try { await navigator.clipboard.writeText(enlace); e.target.textContent = "Copiado"; } catch (x) { e.target.textContent = "Cópielo a mano"; } } }, "Copiar")),
        el("li", { texto: "La persona pulsa «Solicitar acceso», escribe su nombre, correo y una contraseña, y confirma su correo." }),
        el("li", { texto: "Su solicitud aparece abajo. Usted elige el rol (lector, celular o administrador)." }),
        el("li", { texto: "Si es lector o celular, le asigna los proyectos que podrá ver. Sin proyectos asignados no ve ningún dato. El administrador ve todo." })),
      el("div", { class: "chips", style: "margin-top:10px" }, Object.values(ROLES).map((r) => el("span", { class: "chip", title: r.d, texto: r.t + ": " + r.d })))));

    const cajaP = el("div", { class: "tarjeta seccion" }, el("h2", { texto: "Solicitudes pendientes (" + pendientes.length + ")" }));
    if (!pendientes.length) cajaP.appendChild(el("p", { class: "mudo", texto: "No hay solicitudes. Cuando alguien pida acceso aparecerá aquí." }));
    pendientes.forEach((u) => cajaP.appendChild(el("div", { style: "border-top:1px solid var(--rejilla);padding:10px 0" },
      el("div", { class: "fila", style: "justify-content:space-between" },
        el("div", null, el("b", { texto: u.nombre || "(sin nombre)" }), " · ", el("span", { texto: u.email }),
          el("div", { class: "mudo", style: "font-size:12.5px", texto: (u.motivo ? "Motivo: " + u.motivo + " · " : "") + "pidió acceso el " + fecha(u.creado) + (u.confirmado ? " · correo confirmado" : " · aún no confirma su correo") })),
        el("div", { class: "fila" }, botonRol(u, "lector", "Aprobar como lector", recargar), botonRol(u, "celular", "Como celular", recargar), botonRol(u, "admin", "Como administrador", recargar))))));
    if (pendientes.length) cajaP.appendChild(el("p", { class: "mudo", style: "font-size:12px", texto: "Si no aprueba a alguien, no ve nada aunque tenga cuenta. Para borrar una cuenta del todo: supabase.com › proyecto SONOMIN › Authentication › Users › ⋯ › Delete user." }));
    nodo.appendChild(cajaP);

    const tabla = el("table", null,
      el("thead", null, el("tr", null, ["Persona", "Correo", "Rol", "Proyectos que ve", "Último ingreso", "Cambiar"].map((t) => el("th", { texto: t })))),
      el("tbody", null, conAcceso.map((u) => {
        const yo = D.usuarioId && u.user_id === D.usuarioId;
        const sel = el("select", { "aria-label": "Rol de " + u.email, disabled: yo ? true : null }, Object.entries(ROLES).map(([k, r]) => el("option", { value: k, texto: r.t, selected: u.rol === k ? true : null })));
        sel.addEventListener("change", async () => {
          try { await D.asignarRol(u.user_id, sel.value); raiz.SON_UI.aviso("Rol actualizado para " + u.email + ".", "info"); recargar(); }
          catch (ex) { raiz.SON_UI.aviso("No se pudo cambiar el rol: " + ex.message, "grave"); sel.value = u.rol; }
        });
        const botonProy = u.rol === "admin" ? null : el("button", { class: "boton sec", type: "button", style: "padding:4px 10px;margin-top:6px;font-size:13px", onclick: () => dialogoProyectos(u, S, recargar) }, "Asignar proyectos");
        return el("tr", null, el("td", { texto: (u.nombre || "–") + (yo ? " (usted)" : "") }), el("td", { texto: u.email }), el("td", null, sel),
          el("td", null, chipsProyectos(u), botonProy), el("td", { texto: fecha(u.ultimo_ingreso) }), el("td", null, yo ? el("span", { class: "mudo", texto: "–" }) : botonRol(u, null, "Quitar acceso", recargar)));
      })));
    nodo.appendChild(el("div", { class: "tarjeta seccion" }, el("h2", { texto: "Personas con acceso (" + conAcceso.length + ")" }), el("div", { class: "tabla-caja" }, tabla)));

    const equipos = [...S.vivos.values()].sort((a, b) => Date.parse(b.actualizado || 0) - Date.parse(a.actualizado || 0));
    nodo.appendChild(el("div", { class: "tarjeta seccion" }, el("h2", { texto: "Celulares que han enviado datos (" + equipos.length + ")" }),
      equipos.length ? el("div", { class: "tabla-caja" }, el("table", null,
        el("thead", null, el("tr", null, ["Equipo", "Evaluador", "Último proyecto", "Último punto", "Último dato"].map((t) => el("th", { texto: t })))),
        el("tbody", null, equipos.map((v) => el("tr", null, el("td", { texto: v.dispositivo || v.id }), el("td", { texto: v.evaluador || "–" }), el("td", { texto: v.proyecto || "–" }),
          el("td", { texto: v.punto || "–" }), el("td", { texto: v.actualizado ? fecha(v.actualizado) + " (" + U.hace(Date.parse(v.actualizado)) + ")" : "–" }))))))
        : el("p", { class: "mudo", texto: "Ningún celular ha enviado datos todavía." })));

    if (!D.enNube) nodo.prepend(el("div", { class: "caja-aviso info", texto: "Modo demostración: los usuarios son de ejemplo y los cambios no se guardan." }));
    cont.replaceChildren(nodo);
  }

  raiz.SON_VISTAS.accesos = { render: (cont, S) => { cargar(cont, S); } };
})(window);
