'use strict';
/* ------------------------------------------------------------------
   renderer.js — small WebGL2 renderer: one array-textured world shader
   with a directional shadow map, a billboard/decal quad shader, and a
   sky gradient. Everything the game draws goes through here.
   ------------------------------------------------------------------ */

const FLOATS_PER_VERT = 12; // pos3 normal3 uv2 layer1 tint3

/** Accumulates box geometry into interleaved vertex/index arrays. */
class MeshBuilder {
  constructor() {
    this.verts = [];
    this.indices = [];
    this.count = 0;
  }

  /**
   * Add an axis-aligned box.
   * opts: { tint:[r,g,b], uvScale:number, skip:{px,nx,py,ny,pz,nz}, uvOffset:[u,v] }
   */
  box(min, max, layer, opts = {}) {
    const tint = opts.tint || [1, 1, 1];
    const us = opts.uvScale === undefined ? 0.5 : opts.uvScale;
    const skip = opts.skip || {};
    const sx = max[0] - min[0], sy = max[1] - min[1], sz = max[2] - min[2];
    // Faces described as [normal, corner order, uv extents]
    const F = [
      ['px', [1, 0, 0], [[max[0], min[1], max[2]], [max[0], min[1], min[2]], [max[0], max[1], min[2]], [max[0], max[1], max[2]]], sz, sy],
      ['nx', [-1, 0, 0], [[min[0], min[1], min[2]], [min[0], min[1], max[2]], [min[0], max[1], max[2]], [min[0], max[1], min[2]]], sz, sy],
      ['py', [0, 1, 0], [[min[0], max[1], max[2]], [max[0], max[1], max[2]], [max[0], max[1], min[2]], [min[0], max[1], min[2]]], sx, sz],
      ['ny', [0, -1, 0], [[min[0], min[1], min[2]], [max[0], min[1], min[2]], [max[0], min[1], max[2]], [min[0], min[1], max[2]]], sx, sz],
      ['pz', [0, 0, 1], [[min[0], min[1], max[2]], [max[0], min[1], max[2]], [max[0], max[1], max[2]], [min[0], max[1], max[2]]], sx, sy],
      ['nz', [0, 0, -1], [[max[0], min[1], min[2]], [min[0], min[1], min[2]], [min[0], max[1], min[2]], [max[0], max[1], min[2]]], sx, sy],
    ];
    for (const [name, n, corners, w, h] of F) {
      if (skip[name]) continue;
      const uw = Math.max(0.01, w * us), uh = Math.max(0.01, h * us);
      const uvs = [[0, 0], [uw, 0], [uw, uh], [0, uh]];
      // Faces pointing up catch more light; sides and undersides sit darker.
      const shade = n[1] > 0.5 ? 1.0 : (n[1] < -0.5 ? 0.55 : 0.86);
      const base = this.count;
      for (let i = 0; i < 4; i++) {
        const c = corners[i];
        this.verts.push(
          c[0], c[1], c[2],
          n[0], n[1], n[2],
          uvs[i][0], uvs[i][1],
          layer,
          tint[0] * shade, tint[1] * shade, tint[2] * shade
        );
      }
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      this.count += 4;
    }
    return this;
  }

  /** Flat horizontal quad (floors, painted markings). */
  quadY(x0, z0, x1, z1, y, layer, opts = {}) {
    return this.box([x0, y - 0.02, z0], [x1, y, z1], layer,
      Object.assign({ skip: { nx: 1, px: 1, nz: 1, pz: 1, ny: 1 } }, opts));
  }

  isEmpty() { return this.count === 0; }
}

