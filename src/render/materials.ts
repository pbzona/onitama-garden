import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.ts';

const BUMP_GLSL = /* glsl */ `
vec3 bumpNormal(vec3 pos, vec3 n, float h, float strength){
  vec3 dpdx = dFdx(pos); vec3 dpdy = dFdy(pos);
  float dhdx = dFdx(h); float dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, n); vec3 r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * n - strength * grad);
}
`;

export interface StoneOpts {
  base: THREE.ColorRepresentation;
  dark: THREE.ColorRepresentation; // low-frequency mottling colour
  speck1: THREE.ColorRepresentation;
  speck2: THREE.ColorRepresentation;
  scale?: number; // mottling frequency
  speckScale?: number;
  speckAmount?: number;
  roughness?: number;
  bump?: number;
  clearcoat?: number;
  sheen?: THREE.ColorRepresentation;
  strata?: number; // stretch noise along Y for layered stone
  engraveMap?: THREE.Texture; // R = groove, G = gold inlay, sampled on top faces in object XZ
  engraveSize?: number;
  topY?: number;
  offset?: THREE.Vector3; // shifts the noise so shared geometry looks unique
  octaves?: number; // fbm octaves: 4 for hero objects, 2 for scenery (big screen area)
}

/**
 * Procedural stone: object-space fbm mottling + speckles + bump, no UVs needed.
 * Works on lathe/icosahedron/box geometry alike and sticks to moving pieces.
 */
export function stoneMaterial(o: StoneOpts): THREE.MeshStandardMaterial {
  // Physical (clearcoat/sheen) only where it's actually used; Standard is noticeably cheaper per pixel.
  const physical = !!o.clearcoat || !!o.sheen;
  const mat: THREE.MeshStandardMaterial = physical
    ? new THREE.MeshPhysicalMaterial({ color: o.base, roughness: o.roughness ?? 0.7, metalness: 0, clearcoat: o.clearcoat ?? 0, clearcoatRoughness: 0.35 })
    : new THREE.MeshStandardMaterial({ color: o.base, roughness: o.roughness ?? 0.7, metalness: 0 });
  const oct = o.octaves ?? 4;
  mat.defines = { ...(mat.defines ?? {}), FBM_OCT: oct };
  if (o.sheen && mat instanceof THREE.MeshPhysicalMaterial) {
    mat.sheen = 1;
    mat.sheenColor = new THREE.Color(o.sheen);
    mat.sheenRoughness = 0.6;
  }
  const uniforms = {
    uBase: { value: new THREE.Color(o.base) },
    uDark: { value: new THREE.Color(o.dark) },
    uS1: { value: new THREE.Color(o.speck1) },
    uS2: { value: new THREE.Color(o.speck2) },
    uScale: { value: o.scale ?? 2.5 },
    uSpeck: { value: o.speckScale ?? 40 },
    uSpeckAmt: { value: o.speckAmount ?? 1 },
    uBump: { value: o.bump ?? 0.02 },
    uStrata: { value: o.strata ?? 1 },
    uEngrave: { value: o.engraveMap ?? null },
    uEngraveSize: { value: o.engraveSize ?? 1 },
    uTopY: { value: o.topY ?? 0 },
    uOffset: { value: o.offset ?? new THREE.Vector3() },
  };
  const useEngrave = !!o.engraveMap;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;\nvObjN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vObjPos; varying vec3 vObjN;
uniform vec3 uBase, uDark, uS1, uS2; uniform float uScale, uSpeck, uSpeckAmt, uBump, uStrata;
uniform sampler2D uEngrave; uniform float uEngraveSize, uTopY; uniform vec3 uOffset;
${NOISE_GLSL}
${BUMP_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec3 op = vObjPos + uOffset;
vec3 sp = op * vec3(1.0, uStrata, 1.0);
float n1 = fbm(sp * uScale);
float n2 = gnoise(sp * uScale * 6.0);
float s1 = smoothstep(0.62, 0.68, gnoise(op * uSpeck) * 0.5 + 0.5);
float s2 = smoothstep(0.66, 0.72, gnoise(op * uSpeck * 1.9 + 7.3) * 0.5 + 0.5);
vec3 stoneCol = mix(uBase, uDark, smoothstep(-0.25, 0.35, n1));
stoneCol *= 0.92 + 0.16 * n2;
stoneCol = mix(stoneCol, uS1, s1 * uSpeckAmt);
stoneCol = mix(stoneCol, uS2, s2 * uSpeckAmt);
float stoneH = n1 * 0.6 + n2 * 0.25 + (s1 - s2) * 0.08;
float goldMask = 0.0;
${
  useEngrave
    ? `if (vObjN.y > 0.95 && vObjPos.y > uTopY - 0.01) {
  vec2 euv = vObjPos.xz / uEngraveSize + 0.5;
  euv.y = 1.0 - euv.y;
  vec4 eng = texture2D(uEngrave, euv);
  stoneH -= eng.r * 0.7;
  stoneCol *= 1.0 - eng.r * 0.6;
  goldMask = eng.g;
  stoneH -= eng.g * 0.9;
}`
    : ''
}
stoneCol = mix(stoneCol, vec3(0.83, 0.62, 0.30), goldMask);
diffuseColor.rgb = stoneCol;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = clamp(roughness + n2 * 0.12 - s1 * 0.15, 0.05, 1.0);
roughnessFactor = mix(roughnessFactor, 0.28, goldMask);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `float metalnessFactor = mix(metalness, 1.0, goldMask);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
normal = bumpNormal(-vViewPosition, normal, stoneH, uBump);`,
      );
  };
  mat.customProgramCacheKey = () => 'stone' + (useEngrave ? 'E' : '') + (o.sheen ? 'S' : '') + (physical ? 'P' : '') + oct;
  return mat;
}

