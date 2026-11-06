/* =====================================================
   PANEL DE ADMINISTRACIÓN
===================================================== */

const $ = (id) => document.getElementById(id);

/* ---------- Utilidades ---------- */

function esc(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pesos(valor) {
  return "$" + Number(valor || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function fecha(valor) {
  return new Date(valor).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

function aviso(mensaje, tipo = "ok") {
  const caja = document.querySelector(".aviso");
  /* Si hay un diálogo abierto, el aviso va adentro para que se vea encima */
  (document.querySelector("dialog[open]") || document.body).appendChild(caja);
  caja.textContent = mensaje;
  caja.dataset.tipo = tipo;
  caja.classList.add("visible");
  clearTimeout(caja._timer);
  caja._timer = setTimeout(() => caja.classList.remove("visible"), 3500);
}

async function api(ruta, opciones = {}) {
  const config = { method: opciones.method || "GET", headers: {}, credentials: "same-origin" };

  if (opciones.body !== undefined) {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(opciones.body);
  }

  const respuesta = await fetch("/api" + ruta, config);
  const datos = await respuesta.json().catch(() => ({}));

  /* Sesión vencida: volvemos al login */
  if (respuesta.status === 401 && ruta !== "/admin/login") {
    mostrarLogin();
    throw new Error(datos.error || "Tu sesión venció.");
  }

  if (!respuesta.ok) throw new Error(datos.error || "Ocurrió un error.");
  return datos;
}

/* Cerrar cualquier diálogo con su botón ✕ */
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-cerrar]")) e.target.closest("dialog").close();
});

/* =====================================================
   LOGIN
===================================================== */

function mostrarLogin() {
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  $("vista-panel").hidden = true;
  $("vista-login").hidden = false;
}

function mostrarPanel() {
  $("vista-login").hidden = true;
  $("vista-panel").hidden = false;
  cargarCategorias().then(cargarProductos).catch((e) => aviso(e.message, "error"));
  /* Solo para mostrar cuántas solicitudes de arrepentimiento faltan atender */
  api("/admin/arrepentimientos?estado=recibida").then(pintarContadorArrepentimientos).catch(() => {});
}

$("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("error-login").textContent = "";

  try {
    await api("/admin/login", { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
    e.target.reset();
    mostrarPanel();
  } catch (error) {
    $("error-login").textContent = error.message;
  }
});

$("salir").addEventListener("click", async () => {
  await api("/admin/logout", { method: "POST" }).catch(() => {});
  mostrarLogin();
});

/* ---------- Pestañas ---------- */

document.querySelector(".pestanas").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-pestana]");
  if (!boton) return;

  document.querySelectorAll(".pestanas button").forEach((b) => b.classList.toggle("activo", b === boton));
  document.querySelectorAll("[data-vista]").forEach((v) => (v.hidden = v.dataset.vista !== boton.dataset.pestana));

  if (boton.dataset.pestana === "productos") cargarProductos();
  if (boton.dataset.pestana === "pedidos") cargarPedidos();
  if (boton.dataset.pestana === "categorias") cargarCategorias();
  if (boton.dataset.pestana === "arrepentimientos") cargarArrepentimientos();
});

/* =====================================================
   CATEGORÍAS
===================================================== */

let categorias = [];

function nombreCategoria(idCategoria) {
  const cat = categorias.find((x) => x.id === idCategoria);
  if (!cat) return "";
  const padre = categorias.find((x) => x.id === cat.padre_id);
  return padre ? `${padre.nombre} › ${cat.nombre}` : cat.nombre;
}

