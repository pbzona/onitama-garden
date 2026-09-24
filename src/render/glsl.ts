// Shared GLSL snippets for procedural materials.

export const NOISE_GLSL = /* glsl */ `
vec3 _hash3(vec3 p){
  p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));
  return -1.0 + 2.0*fract(sin(p)*43758.5453123);
}
float gnoise(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p);
  vec3 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  return mix(mix(mix(dot(_hash3(i+vec3(0,0,0)),f-vec3(0,0,0)), dot(_hash3(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),
                 mix(dot(_hash3(i+vec3(0,1,0)),f-vec3(0,1,0)), dot(_hash3(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
             mix(mix(dot(_hash3(i+vec3(0,0,1)),f-vec3(0,0,1)), dot(_hash3(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),
                 mix(dot(_hash3(i+vec3(0,1,1)),f-vec3(0,1,1)), dot(_hash3(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);
}
#ifndef FBM_OCT
#define FBM_OCT 5
#endif
float fbm(vec3 p){
  float a = 0.5, s = 0.0;
  for(int i=0;i<FBM_OCT;i++){ s += a*gnoise(p); p = p*2.03 + 17.1; a *= 0.5; }
  return s;
}
float hash13(vec3 p3){
  p3 = fract(p3 * .1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
`;
