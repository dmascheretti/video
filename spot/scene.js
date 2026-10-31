// VYRA One — 30s product spot. Deterministic: window.seek(t) renders the exact frame at time t (seconds).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const VW = 1920, VH = 1080;
const BPM = 120, BEAT = 60 / BPM;

// ---------- easing ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;
const outExpo = p => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
const inExpo = p => (p <= 0 ? 0 : Math.pow(2, 10 * p - 10));
const inOutExpo = p => p <= 0 ? 0 : p >= 1 ? 1 : p < .5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2;
const inOutCubic = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const outCubic = p => 1 - Math.pow(1 - p, 3);
const seg = (t, a, b) => clamp((t - a) / (b - a));

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(VW, VH);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(30, VW / VH, 0.05, 400);
scene.add(camera);

// ---------- studio environment (softbox strips) ----------
function makeEnv() {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(120, 120, 120), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide })));
  const strip = (w, h, x, y, z, k, color = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  strip(5, 46, -24, 0, 14, 7);            // key, vertical, front-left
  strip(2.5, 46, 26, 2, -4, 10);          // hard rim right
  strip(2.5, 46, -20, 0, -22, 6);         // rim back-left
  strip(36, 3, 0, 28, 4, 3);              // top
  strip(4, 30, 14, -6, 24, 1.6, 0x8a6dff);// violet kicker
  strip(4, 30, -12, -8, -26, 1.6, 0x22d3ff);// cyan kicker
  const pm = new THREE.PMREMGenerator(renderer);
  return pm.fromScene(s, 0.035).texture;
}
scene.environment = makeEnv();

