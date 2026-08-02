// ==========================================
// SHADER PARA NIEVE VOLUMÉTRICA FIJA EN LAS MONTAÑAS
// ==========================================

export const snowParticleVertex = `
uniform float uTime;
uniform float uZoomAlpha;

attribute float aRandom;
attribute float aSpeed;

varying float vAlphaFade;

void main() {
    vec3 particleWorldPos = position;
    
    // Altura máxima de la caja de nieve: elevada un poco para que nazcan fuera de la vista
    // pero sin exagerar (antes 25, luego 8, ahora 15)
    float maxHeight = 15.0;
    
    // Caída lenta y constante
    particleWorldPos.y -= uTime * aSpeed * 1.5; 
    
    // Wrap vertical infinito (Teletransportación GPU pura)
    particleWorldPos.y = mod(particleWorldPos.y, maxHeight);
    
    // Viento orgánico (Fluttering): Dos ondas sumadas para movimiento caótico pero suave
    float windX = sin(uTime * 0.5 + aRandom * 20.0) * 2.0 + sin(uTime * 1.5 + aRandom * 5.0) * 0.5;
    float windZ = cos(uTime * 0.4 + aRandom * 20.0) * 2.0 + cos(uTime * 1.3 + aRandom * 5.0) * 0.5;
    
    particleWorldPos.x += windX; 
    particleWorldPos.z += windZ; 

    // Fade vertical ajustado a la nueva altura (nacen invisiblemente arriba, mueren abajo)
    float heightFade = smoothstep(0.5, 2.0, particleWorldPos.y) * 
                       (1.0 - smoothstep(maxHeight - 3.0, maxHeight, particleWorldPos.y));

    // Efecto de centelleo (Twinkle) sutil
    float twinkle = 0.8 + 0.2 * sin(uTime * 2.0 + aRandom * 100.0);
    
    // Optimización por distancia (LOD Culling)
    float dist = distance(cameraPosition, particleWorldPos);
    float distanceFade = 1.0 - smoothstep(60.0, 100.0, dist);

    vAlphaFade = heightFade * (0.3 + aRandom * 0.5) * twinkle * distanceFade;
    
    float zoomFade = smoothstep(0.3, 0.8, uZoomAlpha);
    vAlphaFade *= zoomFade;

    // Colapsar punto (zero size) si es invisible, saltando el rasterizador por completo
    if (vAlphaFade < 0.01) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        return;
    }

    vec4 mvPosition = viewMatrix * vec4(particleWorldPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // Tamaños un poco más grandes (compensando la reducción a 25000 partículas para optimizar)
    float baseSize = 45.0 + aRandom * 50.0;
    gl_PointSize = baseSize * (1.0 / -mvPosition.z);
    gl_PointSize = max(1.5, gl_PointSize); // Permitir que sean un poco más chicos (1.5 px)
}
`;

export const snowParticleFragment = `
varying float vAlphaFade;

void main() {
    if (vAlphaFade < 0.01) discard;

    vec2 cxy = 2.0 * gl_PointCoord - 1.0;
    float r = dot(cxy, cxy);
    if (r > 1.0) discard;
    
    // Gradiente esférico ultra-suave
    float intensity = exp(-r * 3.0);
    gl_FragColor = vec4(0.95, 0.98, 1.0, intensity * vAlphaFade);
}
`;
