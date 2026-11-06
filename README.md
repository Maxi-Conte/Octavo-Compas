# Tienda de ropa — base de e-commerce

Base para una tienda de ropa con catálogo de **talles y colores**, carrito,
checkout con **Mercado Pago** y **panel de administración**.

- **Backend:** Node.js + Express + PostgreSQL
- **Frontend:** HTML, CSS y JavaScript puro (sin frameworks)
- **Pagos:** Mercado Pago Checkout Pro
- **Mails:** Resend (por API, sin SMTP)

---

## 1. Ponerla en marcha en tu compu

Necesitás **Node.js 18+** y **PostgreSQL** instalados.

```powershell
# 1. Instalar dependencias
npm install

# 2. Crear la base de datos (una sola vez)
#    Desde pgAdmin o con psql:
#    CREATE DATABASE tienda_ropa;

# 3. Copiar la configuración y completarla
copy .env.example .env
#    Editá .env: DATABASE_URL, ADMIN_USER, ADMIN_PASSWORD y ADMIN_SESSION_SECRET.
#    Para generar ADMIN_SESSION_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Crear las tablas y cargar productos de ejemplo
npm run db:setup

# 5. Arrancar
npm run dev
```

- Tienda: http://localhost:3000
- Panel: http://localhost:3000/admin.html

> Si el servidor no arranca, leé el mensaje: te dice exactamente qué variable del `.env` falta.

---

## 2. Estructura

```
backend/
  server.js              Servidor, seguridad y rutas
  config.js              Lee y valida el .env
  db/
    schema.sql           Tablas (se puede correr varias veces)
    init.js / seed.js    Crear tablas / datos de ejemplo
    database.js          Conexión + ayudante de transacciones
  middleware/
    admin-auth.js        Sesión del administrador (cookie firmada)
    carrito-cookie.js    Carrito por cookie, sin necesidad de cuenta
  routes/
    catalogo.js          Categorías, productos, filtros y detalle
    carrito.js           Agregar, cambiar y quitar productos
    pagos.js             Checkout, webhook de MP y estado del pedido
    admin/               Panel: productos, variantes, categorías, pedidos
  services/pedidos.js    Lógica de pagos y stock (la parte delicada)
  utils/                 Validaciones, envío, mails, orden de talles

frontend/
  index.html             Inicio
  tienda.html            Catálogo con filtros (categoría, talle, color, precio)
  producto.html          Detalle con selector de color y talle
  checkout.html          Datos de envío y pago
  pago.html              Resultado del pago
  admin.html             Panel de administración
  css/styles.css         Estilos (cambiá las variables de :root para tu marca)
```

---

## 3. Cómo funciona el stock (importante)

Cada producto tiene **variantes**: una por cada combinación de talle + color,
cada una con su propio stock.

1. Al ir a pagar se verifica el stock, pero **no se descuenta todavía**.
2. Cuando Mercado Pago **aprueba** el pago (webhook), se descuenta.
3. Si justo dos personas pagaron la última unidad, el segundo pedido queda
   marcado **"⚠️ Requiere revisión"** y te llega un mail de alerta.
4. Si cancelás un pedido pagado desde el panel, el stock vuelve solo.

---

## 4. Seguridad incluida

- Precios y totales calculados **siempre en el servidor**.
- Webhook de Mercado Pago con **firma verificada** (obligatoria en producción)
  y consulta del pago real a la API de MP.
- El webhook responde **500 si algo falla**, así Mercado Pago reintenta.
- Procesamiento de pagos **idempotente**: un aviso repetido no duplica nada.
- Se verifica que el **monto pagado** coincida con el total del pedido.
- Pedidos consultables solo con un **token aleatorio** (no por número).
- Sesión de admin en **cookie httpOnly + sameSite strict**, con límite de intentos.
- **CSP** activa: el navegador solo ejecuta scripts propios.
- Todas las consultas SQL **parametrizadas**.
- Todo el texto que se muestra en pantalla pasa por `esc()` (anti-XSS).

---

## 5. Mercado Pago

1. Creá una aplicación en https://www.mercadopago.com.ar/developers/panel
2. Copiá el **Access Token** a `MP_ACCESS_TOKEN` (primero usá el de prueba).
3. En **Webhooks**, configurá la URL `https://TU-DOMINIO/api/pagos/webhook`,
   evento **Pagos**, y copiá la **clave secreta** a `MP_WEBHOOK_SECRET`.

