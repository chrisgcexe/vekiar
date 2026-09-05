// --- CHUNK: LUZ DIVINA (FOCUS Y HOVER) ---
// Calcula los godrays, partículas y borde brillante (rim light) altamente optimizado
export const divineGlowChunk = `
// --- OPTIMIZACIÓN: Solo leer texturas base si es necesario ---
float rawFocusMask = 0.0;
float regionPixelAlpha = 0.0;
if (uFocusedRegionAlpha > 0.001) {
    rawFocusMask = dot(texture2D(tFocusMask, vGlobalPos), uFocusChannel);
    regionPixelAlpha = rawFocusMask * uFocusedRegionAlpha;
    
    // --- OSCURECIMIENTO DEL ENTORNO (Vignette de Focus) ---
    float outsideDimming = (1.0 - rawFocusMask) * uFocusedRegionAlpha;
    gl_FragColor.rgb *= (1.0 - outsideDimming * 0.15);
}

float rawHoverMask = 0.0;
float hoverAlpha = 0.0;
float effHoverAlpha = uHoverRegionAlpha * uOverviewMode;
if (effHoverAlpha > 0.001) {
    rawHoverMask = dot(texture2D(tHoverMask, vGlobalPos), uHoverChannel);
    hoverAlpha = rawHoverMask * effHoverAlpha;
}

float activeAlpha = max(regionPixelAlpha, hoverAlpha);

// Si no hay hover ni focus sobre este pixel, saltamos todas las matemáticas costosas
if (activeAlpha > 0.001) {
    // Máscara cruda combinada para recortar los efectos
    float maskBase = max(rawFocusMask * step(0.01, uFocusedRegionAlpha), rawHoverMask * step(0.01, effHoverAlpha));

    // --- BORDES BRILLANTES (RIM LIGHT / INNER GLOW DIRECCIONAL) ---
    vec2 rimOffset = vec2(0.0012); // Trazo muy fino y elegante
    float totalEdge = 0.0;

    // FOCUS EDGE (Solo si focus local está activo)
    if (regionPixelAlpha > 0.001) {
        float nF = dot(texture2D(tFocusMask, vGlobalPos + vec2(0.0, rimOffset.y)), uFocusChannel);
        float sF = dot(texture2D(tFocusMask, vGlobalPos - vec2(0.0, rimOffset.y)), uFocusChannel);
        float eF = dot(texture2D(tFocusMask, vGlobalPos + vec2(rimOffset.x, 0.0)), uFocusChannel);
        float wF = dot(texture2D(tFocusMask, vGlobalPos - vec2(rimOffset.x, 0.0)), uFocusChannel);
        float sobelF = abs(nF - sF) + abs(eF - wF);

        float diagF = dot(texture2D(tFocusMask, vGlobalPos + vec2(0.002, -0.002)), uFocusChannel);
        float dirLightF = max(0.0, rawFocusMask - diagF) * 2.5; 
        
        totalEdge = max(totalEdge, (smoothstep(0.1, 0.5, sobelF) * 0.3 + dirLightF) * regionPixelAlpha);
    }

    // HOVER EDGE (Solo si hover local está activo)
    if (hoverAlpha > 0.001) {
        float nH = dot(texture2D(tHoverMask, vGlobalPos + vec2(0.0, rimOffset.y)), uHoverChannel);
        float sH = dot(texture2D(tHoverMask, vGlobalPos - vec2(0.0, rimOffset.y)), uHoverChannel);
        float eH = dot(texture2D(tHoverMask, vGlobalPos + vec2(rimOffset.x, 0.0)), uHoverChannel);
        float wH = dot(texture2D(tHoverMask, vGlobalPos - vec2(rimOffset.x, 0.0)), uHoverChannel);
        float sobelH = abs(nH - sH) + abs(eH - wH);

        float diagH = dot(texture2D(tHoverMask, vGlobalPos + vec2(0.002, -0.002)), uHoverChannel);
        float dirLightH = max(0.0, rawHoverMask - diagH) * 2.5;

        totalEdge = max(totalEdge, (smoothstep(0.1, 0.5, sobelH) * 0.3 + dirLightH) * hoverAlpha);
    }

    // --- EFECTOS VISUALES (Godrays, Partículas, Pulso) ---
    // 1. Ruido orgánico para el aura fluida
    float auraNoise = fbm(vGlobalPos * 12.0 - vec2(uTime * 0.08, uTime * 0.04));

    // 2. Modulación por altura
    float heightMod = mix(0.15, 1.0, smoothstep(0.0, 2.5, vHeight));

    // 3. Color 
    vec3 divineGold = vec3(1.0, 0.82, 0.35); // godrays
    vec3 rimColor = vec3(1.0, 0.82, 0.35);  // borde

    // 4. Pulso con aura
    float pulse = sin(uTime * 2.0 + auraNoise * 4.0) * 0.25 + 0.75;

    // 5. Godrays (Rayos de luz en ángulo de 45°)
    float rayAngle = -0.785398;
    float rs = sin(rayAngle);
    float rc = cos(rayAngle);
    mat2 rayRot = mat2(rc, -rs, rs, rc);
    vec2 rotatedUV = rayRot * vGlobalPos;

    vec2 rayUV = rotatedUV * vec2(15.0, 2.0) - vec2(uTime * 0.1, uTime * 0.2);
    float rays = smoothstep(0.3, 0.7, fbm(rayUV)) * 0.8;

    // 6. Partículas 
    vec2 partUV = vGlobalPos * 120.0 + vec2(0.0, uTime * -0.08);
    float cellHash = hash(floor(partUV));
    vec2 partLocal = fract(partUV) - 0.5;
    float pTime = fract(uTime * (0.15 + cellHash * 0.2) + cellHash * 10.0);
    partLocal += vec2(sin(pTime * 6.28 + cellHash * 10.0) * 0.15, cos(pTime * 6.28 + cellHash * 10.0) * 0.15);
    float pDist = length(partLocal);
    float pShape = smoothstep(0.08, 0.01, pDist) * smoothstep(0.0, 0.3, pTime) * smoothstep(1.0, 0.6, pTime);
    float partIntensity = pShape * step(0.97, cellHash) * 1.2; 

    // 7. COMPOSICIÓN FINAL
    float focusGlow = pow(regionPixelAlpha, 1.5) * 0.24;
    float hoverGlowPower = hoverAlpha * 0.19;
    float baseGlow = focusGlow + hoverGlowPower;

    float specialFx = (rays + partIntensity) * maskBase * activeAlpha * 0.5;
    float totalGlow = (baseGlow + specialFx) * heightMod * pulse;
    
    gl_FragColor.rgb += divineGold * totalGlow;
    gl_FragColor.rgb += rimColor * totalEdge * 1.3 * pulse;
}
`;
