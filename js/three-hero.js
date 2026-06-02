/* =====================================================================
   three-hero.js  -  WebGL hero: a flowing iridescent silk drape with
   floating golden dust + mouse parallax. Loaded as an ES module.

   Performance: the Three.js library (~600 KB) is heavy, so we only load
   it when it actually adds value. We SKIP it on phones/tablets, when the
   user prefers reduced motion, or when Data Saver is on, and otherwise we
   import it lazily once the browser is idle. The .hero section already has
   a rich gradient background, so the page looks great even without WebGL.
   ===================================================================== */

const canvas = document.getElementById("hero-canvas");

const mq = (q) => window.matchMedia && window.matchMedia(q).matches;
const prefersReduced = mq("(prefers-reduced-motion: reduce)");
const isSmallOrTouch = mq("(max-width: 820px)") || mq("(pointer: coarse)");
const saveData = !!(navigator.connection && navigator.connection.saveData);

if (canvas && !prefersReduced && !isSmallOrTouch && !saveData) {
  const startHero = () => {
    import("three")
      .then((THREE) => { try { initHero(canvas, THREE); } catch (e) { console.warn("3D hero unavailable:", e); } })
      .catch((e) => console.warn("3D hero skipped:", e));
  };
  if ("requestIdleCallback" in window) {
    requestIdleCallback(startHero, { timeout: 2500 });
  } else {
    setTimeout(startHero, 800);
  }
}

function initHero(canvas, THREE) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x3d0a1f, 0.07);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  /* ---------- flowing silk (shader-driven plane) ---------- */
  const silkGeo = new THREE.PlaneGeometry(16, 10, 160, 110);
  const silkMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(0x5b0e2d) }, // wine
      uColorB: { value: new THREE.Color(0xc9a24b) }, // gold
      uColorC: { value: new THREE.Color(0x7b1e42) }, // soft wine
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying float vWave;
      varying vec3 vNormalW;
      void main() {
        vUv = uv;
        vec3 p = position;
        float w1 = sin(p.x * 0.7 + uTime * 0.9) * 0.6;
        float w2 = sin(p.y * 0.9 + uTime * 0.7) * 0.5;
        float w3 = sin((p.x + p.y) * 0.5 + uTime * 1.3) * 0.4;
        float wave = w1 + w2 + w3;
        p.z += wave;
        vWave = wave;
        // cheap normal estimate for shimmer
        float dx = cos(p.x * 0.7 + uTime * 0.9) * 0.42;
        float dy = cos(p.y * 0.9 + uTime * 0.7) * 0.45;
        vNormalW = normalize(vec3(-dx, -dy, 1.0));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uColorC;
      uniform float uTime;
      varying vec2 vUv;
      varying float vWave;
      varying vec3 vNormalW;
      void main() {
        vec3 light = normalize(vec3(0.4, 0.6, 1.0));
        float diff = clamp(dot(vNormalW, light), 0.0, 1.0);
        float sheen = pow(diff, 3.0);
        float grad = smoothstep(-1.5, 1.5, vWave);
        vec3 base = mix(uColorA, uColorC, vUv.y);
        base = mix(base, uColorB, sheen * 0.55);
        base += uColorB * sheen * 0.25;
        float vign = smoothstep(1.1, 0.2, distance(vUv, vec2(0.5)));
        float alpha = 0.9 * vign;
        gl_FragColor = vec4(base * (0.55 + diff * 0.6), alpha);
      }
    `,
  });
  const silk = new THREE.Mesh(silkGeo, silkMat);
  silk.rotation.set(-0.5, 0.15, 0.25);
  silk.position.set(0.5, -0.4, 0);
  scene.add(silk);

  /* ---------- soft glow sprite behind silk ---------- */
  const glowGeo = new THREE.PlaneGeometry(20, 14);
  const glowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(0xc9a24b) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform vec3 uColor;
      void main(){ float d=distance(vUv,vec2(0.5)); float a=smoothstep(0.5,0.0,d)*0.25; gl_FragColor=vec4(uColor,a); }`,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.z = -3;
  scene.add(glow);

  /* ---------- interaction ---------- */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener("pointermove", (e) => {
    mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  const clock = new THREE.Clock();
  let running = true;
  document.addEventListener("visibilitychange", () => { running = !document.hidden; });

  function animate() {
    requestAnimationFrame(animate);
    if (!running) return;
    const t = clock.getElapsedTime();
    silkMat.uniforms.uTime.value = t;

    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    camera.position.x = mouse.x * 0.8;
    camera.position.y = -mouse.y * 0.5;
    camera.lookAt(0, -0.2, 0);

    silk.rotation.z = 0.25 + Math.sin(t * 0.2) * 0.04;
    silk.rotation.x = -0.5 + mouse.y * 0.05;

    renderer.render(scene, camera);
  }
  animate();
}
