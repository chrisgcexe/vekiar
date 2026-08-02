// Inyecciones para el Vertex Shader
export const mapVertexCommon = `
#include <common>
varying vec2 vGlobalPos;
varying float vHeight;
varying vec3 vWorldPosition;
`;

export const mapVertexUv = `
#include <uv_vertex>
vGlobalPos = uv;
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
uniform float uTime;
uniform float uZoomAlpha;
uniform sampler2D tWaterMask; 
uniform sampler2D tNoise;
uniform sampler2D tPackedMasks;
uniform sampler2D tSnowMask;
uniform vec2 uMountainCenter;

float fbm(vec2 p) {
    return texture2D(tNoise, p * 0.03).r;
}

// Generador de ruido procedural puro 100% libre de grillas y texturas
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

// Value Noise suave
float snoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

export const mapOceanFragment = `
#include <dithering_fragment>

// === 1. ANIMACIÓN DEL OCÉANO ===
// Usamos tu nueva máscara perfecta (Blanco=Tierra, Negro=Agua).
// Como queremos que el agua sea 1.0 y la tierra 0.0, lo invertimos (1.0 - mask)
float maskValue = texture2D(tWaterMask, vGlobalPos).r;
float waterMix = 1.0 - maskValue;

if (waterMix > 0.0) {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    
    // Leemos la textura original CRUDA (sin la luz focal de Three.js)
    vec3 rawColor = texture2D(map, vGlobalPos).rgb;
    
    // MATA BIOLUMINISCENCIA: Desaturamos y oscurecemos el océano crudo
    // para que la orilla verde agua deje de brillar y el océano pierda pregnancia.
    float oceanLum = dot(rawColor, vec3(0.299, 0.587, 0.114));
    rawColor = mix(vec3(oceanLum), rawColor, 0.75); // -25% de saturación
    rawColor *= 0.65; // -35% de luz (mucho más oscuro)
    
    // basePaint: en la tierra (waterMix=0) usamos el color iluminado por el sol, 
    // pero en el agua (waterMix=1) usamos nuestro nuevo océano oscuro y sobrio.
    vec3 basePaint = mix(gl_FragColor.rgb, rawColor, waterMix); 
    
    float angle = 0.785;
    float s = sin(angle);
    float c = cos(angle);
    mat2 rot = mat2(c, -s, s, c);
    
    vec2 diagPos = rot * vGlobalPos;
    
    // --- 1. PINCELADAS SEMITRANSPARENTES (Parallax de Profundidad) ---
    // ¡Restauramos las pinceladas base de pintura! (Pero sin deformarlas con la orilla 
    // para que no clippeen con la tierra).
    
    // Capa Profunda (Parallax fuerte)
    vec2 uv1 = diagPos * vec2(20.0, 60.0) + viewDir.xy * 4.0; 
    float stroke1 = smoothstep(0.4, 0.7, fbm(uv1 - uTime * 0.05)); 
    
    // Capa Superficial (Parallax medio)
    vec2 uv2 = diagPos * vec2(30.0, 80.0) + viewDir.xy * 2.0; 
    float stroke2 = smoothstep(0.5, 0.8, fbm(uv2 - uTime * 0.1));
    
    // En lugar de SUMAR luz azul (lo que lo hacía fluorescente), 
    // OSCURECEMOS la textura base para dar profundidad real.
    vec3 waterTexture = mix(basePaint, basePaint * 0.4, stroke1 * 0.8);
    
    // Aclaramos apenas un poco con la segunda capa para darle volumen sin quemar el color
    waterTexture = mix(waterTexture, waterTexture * 1.3, stroke2 * 0.3);
    
    // --- 2. HIGHLIGHTS (Caústicas en el fondo marino) ---
    // ¡Tenés mucha razón! Las caústicas son la luz del sol proyectada en el fondo del mar. 
    // Como el fondo no se mueve, NO deben tener parallax. Le acabo de quitar el viewDir.
    vec2 wUv = diagPos * 30.0; 
    vec2 warp = vec2(fbm(wUv * 0.5 + uTime * 0.15), fbm(wUv * 0.5 - uTime * 0.1)) * 4.0;
    wUv += warp;
    
    float celdas = sin(wUv.x) * sin(wUv.y);
    float web = 1.0 - smoothstep(0.0, 0.15, abs(celdas));
    web *= smoothstep(0.1, 0.7, fbm(wUv * 3.0));
    
    float luz = smoothstep(0.3, 0.9, fbm(diagPos * 8.0 + vec2(uTime * 0.2)));
    float caustics = web * luz;
    
    // Bajamos drásticamente la intensidad (de 1.5 a 0.25) y lo hacemos más blanco que cian neón
    vec3 finalWater = waterTexture + vec3(0.8, 0.9, 1.0) * caustics * 0.25;
    
    // --- 3. SUN GLINTS (Pinceladitas en cúmulos radiales expansivos estilo Runaterra) ---
    
    // --- 3. FOAM CAPS (Dinámicos y agrupados) ---
    
    // 1. ANIMACIÓN DE PULSO MAESTRO (Barrido Diagonal Orgánico)
    float clusterNoise = snoise(vGlobalPos * 15.0) * 10.0;
    float diagonalSweep = (vGlobalPos.x + vGlobalPos.y) * 20.0;
    
    // Onda macro que barre el mapa
    float sweep = sin(diagonalSweep - uTime * 2.5 + clusterNoise) * 0.5 + 0.5;
    // Solo permitimos que pase el 40% superior para dejar espacio vacío entre zonas
    float macroPulse = smoothstep(0.6, 1.0, sweep);
    
    // 2. RUIDO CONTINUO PARA LAS PARTÍCULAS (Cero Grilla)
    // Bajamos la frecuencia a 300 para que los puntitos sean un poco más grandes
    vec2 blobUv = vGlobalPos * 300.0;
    blobUv.x *= 1.5; 
    blobUv += viewDir.xy * 2.5; 
    blobUv.x -= uTime * 0.8;
    blobUv.y -= uTime * 0.3;
    
    // Extraemos el ruido orgánico base (sin celdas, imposible que forme una grilla)
    float rawParticle = snoise(blobUv);
    
    // 3. CICLO DE VIDA INDIVIDUAL (Fade In / Out)
    // Desfasamos la vida de cada partícula usando un ruido para que sea asimétrico
    float particlePhase = snoise(blobUv * 0.5) * 10.0;
    float life = sin(uTime * 4.0 + particlePhase) * 0.5 + 0.5;
    
    // El multiplicador maestro
    float masterPulse = life * macroPulse;
    
    // 4. CRECIMIENTO FÍSICO Y OPACIDAD (Threshold Dinámico)
    // Si la partícula está "muerta" (masterPulse = 0), el corte sube a 1.1 (invisible).
    // Si está "viva" (masterPulse = 1), el corte baja a 0.7 (la partícula se ensancha).
    float currentThreshold = mix(1.1, 0.7, masterPulse);
    
    // Al recortar el ruido con un umbral que sube y baja, la mancha crece y se encoge físicamente
    float foamGlints = smoothstep(currentThreshold, currentThreshold + 0.15, rawParticle);
    
    // Sumamos al agua (bajamos la intensidad de 1.5 a 0.6 para que sean semitransparentes)
    finalWater += vec3(0.85, 0.95, 1.0) * foamGlints * 0.4;
    
    float zoomFade = smoothstep(0.3, 0.8, uZoomAlpha);
    gl_FragColor = mix(gl_FragColor, vec4(finalWater, 1.0), zoomFade * waterMix);
}

