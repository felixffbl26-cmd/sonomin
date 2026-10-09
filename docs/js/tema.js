/* Aplica el tema guardado antes de dibujar la pagina (evita el destello claro al usar el tema oscuro). */
(function () {
  try {
    var t = localStorage.getItem("sonomin_tema");
    if (t === "claro" || t === "oscuro") document.documentElement.setAttribute("data-tema", t);
  } catch (e) { /* sin almacenamiento */ }
})();