> En `localhost` Mercado Pago no puede avisarte los pagos. Para probar el
> webhook en tu compu necesitás exponerla con una URL pública (por ejemplo,
> con ngrok o Cloudflare Tunnel).

---

## 6. Publicar (producción)

- Usá un **plan pago**: en el plan gratis de Render la base se borra a los 30 días.
- Completá todas las variables (el servidor no arranca si falta algo crítico).
- `FRONTEND_URL` tiene que ser `https://...`.
- Configurá un monitor (UptimeRobot) apuntando a `/api/health`.
- Las fotos conviene subirlas a **Cloudinary** y pegar la URL en el panel.

---

## 7. Octavo Compás: fotos, logo y textos

### Catálogo de ejemplo

```powershell
npm run db:seed:danza                    # agrega categorías y 15 productos de danza/gala
npm run db:seed:danza -- --ocultar-demo  # además oculta los productos genéricos del seed original
```

No borra nada. Los productos usan imágenes provisorias de `frontend/img/productos-demo/`;
las fotos reales se cargan desde el panel.

### Fotos del sitio

Cada foto tiene un nombre fijo. **Si guardás un archivo con ese nombre en esa carpeta,
aparece solo**, sin tocar código. Mientras no exista, se ve una caja de color suave
con una etiqueta que dice qué foto va (y el navegador muestra un 404 de ese archivo:
es normal).

| Archivo | Dónde se ve | Medida recomendada | Formato |
|---|---|---|---|
| `img/marca/logo.svg` | Header | horizontal, ~330 × 64 | SVG (o PNG con fondo transparente) |
| `img/marca/logo-claro.svg` | Footer (fondo oscuro) | igual que el anterior, en blanco | SVG / PNG transparente |
| `img/marca/isotipo.svg` | Ícono de la pestaña | cuadrado | SVG |
| `img/hero/look-1.png` … `look-3.png` | Hero de la home (bailarina) | 1200 × 1600 (3:4), figura apoyada abajo | **PNG sin fondo** |
| `img/disciplinas/ballet.jpg`, `contemporaneo.jpg`, `folklore.jpg`, `tango.jpg`, `gala.jpg` | Comprá por disciplina | 900 × 1200 (3:4) | JPG, < 250 KB |
| `img/secciones/a-medida.jpg` | Vestuarios a medida | 1200 × 1500 (4:5) | JPG, < 300 KB |
| `img/secciones/reinas.jpg` | Reinas 2026 (y vista previa al compartir) | 1200 × 1500 (4:5) | JPG, < 300 KB |
| `img/secciones/escena-1.jpg` … `escena-4.jpg` | En escena (Instagram) | 800 × 800 (1:1) | JPG, < 150 KB |
| Fotos de productos (desde el panel) | Tienda y ficha | 1200 × 1500 (4:5); la 2.ª foto se ve al pasar el mouse | JPG / WebP |

Si cambiás un logo `.svg` por un `.png`, actualizá la ruta en `frontend/js/comun.js` (`armarHeader` / `armarFooter`).

### Looks del hero

En `frontend/js/inicio.js`, el array `LOOKS` define cada look: imagen, nombre, texto alternativo
y los **slugs** de las 3 prendas (el slug es lo que aparece en `producto.html?p=ESTE-SLUG`).

### Datos del negocio

- `.env`: `NEGOCIO_WHATSAPP` (solo números, con código de país: `549261...`) y `NEGOCIO_INSTAGRAM_URL`.
- `frontend/js/comun.js` → `SITIO`: email de contacto y ubicación que se muestran en el footer.
- Textos marcados entre corchetes (`[ASÍ]`) están pendientes de completar.

## 8. Próximos pasos sugeridos

- [ ] Fotos reales y logo original (ver tabla de arriba)
- [ ] Endpoint para el botón de arrepentimiento (guardar la solicitud y enviar constancia por mail)
- [ ] Servicio de newsletter
- [ ] Subida de fotos directa desde el panel (Cloudinary)
- [ ] Cupones de descuento
- [ ] Cálculo de envío por código postal (Andreani / Correo Argentino)
- [ ] Cuentas de cliente e historial de pedidos
- [ ] Páginas legales: términos, privacidad, botón de arrepentimiento
- [ ] Facturación electrónica (ARCA)
