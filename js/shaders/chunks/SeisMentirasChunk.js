// --- CHUNK: NEBLINA DE LAS SEIS MENTIRAS (HIELO SECO) ---
export const seisMentirasChunk = `
vec2 uvMentiras = vec2(0.105, 0.675); 

vec2 diff = vGlobalPos - uvMentiras;
// Máscara elíptica cruda
float distMentiras = length(vec2(diff.x * 1.0, diff.y * 0.6));

// OPTIMIZACIÓN: Solo calculamos el ruido del borde si estamos cerca de la niebla
float mathMask = 0.0;
// Ampliamos el radio de cálculo para dar espacio al difuminado extremo
if (distMentiras < 0.28) { 
    // Ruido más orgánico y variable para romper el borde como humo real
    float borderNoise = fbm(vGlobalPos * 4.0) * 0.08 + fbm(vGlobalPos * 12.0) * 0.03;
    // Transición extremadamente suave y difuminada
    mathMask = 1.0 - smoothstep(0.02, 0.25, distMentiras + borderNoise);
}

// MÁSCARA CUSTOMIZADA (Para Las 6 Mentiras)
float paintedMask = texture2D(tSeisMentirasMask, vGlobalPos).r;

// Combinamos la forma base (matemática) con la zona pintada a mano
float maskMentiras = clamp(mathMask + paintedMask, 0.0, 1.0);

if (maskMentiras > 0.0) {
    // --- EFECTO NIEBLA VOLUMÉTRICA (MULTI-CAPA CON PARALLAX) ---
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec2 parallaxOffset = viewDir.xy * 0.06; 
    
    vec2 baseUV = vGlobalPos * 12.0; 
    
    float n1 = fbm(baseUV + vec2(uTime * 0.03, -uTime * 0.02));
    float n2 = fbm(baseUV * 1.3 + parallaxOffset * 0.5 + vec2(-uTime * 0.04, uTime * 0.05));
    float n3 = fbm(baseUV * 1.6 + parallaxOffset + vec2(uTime * 0.02, uTime * 0.06));
    
    // Sumamos los ruidos para dar volumen, asegurando una base mínima para que no desaparezca.
    float volumetricNoise = (n1 * 0.5 + n2 * 0.3 + n3 * 0.2);
    // Elevamos un poco para dar contraste sin generar huecos transparentes (mix asegura un piso de 0.4)
    volumetricNoise *= mix(0.4, 1.5, n2); 
    
    // Ajustamos los umbrales para que sea más espesa y no tenga huecos
    float density = smoothstep(0.0, 0.6, volumetricNoise);
    
    // INTEGRACIÓN ULTRA SUAVE EN LOS BORDES
    // pow() hace que la niebla pierda fuerza exponencialmente hacia afuera,
    // logrando un difuminado perfecto con el océano sin bordes marcados.
    float edgeSoftness = smoothstep(0.0, 1.0, maskMentiras);
    edgeSoftness = pow(edgeSoftness, 2.5); // Caída mucho más pronunciada para que no parezca mancha

    float rawAlpha = density * maskMentiras * edgeSoftness;
    
    // Reducimos la opacidad máxima a 0.70 para que sea más ligera, como un gas
    float alpha = clamp(rawAlpha * 1.2, 0.0, 0.70);
    
    // Hacemos que la niebla desaparezca suavemente al hacer zoom out (modo overview)
    alpha *= smoothstep(0.3, 0.8, uZoomAlpha);

    // --- COLOR FANTASMAL / DEMONÍACO (Restaurado) ---
    vec3 fogShadow = vec3(0.06, 0.02, 0.15); // Morado abisal
    vec3 fogHighlight = vec3(0.20, 0.85, 0.70); // Esmeralda / Cian
    
    vec3 finalFogColor = mix(fogShadow, fogHighlight, n3);
    
    gl_FragColor.rgb = mix(gl_FragColor.rgb, finalFogColor, alpha);
}
`;