class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: true, alpha: false, depth: true, stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is required to play this game.');
    this.gl = gl;
    this.canvas = canvas;
    this.renderScale = 1;
    this.shadowSize = 2048;
    this.fov = 90 * DEG;
    this.viewmodelFov = 68 * DEG;
    this.sunDir = V.norm([-0.42, -0.78, 0.32]);
    this.sunColor = [1.55, 1.36, 1.02];
    this.skyColor = [0.34, 0.46, 0.66];
    this.groundColor = [0.30, 0.25, 0.18];
    this.fogColor = [0.60, 0.63, 0.68];
    this.fogDensity = 0.0055;
    this.exposure = 1.05;
    this.ambient = 0.34;
    this.muzzleLight = 0;

    this.proj = M4.create();
    this.view = M4.create();
    this.viewProj = M4.create();
    this.lightVP = M4.create();
    this.camPos = [0, 0, 0];
    this.camRight = [1, 0, 0];
    this.camUp = [0, 1, 0];
    this.camFwd = [0, 0, -1];

    this.sprites = [];   // rebuilt every frame
    this.decals = [];    // persistent, capped

    this._initPrograms();
    this._initTextures();
    this._initShadowMap();
    this._initSpriteBuffers();
    this.resize();
  }

  /* ------------------------------ setup ------------------------------ */

  _compile(type, src) {
    const gl = this.gl;
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error('Shader compile error: ' + gl.getShaderInfoLog(sh) + '\n' + src);
    }
    return sh;
  }

  _program(vsSrc, fsSrc) {
    const gl = this.gl;
    const p = gl.createProgram();
    gl.attachShader(p, this._compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, this._compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('Program link error: ' + gl.getProgramInfoLog(p));
    }
    // Cache uniform locations by name.
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace('[0]', '');
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  _initPrograms() {
    const gl = this.gl;

    this.world = this._program(`#version 300 es
      precision highp float;
      layout(location=0) in vec3 aPos;
      layout(location=1) in vec3 aNormal;
      layout(location=2) in vec2 aUV;
      layout(location=3) in float aLayer;
      layout(location=4) in vec3 aTint;
      uniform mat4 uProj, uView, uModel, uLightVP;
      out vec3 vWorld; out vec3 vNormal; out vec2 vUV; out float vLayer;
      out vec3 vTint; out vec4 vLightPos;
      void main(){
        vec4 wp = uModel * vec4(aPos,1.0);
        vWorld = wp.xyz;
        vNormal = mat3(uModel) * aNormal;
        vUV = aUV; vLayer = aLayer; vTint = aTint;
        vLightPos = uLightVP * wp;
        gl_Position = uProj * uView * wp;
      }`, `#version 300 es
      precision highp float;
      precision highp sampler2DArray;
      precision highp sampler2DShadow;
      in vec3 vWorld; in vec3 vNormal; in vec2 vUV; in float vLayer;
      in vec3 vTint; in vec4 vLightPos;
      uniform sampler2DArray uTex;
      uniform sampler2DShadow uShadow;
      uniform vec3 uSunDir, uSunColor, uSkyColor, uGroundColor, uTint, uCamPos, uFogColor;
      uniform float uFogDensity, uShadowTexel, uAmbient, uAlpha, uEmissive, uExposure;
      out vec4 fragColor;

      // ACES-style filmic curve: keeps highlights in check without washing
      // the midtones out the way a simple reinhard does.
      vec3 tonemap(vec3 x){
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }

      float shadowFactor(vec3 n){
        vec3 pc = vLightPos.xyz / vLightPos.w * 0.5 + 0.5;
        if (pc.z > 1.0 || pc.x < 0.0 || pc.x > 1.0 || pc.y < 0.0 || pc.y > 1.0) return 1.0;
        float ndl = max(dot(n, -uSunDir), 0.0);
        float bias = mix(0.0016, 0.0004, ndl);
        float sum = 0.0;
        for (int y = -1; y <= 1; y++){
          for (int x = -1; x <= 1; x++){
            vec2 off = vec2(float(x), float(y)) * uShadowTexel;
            sum += texture(uShadow, vec3(pc.xy + off, pc.z - bias));
          }
        }
        return sum / 9.0;
      }

      void main(){
        vec4 texel = texture(uTex, vec3(vUV, vLayer));
        vec3 albedo = texel.rgb * vTint * uTint;
        vec3 n = normalize(vNormal);
        float ndl = max(dot(n, -uSunDir), 0.0);
        float sh = shadowFactor(n);
        vec3 sun = uSunColor * ndl * sh;
        vec3 amb = mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5) * uAmbient;
        vec3 color = albedo * (sun + amb) + albedo * uEmissive;
        // cheap sun sheen so metal and polished floors catch a highlight
        vec3 viewDir = normalize(uCamPos - vWorld);
        vec3 h = normalize(viewDir - uSunDir);
        float spec = pow(max(dot(n, h), 0.0), 24.0) * 0.12 * sh;
        color += uSunColor * spec;
        float d = length(uCamPos - vWorld);
        float fog = 1.0 - exp(-pow(d * uFogDensity, 2.0));
        color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));
        color = tonemap(color * uExposure);
        fragColor = vec4(pow(color, vec3(1.0/2.2)), texel.a * uAlpha);
      }`);

    this.depth = this._program(`#version 300 es
      precision highp float;
      layout(location=0) in vec3 aPos;
      uniform mat4 uLightVP, uModel;
      void main(){ gl_Position = uLightVP * uModel * vec4(aPos,1.0); }`,
      `#version 300 es
      precision highp float;
      void main(){}`);

    this.quad = this._program(`#version 300 es
      precision highp float;
      layout(location=0) in vec3 aPos;
      layout(location=1) in vec2 aUV;
      layout(location=2) in vec4 aColor;
      layout(location=3) in float aLayer;
      uniform mat4 uViewProj;
      out vec2 vUV; out vec4 vColor; out float vLayer; out vec3 vWorld;
      void main(){
        vUV = aUV; vColor = aColor; vLayer = aLayer; vWorld = aPos;
        gl_Position = uViewProj * vec4(aPos, 1.0);
      }`, `#version 300 es
      precision highp float;
      precision highp sampler2DArray;
      in vec2 vUV; in vec4 vColor; in float vLayer; in vec3 vWorld;
      uniform sampler2DArray uTex;
      uniform vec3 uFogColor, uCamPos;
      uniform float uFogDensity, uFogAmount;
      out vec4 fragColor;
      void main(){
        vec4 t = texture(uTex, vec3(vUV, vLayer));
        vec4 c = t * vColor;
        if (c.a < 0.004) discard;
        float d = length(uCamPos - vWorld);
        float fog = (1.0 - exp(-pow(d * uFogDensity, 2.0))) * uFogAmount;
        c.rgb = mix(c.rgb, uFogColor, clamp(fog, 0.0, 1.0));
        fragColor = c;
      }`);

    this.sky = this._program(`#version 300 es
      precision highp float;
      layout(location=0) in vec2 aPos;
      uniform mat4 uInvViewProj;
      out vec3 vDir;
      void main(){
        vec4 near = uInvViewProj * vec4(aPos, -1.0, 1.0);
        vec4 far  = uInvViewProj * vec4(aPos,  1.0, 1.0);
        vDir = normalize(far.xyz / far.w - near.xyz / near.w);
        gl_Position = vec4(aPos, 0.999999, 1.0);
      }`, `#version 300 es
      precision highp float;
      in vec3 vDir;
      uniform vec3 uSunDir, uSkyTop, uSkyHorizon, uSunColor;
      out vec4 fragColor;
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uSkyHorizon, uSkyTop, pow(h, 0.85));
        float sun = max(dot(d, -uSunDir), 0.0);
        col += uSunColor * pow(sun, 220.0) * 3.0;          // disc
        col += uSunColor * pow(sun, 8.0) * 0.22;           // bloom
        col += vec3(0.9, 0.85, 0.75) * pow(1.0 - abs(d.y), 8.0) * 0.15; // haze band
        col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);
        fragColor = vec4(pow(col, vec3(1.0/2.2)), 1.0);
      }`);
  }

  _initTextures() {
    const gl = this.gl;
    const { mats, sprites } = buildTextureArrays();

    this.matTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.matTex);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, TEX_SIZE, TEX_SIZE, MAT_COUNT,
      0, gl.RGBA, gl.UNSIGNED_BYTE, mats);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) {
      const max = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
    }

    this.sprTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.sprTex);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, SPRITE_SIZE, SPRITE_SIZE, SPR_COUNT,
      0, gl.RGBA, gl.UNSIGNED_BYTE, sprites);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  _initShadowMap() {
    const gl = this.gl;
    const s = this.shadowSize;
    this.shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, s, s, 0,
      gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);

    this.shadowFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _initSpriteBuffers() {
    const gl = this.gl;
    this.quadVao = gl.createVertexArray();
    this.quadVbo = gl.createBuffer();
    gl.bindVertexArray(this.quadVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    const stride = 10 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 36);
    this.quadIbo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIbo);
    this.quadData = new Float32Array(6000 * 4 * 10);
    this.quadIdx = new Uint16Array(6000 * 6);
    gl.bindVertexArray(null);

    this.fsVao = gl.createVertexArray();
    const fsVbo = gl.createBuffer();
    gl.bindVertexArray(this.fsVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, fsVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /* ----------------------------- meshes ----------------------------- */

  createMesh(builder) {
    const gl = this.gl;
    const mesh = {
      vao: gl.createVertexArray(),
      vbo: gl.createBuffer(),
      ibo: gl.createBuffer(),
      indexCount: builder.indices.length,
    };
    gl.bindVertexArray(mesh.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(builder.verts), gl.STATIC_DRAW);
    const stride = FLOATS_PER_VERT * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 32);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 3, gl.FLOAT, false, stride, 36);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
    const use32 = builder.count > 65535;
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,
      use32 ? new Uint32Array(builder.indices) : new Uint16Array(builder.indices), gl.STATIC_DRAW);
    mesh.indexType = use32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    gl.bindVertexArray(null);
    return mesh;
  }

  /* ---------------------------- sprites ----------------------------- */

  /** Camera-facing billboard for this frame. mode: 'alpha' | 'add'. */
  sprite(pos, size, layer, color, mode = 'alpha', rot = 0) {
    this.sprites.push({ pos, size, layer, color, mode, rot, decal: null });
  }

  /** Persistent surface-aligned quad (bullet holes, blood splatter). */
  addDecal(pos, normal, size, layer, color, life = 45) {
    if (this.decals.length > 420) this.decals.shift();
    // Build an orthonormal basis on the surface.
    const up = Math.abs(normal[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const right = V.norm(V.cross(up, normal));
    const realUp = V.norm(V.cross(normal, right));
    const a = rand(0, TAU), ca = Math.cos(a), sa = Math.sin(a);
    const r = [right[0] * ca + realUp[0] * sa, right[1] * ca + realUp[1] * sa, right[2] * ca + realUp[2] * sa];
    const u = V.cross(normal, r);
    this.decals.push({
      pos: V.mad(pos, normal, 0.012), r, u, size, layer, color,
      life, maxLife: life,
    });
  }

  updateDecals(dt) {
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= dt;
      if (d.life <= 0) this.decals.splice(i, 1);
    }
  }

  clearDecals() { this.decals.length = 0; }

  /* ----------------------------- frame ------------------------------ */

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.renderScale;
    const w = Math.max(320, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(240, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.aspect = w / h;
  }

  setCamera(pos, yaw, pitch, roll, fovDeg) {
    this.camPos = pos;
    const fwd = angleVector(yaw, pitch);
    this.camFwd = fwd;
    // Basis without roll, then rotate right/up around the view axis.
    const r0 = V.norm(V.cross(fwd, [0, 1, 0]));
    const u0 = V.norm(V.cross(r0, fwd));
    let right = r0, up = u0;
    if (roll) {
      const c = Math.cos(roll), s = Math.sin(roll);
      right = [r0[0] * c + u0[0] * s, r0[1] * c + u0[1] * s, r0[2] * c + u0[2] * s];
      up = [u0[0] * c - r0[0] * s, u0[1] * c - r0[1] * s, u0[2] * c - r0[2] * s];
    }
    this.camRight = right;
    this.camUp = up;
    M4.perspective((fovDeg || 90) * DEG, this.aspect, 0.03, 320, this.proj);
    M4.lookAt(pos, V.add(pos, fwd), up, this.view);
    M4.mul(this.proj, this.view, this.viewProj);
  }

  /** Fit the shadow frustum around a point of interest. */
  updateSun(center, radius) {
    const eye = V.mad(center, this.sunDir, -radius * 1.6);
    const lightView = M4.lookAt(eye, center, [0, 1, 0]);
    const lightProj = M4.ortho(-radius, radius, -radius, radius, 0.5, radius * 3.4);
    M4.mul(lightProj, lightView, this.lightVP);
  }

  beginShadowPass() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.viewport(0, 0, this.shadowSize, this.shadowSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT); // front-face culling trims peter-panning
    gl.useProgram(this.depth.p);
    gl.uniformMatrix4fv(this.depth.u.uLightVP, false, this.lightVP);
  }

  drawShadow(mesh, model) {
    const gl = this.gl;
    if (!mesh || !mesh.indexCount) return;
    gl.uniformMatrix4fv(this.depth.u.uModel, false, model || IDENTITY);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType, 0);
  }

  endShadowPass() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.cullFace(gl.BACK);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  beginWorldPass() {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(this.fogColor[0], this.fogColor[1], this.fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    // Sky first, at the far plane.
    const invVP = invertMat4(this.viewProj);
    gl.useProgram(this.sky.p);
    gl.uniformMatrix4fv(this.sky.u.uInvViewProj, false, invVP);
    gl.uniform3fv(this.sky.u.uSunDir, this.sunDir);
    gl.uniform3fv(this.sky.u.uSkyTop, [0.20, 0.38, 0.68]);
    gl.uniform3fv(this.sky.u.uSkyHorizon, [0.78, 0.80, 0.78]);
    gl.uniform3fv(this.sky.u.uSunColor, this.sunColor);
    gl.bindVertexArray(this.fsVao);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);

    const u = this.world.u;
    gl.useProgram(this.world.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.matTex);
    gl.uniform1i(u.uTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.uniform1i(u.uShadow, 1);
    gl.uniformMatrix4fv(u.uProj, false, this.proj);
    gl.uniformMatrix4fv(u.uView, false, this.view);
    gl.uniformMatrix4fv(u.uLightVP, false, this.lightVP);
    gl.uniform3fv(u.uSunDir, this.sunDir);
    gl.uniform3fv(u.uSunColor, this.sunColor);
    gl.uniform3fv(u.uSkyColor, this.skyColor);
    gl.uniform3fv(u.uGroundColor, this.groundColor);
    gl.uniform3fv(u.uCamPos, this.camPos);
    gl.uniform3fv(u.uFogColor, this.fogColor);
    gl.uniform1f(u.uFogDensity, this.fogDensity);
    gl.uniform1f(u.uShadowTexel, 1 / this.shadowSize);
    gl.uniform1f(u.uAmbient, this.ambient);
    gl.uniform1f(u.uAlpha, 1);
    gl.uniform1f(u.uEmissive, 0);
    gl.uniform1f(u.uExposure, this.exposure);
    gl.uniform3fv(u.uTint, [1, 1, 1]);
  }

  drawMesh(mesh, model, tint, emissive, alpha) {
    const gl = this.gl;
    if (!mesh || !mesh.indexCount) return;
    const u = this.world.u;
    gl.uniformMatrix4fv(u.uModel, false, model || IDENTITY);
    gl.uniform3fv(u.uTint, tint || [1, 1, 1]);
    gl.uniform1f(u.uEmissive, emissive || 0);
    if (alpha !== undefined && alpha < 1) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.uniform1f(u.uAlpha, alpha);
    }
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType, 0);
    if (alpha !== undefined && alpha < 1) {
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      gl.uniform1f(u.uAlpha, 1);
    }
  }

  /** Draws billboards + decals. Call after all opaque geometry. */
  flushSprites() {
    const gl = this.gl;
    const items = [];
    for (const d of this.decals) {
      const fade = Math.min(1, d.life / Math.min(3, d.maxLife));
      items.push({
        pos: d.pos, r: d.r, u: d.u, size: d.size, layer: d.layer,
        color: [d.color[0], d.color[1], d.color[2], d.color[3] * fade],
        mode: 'alpha', dist: V.dist2(d.pos, this.camPos),
      });
    }
    for (const s of this.sprites) {
      const c = Math.cos(s.rot), si = Math.sin(s.rot);
      const r = [this.camRight[0] * c + this.camUp[0] * si,
                 this.camRight[1] * c + this.camUp[1] * si,
                 this.camRight[2] * c + this.camUp[2] * si];
      const u2 = [this.camUp[0] * c - this.camRight[0] * si,
                  this.camUp[1] * c - this.camRight[1] * si,
                  this.camUp[2] * c - this.camRight[2] * si];
      items.push({
        pos: s.pos, r, u: u2, size: s.size, layer: s.layer, color: s.color,
        mode: s.mode, dist: V.dist2(s.pos, this.camPos),
      });
    }
    this.sprites.length = 0;
    if (!items.length) return;
    items.sort((a, b) => b.dist - a.dist); // far to near

    gl.useProgram(this.quad.p);
    gl.uniformMatrix4fv(this.quad.u.uViewProj, false, this.viewProj);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.sprTex);
    gl.uniform1i(this.quad.u.uTex, 0);
    gl.uniform3fv(this.quad.u.uFogColor, this.fogColor);
    gl.uniform3fv(this.quad.u.uCamPos, this.camPos);
    gl.uniform1f(this.quad.u.uFogDensity, this.fogDensity);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.quadVao);

    // Batch runs of the same blend mode to keep state changes down.
    let i = 0;
    while (i < items.length) {
      const mode = items[i].mode;
      let n = 0;
      const start = i;
      while (i < items.length && items[i].mode === mode && n < 5900) { i++; n++; }
      this._uploadQuads(items, start, n);
      if (mode === 'add') {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.uniform1f(this.quad.u.uFogAmount, 0.25);
      } else {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform1f(this.quad.u.uFogAmount, 1.0);
      }
      gl.drawElements(gl.TRIANGLES, n * 6, gl.UNSIGNED_SHORT, 0);
    }

    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(null);
  }

  _uploadQuads(items, start, n) {
    const gl = this.gl;
    const data = this.quadData, idx = this.quadIdx;
    let o = 0, io = 0;
    for (let k = 0; k < n; k++) {
      const it = items[start + k];
      const hw = it.size * 0.5;
      const rx = it.r[0] * hw, ry = it.r[1] * hw, rz = it.r[2] * hw;
      const ux = it.u[0] * hw, uy = it.u[1] * hw, uz = it.u[2] * hw;
      const p = it.pos, c = it.color, L = it.layer;
      const corners = [
        [-1, -1, 0, 1], [1, -1, 1, 1], [1, 1, 1, 0], [-1, 1, 0, 0],
      ];
      for (const [sx, sy, u0, v0] of corners) {
        data[o++] = p[0] + rx * sx + ux * sy;
        data[o++] = p[1] + ry * sx + uy * sy;
        data[o++] = p[2] + rz * sx + uz * sy;
        data[o++] = u0; data[o++] = v0;
        data[o++] = c[0]; data[o++] = c[1]; data[o++] = c[2]; data[o++] = c[3];
        data[o++] = L;
      }
      const b = k * 4;
      idx[io++] = b; idx[io++] = b + 1; idx[io++] = b + 2;
      idx[io++] = b; idx[io++] = b + 2; idx[io++] = b + 3;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, o), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx.subarray(0, io), gl.DYNAMIC_DRAW);
  }

  /** Viewmodel pass: fresh depth range, narrow FOV, camera at origin. */
  beginViewmodelPass() {
    const gl = this.gl;
    gl.clear(gl.DEPTH_BUFFER_BIT);
    const proj = M4.perspective(this.viewmodelFov, this.aspect, 0.005, 12);
    const u = this.world.u;
    gl.useProgram(this.world.p);
    gl.uniformMatrix4fv(u.uProj, false, proj);
    gl.uniformMatrix4fv(u.uView, false, IDENTITY);
    gl.uniform3fv(u.uCamPos, [0, 0, 0]);
    gl.uniform1f(u.uFogDensity, 0.0);
    gl.uniform1f(u.uAmbient, this.ambient * 1.5 + this.muzzleLight * 1.2);
    gl.uniform3fv(u.uSkyColor, [0.55, 0.6, 0.7]);
    gl.uniform3fv(u.uGroundColor, [0.3, 0.28, 0.25]);
    // The viewmodel is in view space, so light it from a fixed view-space angle.
    gl.uniform3fv(u.uSunDir, V.norm([-0.4, -0.75, -0.5]));
    gl.uniformMatrix4fv(u.uLightVP, false, VM_LIGHT_MAT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }

  endViewmodelPass() {
    const gl = this.gl;
    const u = this.world.u;
    gl.uniform1f(u.uFogDensity, this.fogDensity);
    gl.uniform1f(u.uAmbient, this.ambient);
    gl.uniform3fv(u.uSunDir, this.sunDir);
    gl.uniform3fv(u.uSkyColor, this.skyColor);
    gl.uniform3fv(u.uGroundColor, this.groundColor);
  }
}

const IDENTITY = M4.create();
/** Maps every vertex outside the shadow frustum, so the viewmodel is never shadowed. */
const VM_LIGHT_MAT = (() => {
  const m = new Float32Array(16);
  m[14] = 2; m[15] = 1;
  return m;
})();

/** General 4x4 inverse (only used once per frame for the sky). */
function invertMat4(m, out = M4.create()) {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return out;
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}
