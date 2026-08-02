export const landFragmentChunk = `
// === 1. ACUMULACIÓN DE NIEVE (Efecto Clásico Gradual) ===
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
