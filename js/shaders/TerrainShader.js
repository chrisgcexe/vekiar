import { waterFragmentChunk } from './chunks/WaterChunk.js';
import { landFragmentChunk, landColorAdjustmentChunk } from './chunks/LandChunk.js';
import { divineGlowChunk } from './chunks/DivineGlowChunk.js';
import { seisMentirasChunk } from './chunks/SeisMentirasChunk.js';

// Inyecciones para el Vertex Shader (Comunes a todo el terreno)
export const mapVertexCommon = `
#include <common>
varying vec2 vGlobalPos;
varying float vHeight;
varying vec3 vWorldPosition;
varying vec2 vLocalPosition;
varying vec4 vScreenPos;
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
vScreenPos = projectionMatrix * viewMatrix * worldPosition;
`;

// Inyecciones para el Fragment Shader
export const mapFragmentCommon = `
#include <common>
varying vec2 vGlobalPos;
varying float vHeight;
varying vec3 vWorldPosition;
varying vec2 vLocalPosition;
varying vec4 vScreenPos;
uniform float uTime;
uniform float uZoomAlpha;
uniform sampler2D tNoise;
uniform sampler2D tMapDataPacked;
uniform sampler2D tPackedMasks;
uniform sampler2D tFlowMap;
uniform vec2 uMountainCenter;
uniform vec2 uCloudShadowOffset;
uniform float uCloudShadowDensity;

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

// --- FOCUS Y HOVER (LUZ DIVINA CON GODRAYS Y PARTÍCULAS) ---
${divineGlowChunk}

// --- SHADER ESPECÍFICO: LAS SEIS MENTIRAS ---
${seisMentirasChunk}

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

// --- EFECTO DE SUELO MOJADO Y GOTAS DE LLUVIA (Ripples) ---
// 1. Suelo mojado (oscurece la tierra, haciendo que parezca húmeda)
// Se desvanece suavemente cuando alejamos la cámara a OVERVIEW (uZoomAlpha)
float visibleRain = uRainIntensity * smoothstep(0.0, 0.5, uZoomAlpha);
gl_FragColor.rgb *= mix(1.0, 0.65, visibleRain * (1.0 - smoothstep(1.5, 2.5, vHeight)));

// 2. Ondulaciones de gotas de agua hiper-optimizadas
if (visibleRain > 0.0) {
    vec2 ripUV = vGlobalPos * 250.0; // Densidad de las gotas
    float ripNoise = hash(floor(ripUV)); // Posición aleatoria
    vec2 ripLocal = fract(ripUV) - vec2(0.5); 
    
    // Desfasar el centro de la gota usando ruido
    ripLocal += (vec2(hash(floor(ripUV)+1.0), hash(floor(ripUV)+2.0)) - 0.5) * 0.5;
    float ripDist = length(ripLocal);
    
    // Anillo animado
    float ripTime = fract(uTime * (1.5 + ripNoise) + ripNoise * 10.0);
    float ripRing = smoothstep(ripTime - 0.1, ripTime, ripDist) * smoothstep(ripTime + 0.05, ripTime, ripDist);
    
    // Suavizar al final de la expansión
    ripRing *= (1.0 - ripTime);
    
    // Las gotas solo aparecen en partes bajas y llanas (no en las montañas verticales)
    float ripAlpha = ripRing * visibleRain * smoothstep(2.0, 0.0, vHeight);
    
    // Darle brillo como un reflejo especular del cielo gris
    gl_FragColor.rgb += vec3(0.2, 0.25, 0.3) * ripAlpha;
}

// --- TEXTOS DE REGION PROYECTADOS ---
vec4 macroNormal = texture2D(tRegionText, vGlobalPos);
vec4 macroGlow = texture2D(tRegionTextGlow, vGlobalPos);
vec4 microNormal = texture2D(tSubRegionText, vGlobalPos);
vec4 microGlow = texture2D(tSubRegionTextGlow, vGlobalPos);

// Combine macro and micro based on uMicroTextAlpha
vec4 regionTextNormal = clamp(macroNormal + microNormal * uMicroTextAlpha, 0.0, 1.0);
vec4 regionTextGlow = clamp(macroGlow + microGlow * uMicroTextAlpha, 0.0, 1.0);


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
