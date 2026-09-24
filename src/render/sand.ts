import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.ts';

export interface RakeFeature {
  x: number;
  z: number;
  r: number;
}

const MAX_FEATURES = 12;

/**
 * Raked-gravel ground (karesansui). Grooves are computed analytically in the fragment shader:
 * concentric ripples around the board and each rock, straight parallel lines elsewhere.
 */
export function createSand(boardHalf: number, features: RakeFeature[]) {
  const geo = new THREE.PlaneGeometry(80, 80, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xcfc1a2, roughness: 0.96, metalness: 0 });
  const feats = Array.from({ length: MAX_FEATURES }, (_, i) =>
    i < features.length ? new THREE.Vector3(features[i].x, features[i].z, features[i].r) : new THREE.Vector3(999, 999, 0),
  );
  const uniforms = {
    uFeat: { value: feats },
    uFeatN: { value: features.length },
    uBoard: { value: new THREE.Vector2(boardHalf, boardHalf) },
    uRipple: { value: new THREE.Vector4(0, 0, -10, 0) }, // x,z,startTime,strength
    uTime: { value: 0 },
  };
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
uniform vec3 uFeat[${MAX_FEATURES}];
uniform int uFeatN;
uniform vec2 uBoard;
uniform float uTime;
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
  float t = smoothstep(1.35, 1.75, d);
  float h = mix(rings, lines * 0.7, t);
  // soften right next to objects (a smoothed skirt of gravel)
  h *= smoothstep(0.02, 0.18, d);
  return h;
}
`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec2 wp = vWPos.xz;
float aa = clamp(1.0 - fwidth(wp.x + wp.y) * FREQ * 0.18, 0.0, 1.0);
float e = 0.012;
float h0 = rakeH(wp);
float hx = rakeH(wp + vec2(e, 0.0));
float hz = rakeH(wp + vec2(0.0, e));
float grain = hash13(floor(vec3(wp * 260.0, 0.0)));
float blotch = fbm(vec3(wp * 0.25, 3.0));
vec3 sandCol = diffuseColor.rgb * (0.9 + 0.12 * blotch);
sandCol *= mix(1.0, 0.95 + 0.05 * (h0 * 0.5 + 0.5), aa);
sandCol *= 0.9 + 0.2 * grain;
// darker damp band at the base of objects
float dObj = fieldD(wp);
sandCol *= mix(0.78, 1.0, smoothstep(0.0, 0.35, dObj));
diffuseColor.rgb = sandCol;
vec2 sandGrad = vec2(hx - h0, hz - h0) / e * aa;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
vec3 nW = normalize(vec3(-sandGrad.x * 0.012, 1.0, -sandGrad.y * 0.012));
nW.xz += (vec2(hash13(vec3(wp*300.0,1.0)), hash13(vec3(wp*300.0,2.0))) - 0.5) * 0.12;
normal = normalize((viewMatrix * vec4(normalize(nW), 0.0)).xyz);`,
      );
  };
  mat.customProgramCacheKey = () => 'sand';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return { mesh, uniforms };
}
