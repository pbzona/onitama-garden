import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.ts';

export interface RakeFeature {
  x: number;
  z: number;
  r: number;
}

const MAX_FEATURES = 28;
/** Half-size (world units) of the raked area; the garden walls sit at ±14. */
const HALF = 15;

/**
 * Raked-gravel ground (karesansui).
 *
 * The rake pattern (concentric ripples around the board and rocks, straight lines elsewhere) is
 * static, so it is rendered ONCE into a texture at startup instead of being evaluated per pixel per
 * frame (that used to loop over every rock four times per pixel, across most of the screen).
 * Texture channels: R = groove height, G = tint (blotches + damp band near objects), BA = gradient.
 */
export function createSand(renderer: THREE.WebGLRenderer, boardHalf: number, features: RakeFeature[], res = 2048) {
  const tex = bakeRake(renderer, boardHalf, features, res);

  const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xcfc1a2, roughness: 0.96, metalness: 0 });
  const uniforms = { uRake: { value: tex } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWPos;
uniform sampler2D uRake;
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec2 wp = vWPos.xz;
vec4 rk = texture2D(uRake, wp / ${(HALF * 2).toFixed(1)} + 0.5);
float aa = clamp(1.0 - fwidth(wp.x + wp.y) * 39.27 * 0.18, 0.0, 1.0);
float h0 = rk.r * 2.0 - 1.0;
float grain = hash13(floor(vec3(wp * 260.0, 0.0)));
vec3 sandCol = diffuseColor.rgb * rk.g * 1.1;
sandCol *= mix(1.0, 0.95 + 0.05 * (h0 * 0.5 + 0.5), aa);
sandCol *= 0.9 + 0.2 * grain;
diffuseColor.rgb = sandCol;
vec2 sandGrad = (rk.ba * 2.0 - 1.0) * 64.0 * aa;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
vec3 nW = normalize(vec3(-sandGrad.x * 0.012, 1.0, -sandGrad.y * 0.012));
nW.xz += (vec2(hash13(vec3(wp*300.0,1.0)), hash13(vec3(wp*300.0,2.0))) - 0.5) * 0.12;
normal = normalize((viewMatrix * vec4(normalize(nW), 0.0)).xyz);`,
      );
  };
  mat.customProgramCacheKey = () => 'sand-baked';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;

  // Plain ground beyond the walls (only glimpsed over the wall tops) — cheap, no shadows.
  const outerGeo = new THREE.PlaneGeometry(90, 90, 1, 1);
  outerGeo.rotateX(-Math.PI / 2);
  const outer = new THREE.Mesh(outerGeo, new THREE.MeshLambertMaterial({ color: 0x6f6456 }));
  outer.position.y = -0.03;
  mesh.add(outer);
  return { mesh, uniforms };
}

function bakeRake(renderer: THREE.WebGLRenderer, boardHalf: number, features: RakeFeature[], res: number) {
  const feats = Array.from({ length: MAX_FEATURES }, (_, i) =>
    i < features.length ? new THREE.Vector3(features[i].x, features[i].z, features[i].r) : new THREE.Vector3(999, 999, 0),
  );
  const rt = new THREE.WebGLRenderTarget(res, res, {
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    depthBuffer: false,
  });
  rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uFeat: { value: feats },
      uFeatN: { value: Math.min(features.length, MAX_FEATURES) },
      uBoard: { value: new THREE.Vector2(boardHalf, boardHalf) },
    },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
varying vec2 vUv;
uniform vec3 uFeat[${MAX_FEATURES}];
uniform int uFeatN;
uniform vec2 uBoard;
${NOISE_GLSL}
float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0); return mix(b, a, h) - k*h*(1.0-h); }
const float FREQ = 6.2831853 / 0.16;
float fieldD(vec2 p){
  float d = sdRR(p, uBoard + 0.18, 0.5);
  for (int i = 0; i < ${MAX_FEATURES}; i++){
    if (i >= uFeatN) break;
    vec3 f = uFeat[i];
    d = smin(d, length(p - f.xy) - f.z, 0.8);
  }
  return d;
}
float rakeH(vec2 p){
  float d = fieldD(p);
  float wobble = gnoise(vec3(p * 0.35, 1.0)) * 0.06;
  float rings = sin((d + wobble) * FREQ);
  float lines = sin((p.y + wobble * 0.6 + sin(p.x * 0.05) * 0.2) * FREQ);
  float h = mix(rings, lines * 0.7, smoothstep(1.35, 1.75, d));
  return h * smoothstep(0.02, 0.18, d);
}
void main(){
  vec2 p = (vUv - 0.5) * ${(HALF * 2).toFixed(1)};
  float e = 0.012;
  float h0 = rakeH(p);
  vec2 g = vec2(rakeH(p + vec2(e, 0.0)) - h0, rakeH(p + vec2(0.0, e)) - h0) / e;
  float blotch = fbm(vec3(p * 0.25, 3.0));
  float tint = (0.9 + 0.12 * blotch) * mix(0.78, 1.0, smoothstep(0.0, 0.35, fieldD(p)));
  gl_FragColor = vec4(h0 * 0.5 + 0.5, tint / 1.1, clamp(g / 64.0, -1.0, 1.0) * 0.5 + 0.5);
}`,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prev);
  mat.dispose();
  quad.geometry.dispose();
  return rt.texture;
}