// ---------- background glow (camera-attached) ----------
const bgMat = new THREE.ShaderMaterial({
  depthWrite: false, depthTest: false,
  uniforms: { uGlow: { value: 0 }, uC: { value: new THREE.Vector2(.5, .5) }, uA: { value: new THREE.Color(0x6a3cff) }, uB: { value: new THREE.Color(0x1590ff) }, uT: { value: 0 }, uR: { value: .55 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec2 vUv; uniform float uGlow,uT,uR; uniform vec2 uC; uniform vec3 uA,uB;
    void main(){ vec2 p=(vUv-uC)*vec2(1.7778,1.); float d=length(p);
      float g=exp(-d*d/(uR*uR)); float a=atan(p.y,p.x);
      vec3 col=mix(uA,uB,.5+.5*sin(a+uT*.6));
      gl_FragColor=vec4(col*g*uGlow*.4,1.); }`
});
const bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bgMat);
bg.renderOrder = -10; bg.frustumCulled = false;
camera.add(bg);
function fitBg() { const d = 150; bg.position.set(0, 0, -d); const h = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); bg.scale.set(h * camera.aspect * 1.02, h * 1.02, 1); }

// ---------- dust particles ----------
const NP = 700;
const pGeo = new THREE.BufferGeometry();
const pBase = new Float32Array(NP * 3), pPos = new Float32Array(NP * 3), pSeed = new Float32Array(NP);
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < NP; i++) { pBase[i * 3] = (rnd() - .5) * 60; pBase[i * 3 + 1] = (rnd() - .5) * 36; pBase[i * 3 + 2] = (rnd() - .5) * 40; pSeed[i] = rnd(); }
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.3, 'rgba(200,210,255,.5)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const pMat = new THREE.PointsMaterial({ size: .16, map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xaab4ff, opacity: 0 });
const particles = new THREE.Points(pGeo, pMat); particles.frustumCulled = false;
scene.add(particles);
function updateParticles(t, burst) {
  for (let i = 0; i < NP; i++) {
    const s = pSeed[i], b = 1 + burst * (1.2 + s);
    pPos[i * 3] = pBase[i * 3] * b + Math.sin(t * .3 + s * 40) * .8;
    pPos[i * 3 + 1] = pBase[i * 3 + 1] * b + ((t * (.3 + s * .4) + s * 36) % 36) - 18;
    pPos[i * 3 + 2] = pBase[i * 3 + 2] + Math.cos(t * .25 + s * 20) * .8;
  }
  pGeo.attributes.position.needsUpdate = true;
}

// ---------- phone ----------
const PW = 7.6, PH = 16.2, PR = 1.25, BS = 0.12, DEPTH = 0.56;
const ZF = DEPTH / 2 + BS; // 0.40 front/back face
function rrShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  return s;
}
function normUV(geo) {
  geo.computeBoundingBox(); const b = geo.boundingBox, p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - b.min.x) / (b.max.x - b.min.x), (p.getY(i) - b.min.y) / (b.max.y - b.min.y));
  uv.needsUpdate = true; return geo;
}

// screen content (shared)
const scrC = document.createElement('canvas'); scrC.width = 600; scrC.height = 1280;
const scrG = scrC.getContext('2d');
const scrTex = new THREE.CanvasTexture(scrC); scrTex.colorSpace = THREE.SRGBColorSpace; scrTex.anisotropy = 4;
function drawScreen(t) {
  const g = scrG, w = scrC.width, h = scrC.height;
  g.fillStyle = '#05040c'; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  const blobs = [[.3, .25, '#6d3cff', 520], [.75, .45, '#00c8ff', 480], [.4, .75, '#b44dff', 560], [.8, .9, '#0066ff', 420]];
  blobs.forEach(([bx, by, c, r], i) => {
    const x = (bx + .12 * Math.sin(t * .7 + i * 2)) * w, y = (by + .06 * Math.cos(t * .5 + i)) * h;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = .75; g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#000'; roundRect(g, w / 2 - 70, 26, 140, 40, 20); g.fill(); // camera pill
  g.fillStyle = 'rgba(255,255,255,.92)'; g.textAlign = 'center';
  g.font = '500 30px "Inter Display"'; g.fillText('Wednesday, November 11', w / 2, 190);
  g.font = '600 190px "Inter Display"'; g.fillText('11:11', w / 2, 370);
  // widgets
  g.fillStyle = 'rgba(255,255,255,.12)';
  roundRect(g, 60, 440, 225, 150, 36); g.fill(); roundRect(g, 315, 440, 225, 150, 36); g.fill();
  g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '600 52px "Inter Display"'; g.textAlign = 'left';
  g.fillText('21°', 90, 530); g.fillText('98%', 345, 530);
  g.font = '400 22px "Inter Display"'; g.fillStyle = 'rgba(255,255,255,.6)'; g.fillText('Milano', 90, 565); g.fillText('2 days left', 345, 565);
  g.fillStyle = 'rgba(255,255,255,.5)'; roundRect(g, w / 2 - 80, h - 40, 160, 8, 4); g.fill();
  scrTex.needsUpdate = true;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

const wordC = document.createElement('canvas'); wordC.width = 512; wordC.height = 128;
{ const g = wordC.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 512, 128); }
const wordTex = new THREE.CanvasTexture(wordC);
function drawWordmark() { const g = wordC.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 512, 128); g.fillStyle = '#fff'; g.font = '600 92px "Inter Display"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = '18px'; g.fillText('VYRA', 266, 66); wordTex.needsUpdate = true; }

const COLORWAYS = {
  graphite: { back: 0x24262b, frame: 0x7a7e86, name: 'Graphite' },
  glacier: { back: 0x6f8798, frame: 0xa9b3be, name: 'Glacier' },
  ember: { back: 0xb8461f, frame: 0xc08a6c, name: 'Ember' },
};
const halos = [];
function makePhone(cw) {
  const c = COLORWAYS[cw];
  const g = new THREE.Group();
  const frameMat = new THREE.MeshPhysicalMaterial({ color: c.frame, metalness: 1, roughness: .26, clearcoat: .3, envMapIntensity: 1.25 });
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(rrShape(PW - 2 * BS, PH - 2 * BS, PR - BS), { depth: DEPTH, bevelEnabled: true, bevelThickness: BS, bevelSize: BS, bevelSegments: 10, curveSegments: 64 }).translate(0, 0, -DEPTH / 2), frameMat);
  g.add(body);
  // front glass + screen
  const bezel = new THREE.Mesh(new THREE.ShapeGeometry(rrShape(PW - .26, PH - .26, PR - .13), 64), new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: .05, clearcoat: 1, clearcoatRoughness: .03, envMapIntensity: 1.1 }));
  bezel.position.z = ZF + .002; g.add(bezel);
  const scrMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: .06, clearcoat: 1, clearcoatRoughness: .02, emissive: 0xffffff, emissiveMap: scrTex, emissiveIntensity: 0, envMapIntensity: .9 });
  const screen = new THREE.Mesh(normUV(new THREE.ShapeGeometry(rrShape(PW - .52, PH - .52, PR - .26), 64)), scrMat);
  screen.position.z = ZF + .004; g.add(screen);
  // back glass
  const backMat = new THREE.MeshPhysicalMaterial({ color: c.back, metalness: .25, roughness: .4, clearcoat: .8, clearcoatRoughness: .18, envMapIntensity: 1.1 });
  const back = new THREE.Mesh(new THREE.ShapeGeometry(rrShape(PW - .26, PH - .26, PR - .13), 64), backMat);
  back.rotation.y = Math.PI; back.position.z = -ZF - .002; g.add(back);
  const word = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .65), new THREE.MeshPhysicalMaterial({ color: 0xdfe3ea, metalness: 1, roughness: .18, alphaMap: wordTex, transparent: true, envMapIntensity: 1.6 }));
  word.rotation.y = Math.PI; word.position.set(0, -5.2, -ZF - .006); g.add(word);
  // camera module
  const mod = new THREE.Group(); mod.rotation.y = Math.PI; mod.position.set(PW / 2 - .42 - 1.9, PH / 2 - .42 - 1.9, -ZF); g.add(mod);
  const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(rrShape(3.68, 3.68, 1.02), { depth: .08, bevelEnabled: true, bevelThickness: .06, bevelSize: .06, bevelSegments: 6, curveSegments: 48 }),
    new THREE.MeshPhysicalMaterial({ color: new THREE.Color(c.back).multiplyScalar(.55), metalness: .6, roughness: .22, clearcoat: 1, envMapIntensity: 1.3 }));
  mod.add(plate);
  const ringMat = new THREE.MeshPhysicalMaterial({ color: c.frame, metalness: 1, roughness: .18, envMapIntensity: 1.4 });
  const lens = (x, y, r, halo) => {
    const L = new THREE.Group(); L.position.set(x, y, 0); mod.add(L);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.02, .3, 96, 1).rotateX(Math.PI / 2), ringMat); ring.position.z = .27; L.add(ring);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(r * .86, 96), new THREE.MeshPhysicalMaterial({ color: 0x020205, roughness: .02, metalness: .2, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [200, 600], envMapIntensity: 2 }));
    glass.position.z = .425; L.add(glass);
    const el = new THREE.Mesh(new THREE.RingGeometry(r * .2, r * .38, 96), new THREE.MeshPhysicalMaterial({ color: 0x0a0d18, metalness: 1, roughness: .1, emissive: 0x1a2a6a, emissiveIntensity: .35, envMapIntensity: 2 }));
    el.position.z = .427; L.add(el);
    if (halo) {
      const hm = new THREE.MeshBasicMaterial({ color: 0x8f7bff, toneMapped: false });
      const h = new THREE.Mesh(new THREE.TorusGeometry(r * 1.13, .04, 16, 160), hm); h.position.z = .16; L.add(h);
      halos.push(hm); g.userData.halo = hm; g.userData.mainLens = L;
    }
  };
  lens(-.72, .72, .74, true); lens(.95, .9, .5, false); lens(.92, -.95, .5, false);
  const flash = new THREE.Mesh(new THREE.CircleGeometry(.2, 48), new THREE.MeshPhysicalMaterial({ color: 0xfff6dc, roughness: .3, emissive: 0xffeec0, emissiveIntensity: .25 }));
  flash.position.set(-.95, -1.0, .15); mod.add(flash);
  // buttons
  const btnMat = frameMat;
  const btn = (side, y, len) => { const b = new THREE.Mesh(new RoundedBoxGeometry(.22, len, .3, 4, .1), btnMat); b.position.set(side * (PW / 2 + .04), y, 0); g.add(b); };
  btn(1, 3.6, 2.6); btn(1, .6, 1.5); btn(-1, 4.6, .9);
  g.userData.scr = scrMat; g.userData.cw = cw;
  return g;
}
const phones = { graphite: makePhone('graphite'), glacier: makePhone('glacier'), ember: makePhone('ember') };
Object.values(phones).forEach(p => scene.add(p));

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(VW, VH, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(VW, VH), .5, .55, .9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 1 }, uCA: { value: .0015 } },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uT,uFlash,uFade,uCA; varying vec2 vUv;
    float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){ vec2 c=vUv-.5; float r=dot(c,c);
      vec2 o=c*uCA*(1.+r*4.);
      vec3 col=vec3(texture2D(tDiffuse,vUv+o).r, texture2D(tDiffuse,vUv).g, texture2D(tDiffuse,vUv-o).b);
      col*=1.-smoothstep(.12,.7,r)*.55;
      col+= (h(vUv*1000.+fract(uT*7.13))-.5)*.035;
      col=mix(col,vec3(1.),uFlash); col*=uFade;
      gl_FragColor=vec4(col,1.); }`
});
composer.addPass(finish);

// ---------- typography / UI ----------
const ui = document.getElementById('ui');
const flashEl = document.getElementById('flash');
const texts = [];
function addText(o) {
  const el = document.createElement('div'); el.className = 't ' + (o.cls || '');
  el.style.left = o.x + 'px'; el.style.top = o.y + 'px';
  if (o.align === 'center') el.style.transform = 'translate(-50%,-50%)'; else if (o.align === 'right') el.style.transform = 'translate(-100%,-50%)'; else el.style.transform = 'translateY(-50%)';
  const words = [];
  if (o.mode === 'track' || o.mode === 'count' || o.mode === 'fade') { el.innerHTML = o.html; }
  else {
    o.html.split(' ').forEach((w, i) => {
      const outer = document.createElement('span'); outer.className = 'w'; outer.style.overflow = 'hidden'; outer.style.verticalAlign = 'top'; outer.style.padding = '0.08em 0.02em 0.14em';
      const inner = document.createElement('span'); inner.className = 'w' + (o.grad && o.grad.includes(i) ? ' grad' : ''); inner.innerHTML = w;
      outer.appendChild(inner); el.appendChild(outer); el.appendChild(document.createTextNode(' '));
      words.push(inner);
    });
  }
  ui.appendChild(el); texts.push({ ...o, el, words }); return el;
}
function updateTexts(t) {
  for (const o of texts) {
    const visible = t >= o.tin - .01 && t <= o.tout + .4;
    o.el.style.display = visible ? 'block' : 'none'; if (!visible) continue;
    const pout = outCubic(seg(t, o.tout, o.tout + .25));
    if (o.mode === 'track') {
      const p = outExpo(seg(t, o.tin, o.tin + (o.dur || .9)));
      o.el.style.opacity = p * (1 - pout);
      o.el.style.letterSpacing = lerp(o.ls0 ?? .2, o.ls1 ?? -.045, p) + 'em';
      o.el.style.filter = `blur(${(1 - p) * 10 + pout * 8}px)`;
    } else if (o.mode === 'fade') {
      const p = outExpo(seg(t, o.tin, o.tin + .6));
      o.el.style.opacity = p * (1 - pout);
      o.el.style.filter = `blur(${(1 - p) * 8 + pout * 6}px)`;
      o.el.style.marginTop = ((1 - p) * 18) + 'px';
    } else if (o.mode === 'count') {
      const p = outExpo(seg(t, o.tin, o.tin + (o.dur || 1.1)));
      o.el.querySelector('.n').textContent = Math.round(lerp(o.from, o.to, p));
      o.el.style.opacity = clamp(seg(t, o.tin, o.tin + .2)) * (1 - pout);
      o.el.style.filter = `blur(${pout * 8}px)`;
    } else {
      o.words.forEach((w, i) => {
        const p = outExpo(seg(t, o.tin + i * .07, o.tin + i * .07 + .5));
        w.style.transform = `translateY(${(1 - p) * 105}%)`;
        w.style.filter = `blur(${(1 - p) * 6 + pout * 8}px)`;
      });
      o.el.style.opacity = 1 - pout;
    }
  }
}
const L = 170; // left margin
// S2 brand
addText({ html: 'Introducing', cls: 'eyebrow', x: L, y: 455, tin: 2.25, tout: 4.75, mode: 'fade' });
addText({ html: 'VYRA One', cls: 'h1', x: L - 6, y: 560, tin: 2.5, tout: 4.75, grad: [1] });
// S3 design (text right)
addText({ html: 'Titanium.', cls: 'h2', x: 1750, y: 470, align: 'right', tin: 5.35, tout: 8.6 });
addText({ html: 'Reimagined.', cls: 'h2', x: 1750, y: 565, align: 'right', tin: 5.85, tout: 8.6, grad: [0] });
addText({ html: 'Aerospace frame · 7.4 mm · 187 g', cls: 'spec', x: 1750, y: 665, align: 'right', tin: 6.5, tout: 8.6, mode: 'fade' });
// S4 camera (text left)
addText({ html: 'Halo Camera', cls: 'eyebrow', x: L, y: 360, tin: 9.35, tout: 12.4, mode: 'fade' });
addText({ html: '<span class="n">0</span><span class="unit grad">MP</span>', cls: 'num', x: L - 12, y: 520, tin: 9.55, tout: 12.4, mode: 'count', from: 0, to: 200, dur: 1.2 });
addText({ html: '10× optical zoom · Night Vision AI', cls: 'spec', x: L, y: 670, tin: 10.5, tout: 12.4, mode: 'fade' });
// S5 display
addText({ html: '6.9″', cls: 'h1', x: 520, y: 500, align: 'right', tin: 15.0, tout: 16.75, ls0: .25, ls1: -.035, mode: 'track', dur: .8 });
addText({ html: 'LumaFlow display', cls: 'spec', x: 520, y: 590, align: 'right', tin: 15.3, tout: 16.75, mode: 'fade' });
addText({ html: '144<span class="unit">Hz</span>', cls: 'h1', x: 1400, y: 450, tin: 15.25, tout: 16.75, ls0: .25, ls1: -.035, mode: 'track', dur: .8 });
addText({ html: '3000 nits peak', cls: 'spec', x: 1400, y: 545, tin: 15.55, tout: 16.75, mode: 'fade' });
// S6 battery + chip
addText({ html: 'V1 Neural Chip', cls: 'eyebrow', x: L, y: 400, tin: 17.2, tout: 19.7, mode: 'fade' });
addText({ html: 'Two-day battery.', cls: 'h2', x: L - 4, y: 500, tin: 17.45, tout: 19.7, grad: [0] });
const bar = document.createElement('div'); bar.className = 'bar'; bar.style.left = L + 'px'; bar.style.top = '590px'; bar.style.width = '520px'; bar.innerHTML = '<i></i>'; ui.appendChild(bar);
addText({ html: '5,500 mAh · 120W charge in 18 min', cls: 'spec', x: L, y: 640, tin: 18.2, tout: 19.7, mode: 'fade' });
// S7 colorways
const cwLabel = addText({ html: '', cls: 'eyebrow', x: 960, y: 980, align: 'center', tin: 20.0, tout: 21.35, mode: 'fade' });
// S8 climax
addText({ html: 'See beyond.', cls: 'h1', x: 960, y: 118, align: 'center', tin: 22.35, tout: 24.75, grad: [1] });
// S9 end card
addText({ html: 'VYRA <b>One</b>', cls: 'logo', x: L - 8, y: 470, tin: 25.3, tout: 99, ls0: .2, ls1: -.045, mode: 'track', dur: .8 });
addText({ html: 'See beyond.', cls: 'spec', x: L, y: 575, tin: 26.0, tout: 99, mode: 'fade' });
addText({ html: '<span class="grad">Pre-order now</span>', cls: 'cta', x: L, y: 700, tin: 26.6, tout: 99, mode: 'fade' });
addText({ html: 'Available 11.11 · vyra.example', cls: 'small', x: L, y: 752, tin: 26.9, tout: 99, mode: 'fade' });

// halo-ring transition overlay (signature motif)
const ringEl = document.createElement('div');
Object.assign(ringEl.style, { position: 'absolute', left: '0', top: '0', width: '200px', height: '200px', borderRadius: '50%', border: '6px solid #a99bff', boxShadow: '0 0 40px #7c5cff, inset 0 0 40px #22d3ff', opacity: 0 });
ui.appendChild(ringEl);
function ring(x, y, p, op) { const s = lerp(.05, 14, inExpo(p)); ringEl.style.transform = `translate(${x - 100}px,${y - 100}px) scale(${s})`; ringEl.style.opacity = op; ringEl.style.borderWidth = lerp(6, 2, p) + 'px'; }

// ---------- shot logic ----------
const v3 = new THREE.Vector3(), look = new THREE.Vector3();
function showOnly(name) { for (const k in phones) phones[k].visible = k === name; }
function place(p, x, y, z, rx, ry, rz) { p.position.set(x, y, z); p.rotation.set(rx, ry, rz, 'YXZ'); }
function cam(x, y, z, lx, ly, lz, fov = 30) { camera.position.set(x, y, z); camera.fov = fov; camera.updateProjectionMatrix(); camera.lookAt(lx, ly, lz); fitBg(); }
function beatPulse(t, from) { if (t < from) return 0; const b = (t - from) % BEAT; return Math.exp(-b * 7); }

function apply(t) {
  let haloI = 0, scr = 0, glow = 0, glowC = [.5, .5], glowR = .55, envRot = 0, envI = 1, part = 0, burst = 0, flash = 0, fade = 1, exposure = 1;
  ringEl.style.opacity = 0; bar.style.display = 'none';
  const P = phones.graphite;
  for (const k in phones) phones[k].scale.setScalar(1);

  if (t < 2) { // S1 hook: rim light sweeps the edge out of darkness
    showOnly('graphite'); const u = seg(t, 0, 2);
    place(P, 0, 0, 0, .1, lerp(-1.2, -.95, outCubic(u)), .42);
    cam(-1.5, 1.5, 15.5 - u * 1.2, 0, 1.2, 0, 30);
    envRot = lerp(-2.4, .4, inOutCubic(u)); envI = lerp(.35, 1.25, outCubic(u));
    exposure = lerp(.0, 1, outExpo(seg(t, 0, .5)));
    part = .35 * u;
  } else if (t < 5) { // S2 reveal + brand
    showOnly('graphite'); const u = seg(t, 2, 5), e = outExpo(seg(t, 2, 4.2));
    place(P, 4.6, -.2, 0, -.06, Math.PI + lerp(.95, .3, e), .04);
    cam(0, 0, lerp(44, 39.5, inOutCubic(u)), 0, 0, 0);
    haloI = outExpo(seg(t, 2.4, 3.2)) * (1 + .5 * beatPulse(t, 2));
    glow = .7 * outCubic(seg(t, 2, 3)); glowC = [.68, .5];
    envRot = lerp(.4, 1.1, u); part = .4;
  } else if (t < 9) { // S3 design / titanium orbit
    showOnly('graphite'); const u = seg(t, 5, 9), e = inOutCubic(u);
    place(P, -3.6, .3, 0, lerp(.32, .12, e), lerp(-1.05, -.4, e), lerp(-.18, -.06, e));
    cam(0, lerp(2, 0, e), lerp(37, 33, e), 0, 0, 0);
    envRot = lerp(-.6, 1.4, e); glow = .45; glowC = [.33, .5]; part = .4;
    if (t > 8.7) { const p = seg(t, 8.7, 9.0); ring(560, 540, p, 1 - p * .3); }
  } else if (t < 13) { // S4 camera macro, crash zoom into lens
    showOnly('graphite'); const u = seg(t, 9, 13);
    place(P, 0, 0, 0, -.05, Math.PI + lerp(.2, -.04, outCubic(u)), lerp(.06, -.02, u));
    P.updateMatrixWorld(true); P.userData.mainLens.getWorldPosition(v3);
    const push = lerp(9.5, 6.2, outCubic(seg(t, 9, 11.6)));
    const crash = inExpo(seg(t, 11.7, 12.95));
    const d = lerp(push, .55, crash);
    const off = lerp(1, 0, crash);
    cam(v3.x - 1.1 * off, v3.y + .5 * off, v3.z + d, v3.x - 1.5 * off * (push / 9), v3.y + .1 * off, v3.z, lerp(30, 28, crash));
    haloI = 1.1 + .9 * beatPulse(t, 9); envRot = lerp(.2, 1.6, u); glow = .5 * (1 - crash); glowC = [.62, .55]; glowR = .35; part = .55;
    exposure = 1 - .9 * seg(t, 12.75, 13);
    if (t < 9.25) flash = .55 * (1 - seg(t, 9, 9.25));
  } else if (t < 17) { // S5 heroic 180° rotation to the front, screen powers on
    showOnly('graphite'); const u = seg(t, 13, 17), r = inOutExpo(seg(t, 13, 15.5));
    place(P, 0, 0, 0, lerp(.12, 0, r), Math.PI + Math.PI * r + .12 * (1 - r) - .06 * seg(t, 15.5, 17), lerp(-.1, 0, r));
    cam(0, 0, lerp(42, 37, outCubic(u)), 0, 0, 0);
    exposure = outExpo(seg(t, 13, 13.4));
    scr = outCubic(seg(t, 14.6, 15.4)) * (1 + .15 * Math.exp(-(t - 14.6) * 4) * (t > 14.6));
    haloI = 1; envRot = lerp(-1, 1, inOutCubic(u)); glow = .65 * outCubic(seg(t, 14.6, 15.6)); glowC = [.5, .5]; glowR = .4; part = .4;
  } else if (t < 20) { // S6 battery / chip
    showOnly('graphite'); const u = seg(t, 17, 20), e = outCubic(u);
    place(P, 4.4, lerp(-.6, .2, e), 0, -.08, lerp(-.55, -.3, e), -.1);
    cam(0, 0, lerp(37, 34.5, e), 0, 0, 0);
    scr = 1; haloI = 1; envRot = lerp(.2, 1.2, u); glow = .55; glowC = [.67, .5]; part = .45;
    bar.style.display = 'block';
    const bo = clamp(seg(t, 17.6, 17.9)) * (1 - seg(t, 19.7, 19.95));
    bar.style.opacity = bo; bar.firstChild.style.width = (outExpo(seg(t, 18.1, 19.4)) * 100) + '%';
  } else if (t < 21.5) { // S7 colorway cuts on the beat
    const i = Math.min(2, Math.floor((t - 20) / BEAT)), names = ['graphite', 'glacier', 'ember'];
    const p = phones[names[i]]; showOnly(names[i]); const u = ((t - 20) % BEAT) / BEAT;
    const angles = [[Math.PI + .5, .2], [Math.PI - .45, -.15], [Math.PI + .2, .3]];
    place(p, 0, 0, 0, -.05, angles[i][0] - u * .12, angles[i][1]);
    cam(0, 0, 33 - u * 1.2, 0, 0, 0);
    haloI = 1.2; envRot = .4 + i * .9 + u * .3; glow = .55; glowC = [.5, .5]; glowR = .45; part = .4;
    cwLabel.innerHTML = COLORWAYS[names[i]].name;
    flash = .25 * Math.exp(-u * 12);
    fade = 1 - seg(t, 21.38, 21.5);
  } else if (t < 22) { // 0.5s of silence & black before the drop
    showOnly('none'); fade = 0;
  } else if (t < 25) { // S8 climax: three-phone lineup + impact
    const u = seg(t, 22, 25), e = outExpo(seg(t, 22, 23.6));
    for (const k in phones) phones[k].visible = true;
    place(phones.graphite, 0, lerp(-3.4, -1.3, e), 1.5, 0, lerp(-.35, .12, outCubic(u)), 0);
    place(phones.glacier, lerp(-4, -9.2, e), lerp(-3.4, -1.8, e), -2, 0, Math.PI - .55 + .1 * u, .05);
    place(phones.ember, lerp(4, 9.2, e), lerp(-3.4, -1.8, e), -2, 0, Math.PI + .55 - .1 * u, -.05);
    cam(lerp(-2, 2, inOutCubic(u)), 1.2, lerp(40, 44, outCubic(u)), 0, -.8, 0, 32);
    scr = 1; haloI = 1.3 + beatPulse(t, 22); envRot = lerp(-.8, .9, u);
    glow = 1.25 * (1 - .4 * u) + .6 * Math.exp(-(t - 22) * 3); glowC = [.5, .48]; glowR = .5 + .2 * e;
    part = .8; burst = outExpo(seg(t, 22, 24)) * .35;
    flash = .85 * Math.exp(-(t - 22) * 9);
  } else { // S9 end card
    showOnly('graphite'); const u = seg(t, 25, 30), e = outExpo(seg(t, 25, 26.8));
    place(P, 5.2, lerp(-1.5, -.2, e), 0, -.02, lerp(-.42, -.22, outCubic(u)), 0);
    cam(0, 0, 40, 0, 0, 0);
    scr = 1; haloI = 1; envRot = lerp(.1, .8, u); glow = .75 * e; glowC = [.71, .5]; glowR = .42; part = .35;
    exposure = outExpo(seg(t, 25, 25.35));
  }

  // apply globals
  for (const k in phones) phones[k].userData.scr.emissiveIntensity = scr * 1.05;
  const hc = new THREE.Color(0x8f7bff).multiplyScalar(haloI * 4);
  halos.forEach(h => h.color.copy(hc));
  scene.environmentRotation.set(0, envRot, 0);
  scene.environmentIntensity = envI;
  bgMat.uniforms.uGlow.value = glow; bgMat.uniforms.uC.value.set(glowC[0], glowC[1]); bgMat.uniforms.uR.value = glowR; bgMat.uniforms.uT.value = t;
  pMat.opacity = part; updateParticles(t, burst);
  renderer.toneMappingExposure = exposure * 1.05;
  finish.uniforms.uT.value = t; finish.uniforms.uFlash.value = flash; finish.uniforms.uFade.value = fade;
  flashEl.style.opacity = 0;
  if (scr > 0) drawScreen(t);
}

window.seek = (t) => { apply(t); updateTexts(t); composer.render(); };
window.ready = (async () => {
  await Promise.all(['300', '400', '500', '600', '700'].map(w => document.fonts.load(`${w} 40px "Inter Display"`)));
  drawWordmark(); drawScreen(0);
  window.seek(0); return true;
})();