// Palette -------------------------------------------------------------

export const PALETTE = {
  granite: { base: 0xe2d9c6, dark: 0xc4b59b, speck1: 0x5a524a, speck2: 0xf7f2e8 },
  basalt: { base: 0x2b2c30, dark: 0x1a1b1e, speck1: 0x55565c, speck2: 0x0c0c0e },
  slate: { base: 0x434a50, dark: 0x2a3035, speck1: 0x5d656d, speck2: 0x1f2327 },
  boulder: { base: 0x7d776c, dark: 0x5b574f, speck1: 0x9a9384, speck2: 0x3c3a35 },
  moss: { base: 0x46602a, dark: 0x263a15, speck1: 0x7a8a3c, speck2: 0x1b2a0e },
  indigo: 0x3c5486,
  vermilion: 0xc0472e,
  gold: 0xd9a54a,
};

const rOff = () => new THREE.Vector3(Math.random() * 50, Math.random() * 50, Math.random() * 50);
export function graniteMat() {
  return stoneMaterial({ ...PALETTE.granite, offset: rOff(), scale: 2.2, speckScale: 95, speckAmount: 0.55, roughness: 0.5, bump: 0.008, clearcoat: 0.3 });
}
export function basaltMat() {
  return stoneMaterial({ ...PALETTE.basalt, offset: rOff(), scale: 3, speckScale: 60, speckAmount: 0.7, roughness: 0.38, bump: 0.01, clearcoat: 0.6 });
}
export function boulderMat() {
  return stoneMaterial({ ...PALETTE.boulder, octaves: 2, scale: 0.9, speckScale: 18, speckAmount: 0.5, roughness: 0.9, bump: 0.06, strata: 2.2 });
}
export function mossMat() {
  return stoneMaterial({ ...PALETTE.moss, octaves: 2, scale: 3.5, speckScale: 70, speckAmount: 0.8, roughness: 1, bump: 0.14, sheen: 0x8aa04c });
}
