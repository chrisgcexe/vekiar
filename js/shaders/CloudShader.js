export const cloudVertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const cloudFragmentShader = `
varying vec2 vUv;
uniform float uTime;
uniform vec3 uColor;
uniform vec2 uTargetUv;

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
    
    // Movimiento MUCHO más rápido para que se note
    st.x += uTime * 0.08;
    st.y -= uTime * 0.04;

    // Generar la forma de la nube
    float n = fbm(st);
    
    // Contraste más alto para que parezcan cúmulos reales de nubes y no niebla plana
    float alpha = smoothstep(0.4, 0.65, n);
    
    // Efecto "Fog of War": El centro objetivo está libre de nubes (0.0), y se espesan hacia los bordes (1.0)
    float distToTarget = distance(vUv, uTargetUv);
    float fogOfWar = smoothstep(0.05, 0.20, distToTarget);
    
    // Difuminar suavemente los bordes absolutos del plano para que no se vea el corte cuadrado
    float edgeFade = 1.0 - smoothstep(0.4, 0.5, distance(vUv, vec2(0.5)));
    
    // Aumentamos el multiplicador final (0.45) para que las nubes sean más notorias sin perder la niebla de guerra
    gl_FragColor = vec4(uColor, alpha * fogOfWar * edgeFade * 0.45);
}
`;
