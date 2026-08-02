// ==========================================
// SHADER PARA EL BRILLO ESPECTRAL DE LAS MONTAÑAS
// ==========================================
// Este shader dibuja una capa puramente aditiva (brillo) sobre las montañas nevadas.
// Es un ShaderMaterial muy liviano (no calcula luces PBR).

export const mountainGlowVertex = `
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
    vUv = uv;
    // position ya tiene la altura Z precalculada por el Worker
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const mountainGlowFragment = `
uniform sampler2D tPackedMasks;
uniform sampler2D tNoise;
uniform float uTime;
uniform float uZoomAlpha;

varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
    // Leemos la máscara de nieve (Canal Alpha)
    vec4 masks = texture2D(tPackedMasks, vUv);
    float isSnowArea = 1.0 - smoothstep(0.1, 0.5, masks.a); 
    
    if (isSnowArea < 0.01) discard;

    // Leemos textura de ruido animada para hacer que el brillo pulse
    vec2 noiseUv = vUv * 5.0 + vec2(uTime * 0.01, uTime * 0.015);
    float noiseVal = texture2D(tNoise, noiseUv).r;
    
    // Pulso temporal y sutil
    float pulse = 0.7 + 0.3 * sin(uTime * 2.0 + noiseVal * 10.0);
    
    // Elevación: El brillo se hace más fuerte a mayor altura
    // Z máximo del terreno es 3.5
    float heightFactor = smoothstep(1.5, 3.5, vWorldPos.y); // Y porque el mapa rota en Map.js

    // Color del brillo espectral (Celeste hielo muy puro)
    vec3 glowColor = vec3(0.6, 0.85, 1.0);
    
    // Transparencia final
    float alpha = isSnowArea * pulse * heightFactor * 0.4 * uZoomAlpha;

    gl_FragColor = vec4(glowColor, alpha);
}
`;