async function cargarCategorias() {
  categorias = await api("/admin/categorias");

  const principales = categorias.filter((c) => !c.padre_id);

  $("select-padre").innerHTML =
    `<option value="">(Categoría principal)</option>` +
    principales.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join("");

  /* Select del editor de productos: principales y subcategorías */
  $("select-categoria").innerHTML =
    `<option value="">Sin categoría</option>` +
    principales
      .map((c) => {
        const hijas = categorias.filter((h) => h.padre_id === c.id);
        return `<option value="${c.id}">${esc(c.nombre)}</option>` +
          hijas.map((h) => `<option value="${h.id}">&nbsp;&nbsp;↳ ${esc(h.nombre)}</option>`).join("");
      })
      .join("");

  $("lista-categorias").innerHTML = categorias
    .map(
      (c) => `
      <tr>
        <td>${c.padre_id ? "↳ " : ""}<strong>${esc(c.nombre)}</strong></td>
        <td>${esc(nombreCategoria(c.padre_id) || "—")}</td>
        <td>${c.orden}</td>
        <td>${c.productos}</td>
        <td><button type="button" class="estado ${c.activo ? "estado-entregado" : "estado-inactivo"}"
              data-alternar-cat="${c.id}">${c.activo ? "Visible" : "Oculta"}</button></td>
        <td><button type="button" class="link-quitar" data-renombrar-cat="${c.id}">Renombrar</button>
            <button type="button" class="link-quitar" data-borrar-cat="${c.id}">Borrar</button></td>
      </tr>`
    )
    .join("");
}

$("form-categoria").addEventListener("submit", async (e) => {
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(e.target));

  try {
    await api("/admin/categorias", { method: "POST", body: datos });
    e.target.reset();
    aviso("Categoría creada.");
    cargarCategorias();
  } catch (error) {
    aviso(error.message, "error");
  }
});

$("lista-categorias").addEventListener("click", async (e) => {
  const boton = e.target.closest("[data-alternar-cat], [data-renombrar-cat], [data-borrar-cat]");
  if (!boton) return;

  const { alternarCat, renombrarCat, borrarCat } = boton.dataset;
  const id = Number(alternarCat || renombrarCat || borrarCat);
  const cat = categorias.find((x) => x.id === id);
  if (!cat) return;

  try {
    if (borrarCat) {
      if (!confirm(`¿Borrar la categoría "${cat.nombre}"?`)) return;
      await api(`/admin/categorias/${id}`, { method: "DELETE" });
    } else {
      const nombre = renombrarCat ? prompt("Nuevo nombre:", cat.nombre) : cat.nombre;
      if (!nombre) return;

      await api(`/admin/categorias/${id}`, {
        method: "PUT",
        body: {
          nombre,
          padre_id: cat.padre_id,
          orden: cat.orden,
          /* Al renombrar se regenera la URL; al ocultar/mostrar se mantiene */
          slug: renombrarCat ? "" : cat.slug,
          activo: alternarCat ? !cat.activo : cat.activo
        }
      });
    }

    aviso("Listo.");
    cargarCategorias();
  } catch (error) {
    aviso(error.message, "error");
  }
});

/* =====================================================
   PRODUCTOS
===================================================== */