// === AJUSTES GLOBALES DE COLOR (Vibrancia y Luz) ===
// Subimos un pelín la saturación y el brillo de todo el mapa (Tierra y Océano)
float luminance = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
gl_FragColor.rgb = mix(vec3(luminance), gl_FragColor.rgb, 1.18); // +18% de Saturación (más color)
gl_FragColor.rgb *= 1.05; // +5% de Brillo general

// (La nieve se movió a mapFragmentColorChunk para ser afectada por la luz)

// === NIEBLA DE LOS BORDES ===
float edgeX = max(0.0, abs(vGlobalPos.x - 0.5) * 2.0 - 0.88) / 0.12;
float edgeY = max(0.0, abs(vGlobalPos.y - 0.5) * 2.0 - 0.88) / 0.12;

float edgeFactor = min(1.0, max(edgeX, edgeY));
edgeFactor = smoothstep(0.0, 1.0, edgeFactor);
edgeFactor = smoothstep(0.0, 1.0, edgeFactor); 

edgeFactor *= uZoomAlpha;

vec3 mapFogColor = vec3(58.0/255.0, 86.0/255.0, 130.0/255.0);
gl_FragColor.rgb = mix(gl_FragColor.rgb, mapFogColor, edgeFactor);
`;

export const mapFragmentColorChunk = `
#include <map_fragment>

