export const cloudVertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const cloudFragmentShader = `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform vec3 uColor;
uniform vec2 uTargetUv;
uniform float uOpacity; // <-- Nuevo uniform
uniform vec2 uCloudOffset;
uniform float uCloudDensity;

// Función Random
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

// Ruido 2D
float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// Fractional Brownian Motion para nubes realistas
float fbm(vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
        value += amplitude * noise(st);
        st *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

void main() {
    // Nubes más pequeñas y detalladas
    vec2 st = vUv * 6.0; 
    
    // Movimiento reactivo al viento
    st += uCloudOffset;

    // Generar la forma de la nube
    float n = fbm(st);
    
    // Contraste dinámico: uCloudDensity hace las nubes más espesas (0.0 = pocas nubes, 1.0 = tormenta ciega)
    float cloudThreshold = mix(0.5, 0.2, uCloudDensity);
    float alpha = smoothstep(cloudThreshold, cloudThreshold + 0.25, n);
    
    // En tormentas densas, oscurecer el color base de las nubes (grises)
    vec3 cloudColor = mix(uColor, vec3(0.4, 0.45, 0.5), uCloudDensity);
    
    // Efecto "Fog of War": El centro objetivo está libre de nubes, y se espesan hacia los bordes
    // Aumentamos el gapSize para hacer el ojo mucho más grande y difuso
    float gapSize = mix(0.35, 0.25, uCloudDensity);
    float distToTarget = distance(vUv, uTargetUv);
    float fogOfWar = smoothstep(0.02, gapSize, distToTarget);
    
    // Difuminar suavemente los bordes absolutos del plano para que no se vea el corte cuadrado
    float edgeFade = 1.0 - smoothstep(0.4, 0.5, distance(vUv, vec2(0.5)));
    
    // Multiplicamos por uOpacity para controlar el fundido de entrada de forma interna
    gl_FragColor = vec4(cloudColor, alpha * fogOfWar * edgeFade * 0.45 * uOpacity);
}
`;