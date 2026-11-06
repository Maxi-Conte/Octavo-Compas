/* =====================================================
   BAILARINA 3D (WebGL, sin librerías)
   La figura está modelada con formas matemáticas (SDF) y se dibuja
   con raymarching: luz, sombra suave en el piso y oclusión ambiental.
   Uso: const b = crearBailarina3D(canvas, { estatica });  b.detener();
   Devuelve null si el navegador no tiene WebGL (se usa el dibujo SVG).
===================================================== */

const SHADER_BAILARINA = `
precision highp float;
uniform vec2 uRes;
uniform float uAng;

/* ---------- Primitivas ---------- */

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}

float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ba = b - a;
  float l2 = dot(ba, ba);
  float rr = r1 - r2;
  float a2 = l2 - rr * rr;
  float il2 = 1.0 / l2;
  vec3 pa = p - a;
  float y = dot(pa, ba);
  float z = y - l2;
  vec3 xv = pa * l2 - ba * y;
  float x2 = dot(xv, xv);
  float y2 = y * y * l2;
  float z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

/* ---------- La bailarina ----------
   Materiales: 1 piel, 2 malla, 3 tutú, 4 pelo, 5 medias, 6 zapatillas */

vec2 elegir(vec2 a, vec2 b) { return a.x < b.x ? a : b; }

vec2 figura(vec3 p) {
  /* Pierna de apoyo, en punta */
  float medias = sdRoundCone(p, vec3(0.055, 0.98, 0.0), vec3(0.045, 0.56, 0.012), 0.066, 0.046);
  medias = smin(medias, sdRoundCone(p, vec3(0.045, 0.56, 0.012), vec3(0.036, 0.15, 0.0), 0.046, 0.03), 0.02);
  /* Pierna en retiré: rodilla afuera, pie apoyado en la otra rodilla */
  medias = min(medias, sdRoundCone(p, vec3(-0.055, 0.98, 0.0), vec3(-0.33, 0.74, 0.07), 0.066, 0.046));
  medias = smin(medias, sdRoundCone(p, vec3(-0.33, 0.74, 0.07), vec3(-0.03, 0.6, 0.05), 0.046, 0.03), 0.02);

  float zapatillas = sdRoundCone(p, vec3(0.036, 0.15, 0.0), vec3(0.032, 0.005, 0.016), 0.031, 0.02);
  zapatillas = min(zapatillas, sdRoundCone(p, vec3(-0.03, 0.6, 0.05), vec3(0.04, 0.57, 0.04), 0.031, 0.02));

  /* Torso con malla */
  vec3 pt = vec3(p.x, p.y, p.z * 1.25);
  float malla = sdEllipsoid(p - vec3(0.0, 1.0, 0.0), vec3(0.13, 0.1, 0.095));
  malla = smin(malla, sdRoundCone(pt, vec3(0.0, 1.04, 0.0), vec3(0.0, 1.3, 0.0), 0.078, 0.1) * 0.8, 0.05);
  malla = smin(malla, sdEllipsoid(p - vec3(0.0, 1.29, 0.012), vec3(0.125, 0.085, 0.082)), 0.04);

  /* Piel: hombros, cuello, cabeza y brazos en corona */
  float piel = sdEllipsoid(p - vec3(0.0, 1.375, 0.0), vec3(0.15, 0.05, 0.068));
  piel = smin(piel, sdRoundCone(p, vec3(0.0, 1.37, 0.0), vec3(0.0, 1.53, 0.005), 0.042, 0.034), 0.03);
  piel = smin(piel, sdEllipsoid(p - vec3(0.0, 1.61, 0.012), vec3(0.068, 0.087, 0.078)), 0.025);
  for (int i = 0; i < 2; i++) {
    float s = i == 0 ? 1.0 : -1.0;
    float brazo = sdRoundCone(p, vec3(0.13 * s, 1.385, 0.0), vec3(0.27 * s, 1.58, 0.07), 0.037, 0.028);
    brazo = smin(brazo, sdRoundCone(p, vec3(0.27 * s, 1.58, 0.07), vec3(0.11 * s, 1.83, 0.06), 0.028, 0.022), 0.015);
    brazo = smin(brazo, sdEllipsoid(p - vec3(0.065 * s, 1.85, 0.055), vec3(0.035, 0.02, 0.016)), 0.015);
    piel = smin(piel, brazo, 0.03);
  }

  /* Pelo recogido con rodete */
  vec3 ph = p - vec3(0.0, 1.62, -0.006);
  float pelo = sdEllipsoid(ph, vec3(0.073, 0.088, 0.08));
  pelo = max(pelo, -(dot(ph, normalize(vec3(0.0, 0.55, -0.83))) + 0.012));
  pelo = smin(pelo, length(p - vec3(0.0, 1.69, -0.075)) - 0.043, 0.02);

  /* Tutú: disco plisado que cae un poco hacia el borde */
  vec3 q = p - vec3(0.0, 0.99, 0.0);
  float r = length(q.xz);
  float ang = atan(q.z, q.x);
  float borde = r / 0.46;
  float pliegue = 0.013 * sin(ang * 30.0) + 0.006 * sin(ang * 11.0 + 1.3);
  float alto = -0.065 * borde * borde + pliegue * borde;
  float grosor = 0.016 + 0.024 * (1.0 - borde);
  float tutu = max(abs(q.y - alto) - grosor, r - 0.46 - pliegue * 0.7) * 0.6;

  vec2 res = vec2(medias, 5.0);
  res = elegir(res, vec2(zapatillas, 6.0));
  res = elegir(res, vec2(malla, 2.0));
  res = elegir(res, vec2(piel, 1.0));
  res = elegir(res, vec2(pelo, 4.0));
  res = elegir(res, vec2(tutu, 3.0));
  return res;
}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

vec2 escena(vec3 p) {
  vec3 q = p;
  q.xz = rot(uAng) * q.xz;
  return elegir(figura(q), vec2(p.y, 0.0));
}

vec3 normal(vec3 p) {
  const vec2 e = vec2(0.0012, -0.0012);
  return normalize(e.xyy * escena(p + e.xyy).x + e.yyx * escena(p + e.yyx).x +
                   e.yxy * escena(p + e.yxy).x + e.xxx * escena(p + e.xxx).x);
}

float sombra(vec3 ro, vec3 rd) {
  float res = 1.0, t = 0.02;
  for (int i = 0; i < 40; i++) {
    float h = escena(ro + rd * t).x;
    res = min(res, 9.0 * h / t);
    t += clamp(h, 0.01, 0.15);
    if (res < 0.002 || t > 3.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

float oclusion(vec3 p, vec3 n) {
  float occ = 0.0, peso = 1.0;
  for (int i = 1; i <= 5; i++) {
    float h = 0.02 * float(i);
    occ += (h - escena(p + n * h).x) * peso;
    peso *= 0.75;
  }
  return clamp(1.0 - 3.5 * occ, 0.0, 1.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  vec3 fondo = vec3(0.937, 0.914, 0.89);

  vec3 ro = vec3(0.0, 1.12, 3.75);
  vec3 ta = vec3(0.0, 0.93, 0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 2.45 * ww);

  float t = 0.0;
  vec2 h = vec2(1.0, -1.0);
  for (int i = 0; i < 120; i++) {
    h = escena(ro + rd * t);
    if (abs(h.x) < 0.0006 * t || t > 9.0) break;
    t += h.x;
  }

  vec3 col = fondo;
  if (t < 9.0) {
    vec3 p = ro + rd * t;
    vec3 n = normal(p);
    vec3 luz = normalize(vec3(-0.55, 0.85, 0.65));
    float sha = sombra(p + n * 0.003, luz);
    float occ = oclusion(p, n);

    if (h.y < 0.5) {
      /* Piso: mismo tono que el fondo, solo con sombra de contacto */
      float s = mix(0.72, 1.0, sha) * mix(0.8, 1.0, occ);
      col = mix(fondo * s, fondo, smoothstep(2.5, 7.0, t));
    } else {
      vec3 base = vec3(0.86, 0.69, 0.6);          /* piel */
      float brillo = 0.15;
      if (h.y > 1.5) { base = vec3(0.55, 0.09, 0.36); brillo = 0.35; }   /* malla */
      if (h.y > 2.5) { base = vec3(0.72, 0.26, 0.52); brillo = 0.2; }    /* tutú */
      if (h.y > 3.5) { base = vec3(0.13, 0.09, 0.08); brillo = 0.4; }    /* pelo */
      if (h.y > 4.5) { base = vec3(0.9, 0.74, 0.7); brillo = 0.25; }     /* medias */
      if (h.y > 5.5) { base = vec3(0.95, 0.78, 0.75); brillo = 0.8; }    /* zapatillas de satén */

      float dif = clamp(dot(n, luz), 0.0, 1.0) * sha;
      float cielo = 0.5 + 0.5 * n.y;
      float contra = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 3.0);
      vec3 medio = normalize(luz - rd);
      float spec = pow(clamp(dot(n, medio), 0.0, 1.0), 40.0) * dif * brillo;

      col = base * (1.15 * dif * vec3(1.0, 0.96, 0.9) + 0.5 * cielo * occ * vec3(0.92, 0.9, 0.95));
      col += 0.35 * contra * occ * fondo;
      col += spec;
      /* El tutú deja pasar un poco de luz (tul) */
      if (h.y > 2.5 && h.y < 3.5) col += base * 0.25 * clamp(dot(-n, luz), 0.0, 1.0);
      col = pow(col, vec3(0.92));
    }
  }

  gl_FragColor = vec4(col, 1.0);
}`;