// === ACUMULACIÓN DE NIEVE (Efecto Clásico Gradual) ===
// 1. ZONA DE NIEVE: Leemos la máscara de nieve del piso desde la imagen empaquetada amarilla.
// El usuario indica usar el "canal alpha", pero como la imagen es RGB plana con nieve en blanco, 
// la leemos desde el canal Azul (b).
float m = texture2D(tPackedMasks, vGlobalPos).b; 
float snowZone = smoothstep(0.1, 0.5, m);

// Leemos todas las máscaras empaquetadas
vec4 packedMasks = texture2D(tPackedMasks, vGlobalPos);
// NOTA: Ya no excluimos el agua, para que la nieve tape los ríos y lagos.

// Excluir la nieve base en la montaña de forma ULTRA SUAVE.
// Usamos el "bias" de texture2D (3er parámetro en GLSL) para leer un 
// MipMap inferior, lo que nos da una versión extremadamente borrosa 
// de la máscara de forma nativa y sin costo de rendimiento.
float blurryMountain = 1.0 - texture2D(tSnowMask, vGlobalPos, 5.0).r;

// El resultado es un gradiente perfecto y gigante. Lo ajustamos con smoothstep
// para que el desvanecimiento sea mantequilla pura.
float mountainFade = smoothstep(0.01, 0.8, blurryMountain);

// En vez de bajarlo a 0.0 (que desaparezca por completo), lo bajamos a 0.35.
// Al reducir snowZone, el shader de ruido automáticamente generará MENOS parches (o "partículas" de piso)
// a medida que te acercas al centro de la montaña, pero sin borrar la nieve por completo.
snowZone *= mix(1.0, 0.35, mountainFade);

// 2. CICLO DE CLIMA ASIMÉTRICO
// En lugar de un seno básico, creamos un ciclo (20 seg) donde:
// - Cae la nieve rápido (0.0 a 0.2)
// - Perdura al máximo (0.2 a 0.6)
// - Se derrite muy lentamente (0.6 a 1.0)
float tCycle = fract(uTime * 0.05);
float cycle = smoothstep(0.0, 0.2, tCycle) - smoothstep(0.6, 1.0, tCycle);

// 3. RUIDO DEL TERRENO
// Simula las imperfecciones del suelo. Usamos alta frecuencia para que los bordes sean naturales.
float groundNoise = fbm(vGlobalPos * 100.0);

// 4. EFECTO DE PINTADO (Acumulación)
// Multiplicar por snowZone hace que el centro alcance 1.0 (blanco total) y los bordes se queden en parches.
float localCoverage = cycle * snowZone;

// Comparamos la cobertura contra el ruido del suelo. 
// A medida que localCoverage sube, "tapa" progresivamente los valores del ruido.
// Esto genera el efecto visual exacto de manchas de nieve que crecen, se unen y forman un manto sólido.
float snowFactor = smoothstep(groundNoise - 0.1, groundNoise + 0.1, localCoverage);

// FIX DEL BUG DE NIEVE FANTASMA: 
// Debido al ancho del smoothstep anterior (groundNoise - 0.1), un localCoverage de 0.0
// podía devolver un valor mayor a cero si el groundNoise era muy bajo (ej: 0.05 - 0.1 = -0.05).
// Esto generaba parches aleatorios por todo el mapa. Forzamos a cero estricto si no hay cobertura:
snowFactor *= smoothstep(0.0, 0.01, localCoverage);

// 5. RELIEVE 3D EN NIEVE DENSA (Bumps / Montículos)
// Calculamos un ruido de muy alta frecuencia desplazado para simular sombras (derivada direccional)
vec2 bumpPos = vGlobalPos * 400.0;
float n0 = fbm(bumpPos);
float n1 = fbm(bumpPos + vec2(0.015, 0.015)); // Offset diagonal
float bumpShadow = (n1 - n0) * 12.0; // Falsa iluminación (relieve)

// Mezclamos el terreno con blanco puro
vec3 snowColorBase = vec3(0.95, 0.98, 1.0);

// Aplicamos el relieve SOLO donde la nieve está muy densa (>0.7 de acumulación)
float bumpMask = smoothstep(0.6, 1.0, snowFactor);
// Le sumamos/restamos luz para crear los "montículos"
vec3 snowColor = snowColorBase + (bumpShadow * bumpMask * vec3(0.4, 0.45, 0.5)); // Sombras frías

float zoomFadeSnow = smoothstep(0.3, 0.8, uZoomAlpha);
diffuseColor.rgb = mix(diffuseColor.rgb, snowColor, snowFactor * zoomFadeSnow);
`;
