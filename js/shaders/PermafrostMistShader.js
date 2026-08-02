// ==========================================
// SHADER PARA LA NEBLINA DE PERMAFROST (HUMO)
// ==========================================
// Utiliza la técnica de "Shell": Desplaza los vértices ligeramente 
// a lo largo de sus normales para flotar sobre el terreno original.

export const permafrostMistVertex = `
uniform float uTime;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vDistanceFade;

void main() {
    vUv = uv;
    vNormal = normal;
    
    // Elevamos el vértice a lo largo de su normal para crear la "cáscara"
    // Le damos una sutil fluctuación con el tiempo para que respire
    float offset = 0.15 + 0.05 * sin(uTime * 2.0 + position.x + position.y);
    vec3 shellPosition = position + normal * offset;
    
    vec4 worldPosition = modelMatrix * vec4(shellPosition, 1.0);
    vWorldPos = worldPosition.xyz;
    
    // Optimización: Calcular distancia a la cámara por vértice en vez de por píxel
    float dist = distance(cameraPosition, vWorldPos);
    vDistanceFade = 1.0 - smoothstep(25.0, 40.0, dist);
    
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const permafrostMistFragment = `
uniform sampler2D tPackedMasks;
uniform sampler2D tMapDataPacked;
uniform sampler2D tNoise;
uniform float uTime;
uniform float uZoomAlpha;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vDistanceFade;

void main() {
    // Si estamos muy lejos (fade = 0), abortamos toda la matemática pesada de este píxel
    if (vDistanceFade < 0.01) discard;

    // --- FLUJO DE HIELO SECO ---
    // El usuario pidió dirección contraria: ahora la textura se desliza hacia el Norte (restando a vUv.y)
    vec2 flowUv1 = vUv * 4.0 + vec2(0.0, -uTime * 0.03);
    vec2 flowUv2 = vUv * 3.0 + vec2(sin(uTime * 0.01) * 0.01, -uTime * 0.02);
    
    float noise1 = texture2D(tNoise, flowUv1).r;
    float noise2 = texture2D(tNoise, flowUv2).r;
    
    // Leemos la textura de nieve usando el "bias" nativo de WebGL (MipMap inferior)
    // Esto nos da un desenfoque (blur) extremadamente barato en rendimiento (1 muestreo vs 9)
    // Canal Azul (b) de tMapDataPacked contiene la máscara de nieve de montañas
    float m = 1.0 - texture2D(tMapDataPacked, vUv, 3.0).b;
    
    // Solo mostramos niebla donde hay nieve (m > 0)
    // Ampliamos el rango del smoothstep para que el desvanecimiento sea ultra suave
    float mask = smoothstep(0.02, 0.8, m); 
    
    if (mask < 0.01) discard;

    // Combinamos el ruido
    float mistDensity = smoothstep(0.0, 0.6, noise1 * noise2);
    
    // Color hielo seco (Blanco cyan)
    vec3 mistColor = vec3(0.7, 0.9, 1.0);
    
    // --- DIFUMINADO POR ALTURA (EVITA EL CORTE FATAL) ---
    // En lugar de recortar por la textura (que tiene bordes duros), difuminamos usando 
    // la altura real del modelo 3D, que es un gradiente perfectamente suave.
    
    // Calculamos si la cara mira al Norte (>0) o al Sur (<0)
    float northFactor = smoothstep(-0.2, 0.4, vNormal.y);
    
    // La niebla baja hasta el suelo (0.0) en la cara Norte, pero se desvanece rápido en la Sur (1.5)
    float baseHeightFade = mix(1.5, 0.1, northFactor); 
    float topHeightFade = mix(2.5, 1.5, northFactor);
    
    float heightFade = smoothstep(baseHeightFade, topHeightFade, vWorldPos.y) * 
                       (1.0 - smoothstep(3.2, 4.0, vWorldPos.y));

    // Opacidad final ajustada a 0.15 y desvanecida por la distancia y zoom
    float zoomFade = smoothstep(0.3, 0.8, uZoomAlpha);
    float alpha = mask * mistDensity * heightFade * vDistanceFade * 0.15 * zoomFade;

    gl_FragColor = vec4(mistColor, alpha);
}
`;
