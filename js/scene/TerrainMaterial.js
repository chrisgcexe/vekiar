import * as THREE from 'three';
import { 
    mapVertexCommon, 
    mapVertexUv, 
    mapVertexBegin, 
    mapVertexWorldPos, 
    mapFragmentCommon, 
    mapDitheringFragment,
    mapFragmentColorChunk
} from '../shaders/TerrainShader.js';

export class TerrainMaterial {
    static create(assets) {
        const { 
            colorTexture, 
            mapDataPackedTexture, 
            noiseTexture, 
            packedMasksTexture, 
            flowmapTexture,
            mountainMaskTexture
        } = assets;

        const material = new THREE.MeshStandardMaterial({ 
            map: colorTexture,
            roughness: 0.8,
            metalness: 0.1,
        });
        
        material.userData.uZoomAlpha = { value: 1.0 };
        material.userData.uTime = { value: 0.0 };
        material.userData.tMapDataPacked = { value: mapDataPackedTexture };
        material.userData.tNoise = { value: noiseTexture };
        material.userData.tPackedMasks = { value: packedMasksTexture };
        material.userData.tFlowMap = { value: flowmapTexture };
        material.userData.tMountainMask = { value: mountainMaskTexture };
        material.userData.uMountainCenter = { value: new THREE.Vector2(0, 0) };
        
        // --- UNIFORM: Sigue la posición actual de los rollos ---
        material.userData.uRollX = { value: 50.1 }; 
        material.userData.tRegionText = { value: null };
        material.userData.tRegionTextGlow = { value: null };
        material.userData.uRegionOpacity = { value: 0.0 };
        
        // --- UNIFORMS: Hover Político y Texto ---
        material.userData.regionMasksTextures = assets.regionMasksTextures;
        material.userData.tHoverMask = { value: assets.regionMasksTextures[0] };
        material.userData.uHoverChannel = { value: new THREE.Vector4(0, 0, 0, 0) };
        material.userData.tFocusMask = { value: assets.regionMasksTextures[0] };
        material.userData.uFocusChannel = { value: new THREE.Vector4(0, 0, 0, 0) };
        
        material.userData.tReferenceMap = { value: assets.referenceTexture };
        material.userData.uHoverRegionAlpha = { value: 0.0 };
        material.userData.uHoverTextAlpha = { value: 0.0 };
        material.userData.uFocusedRegionAlpha = { value: 0.0 };
        
        material.userData.uHoverTextUV = { value: new THREE.Vector3(-1, -1, 1) };
        material.userData.uFocusTextUV = { value: new THREE.Vector3(-1, -1, 1) };
        // 1 = modo overview (alejado): el hover agranda la letra en vez de iluminarla y dejarla fija.
        // 0 = modo juego (cercano): comportamiento previo de brillo/hover.
        material.userData.uOverviewMode = { value: 0.0 };

        material.onBeforeCompile = (shader) => {
            shader.uniforms.uZoomAlpha = material.userData.uZoomAlpha;
            shader.uniforms.uTime = material.userData.uTime;
            shader.uniforms.tMapDataPacked = material.userData.tMapDataPacked;
            shader.uniforms.tNoise = material.userData.tNoise;
            shader.uniforms.tPackedMasks = material.userData.tPackedMasks;
            shader.uniforms.tFlowMap = material.userData.tFlowMap;
            shader.uniforms.tMountainMask = material.userData.tMountainMask;
            shader.uniforms.uMountainCenter = material.userData.uMountainCenter;
            shader.uniforms.uRollX = material.userData.uRollX;
            shader.uniforms.tRegionText = material.userData.tRegionText;
            shader.uniforms.tRegionTextGlow = material.userData.tRegionTextGlow;
            shader.uniforms.uRegionOpacity = material.userData.uRegionOpacity;
            
            shader.uniforms.tHoverMask = material.userData.tHoverMask;
            shader.uniforms.uHoverChannel = material.userData.uHoverChannel;
            shader.uniforms.tFocusMask = material.userData.tFocusMask;
            shader.uniforms.uFocusChannel = material.userData.uFocusChannel;
            
            shader.uniforms.tReferenceMap = material.userData.tReferenceMap;
            shader.uniforms.uHoverRegionAlpha = material.userData.uHoverRegionAlpha;
            shader.uniforms.uHoverTextAlpha = material.userData.uHoverTextAlpha;
            shader.uniforms.uFocusedRegionAlpha = material.userData.uFocusedRegionAlpha;
            
            shader.uniforms.uHoverTextUV = material.userData.uHoverTextUV;
            shader.uniforms.uFocusTextUV = material.userData.uFocusTextUV;
            shader.uniforms.uOverviewMode = material.userData.uOverviewMode;

            // 1. Inyectamos los uniforms SIN redefinir variables que rompan la compilación
            shader.fragmentShader = "uniform float uRollX;\nuniform sampler2D tRegionText;\nuniform sampler2D tRegionTextGlow;\nuniform float uRegionOpacity;\nuniform sampler2D tHoverMask;\nuniform vec4 uHoverChannel;\nuniform sampler2D tFocusMask;\nuniform vec4 uFocusChannel;\nuniform sampler2D tReferenceMap;\nuniform float uHoverRegionAlpha;\nuniform float uHoverTextAlpha;\nuniform float uFocusedRegionAlpha;\nuniform vec3 uHoverTextUV;\nuniform vec3 uFocusTextUV;\nuniform float uOverviewMode;\nuniform sampler2D tMountainMask;\n" + shader.fragmentShader;

            // 2. Vertex Shader (dejamos tu lógica tal cual)
            shader.vertexShader = shader.vertexShader.replace('#include <common>', mapVertexCommon);
            shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', mapVertexUv);
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', mapVertexBegin);
            shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', mapVertexWorldPos);
            
// 3. FRAGMENT SHADER
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', mapFragmentCommon);
            shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', mapFragmentColorChunk);
            
            // Inyectamos la sombra en el ÚLTIMO paso del shader (después de que el océano ya se pintó)
            shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', mapDitheringFragment + `
                
                // --- DIFUMINADO PERIMETRAL EN LOS 4 BORDES (X e Y) ---
                // 1. Límites del despliegue lateral (eje X)
                float uvRollLeft = 0.5 - (uRollX / 100.0);
                float uvRollRight = 0.5 + (uRollX / 100.0);
                float distLeft = vGlobalPos.x - uvRollLeft;
                float distRight = uvRollRight - vGlobalPos.x;
                float distToEdgeX = min(distLeft, distRight);
                
                // 2. Límites superior e inferior (eje Y)
                float distToEdgeY = min(vGlobalPos.y, 1.0 - vGlobalPos.y);

                // 3. Calculamos la atenuación de bordes (0.08 para los laterales, 0.12 para arriba/abajo)
                float edgeShadowX = smoothstep(0.0, 0.08, distToEdgeX);
                float edgeShadowY = smoothstep(0.0, 0.12, distToEdgeY);
                float borderFade = edgeShadowX * edgeShadowY;
                borderFade = pow(borderFade, 1.5); // Atenuación exponencial ultra-suave

                // 4. Sombra clásica del rollo en X para dar profundidad 3D
                float rollDepthShadow = smoothstep(0.0, 0.1, distToEdgeX);
                rollDepthShadow = mix(0.15, 1.0, rollDepthShadow);

                // Color exacto del fondo de la escena (0x171310)
                vec3 fogColor = vec3(0.09, 0.075, 0.063);

                // Mezclamos el mapa completo con el fondo del canvas en todo su contorno
                gl_FragColor.rgb = mix(fogColor, gl_FragColor.rgb * rollDepthShadow, borderFade);
            `);
        };

        return material;
    }
}