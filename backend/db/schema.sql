-- =====================================================
-- ESQUEMA - TIENDA DE ROPA
-- Se puede correr varias veces: solo crea lo que falta.
-- =====================================================

-- ---------- CATEGORÍAS (con subcategorías) ----------
CREATE TABLE IF NOT EXISTS categorias (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(80)  NOT NULL,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  padre_id    INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  orden       INTEGER      NOT NULL DEFAULT 0,
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------- PRODUCTOS ----------
CREATE TABLE IF NOT EXISTS productos (
  id             SERIAL PRIMARY KEY,
  nombre         VARCHAR(150)  NOT NULL,
  slug           VARCHAR(180)  NOT NULL UNIQUE,
  descripcion    TEXT,
  categoria_id   INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  marca          VARCHAR(80),
  precio         NUMERIC(12,2) NOT NULL CHECK (precio > 0),
  -- Si tiene precio_oferta, se cobra ese (tiene que ser menor al precio)
  precio_oferta  NUMERIC(12,2) CHECK (precio_oferta IS NULL OR precio_oferta > 0),
  destacado      BOOLEAN       NOT NULL DEFAULT FALSE,
  activo         BOOLEAN       NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT oferta_menor_al_precio
    CHECK (precio_oferta IS NULL OR precio_oferta < precio)
);

CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_productos_activo    ON productos(activo);

-- ---------- IMÁGENES ----------
-- "color" es opcional: permite mostrar las fotos del color elegido
CREATE TABLE IF NOT EXISTS producto_imagenes (
  id           SERIAL PRIMARY KEY,
  producto_id  INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  url          TEXT    NOT NULL,
  color        VARCHAR(40),
  orden        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_imagenes_producto ON producto_imagenes(producto_id);

-- ---------- VARIANTES (talle + color, cada una con su stock) ----------
CREATE TABLE IF NOT EXISTS variantes (
  id           SERIAL PRIMARY KEY,
  producto_id  INTEGER     NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  talle        VARCHAR(20) NOT NULL,
  color        VARCHAR(40) NOT NULL,
  color_hex    VARCHAR(7)  NOT NULL DEFAULT '#cccccc',
  sku          VARCHAR(60) UNIQUE,
  stock        INTEGER     NOT NULL DEFAULT 0 CHECK (stock >= 0),
  activo       BOOLEAN     NOT NULL DEFAULT TRUE,
  UNIQUE (producto_id, talle, color)
);

CREATE INDEX IF NOT EXISTS idx_variantes_producto ON variantes(producto_id);

-- ---------- CARRITO (por cookie, sin necesidad de cuenta) ----------
CREATE TABLE IF NOT EXISTS carritos (
  id              SERIAL PRIMARY KEY,
  token           UUID        NOT NULL UNIQUE,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS carrito_items (
  id           SERIAL PRIMARY KEY,
  carrito_id   INTEGER NOT NULL REFERENCES carritos(id) ON DELETE CASCADE,
  variante_id  INTEGER NOT NULL REFERENCES variantes(id) ON DELETE CASCADE,
  cantidad     INTEGER NOT NULL CHECK (cantidad > 0),
  UNIQUE (carrito_id, variante_id)
);

-- ---------- ÓRDENES ----------
CREATE TABLE IF NOT EXISTS ordenes (
  id                 SERIAL PRIMARY KEY,
  -- Token público e impredecible para consultar el estado
  -- (así nadie puede ver pedidos ajenos probando números)
  token_publico      UUID          NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  carrito_id         INTEGER REFERENCES carritos(id) ON DELETE SET NULL,
  estado             VARCHAR(20)   NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','rechazado','pagado','preparando',
                      'enviado','listo_retiro','entregado','cancelado')),

  email              VARCHAR(255)  NOT NULL,
  nombre             VARCHAR(150)  NOT NULL,
  telefono           VARCHAR(40)   NOT NULL,
  dni                VARCHAR(20)   NOT NULL,

  metodo_entrega     VARCHAR(10)   NOT NULL CHECK (metodo_entrega IN ('envio','retiro')),
  direccion          VARCHAR(255),
  ciudad             VARCHAR(120),
  provincia          VARCHAR(120),
  codigo_postal      VARCHAR(15),
  notas              VARCHAR(500),

  subtotal           NUMERIC(12,2) NOT NULL,
  costo_envio        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total              NUMERIC(12,2) NOT NULL,

  mp_preference_id   VARCHAR(120),
  mp_payment_id      VARCHAR(60),

  -- Se marca cuando algo no cierra (stock insuficiente, monto distinto...)
  requiere_revision  BOOLEAN       NOT NULL DEFAULT FALSE,
  nota_revision      TEXT,

  codigo_seguimiento VARCHAR(120),
  creado_en          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  actualizado_en     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ordenes_estado ON ordenes(estado);

-- Copia de lo comprado: si mañana cambia el producto,
-- el pedido sigue mostrando lo que se pagó.
CREATE TABLE IF NOT EXISTS orden_items (
  id               SERIAL PRIMARY KEY,
  orden_id         INTEGER       NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  variante_id      INTEGER REFERENCES variantes(id) ON DELETE SET NULL,
  producto_id      INTEGER,
  nombre_producto  VARCHAR(150)  NOT NULL,
  talle            VARCHAR(20)   NOT NULL,
  color            VARCHAR(40)   NOT NULL,
  precio_unitario  NUMERIC(12,2) NOT NULL,
  cantidad         INTEGER       NOT NULL CHECK (cantidad > 0),
  -- TRUE solo si este item efectivamente descontó stock
  -- (así al cancelar no se devuelve stock que nunca salió)
  stock_descontado BOOLEAN       NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_orden_items_orden ON orden_items(orden_id);

-- ---------- BOTÓN DE ARREPENTIMIENTO (Ley 24.240 / Res. 424/2020) ----------
-- Cada solicitud recibe un código que se le informa al cliente.
CREATE TABLE IF NOT EXISTS arrepentimientos (
  id             SERIAL PRIMARY KEY,
  codigo         VARCHAR(30)  NOT NULL UNIQUE,
  nombre         VARCHAR(150) NOT NULL,
  email          VARCHAR(255) NOT NULL,
  numero_pedido  VARCHAR(40)  NOT NULL,
  motivo         VARCHAR(500),
  -- Se completa solo si el número de pedido y el email coinciden con una orden
  orden_id       INTEGER REFERENCES ordenes(id) ON DELETE SET NULL,
  estado         VARCHAR(20)  NOT NULL DEFAULT 'recibida'
    CHECK (estado IN ('recibida', 'en_proceso', 'resuelta')),
  creado_en      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arrepentimientos_creado ON arrepentimientos(creado_en DESC);
