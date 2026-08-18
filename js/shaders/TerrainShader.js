import { waterFragmentChunk } from './chunks/WaterChunk.js';
import { landFragmentChunk, landColorAdjustmentChunk } from './chunks/LandChunk.js';

// Inyecciones para el Vertex Shader (Comunes a todo el terreno)
export const mapVertexCommon = `
#include <common>
varying vec2 vGlobalPos;
varying float vHeight;
varying vec3 vWorldPosition;
varying vec2 vLocalPosition;
`;

export const mapVertexUv = `
#include <uv_vertex>
vGlobalPos = uv;
vLocalPosition = position.xy;
`;

export const mapVertexBegin = `
#include <begin_vertex>
vHeight = position.z;
`;

export const mapVertexWorldPos = `
#include <worldpos_vertex>
vWorldPosition = worldPosition.xyz;
`;

// Inyecciones para el Fragment Shader
export const mapFragmentCommon = `
#include <common>
varying vec2 vGlobalPos;
varying float vHeight;
varying vec3 vWorldPosition;
varying vec2 vLocalPosition;
uniform float uTime;
uniform float uZoomAlpha;
uniform sampler2D tNoise;
uniform sampler2D tMapDataPacked;
uniform sampler2D tPackedMasks;
uniform sampler2D tFlowMap;
uniform vec2 uMountainCenter;

float fbm(vec2 p) {
    return texture2D(tNoise, p * 0.03).r;
}

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float snoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float simplexNoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

export const mapFragmentColorChunk = `
#include <map_fragment>
${landFragmentChunk}
`;

export const mapDitheringFragment = `
#include <dithering_fragment>
${waterFragmentChunk}
${landColorAdjustmentChunk}

// --- FOCUS POLÍTICO (LUZ DIVINA CON VOLUMEN Y RIQUEZA) ---
// Extraemos la máscara original
float regionPixelAlpha = dot(texture2D(tFocusMask, vGlobalPos), uFocusChannel) * uFocusedRegionAlpha;

// 1. Ruido orgánico para darle un aura mágica y viva (más notoria y fluida)
float auraNoise = fbm(vGlobalPos * 12.0 - vec2(uTime * 0.08, uTime * 0.04));

// 2. Hacemos que la luz emane desde el centro y se desvanezca más suavemente
float softGlow = pow(regionPixelAlpha, 1.5);

// 3. Modulación EXTREMA por altura: los valles brillan poco (15%), 
// las cumbres brillan al máximo (100%). Al usar esto, la luz NUNCA se verá plana
// aunque usemos luz pura (aditiva) de noche.
float heightMod = mix(0.15, 1.0, smoothstep(0.0, 2.5, vHeight));

// 4. Color Divino: Oro puro y rico
vec3 divineGold = vec3(1.0, 0.82, 0.35);

// 5. Pulso celestial con auraNoise visible. 
// La luz late, fluye y cambia con el ruido para sentirse verdaderamente mágica.
float pulse = sin(uTime * 1.5 + auraNoise * 4.0) * 0.25 + 0.75;

// --- MÁSCARAS DE TEXTO ---
float distFocusText = length(vec2(
    (vGlobalPos.x - uFocusTextUV.x) / max(uFocusTextUV.z * 0.6, 0.02),
    (vGlobalPos.y - uFocusTextUV.y) / 0.05
));
float isFocusedText = 1.0 - smoothstep(0.7, 1.2, distFocusText);

float distHoverText = length(vec2(
    (vGlobalPos.x - uHoverTextUV.x) / max(uHoverTextUV.z * 0.6, 0.02),
    (vGlobalPos.y - uHoverTextUV.y) / 0.05
));
float isHoveredText = 1.0 - smoothstep(0.7, 1.2, distHoverText);

// Intensidad general del brillo mágico
float glowPower = softGlow * heightMod * pulse;

// --- OSCURECIMIENTO DEL ENTORNO (Vignette de Focus) ---
float rawFocusMask = dot(texture2D(tFocusMask, vGlobalPos), uFocusChannel);
// Oscurecemos hasta un 15% todo el mapa que NO sea la región activa
float outsideDimming = (1.0 - rawFocusMask) * uFocusedRegionAlpha;
gl_FragColor.rgb *= (1.0 - outsideDimming * 0.15);

// 6. LUZ PURA Y AUTÓNOMA: En lugar de multiplicar por el color del terreno 
// (lo cual hace que no se vea de noche porque el terreno es negro), sumamos luz aditiva pura.
// Como la luz ya está esculpida por la altura de las montañas (heightMod), 
// se verá increíblemente 3D y voluminosa de noche y de día.
// Se reduce la intensidad a 0.30 para que sea un brillo más sutil y elegante.
vec3 addedGlow = divineGold * glowPower * 0.30;

gl_FragColor.rgb += addedGlow;

// --- TEXTOS DE REGION PROYECTADOS ---
vec4 regionTextNormal = texture2D(tRegionText, vGlobalPos);
vec4 regionTextGlow = texture2D(tRegionTextGlow, vGlobalPos);

// RESTAURADO: El texto vuelve a brillar intensamente en amarillo cuando la región está enfocada.
float textGlowMask = clamp(isHoveredText * uHoverTextAlpha + isFocusedText * uFocusedRegionAlpha, 0.0, 1.0);

// Mezclar texto base y texto con brillo
vec4 finalRegionText = mix(regionTextNormal, regionTextGlow, textGlowMask);

// --- AJUSTE DE VISIBILIDAD NOCTURNA ---
// Calculamos cuán oscuro está el terreno bajo el texto
float bgLuminance = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
// nightFactor = 1.0 si es de noche (muy oscuro), 0.0 si es de día
float nightFactor = 1.0 - smoothstep(0.05, 0.25, bgLuminance);

// Color claro (pergamino/dorado pálido) para que contraste contra la noche
vec3 nightTextColor = vec3(0.85, 0.75, 0.60);
// Solo aclaramos el texto normal (si no está brillando ya por el hover/focus)
finalRegionText.rgb = mix(finalRegionText.rgb, nightTextColor, nightFactor * (1.0 - textGlowMask));

// Mezclar el texto final con el terreno
gl_FragColor.rgb = mix(gl_FragColor.rgb, finalRegionText.rgb, finalRegionText.a * 0.85 * uRegionOpacity);
`;