async function cargarProductos() {
  const buscar = $("buscar-producto").value.trim();
  const productos = await api(`/admin/productos${buscar ? `?buscar=${encodeURIComponent(buscar)}` : ""}`);

  $("lista-productos").innerHTML = productos.length
    ? productos
        .map(
          (p) => `
      <tr class="clickeable" data-producto="${p.id}">
        <td>${p.imagen ? `<img src="${esc(p.imagen)}" alt="">` : ""}</td>
        <td><strong>${esc(p.nombre)}</strong>${p.destacado ? " ★" : ""}<br><small>${p.variantes} variantes</small></td>
        <td>${esc(p.categoria || "—")}</td>
        <td>${p.precio_oferta ? `${pesos(p.precio_oferta)} <s>${pesos(p.precio)}</s>` : pesos(p.precio)}</td>
        <td>${p.stock_total === 0 ? `<span class="texto-error">0</span>` : p.stock_total}</td>
        <td><span class="estado ${p.activo ? "estado-entregado" : "estado-inactivo"}">${p.activo ? "Visible" : "Oculto"}</span></td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="6" class="vacio">No hay productos.</td></tr>`;
}

let temporizadorBusqueda;
$("buscar-producto").addEventListener("input", () => {
  clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = setTimeout(() => cargarProductos().catch((e) => aviso(e.message, "error")), 300);
});

$("lista-productos").addEventListener("click", (e) => {
  const fila = e.target.closest("[data-producto]");
  if (fila) abrirEditor(Number(fila.dataset.producto));
});

$("nuevo-producto").addEventListener("click", () => abrirEditor(null));

/* ---------- Editor ---------- */

let productoEditando = null;

function filaImagen(img = { url: "", color: "" }) {
  return `
    <div class="fila-imagen">
      ${img.url ? `<img src="${esc(img.url)}" alt="">` : "<span></span>"}
      <input name="img-url" placeholder="https://..." value="${esc(img.url)}">
      <input name="img-color" placeholder="Color (opcional)" value="${esc(img.color || "")}">
      <button type="button" class="link-quitar" data-quitar-fila>Quitar</button>
    </div>`;
}

function filaColor(color = { nombre: "", hex: "#cccccc" }) {
  return `
    <div class="fila-color">
      <input name="color-nombre" placeholder="Ej: Negro" value="${esc(color.nombre)}">
      <input name="color-hex" type="color" value="${esc(color.hex)}">
      <button type="button" class="link-quitar" data-quitar-fila>✕</button>
    </div>`;
}

function pintarImagenes(imagenes) {
  $("lista-imagenes").innerHTML = (imagenes.length ? imagenes : [{ url: "" }]).map(filaImagen).join("");
}

function pintarVariantes() {
  const variantes = productoEditando?.variantes || [];

  $("lista-variantes").innerHTML = variantes.length
    ? variantes
        .map(
          (v) => `
      <tr data-variante="${v.id}">
        <td><span class="punto-color" style="background:${esc(v.color_hex)}"></span>${esc(v.color)}</td>
        <td>${esc(v.talle)}</td>
        <td><input name="sku" value="${esc(v.sku || "")}" placeholder="SKU"></td>
        <td><input name="stock" type="number" min="0" value="${v.stock}"></td>
        <td><input name="activo" type="checkbox" ${v.activo ? "checked" : ""}></td>
        <td><button type="button" class="boton boton-chico" data-guardar-variante>Guardar</button>
            <button type="button" class="link-quitar" data-borrar-variante>Borrar</button></td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="6" class="vacio">Todavía no hay talles ni colores. Creálos arriba.</td></tr>`;
}

async function abrirEditor(id) {
  const form = $("form-producto");
  form.reset();
  $("error-producto").textContent = "";
  productoEditando = null;

  if (id) {
    try {
      productoEditando = await api(`/admin/productos/${id}`);
    } catch (error) {
      return aviso(error.message, "error");
    }
  }

  const p = productoEditando || { activo: true, imagenes: [] };

  $("titulo-editor").textContent = id ? "Editar producto" : "Nuevo producto";
  form.nombre.value = p.nombre || "";
  form.categoria_id.value = p.categoria_id || "";
  form.marca.value = p.marca || "";
  form.precio.value = p.precio || "";
  form.precio_oferta.value = p.precio_oferta || "";
  form.descripcion.value = p.descripcion || "";
  form.destacado.checked = Boolean(p.destacado);
  form.activo.checked = p.activo !== false;

  pintarImagenes(p.imagenes);
  $("colores-generar").innerHTML = filaColor();
  $("borrar-producto").hidden = !id;
  $("seccion-variantes").hidden = !id;
  pintarVariantes();

  $("editor").showModal();
}

$("agregar-imagen").addEventListener("click", () => {
  $("lista-imagenes").insertAdjacentHTML("beforeend", filaImagen());
});

$("agregar-color").addEventListener("click", () => {
  $("colores-generar").insertAdjacentHTML("beforeend", filaColor());
});

$("editor").addEventListener("click", (e) => {
  if (e.target.closest("[data-quitar-fila]")) e.target.closest(".fila-imagen, .fila-color").remove();
});

$("form-producto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  const imagenes = [...document.querySelectorAll("#lista-imagenes .fila-imagen")]
    .map((fila) => ({
      url: fila.querySelector("[name=img-url]").value.trim(),
      color: fila.querySelector("[name=img-color]").value.trim()
    }))
    .filter((img) => img.url);

  const datos = {
    nombre: form.nombre.value,
    categoria_id: form.categoria_id.value || null,
    marca: form.marca.value,
    precio: form.precio.value,
    precio_oferta: form.precio_oferta.value,
    descripcion: form.descripcion.value,
    destacado: form.destacado.checked,
    activo: form.activo.checked,
    imagenes
  };

  try {
    const editando = Boolean(productoEditando);
    productoEditando = await api(editando ? `/admin/productos/${productoEditando.id}` : "/admin/productos", {
      method: editando ? "PUT" : "POST",
      body: datos
    });

    aviso(editando ? "Producto guardado." : "Producto creado. Ahora cargá talles y colores.");
    $("titulo-editor").textContent = "Editar producto";
    $("borrar-producto").hidden = false;
    $("seccion-variantes").hidden = false;
    pintarImagenes(productoEditando.imagenes);
    pintarVariantes();
    cargarProductos();
  } catch (error) {
    $("error-producto").textContent = error.message;
  }
});

$("borrar-producto").addEventListener("click", async () => {
  if (!productoEditando) return;
  if (!confirm(`¿Borrar "${productoEditando.nombre}"? Esta acción no se puede deshacer.\n\nSi solo querés ocultarlo, destildá "Visible en la tienda".`)) return;

  try {
    await api(`/admin/productos/${productoEditando.id}`, { method: "DELETE" });
    $("editor").close();
    aviso("Producto borrado.");
    cargarProductos();
  } catch (error) {
    aviso(error.message, "error");
  }
});

/* ---------- Variantes ---------- */

$("form-generar").addEventListener("submit", async (e) => {
  e.preventDefault();

  const talles = e.target.talles.value.split(",").map((t) => t.trim()).filter(Boolean);
  const colores = [...document.querySelectorAll("#colores-generar .fila-color")]
    .map((fila) => ({
      nombre: fila.querySelector("[name=color-nombre]").value.trim(),
      hex: fila.querySelector("[name=color-hex]").value
    }))
    .filter((c) => c.nombre);

  try {
    const r = await api(`/admin/productos/${productoEditando.id}/variantes`, {
      method: "POST",
      body: { talles, colores, stock: e.target.stock.value }
    });

    productoEditando = r.producto;
    pintarVariantes();
    aviso(r.creadas ? `Se crearon ${r.creadas} combinaciones.` : "Esas combinaciones ya existían.");
    e.target.talles.value = "";
    $("colores-generar").innerHTML = filaColor();
    cargarProductos();
  } catch (error) {
    aviso(error.message, "error");
  }
});

$("lista-variantes").addEventListener("click", async (e) => {
  const fila = e.target.closest("[data-variante]");
  if (!fila) return;
  const id = fila.dataset.variante;

  try {
    if (e.target.closest("[data-guardar-variante]")) {
      const actualizada = await api(`/admin/variantes/${id}`, {
        method: "PUT",
        body: {
          stock: Number(fila.querySelector("[name=stock]").value),
          sku: fila.querySelector("[name=sku]").value,
          activo: fila.querySelector("[name=activo]").checked
        }
      });
      Object.assign(productoEditando.variantes.find((v) => String(v.id) === id), actualizada);
      aviso("Stock actualizado.");
      cargarProductos();
    }

    if (e.target.closest("[data-borrar-variante]")) {
      if (!confirm("¿Borrar esta combinación de talle y color?")) return;
      await api(`/admin/variantes/${id}`, { method: "DELETE" });
      productoEditando.variantes = productoEditando.variantes.filter((v) => String(v.id) !== id);
      pintarVariantes();
      cargarProductos();
    }
  } catch (error) {
    aviso(error.message, "error");
  }
});

/* =====================================================
   PEDIDOS
===================================================== */

const ACCIONES = {
  envio: [["preparando", "Preparando"], ["enviado", "Enviado"], ["entregado", "Entregado"], ["cancelado", "Cancelar pedido"]],
  retiro: [["preparando", "Preparando"], ["listo_retiro", "Listo para retirar"], ["entregado", "Entregado"], ["cancelado", "Cancelar pedido"]]
};

const PAGADOS = ["pagado", "preparando", "enviado", "listo_retiro", "entregado"];

async function cargarPedidos() {
  const filtro = $("filtro-pedidos").value;
  const consulta = filtro === "revision" ? "?estado=todos&revision=1" : filtro ? `?estado=${filtro}` : "";

  try {
    const pedidos = await api(`/admin/pedidos${consulta}`);

    $("lista-pedidos").innerHTML = pedidos.length
      ? pedidos
          .map(
            (o) => `
        <tr class="clickeable ${o.requiere_revision ? "fila-alerta" : ""}" data-pedido="${o.id}">
          <td><strong>#${o.id}</strong>${o.requiere_revision ? " ⚠️" : ""}</td>
          <td>${fecha(o.creado_en)}</td>
          <td>${esc(o.nombre)}<br><small>${esc(o.email)}</small></td>
          <td>${o.metodo_entrega === "retiro" ? "Retiro" : esc(`${o.ciudad}, ${o.provincia}`)}</td>
          <td>${o.unidades}</td>
          <td>${pesos(o.total)}</td>
          <td><span class="estado estado-${o.estado}">${esc(o.estado_texto)}</span></td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="7" class="vacio">No hay pedidos.</td></tr>`;
  } catch (error) {
    aviso(error.message, "error");
  }
}

$("filtro-pedidos").addEventListener("change", cargarPedidos);
$("recargar-pedidos").addEventListener("click", cargarPedidos);

$("lista-pedidos").addEventListener("click", (e) => {
  const fila = e.target.closest("[data-pedido]");
  if (fila) abrirPedido(Number(fila.dataset.pedido));
});

async function abrirPedido(id) {
  let o;
  try {
    o = await api(`/admin/pedidos/${id}`);
  } catch (error) {
    return aviso(error.message, "error");
  }

  $("titulo-pedido").textContent = `Pedido #${o.id} · ${o.estado_texto}`;

  const entrega = o.metodo_entrega === "retiro"
    ? "Retiro en local"
    : `${esc(o.direccion)}<br>${esc(o.ciudad)}, ${esc(o.provincia)} (${esc(o.codigo_postal)})`;

  const items = o.items
    .map((i) => `<tr><td>${esc(i.nombre_producto)}</td><td>${esc(i.color)}</td><td>${esc(i.talle)}</td><td>${i.cantidad}</td><td>${pesos(i.precio_unitario * i.cantidad)}</td></tr>`)
    .join("");

  const pagado = PAGADOS.includes(o.estado);
  const acciones = o.estado === "cancelado"
    ? ""
    : (pagado ? ACCIONES[o.metodo_entrega] : [["cancelado", "Cancelar pedido"]])
        .filter(([valor]) => valor !== o.estado)
        .map(([valor, texto]) => `<option value="${valor}">${texto}</option>`)
        .join("");

  $("contenido-pedido").innerHTML = `
    ${o.requiere_revision ? `
      <div class="alerta-revision">
        <strong>⚠️ Requiere revisión:</strong> ${esc(o.nota_revision || "")}
        <br><button type="button" class="link-quitar" id="marcar-revisado">Marcar como revisado</button>
      </div>` : ""}

    <div class="datos-pedido">
      <div>
        <strong>Cliente</strong><br>
        ${esc(o.nombre)}<br>${esc(o.email)}<br>${esc(o.telefono)}<br>DNI/CUIT: ${esc(o.dni)}
      </div>
      <div>
        <strong>Entrega</strong><br>${entrega}
        ${o.notas ? `<br><em>Nota: ${esc(o.notas)}</em>` : ""}
        ${o.codigo_seguimiento ? `<br>Seguimiento: <strong>${esc(o.codigo_seguimiento)}</strong>` : ""}
      </div>
    </div>

    <table class="tabla">
      <thead><tr><th>Producto</th><th>Color</th><th>Talle</th><th>Cant.</th><th>Subtotal</th></tr></thead>
      <tbody>${items}</tbody>
    </table>
    <p>Envío: ${pesos(o.costo_envio)} · <strong>Total: ${pesos(o.total)}</strong>
       ${o.mp_payment_id ? ` · Pago MP: ${esc(o.mp_payment_id)}` : ""}</p>

    ${acciones ? `
      <form class="acciones-pedido" id="form-estado">
        <label class="campo">Cambiar estado
          <select name="estado">${acciones}</select>
        </label>
        <label class="campo">Código de seguimiento (opcional)
          <input name="codigo_seguimiento" value="${esc(o.codigo_seguimiento || "")}">
        </label>
        <button class="boton boton-chico" type="submit">Actualizar</button>
      </form>` : ""}`;

  $("form-estado")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.target));

    if (datos.estado === "cancelado" &&
        !confirm("¿Cancelar el pedido? Si estaba pagado, el stock vuelve al inventario (el reintegro del dinero se hace desde Mercado Pago).")) {
      return;
    }

    try {
      const r = await api(`/admin/pedidos/${id}/estado`, { method: "PATCH", body: datos });
      aviso(r.mensaje);
      cargarPedidos();
      abrirPedido(id);
    } catch (error) {
      aviso(error.message, "error");
    }
  });

  $("marcar-revisado")?.addEventListener("click", async () => {
    await api(`/admin/pedidos/${id}/revisado`, { method: "PATCH" }).catch((err) => aviso(err.message, "error"));
    cargarPedidos();
    abrirPedido(id);
  });

  if (!$("detalle-pedido").open) $("detalle-pedido").showModal();
}

