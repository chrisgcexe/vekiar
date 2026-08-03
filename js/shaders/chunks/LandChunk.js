// ==========================================
// LAND CHUNK: Tierra, Nieve en Piso y Desierto
// 
// tMapDataPacked: map_data_R_elevation_B_snow_particles.png
//   -> R: Elevación 3D (Usado en worker)
//   -> B: Máscara de Nieve 
// 
// tPackedMasks: masks_2_R_river_G_lake_B_snow_A_desert.png
//   -> R: Ríos
//   -> G: Lagos
//   -> B: Zonas de Nieve 
//   -> A: Desierto (Heat haze y color) 
// ==========================================

export const landFragmentChunk = `
// === 1. ACUMULACIÓN DE NIEVE (Efecto Clásico Gradual) ===
// Leemos la máscara de nieve del canal Azul de la textura de máscaras
float m = texture2D(tPackedMasks, vGlobalPos).b; 
float snowZone = smoothstep(0.1, 0.5, m);

vec4 packedMasks = texture2D(tPackedMasks, vGlobalPos);
float blurryMountain = 1.0 - texture2D(tMapDataPacked, vGlobalPos, 5.0).b;
float mountainFade = smoothstep(0.01, 0.8, blurryMountain);

snowZone *= mix(1.0, 0.35, mountainFade);

float tCycle = fract(uTime * 0.05);
float cycle = smoothstep(0.0, 0.2, tCycle) - smoothstep(0.6, 1.0, tCycle);

float groundNoise = fbm(vGlobalPos * 100.0);
float localCoverage = cycle * snowZone;
float snowFactor = smoothstep(groundNoise - 0.1, groundNoise + 0.1, localCoverage);
snowFactor *= smoothstep(0.0, 0.01, localCoverage);

vec2 bumpPos = vGlobalPos * 400.0;
float n0 = fbm(bumpPos);
float n1 = fbm(bumpPos + vec2(0.015, 0.015));
float bumpShadow = (n1 - n0) * 12.0;

vec3 snowColorBase = vec3(0.95, 0.98, 1.0);
float bumpMask = smoothstep(0.6, 1.0, snowFactor);
vec3 snowColor = snowColorBase + (bumpShadow * bumpMask * vec3(0.4, 0.45, 0.5));

float zoomFadeSnow = smoothstep(0.3, 0.8, uZoomAlpha);
diffuseColor.rgb = mix(diffuseColor.rgb, snowColor, snowFactor * zoomFadeSnow);


// === 2. AMBIENTACIÓN DEL DESIERTO (ESPEJISMO + POLVO) ===

// 1. Calculamos las máscaras UNA SOLA VEZ para ambos efectos
float rawDesert = texture2D(tPackedMasks, vGlobalPos, 4.0).a;
float desertMaskAlpha = 1.0 - rawDesert;
float aridZone = smoothstep(0.2, 0.7, desertMaskAlpha);

float landMask = texture2D(tMapDataPacked, vGlobalPos).g;
aridZone *= smoothstep(0.1, 0.5, landMask);

if (aridZone > 0.01) {
    // --- EFECTO 1: TORMENTA DE ARENA (POLVO) ---
    vec2 windUv1 = vGlobalPos * 25.0 + vec2(-uTime * 2.8, -uTime * 1.0);
    vec2 windUv2 = vGlobalPos * 35.0 + vec2(-uTime * 2.2, uTime * 0.5);

    float dustNoise = fbm(windUv1) * fbm(windUv2);
    float movingDust = smoothstep(0.05, 0.25, dustNoise);
    
    float dustClouds = 0.25 + 0.7 * movingDust; 
    
    vec3 baseDustColor = vec3(0.92, 0.78, 0.50);
    vec3 peakDustColor = vec3(1.0, 0.88, 0.65);
    vec3 finalDustColor = mix(baseDustColor, peakDustColor, movingDust);
    
    float zoomFadeDust = smoothstep(0.3, 0.8, uZoomAlpha);
    float finalDustAlpha = clamp(aridZone * dustClouds * zoomFadeDust, 0.0, 1.0);

    // Aplicamos el polvo PRIMERO al terreno
    diffuseColor.rgb = mix(diffuseColor.rgb, finalDustColor, finalDustAlpha);

    // --- EFECTO 2: HEAT HAZE SOBRE TODO (Terreno + Polvo) ---
    // Bajamos la escala a 30.0 para que las ondas sean más grandes y legibles, y aceleramos el pulso
    vec2 heatUv = vGlobalPos * 30.0 + vec2(-uTime * 3.0, -uTime * 4.5);
    float heatNoise = fbm(heatUv);
    
    // Contraste más duro para aislar bien la refracción
    float shimmer = smoothstep(0.3, 0.6, heatNoise);
    
    // Tomamos el color actual (que ahora ya tiene la arena incorporada)
    vec3 currentTerrain = diffuseColor.rgb;
    
    // Exageramos la luminosidad brutalmente para que se note el destello térmico
    vec3 heatWarp = currentTerrain + (shimmer * 0.35); 
    // Y lo cruzamos con sombras duras
    heatWarp = mix(heatWarp, currentTerrain * 0.6, shimmer * 0.7); 
    
    // Tinte mucho más agresivo (empuja los rojos y amarillos)
    vec3 heatTint = vec3(1.15, 0.9, 0.75);
    
    float zoomFadeHeat = smoothstep(0.3, 0.8, uZoomAlpha);
    float finalHeatAlpha = clamp(aridZone * zoomFadeHeat, 0.0, 1.0);

    // Distorsionamos todo junto antes de mandarlo al motor de iluminación
    diffuseColor.rgb = mix(currentTerrain, heatWarp * heatTint, finalHeatAlpha);
}    
`;


export const landColorAdjustmentChunk = `
// === AJUSTES GLOBALES DE COLOR (Vibrancia y Luz) ===
float luminance = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
gl_FragColor.rgb = mix(vec3(luminance), gl_FragColor.rgb, 1.18);
gl_FragColor.rgb *= 1.05;

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