function crearBailarina3D(canvas, { estatica = false } = {}) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
  if (!gl) return null;

  const compilar = (tipo, fuente) => {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, fuente);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };

  const vs = compilar(gl.VERTEX_SHADER, "attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }");
  const fs = compilar(gl.FRAGMENT_SHADER, SHADER_BAILARINA);
  if (!vs || !fs) return null;

  const programa = gl.createProgram();
  gl.attachShader(programa, vs);
  gl.attachShader(programa, fs);
  gl.linkProgram(programa);
  if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) return null;
  gl.useProgram(programa);

  /* Un triángulo que cubre toda la pantalla */
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const atributo = gl.getAttribLocation(programa, "a");
  gl.enableVertexAttribArray(atributo);
  gl.vertexAttribPointer(atributo, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(programa, "uRes");
  const uAng = gl.getUniformLocation(programa, "uAng");

  /* Resolución: nítida pero sin exigir de más a celulares */
  const escala = Math.min(window.devicePixelRatio || 1, 1.75);
  canvas.width = Math.round(canvas.clientWidth * escala);
  canvas.height = Math.round(canvas.clientHeight * escala);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform2f(uRes, canvas.width, canvas.height);

  const VUELTA = 1.8; // segundos por pirueta (gira y hace una pausa)
  const inicio = performance.now();
  let cuadro = 0;

  function angulo(segundos) {
    const ciclo = segundos / VUELTA;
    const u = ciclo - Math.floor(ciclo);
    const giro = u < 0.72 ? (1 - Math.cos((u / 0.72) * Math.PI)) / 2 : 1; // acelera y frena
    return (Math.floor(ciclo) + giro) * Math.PI * 2 + 0.5;
  }

  function dibujar(ang) {
    gl.uniform1f(uAng, ang);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  if (estatica) {
    dibujar(0.5);
  } else {
    const bucle = (ahora) => {
      dibujar(angulo((ahora - inicio) / 1000));
      cuadro = requestAnimationFrame(bucle);
    };
    cuadro = requestAnimationFrame(bucle);
  }

  return {
    detener() {
      cancelAnimationFrame(cuadro);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  };
}
