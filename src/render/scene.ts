import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export type Quality = 'high' | 'low';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.9 },
    uGrain: { value: 0.035 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uGrain; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // gentle split-tone: cool shadows, warm highlights
      float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb = mix(c.rgb * vec3(0.93,0.97,1.05), c.rgb * vec3(1.04,1.0,0.94), smoothstep(0.15, 0.8, l));
      vec2 q = vUv - 0.5;
      float v = 1.0 - dot(q, q) * uVignette * 1.6;
      c.rgb *= clamp(v, 0.0, 1.0);
      c.rgb += (h(vUv * 1000.0 + uTime) - 0.5) * uGrain;
      gl_FragColor = c;
    }`,
};

export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  composer: EffectComposer;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: Sky;
  bloom: UnrealBloomPass;
  grade: ShaderPass;
  quality: Quality;
  private pmrem: THREE.PMREMGenerator;
  private maxDpr: number;

  constructor(container: HTMLElement, quality: Quality) {
    this.quality = quality;
    this.maxDpr = quality === 'high' ? 2 : 1.25;
    const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, this.maxDpr));
    r.setSize(container.clientWidth, container.clientHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    // Shadows are expensive at 4096², and almost every caster in the garden is
    // static. Let the app invalidate the map only while pieces/cards move, plus
    // occasional refreshes for the falling leaves. This preserves the exact map
    // resolution and filtering without rebuilding it on every display refresh.
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
    container.appendChild(r.domElement);
    this.renderer = r;

    this.camera = new THREE.PerspectiveCamera(36, container.clientWidth / container.clientHeight, 0.1, 200);
    this.camera.position.set(0, 9.2, 9.6);

    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.target.set(0, 0.2, 0.2);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 22;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 1.2;
    this.controls.rotateSpeed = 0.55;

    // ---- dusk sky
    this.sky = new Sky();
    this.sky.scale.setScalar(400);
    const su = this.sky.material.uniforms;
    su.turbidity.value = 4.5;
    su.rayleigh.value = 1.8;
    su.mieCoefficient.value = 0.0025;
    su.mieDirectionalG.value = 0.8;
    su.showSunDisc.value = 0;
    su.cloudCoverage.value = 0.38;
    su.cloudDensity.value = 0.5;
    su.cloudScale.value = 0.00035;
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(86), THREE.MathUtils.degToRad(-128));
    su.sunPosition.value.copy(sunDir);
    this.scene.add(this.sky);

    this.pmrem = new THREE.PMREMGenerator(r);
    this.refreshEnvironment();

    this.scene.fog = new THREE.Fog(0x6f6470, 26, 75);

    // ---- lights
    this.hemi = new THREE.HemisphereLight(0x8391bb, 0x4a3a2e, 0.42);
    this.scene.add(this.hemi);
    // Warm low sun from behind-left: long raking shadows across the gravel.
    this.sun = new THREE.DirectionalLight(0xffa25c, 3.6);
    this.sun.position.set(-11, 7.5, -9);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    const sm = quality === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -13;
    sc.right = 13;
    sc.top = 11;
    sc.bottom = -11;
    sc.near = 1;
    sc.far = 45;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    // Cool fill from the camera side so faces toward the player aren't lost in shadow.
    const fill = new THREE.DirectionalLight(0x8fa3d6, 0.55);
    fill.position.set(6, 8, 10);
    this.scene.add(fill);

    // ---- post
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: quality === 'high' ? 4 : 2,
    });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.65, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    window.addEventListener('resize', () => this.resize(container));
    this.resize(container);
  }

  /** Switch graphics quality at runtime (no reload needed). */
  setQuality(q: Quality, container: HTMLElement) {
    if (q === this.quality) return;
    this.quality = q;
    this.maxDpr = q === 'high' ? 2 : 1.25;
    const sm = q === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.map?.dispose();
    (this.sun.shadow as any).map = null;
    this.renderer.shadowMap.needsUpdate = true;
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      rt.samples = q === 'high' ? 4 : 2;
      rt.dispose();
    }
    this.resize(container);
  }

  refreshEnvironment() {
    // Bake the sky into an environment map for image-based lighting.
    const envScene = new THREE.Scene();
    const s = new Sky();
    s.scale.setScalar(100);
    for (const k of Object.keys(this.sky.material.uniforms))
      (s.material.uniforms as any)[k].value = (this.sky.material.uniforms as any)[k].value;
    s.material.uniforms.showSunDisc.value = 0;
    envScene.add(s);
    const rt = this.pmrem.fromScene(envScene, 0.02);
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.55;
  }

  resize(container: HTMLElement) {
    const w = container.clientWidth, h = container.clientHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxDpr));
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxDpr));
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // Fit the board + card rows: widen the effective view on portrait screens.
    const aspect = w / h;
    this.camera.fov = aspect < 1 ? 36 + (1 - aspect) * 34 : 36;
    this.camera.updateProjectionMatrix();
  }

  render(t: number, refreshShadows = false) {
    this.grade.uniforms.uTime.value = t % 100;
    this.sky.material.uniforms.time.value = t;
    if (refreshShadows) this.renderer.shadowMap.needsUpdate = true;
    this.composer.render();
  }
}
