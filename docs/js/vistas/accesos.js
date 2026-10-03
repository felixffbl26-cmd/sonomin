/* Vista ACCESOS (solo administrador): aprobar solicitudes, cambiar roles, quitar accesos y ver equipos. */
(function (raiz) {
  "use strict";
  const { el, fechaHora } = raiz.SON_G;
  const U = raiz.SON_U, D = raiz.SON_DATOS;
  raiz.SON_VISTAS = raiz.SON_VISTAS || {};

  const ROLES = {
    lector: { t: "Lector", d: "Ve todo el tablero en tiempo real. No puede cambiar nada." },
    celular: { t: "Celular", d: "Cuenta para los teléfonos que miden: envía mediciones, fotos y nivel en vivo." },
    admin: { t: "Administrador", d: "Ve todo, aprueba accesos, edita los planes de proyecto y puede borrar." },
  };
  const fecha = (iso) => (iso ? fechaHora(Date.parse(iso)) : "nunca");

  function botonRol(u, rol, texto, alTerminar) {
    return el("button", { class: rol ? "boton" : "boton sec", type: "button", onclick: async (e) => {
      const b = e.currentTarget;
      if (!rol && b.dataset.confirmar !== "1") { b.dataset.confirmar = "1"; b.textContent = "¿Seguro? Pulse otra vez"; setTimeout(() => { b.dataset.confirmar = ""; b.textContent = texto; }, 4000); return; }
      b.disabled = true;
      try {
        await D.asignarRol(u.user_id, rol);
        raiz.SON_UI.aviso(rol ? (u.email + " ahora tiene acceso como " + ROLES[rol].t.toLowerCase() + ".") : ("Se quitó el acceso a " + u.email + "."), "info");
        alTerminar();
      } catch (ex) { raiz.SON_UI.aviso("No se pudo cambiar el acceso: " + ex.message, "grave"); b.disabled = false; }
    } }, texto);
  }

  async function cargar(cont, S) {
    cont.replaceChildren(el("div", { class: "tarjeta" }, el("p", { class: "mudo", texto: "Cargando usuarios…" })));
    let usuarios;
    try { usuarios = await D.usuarios(); }
    catch (e) { cont.replaceChildren(el("div", { class: "caja-aviso grave", texto: "No se pudo leer la lista de usuarios: " + e.message })); return; }
    const recargar = () => cargar(cont, S);
    const pendientes = usuarios.filter((u) => !u.rol), conAcceso = usuarios.filter((u) => u.rol);
    const enlace = location.origin + location.pathname;
    const nodo = el("div");

    nodo.appendChild(el("div", { class: "tarjeta" }, el("h2", { texto: "Cómo dar acceso a una persona" }),
      el("ol", { style: "margin:8px 0 0;padding-left:20px;font-size:14px" },
        el("li", null, "Envíele este enlace: ", el("code", { texto: enlace }), " ",
          el("button", { class: "boton sec", type: "button", style: "padding:3px 10px", onclick: async (e) => { try { await navigator.clipboard.writeText(enlace); e.target.textContent = "Copiado"; } catch (x) { e.target.textContent = "Cópielo a mano"; } } }, "Copiar")),
        el("li", { texto: "La persona pulsa «Solicitar acceso», escribe su nombre, correo y una contraseña, y confirma su correo." }),
        el("li", { texto: "Su solicitud aparece abajo. Usted elige si la aprueba como lector, celular o administrador. Desde ese momento entra y ve todo en tiempo real." })),
      el("div", { class: "chips", style: "margin-top:10px" }, Object.values(ROLES).map((r) => el("span", { class: "chip", title: r.d, texto: r.t + ": " + r.d })))));

    const cajaP = el("div", { class: "tarjeta seccion" }, el("h2", { texto: "Solicitudes pendientes (" + pendientes.length + ")" }));
    if (!pendientes.length) cajaP.appendChild(el("p", { class: "mudo", texto: "No hay solicitudes. Cuando alguien pida acceso aparecerá aquí." }));
    pendientes.forEach((u) => cajaP.appendChild(el("div", { style: "border-top:1px solid var(--rejilla);padding:10px 0" },
      el("div", { class: "fila", style: "justify-content:space-between" },
        el("div", null, el("b", { texto: u.nombre || "(sin nombre)" }), " · ", el("span", { texto: u.email }),
          el("div", { class: "mudo", style: "font-size:12.5px", texto: (u.motivo ? "Motivo: " + u.motivo + " · " : "") + "pidió acceso el " + fecha(u.creado) + (u.confirmado ? " · correo confirmado" : " · aún no confirma su correo") })),
        el("div", { class: "fila" }, botonRol(u, "lector", "Aprobar como lector", recargar), botonRol(u, "celular", "Como celular", recargar), botonRol(u, "admin", "Como administrador", recargar))))));
    if (pendientes.length) cajaP.appendChild(el("p", { class: "mudo", style: "font-size:12px", texto: "Si no aprueba a alguien, no ve nada aunque tenga cuenta. Para borrar la cuenta del todo use Supabase › Authentication › Users." }));
    nodo.appendChild(cajaP);

    const tabla = el("table", null,
      el("thead", null, el("tr", null, ["Persona", "Correo", "Rol", "Último ingreso", "Cambiar"].map((t) => el("th", { texto: t })))),
      el("tbody", null, conAcceso.map((u) => {
        const yo = D.usuarioId && u.user_id === D.usuarioId;
        const sel = el("select", { "aria-label": "Rol de " + u.email, disabled: yo ? true : null }, Object.entries(ROLES).map(([k, r]) => el("option", { value: k, texto: r.t, selected: u.rol === k ? true : null })));
        sel.addEventListener("change", async () => {
          try { await D.asignarRol(u.user_id, sel.value); raiz.SON_UI.aviso("Rol actualizado para " + u.email + ".", "info"); recargar(); }
          catch (ex) { raiz.SON_UI.aviso("No se pudo cambiar el rol: " + ex.message, "grave"); sel.value = u.rol; }
        });
        return el("tr", null, el("td", { texto: (u.nombre || "–") + (yo ? " (usted)" : "") }), el("td", { texto: u.email }), el("td", null, sel),
          el("td", { texto: fecha(u.ultimo_ingreso) }), el("td", null, yo ? el("span", { class: "mudo", texto: "–" }) : botonRol(u, null, "Quitar acceso", recargar)));
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
