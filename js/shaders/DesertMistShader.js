// ==========================================
// SHADER DEBUG: Desierto pintado de rosa
// Verifica que la máscara del canal Alpha esté correctamente asignada
// ==========================================

export const desertMistVertex = `
varying vec2 vUv;
varying float vDistanceFade;

void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    float dist = distance(cameraPosition, worldPosition.xyz);
    vDistanceFade = 1.0 - smoothstep(25.0, 40.0, dist);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const desertMistFragment = `
uniform sampler2D tPackedMasks;

varying vec2 vUv;
varying float vDistanceFade;

void main() {
    if (vDistanceFade < 0.01) discard;

    // Canal Alpha: blanco = todo el mapa, negro = desierto => invertimos
    float m = 1.0 - texture2D(tPackedMasks, vUv).a;
    float mask = smoothstep(0.01, 0.5, m);
    if (mask < 0.01) discard;

    // DEBUG: rosa puro para verificar que la máscara funciona correctamente
    gl_FragColor = vec4(1.0, 0.0, 0.8, mask * 0.9);
}
`;
