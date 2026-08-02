export const waterFragmentChunk = `
// === 1. ANIMACIÓN DEL OCÉANO ===
// Usamos tu nueva máscara perfecta (Blanco=Tierra, Negro=Agua).
// Como queremos que el agua sea 1.0 y la tierra 0.0, lo invertimos (1.0 - mask)
float maskValue = texture2D(tMapDataPacked, vGlobalPos).g;
float waterMix = 1.0 - maskValue;

if (waterMix > 0.0) {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    
    // Leemos la textura original CRUDA (sin la luz focal de Three.js)
    vec3 rawColor = texture2D(map, vGlobalPos).rgb;
    
    // MATA BIOLUMINISCENCIA: Desaturamos y oscurecemos el océano crudo
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
    // Capa Profunda (Parallax fuerte)
    vec2 uv1 = diagPos * vec2(20.0, 60.0) + viewDir.xy * 4.0; 
    float stroke1 = smoothstep(0.4, 0.7, fbm(uv1 - uTime * 0.05)); 
    
    // Capa Superficial (Parallax medio)
    vec2 uv2 = diagPos * vec2(30.0, 80.0) + viewDir.xy * 2.0; 
    float stroke2 = smoothstep(0.5, 0.8, fbm(uv2 - uTime * 0.1));
    
    vec3 waterTexture = mix(basePaint, basePaint * 0.4, stroke1 * 0.8);
    waterTexture = mix(waterTexture, waterTexture * 1.3, stroke2 * 0.3);
    
    // --- 2. HIGHLIGHTS (Caústicas en el fondo marino) ---
    vec2 wUv = diagPos * 30.0; 
    vec2 warp = vec2(fbm(wUv * 0.5 + uTime * 0.15), fbm(wUv * 0.5 - uTime * 0.1)) * 4.0;
    
    float isWater = 1.0 - smoothstep(0.1, 0.5, texture2D(tMapDataPacked, vGlobalPos).g);
    wUv += warp;
    
    float celdas = sin(wUv.x) * sin(wUv.y);
    float web = 1.0 - smoothstep(0.0, 0.15, abs(celdas));
    web *= smoothstep(0.1, 0.7, fbm(wUv * 3.0));
    
    float luz = smoothstep(0.3, 0.9, fbm(diagPos * 8.0 + vec2(uTime * 0.2)));
    float caustics = web * luz;
    
    vec3 finalWater = waterTexture + vec3(0.8, 0.9, 1.0) * caustics * 0.25;
    
    // --- 3. FOAM CAPS (Dinámicos y agrupados) ---
    float clusterNoise = snoise(vGlobalPos * 15.0) * 10.0;
    float diagonalSweep = (vGlobalPos.x + vGlobalPos.y) * 20.0;
    float sweep = sin(diagonalSweep - uTime * 2.5 + clusterNoise) * 0.5 + 0.5;
    float macroPulse = smoothstep(0.6, 1.0, sweep);
    
    vec2 blobUv = vGlobalPos * 300.0;
    blobUv.x *= 1.5; 
    blobUv += viewDir.xy * 2.5; 
    blobUv.x -= uTime * 0.8;
    blobUv.y -= uTime * 0.3;
    
    float rawParticle = snoise(blobUv);
    
    float particlePhase = snoise(blobUv * 0.5) * 10.0;
    float life = sin(uTime * 4.0 + particlePhase) * 0.5 + 0.5;
    
    float masterPulse = life * macroPulse;
    float currentThreshold = mix(1.1, 0.7, masterPulse);
    float foamGlints = smoothstep(currentThreshold, currentThreshold + 0.15, rawParticle);
    
    finalWater += vec3(0.85, 0.95, 1.0) * foamGlints * 0.4;
    
    float zoomFade = smoothstep(0.3, 0.8, uZoomAlpha);
    gl_FragColor = mix(gl_FragColor, vec4(finalWater, 1.0), zoomFade * waterMix);
}

// === 2. AGUA DULCE (Ríos y Lagos) ===
vec4 packedMasksRiver = texture2D(tPackedMasks, vGlobalPos);
float isRiver = 1.0 - smoothstep(0.1, 0.5, packedMasksRiver.r);
float isLake  = 1.0 - smoothstep(0.1, 0.5, packedMasksRiver.g);
float isFreshWater = max(isRiver, isLake);

if (isFreshWater > 0.01) {
    vec2 localPosRiver = vLocalPosition;
    vec2 flowmapData = texture2D(tFlowMap, vGlobalPos).rg;
    vec2 flowDir = vec2(flowmapData.r * 2.0 - 1.0, -(flowmapData.g * 2.0 - 1.0));
    if (length(flowDir) < 0.1) flowDir = vec2(0.0, 0.0);
    else flowDir = normalize(flowDir);
    
    float flowAxis = dot(localPosRiver, flowDir);
    float walkerWave = fract(flowAxis * 8.0 - uTime * 1.2);
    float stroke = smoothstep(0.0, 0.4, walkerWave) * (1.0 - smoothstep(0.6, 1.0, walkerWave));
    
    float noiseBreak = simplexNoise(localPosRiver * 8.0);
    float lifeCycle = simplexNoise(localPosRiver * 4.0 - vec2(uTime * 0.5));
    
    float walker = stroke * smoothstep(0.0, 0.8, noiseBreak + 0.5) * smoothstep(-0.2, 0.8, lifeCycle);
    
    vec3 riverColorBase = vec3(0.0, 0.5, 0.7);
    vec3 riverHighlight = vec3(0.5, 0.8, 0.9);
    
    vec3 finalRiverColor = mix(riverColorBase * 0.15, riverHighlight * 1.2, walker);
    
    vec3 illuminatedRiver = gl_FragColor.rgb * finalRiverColor;
    illuminatedRiver += riverHighlight * walker * 0.4;
    
    float riverAlpha = isFreshWater * max(0.05, walker * 0.5);
    
    float snowMaskRiver = smoothstep(0.1, 0.5, packedMasksRiver.b);
    float tCycleRiver = fract(uTime * 0.05);
    float cycleRiver = smoothstep(0.0, 0.2, tCycleRiver) - smoothstep(0.6, 1.0, tCycleRiver);
    float localCoverageRiver = cycleRiver * snowMaskRiver;
    
    riverAlpha *= (1.0 - localCoverageRiver);
    
    float zoomFade = smoothstep(0.3, 0.8, uZoomAlpha);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, illuminatedRiver, riverAlpha * zoomFade);
}
`;
