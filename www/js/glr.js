'use strict';
// The graphics-chip layer. A phone's 2D canvas is painted by its processor, which is slow for the busy, repeated pictures of the game: the soft
// glows, the particles, the stardust and, above all, the planets. Those are drawn here with WebGL instead, onto a transparent canvas that lies
// between the sky (page elements) and the game's own canvas (orbits, hazards, you, text). If WebGL is missing, ok stays false and the game
// draws everything on its canvas as before.
//
//   sprites: one picture atlas (soft glow, disc, star, plain block) and one shader. Every sprite is a tinted, premultiplied quad. A sprite that
//            is "additive" outputs alpha 0, so the page adds it to whatever lies behind (the same as the canvas's 'lighter').
//   planets: a shader that paints a lit, spinning sphere straight from the planet's map pictures, every frame, with its own clouds,
//            glow lights, shading, highlight and atmosphere (the same look the old canvas painter gave, see planets.js render()).
OD.glr = (() => {
  const api = { ok: false };
  let gl = null, cvs = null, spr = null, pln = null, atlas = null, vbo = null, pvbo = null, lost = false;
  let cssW = 1, cssH = 1, devW = 1, devH = 1;
  const M = [1, 0, 0];   // world -> screen: x' = s * x + tx, y' = s * y + ty (css px)
  const F = 9, MAXQ = 4200;
  let buf = new Float32Array(MAXQ * 6 * F), nv = 0;
  const texs = new Map();

  const SPR_VS = `attribute vec2 aPos; attribute vec2 aUv; attribute vec4 aCol; attribute float aAdd;
uniform vec3 uM; uniform vec2 uRes; varying vec2 vUv; varying vec4 vCol; varying float vAdd;
void main() { vec2 s = aPos * uM.x + uM.yz; gl_Position = vec4(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0, 0.0, 1.0); vUv = aUv; vCol = aCol; vAdd = aAdd; }`;
  const SPR_FS = `precision mediump float; uniform sampler2D uTex; varying vec2 vUv; varying vec4 vCol; varying float vAdd;
void main() { vec4 t = texture2D(uTex, vUv); gl_FragColor = vec4(t.rgb * vCol.rgb * vCol.a, t.a * vCol.a * (1.0 - vAdd)); }`;

  const PLN_VS = `attribute vec2 aPos; attribute vec2 aP; uniform vec3 uM; uniform vec2 uRes; varying vec2 vP;
void main() { vec2 s = aPos * uM.x + uM.yz; gl_Position = vec4(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0, 0.0, 1.0); vP = aP; }`;
  const PLN_FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vP;
uniform sampler2D uSurf, uCloud, uEmit;
uniform float uTexW, uMW, uSpin, uCloudSpin, uHasCloud, uCloudA, uHasEmit, uMask, uPulse, uHasAtmo, uAtmoA, uSpec, uLw, uPx, uAlpha;
uniform vec3 uAtmo;
const float TAU = 6.28318530718;
float grad2(vec2 p, vec2 c0, float r0, vec2 c1, float r1) {
  vec2 cd = c1 - c0, d = p - c0; float dr = r1 - r0;
  float a = dot(cd, cd) - dr * dr, b = dot(d, cd) + r0 * dr, c = dot(d, d) - r0 * r0, t = 0.0;
  if (abs(a) < 1e-5) { t = c / (2.0 * b); }
  else { float s = sqrt(max(b * b - a * c, 0.0)), t1 = (b + s) / a, t2 = (b - s) / a; t = max(t1, t2); if (r0 + t * dr < 0.0) t = min(t1, t2); }
  return clamp(t, 0.0, 1.0);
}
void main() {
  vec2 p = vP; float d = length(p);
  // the glow of the atmosphere, outside the disc (a0 at the edge, fading to nothing at 1.22)
  vec3 gRGB = vec3(0.0); float gA = 0.0;
  if (uHasAtmo > 0.5) {
    float t = clamp((d - 0.92) / 0.30, 0.0, 1.0);
    float a = t < 0.35 ? mix(uAtmoA, 0.16, t / 0.35) : mix(0.16, 0.0, (t - 0.35) / 0.65);
    if (d > 1.22) a = 0.0;
    gRGB = uAtmo * a; gA = a;
  }
  float body = clamp((1.0 - d) / uPx + 0.5, 0.0, 1.0);
  vec3 col = vec3(0.0);
  if (body > 0.0) {
    float fi = 0.32, cs = cos(fi), sn = sin(fi);
    float xr = clamp(p.x * cs - p.y * sn, -0.9999, 0.9999), yr = p.x * sn + p.y * cs;
    float lon = asin(xr) + uSpin, u = fract(lon / TAU), v = clamp(0.5 + 0.5 * yr, 0.0, 1.0);
    vec2 tc = vec2(u * uMW / uTexW, v);
    col = texture2D(uSurf, tc).rgb;
    if (uHasCloud > 0.5) {
      float xc = clamp(xr / 1.012, -0.9999, 0.9999), yc = yr / 1.012;
      float uc = fract((asin(xc) + uCloudSpin) / TAU), vc = clamp(0.5 + 0.5 * yc, 0.0, 1.0);
      vec4 cl = texture2D(uCloud, vec2(uc * uMW / uTexW, vc));
      col = cl.rgb * uCloudA + col * (1.0 - cl.a * uCloudA);
    }
    if (uHasEmit > 0.5) {
      vec3 em = texture2D(uEmit, tc).rgb;
      float m = 1.0;
      if (uMask > 0.5) { float t = grad2(p, vec2(-0.4, -0.4), 0.2, vec2(0.0), 1.2); m = t < 0.45 ? mix(0.0, 0.12, t / 0.45) : t < 0.8 ? mix(0.12, 1.0, (t - 0.45) / 0.35) : 1.0; }
      col += em * m * uPulse;
    }
    // light: bright upper left, a soft terminator, a dark side with a little blue sky-light
    float t = grad2(p, vec2(-0.38, -0.4), 0.05, vec2(-0.05, -0.05), 1.18);
    vec4 sh;
    if (t < 0.34) sh = mix(vec4(1.0, 0.9725, 0.9020, 0.2), vec4(1.0, 1.0, 1.0, 0.0), t / 0.34);
    else if (t < 0.62) sh = mix(vec4(1.0, 1.0, 1.0, 0.0), vec4(0.0, 0.0, 0.0627, 0.34), (t - 0.34) / 0.28);
    else if (t < 0.86) sh = mix(vec4(0.0, 0.0, 0.0627, 0.34), vec4(0.0, 0.0, 0.0784, 0.76), (t - 0.62) / 0.24);
    else sh = mix(vec4(0.0, 0.0, 0.0784, 0.76), vec4(0.0, 0.0, 0.1098, 0.94), (t - 0.86) / 0.14);
    col = col * (1.0 - sh.a) + sh.rgb * sh.a;
    if (uSpec > 0.0) col += vec3(1.0) * uSpec * clamp(1.0 - length(p - vec2(-0.4, -0.42)) / 0.34, 0.0, 1.0);
    if (uHasAtmo > 0.5) {   // the lit edge of the atmosphere
      float e = 1.0 - d, cov = smoothstep(-uPx, uPx, e) * (1.0 - smoothstep(uLw - uPx, uLw + uPx, e));
      float g = clamp((p.x + p.y + 1.6) / 3.2, 0.0, 1.0), ea = g < 0.5 ? mix(0.85, 0.12, g / 0.5) : mix(0.12, 0.02, (g - 0.5) / 0.5);
      col += uAtmo * ea * cov;
    }
    col = min(col, vec3(1.0));
  }
  vec3 rgb = col * body + gRGB * (1.0 - body); float a = body + gA * (1.0 - body);
  gl_FragColor = vec4(rgb, a) * uAlpha;
}`;

  function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function program(vs, fs, attribs) {
    const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    attribs.forEach((a, i) => gl.bindAttribLocation(p, i, a)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); }
    return { p, u };
  }
  // ---- the picture atlas: soft glow, disc, star, plain block (white, with alpha; tinted by each sprite)
  const UV = {};
  function makeAtlas() {
    const A = document.createElement('canvas'); A.width = A.height = 256; const g = A.getContext('2d');
    const glow = g.createRadialGradient(64, 64, 0, 64, 64, 62); glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(0.25, 'rgba(255,255,255,0.45)'); glow.addColorStop(0.6, 'rgba(255,255,255,0.12)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow; g.fillRect(2, 2, 124, 124);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(160, 32, 28, 0, Math.PI * 2); g.fill();
    g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, r = (i % 2 ? 1.9 : 5.2) / 5.2 * 28; g.lineTo(224 + Math.cos(a) * r, 32 + Math.sin(a) * r); } g.closePath(); g.fill();
    g.fillRect(8, 136, 16, 16);
    const r = (x, y, w, h) => [x / 256, y / 256, (x + w) / 256, (y + h) / 256];
    UV.glow = r(2, 2, 124, 124); UV.disc = r(132, 4, 56, 56); UV.star = r(196, 4, 56, 56); UV.block = r(12, 140, 8, 8);
    return A;
  }
  function makeTex(src, premult) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premult !== false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  let empty = null;
  function setup() {
    spr = program(SPR_VS, SPR_FS, ['aPos', 'aUv', 'aCol', 'aAdd']);
    pln = program(PLN_VS, PLN_FS, ['aPos', 'aP']);
    vbo = gl.createBuffer(); pvbo = gl.createBuffer();
    atlas = makeTex(makeAtlas()); texs.clear();
    const e = document.createElement('canvas'); e.width = e.height = 1; empty = makeTex(e);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  // ---- colours: any CSS colour to [r, g, b] (0..1), remembered
  const cc = new Map(); let pc = null;
  function rgbOf(str) {
    let v = cc.get(str); if (v) return v;
    if (!pc) { const c = document.createElement('canvas'); c.width = c.height = 1; pc = c.getContext('2d', { willReadFrequently: true }); }
    pc.clearRect(0, 0, 1, 1); pc.fillStyle = '#000'; pc.fillStyle = str; pc.fillRect(0, 0, 1, 1);
    const d = pc.getImageData(0, 0, 1, 1).data; v = [d[0] / 255, d[1] / 255, d[2] / 255];
    if (cc.size > 500) cc.clear(); cc.set(str, v); return v;
  }
  // ---- sprites
  function quad(uv, x, y, hw, hh, rot, rgb, a, add) {
    if (nv + 6 > MAXQ * 6) flush();
    const c = Math.cos(rot), s = Math.sin(rot), ax = c * hw, ay = s * hw, bx = -s * hh, by = c * hh;
    const [u0, v0, u1, v1] = uv, r = rgb[0], g = rgb[1], b = rgb[2], ad = add ? 1 : 0;
    const x00 = x - ax - bx, y00 = y - ay - by, x10 = x + ax - bx, y10 = y + ay - by, x11 = x + ax + bx, y11 = y + ay + by, x01 = x - ax + bx, y01 = y - ay + by;
    let o = nv * F;
    const put = (px, py, u, v) => { buf[o] = px; buf[o + 1] = py; buf[o + 2] = u; buf[o + 3] = v; buf[o + 4] = r; buf[o + 5] = g; buf[o + 6] = b; buf[o + 7] = a; buf[o + 8] = ad; o += F; };
    put(x00, y00, u0, v0); put(x10, y10, u1, v0); put(x11, y11, u1, v1); put(x00, y00, u0, v0); put(x11, y11, u1, v1); put(x01, y01, u0, v1);
    nv += 6;
  }
  function flush() {
    if (!nv || !gl) { nv = 0; return; }
    gl.useProgram(spr.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, buf.subarray(0, nv * F), gl.STREAM_DRAW);
    const st = F * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, st, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, st, 16);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 32);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlas); gl.uniform1i(spr.u.uTex, 0);
    gl.uniform3f(spr.u.uM, M[0], M[1], M[2]); gl.uniform2f(spr.u.uRes, cssW, cssH);
    gl.drawArrays(gl.TRIANGLES, 0, nv); nv = 0;
  }
  // ---- planets
  const ptex = {};
  function planetTex(skin, info) {
    let t = ptex[skin]; if (t) return t;
    t = ptex[skin] = { surf: makeTex(info.m.surf), cloud: info.m.cloud ? makeTex(info.m.cloud) : empty, emit: info.m.emit ? makeTex(info.m.emit) : empty };
    return t;
  }
  api.prep = function (skin) { if (!api.ok) return false; const info = OD.planets.info(skin); if (!info) return false; planetTex(skin, info); return true; };   // upload a planet's pictures ahead of its arrival
  api.init = function (canvas) {
    cvs = canvas;
    try {
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
      if (!gl) return false;
      setup(); api.ok = true;
      canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); api.ok = false; lost = true; }, false);
      canvas.addEventListener('webglcontextrestored', () => { try { for (const k in ptex) delete ptex[k]; setup(); api.ok = true; lost = false; } catch (err) { api.ok = false; } }, false);
    } catch (e) { api.ok = false; gl = null; }
    return api.ok;
  };
  api.resize = function (devw, devh, cw, ch) {
    if (!cvs) return; devW = devw; devH = devh; cssW = cw; cssH = ch;
    if (cvs.width !== devw || cvs.height !== devh) { cvs.width = devw; cvs.height = devh; }
    if (gl) gl.viewport(0, 0, devw, devh);
  };
  api.begin = function () { if (!api.ok) return; gl.viewport(0, 0, devW, devH); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); nv = 0; M[0] = 1; M[1] = 0; M[2] = 0; };
  api.setMatrix = function (s, tx, ty) { if (!api.ok) return; if (s !== M[0] || tx !== M[1] || ty !== M[2]) flush(); M[0] = s; M[1] = tx; M[2] = ty; };
  api.end = function () { if (api.ok) flush(); };
  // soft light. add: true = added to what lies behind (like 'lighter'); false = laid over it
  api.glow = function (x, y, r, color, alpha, add = true) { if (!api.ok || alpha <= 0.003) return; quad(UV.glow, x, y, r, r, 0, rgbOf(color), alpha, add); };
  api.disc = function (x, y, r, color, alpha, add = true) { if (!api.ok || alpha <= 0.003) return; const k = r; quad(UV.disc, x, y, k, k, 0, rgbOf(color), alpha, add); };
  // a soft streak (a stretched glow): light rays, shooting stars
  api.ray = function (x, y, hw, hh, rot, color, alpha, add = true) { if (!api.ok || alpha <= 0.003) return; quad(UV.glow, x, y, hw, hh, rot, rgbOf(color), alpha, add); };
  api.block = function (x, y, hw, hh, rot, color, alpha, add = false) { if (!api.ok || alpha <= 0.003) return; quad(UV.block, x, y, hw, hh, rot, rgbOf(color), alpha, add); };
  api.star = function (x, y, r, rot, color, alpha, add = false) { if (!api.ok || alpha <= 0.003) return; const k = r; quad(UV.star, x, y, k, k, rot, rgbOf(color), alpha, add); };
  // a lit, spinning planet from its map pictures; false when its pictures are not loaded yet (the caller then draws it the old way)
  api.planet = function (x, y, r, skin, t, alpha = 1) {
    if (!api.ok) return false;
    const info = OD.planets.info(skin); if (!info) return false;
    flush();
    const T = planetTex(skin, info), m = info.m, h = r * 1.3;
    gl.useProgram(pln.p);
    const q = new Float32Array([x - h, y - h, -1.3, -1.3, x + h, y - h, 1.3, -1.3, x + h, y + h, 1.3, 1.3, x - h, y - h, -1.3, -1.3, x + h, y + h, 1.3, 1.3, x - h, y + h, -1.3, 1.3]);
    gl.bindBuffer(gl.ARRAY_BUFFER, pvbo); gl.bufferData(gl.ARRAY_BUFFER, q, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.disableVertexAttribArray(2); gl.disableVertexAttribArray(3);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.surf); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.cloud); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, T.emit);
    const u = pln.u, spin = t * info.spin;
    gl.uniform1i(u.uSurf, 0); gl.uniform1i(u.uCloud, 1); gl.uniform1i(u.uEmit, 2);
    gl.uniform3f(u.uM, M[0], M[1], M[2]); gl.uniform2f(u.uRes, cssW, cssH);
    gl.uniform1f(u.uTexW, info.texW); gl.uniform1f(u.uMW, info.MW);
    gl.uniform1f(u.uSpin, spin); gl.uniform1f(u.uCloudSpin, spin * 1.6 + 0.8);
    gl.uniform1f(u.uHasCloud, m.cloud && OD.Q().clouds ? 1 : 0); gl.uniform1f(u.uCloudA, skin === 'toxic' ? 0.8 : 0.95);
    gl.uniform1f(u.uHasEmit, m.emit ? 1 : 0); gl.uniform1f(u.uMask, skin !== 'lava' && skin !== 'toxic' ? 1 : 0);
    gl.uniform1f(u.uPulse, skin === 'lava' ? 0.8 + 0.2 * Math.sin(t * 1.6) : skin === 'crystal' ? 0.75 + 0.25 * Math.sin(t * 3.1) : 1);
    const at = info.atmo; gl.uniform1f(u.uHasAtmo, at ? 1 : 0);
    if (at) { const c = rgbOf(at); gl.uniform3f(u.uAtmo, c[0], c[1], c[2]); }
    gl.uniform1f(u.uAtmoA, skin === 'void' ? 0.5 : 0.42);
    gl.uniform1f(u.uSpec, info.spec || 0);
    gl.uniform1f(u.uLw, Math.max(1.2 / r, 0.045));
    gl.uniform1f(u.uPx, 1 / Math.max(1, r * M[0] * (devW / cssW)));
    gl.uniform1f(u.uAlpha, alpha);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.activeTexture(gl.TEXTURE0);
    return true;
  };
  return api;
})();
