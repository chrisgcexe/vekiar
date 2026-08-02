export const lakeVertexCommon = `
#include <common>
varying vec2 vUv;
varying vec3 vGlobalPos;
uniform float uTime;
uniform sampler2D tBiomesMask;
`;

export const lakeVertexUv = `
#include <uv_vertex>
vUv = uv;
vGlobalPos = position;
`;

export const lakeFragmentCommon = `
#include <common>
varying vec2 vUv;
varying vec3 vGlobalPos;
uniform float uTime;
uniform sampler2D tPackedMasks;
uniform sampler2D tFlowMap;
uniform sampler2D tNoise;
uniform float uZoomAlpha;

// Simplex 2D noise
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v){
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

export const lakeFragment = `
#include <dithering_fragment>

    // Leemos la textura empaquetada (R=Ríos, G=Lagos, B=Desierto, A=Nieve)
    vec4 packedMasks = texture2D(tPackedMasks, vUv);
    
    // El canal Verde (g) contiene la máscara de los lagos (líneas negras sobre fondo blanco)
    float isRiver = 1.0 - smoothstep(0.1, 0.5, packedMasks.g);
    
    // Si no es un lago, descartamos el píxel inmediatamente (100% transparente)
    if (isRiver < 0.01) {
        discard;
    }

    // --- EFECTO DE TRAZOS CAMINANTES (Walkers) ---
    
    // Leemos el flowmap. R=X, G=Y. Viene de 0..1, lo pasamos a -1..1
    vec2 flowmapData = texture2D(tFlowMap, vUv).rg;
    // Y tiene el signo invertido por cómo mapea el canvas respecto al mundo UV
    vec2 flowDir = vec2(flowmapData.r * 2.0 - 1.0, -(flowmapData.g * 2.0 - 1.0));
    
    // Si no hay flowmap o es neutral, evitamos que se rompa normalizando 0
    if (length(flowDir) < 0.1) {
        flowDir = vec2(0.0, 0.0);
    } else {
        flowDir = normalize(flowDir);
    }
    
    // Proyectamos la posición global sobre la dirección de flujo para obtener una coordenada 1D
    float flowAxis = dot(vGlobalPos.xy, flowDir);
    
    // Creamos "segmentos" que viajan a lo largo de esa dirección
    // Redujimos el multiplicador de 15.0 a 8.0 para que sean menos densos y más largos
    float walkerWave = fract(flowAxis * 8.0 - uTime * 1.2);
    
    // Le damos forma de trazo. Alargas el inicio y fin para que no parezcan "puntos" duros
    float stroke = smoothstep(0.0, 0.4, walkerWave) * (1.0 - smoothstep(0.6, 1.0, walkerWave));
    
    // Para que no sean líneas perfectas en todos lados al mismo tiempo,
    // rompemos los trazos usando un ruido de baja frecuencia estático y otro en movimiento
    float noiseBreak = snoise(vGlobalPos.xy * 8.0);
    float lifeCycle = snoise(vGlobalPos.xy * 4.0 - uTime * 0.5); // Fade in / fade out asimétrico
    
    // Combinamos todo para crear el "caminante" final
    float walker = stroke * smoothstep(0.0, 0.8, noiseBreak + 0.5) * smoothstep(-0.2, 0.8, lifeCycle);
    
    // Color del agua dulce/río
    vec3 riverColorBase = vec3(0.0, 0.5, 0.7);
    vec3 riverHighlight = vec3(0.5, 0.8, 0.9);
    
    // Hacemos que el color base sea muy tenue para que se mezcle con el terreno
    vec3 finalRiverColor = mix(riverColorBase * 0.15, riverHighlight * 1.2, walker);
    
    // Usamos la iluminación base de Three.js multiplicada por nuestro color
    vec3 illuminatedRiver = gl_FragColor.rgb * finalRiverColor;
    
    // Añadimos un brillo MUY sutil encima de la iluminación (bajó de 1.5 a 0.4)
    illuminatedRiver += riverHighlight * walker * 0.4;

    // Aplicamos opacidad basándonos en la máscara.
    // El río base casi no tiene opacidad (0.05), y el caminante llega como máximo a 0.5 (semi-transparente)
    float finalAlpha = isRiver * max(0.05, walker * 0.5);

    // Hacemos que la nieve "tape" el lago.
    // Leemos la máscara de nieve y calculamos el mismo ciclo climático del terreno.
    float snowMask = smoothstep(0.1, 0.5, packedMasks.b);
    float tCycle = fract(uTime * 0.05);
    float cycle = smoothstep(0.0, 0.2, tCycle) - smoothstep(0.6, 1.0, tCycle);
    float localCoverage = cycle * snowMask;

    // Reducimos la opacidad del agua drásticamente donde hay nieve acumulada
    finalAlpha *= (1.0 - localCoverage);

    float zoomFade = smoothstep(0.3, 0.8, uZoomAlpha);
    gl_FragColor = vec4(illuminatedRiver, finalAlpha * zoomFade);
`;