/* =====================================================
   BOTÓN DE ARREPENTIMIENTO
===================================================== */

const ESTADOS_ARREPENTIMIENTO = {
  recibida: "Recibida",
  en_proceso: "En proceso",
  resuelta: "Resuelta"
};

/* Días corridos desde que llegó la solicitud */
function diasDesde(valor) {
  return Math.floor((Date.now() - new Date(valor).getTime()) / 86400000);
}

function pintarContadorArrepentimientos({ sin_atender }) {
  const contador = $("contador-arrepentimientos");
  contador.textContent = sin_atender;
  contador.hidden = !sin_atender;
}

async function cargarArrepentimientos() {
  const filtro = $("filtro-arrepentimientos").value;

  try {
    const datos = await api(`/admin/arrepentimientos?estado=${encodeURIComponent(filtro)}`);
    pintarContadorArrepentimientos(datos);

    $("lista-arrepentimientos").innerHTML = datos.solicitudes.length
      ? datos.solicitudes
          .map((s) => {
            const dias = diasDesde(s.creado_en);
            const opciones = Object.entries(ESTADOS_ARREPENTIMIENTO)
              .map(([valor, texto]) => `<option value="${valor}" ${valor === s.estado ? "selected" : ""}>${texto}</option>`)
              .join("");

            return `
        <tr class="${s.estado === "recibida" ? "fila-alerta" : ""}">
          <td><strong>${esc(s.codigo)}</strong></td>
          <td>${fecha(s.creado_en)}<br><small>hace ${dias} día${dias === 1 ? "" : "s"}</small></td>
          <td>${esc(s.nombre)}<br><small><a href="mailto:${encodeURIComponent(s.email)}">${esc(s.email)}</a></small></td>
          <td>
            ${s.orden_id
              ? `<button type="button" class="link-quitar" data-ver-pedido="${s.orden_id}">#${s.orden_id}</button><br><small>Coincide</small>`
              : `${esc(s.numero_pedido)}<br><small class="texto-error">No coincide con el email</small>`}
          </td>
          <td>${s.motivo ? esc(s.motivo) : "<small>—</small>"}</td>
          <td>
            <select data-arrepentimiento="${s.id}" aria-label="Estado de la solicitud ${esc(s.codigo)}">${opciones}</select>
          </td>
        </tr>`;
          })
          .join("")
      : `<tr><td colspan="6" class="vacio">No hay solicitudes.</td></tr>`;
  } catch (error) {
    aviso(error.message, "error");
  }
}

$("filtro-arrepentimientos").addEventListener("change", cargarArrepentimientos);
$("recargar-arrepentimientos").addEventListener("click", cargarArrepentimientos);

$("lista-arrepentimientos").addEventListener("change", async (e) => {
  const select = e.target.closest("[data-arrepentimiento]");
  if (!select) return;

  select.disabled = true;
  try {
    const r = await api(`/admin/arrepentimientos/${select.dataset.arrepentimiento}/estado`, {
      method: "PATCH",
      body: { estado: select.value }
    });
    aviso(`Solicitud marcada como "${r.estado_texto}".`);
    cargarArrepentimientos();
  } catch (error) {
    aviso(error.message, "error");
    select.disabled = false;
  }
});

$("lista-arrepentimientos").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-ver-pedido]");
  if (boton) abrirPedido(Number(boton.dataset.verPedido));
});

/* =====================================================
   ARRANQUE
===================================================== */

api("/admin/sesion")
  .then((r) => (r.logueado ? mostrarPanel() : mostrarLogin()))
  .catch(mostrarLogin);
