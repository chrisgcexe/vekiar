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
        material.userData.tRegionIds = { value: assets.regionIdsTexture };
        material.userData.tReferenceMap = { value: assets.referenceTexture };
        material.userData.uHoveredRegionColor = { value: new THREE.Color(-1, -1, -1) };
        material.userData.uHoverRegionAlpha = { value: 0.0 };
        material.userData.uFocusedRegionColor = { value: new THREE.Color(-1, -1, -1) };
        material.userData.uFocusedRegionAlpha = { value: 0.0 };
        
        material.userData.uHoverTextUV = { value: new THREE.Vector3(-1, -1, 1) };
        material.userData.uFocusTextUV = { value: new THREE.Vector3(-1, -1, 1) };

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
            
            shader.uniforms.tRegionIds = material.userData.tRegionIds;
            shader.uniforms.tReferenceMap = material.userData.tReferenceMap;
            shader.uniforms.uHoveredRegionColor = material.userData.uHoveredRegionColor;
            shader.uniforms.uHoverRegionAlpha = material.userData.uHoverRegionAlpha;
            shader.uniforms.uFocusedRegionColor = material.userData.uFocusedRegionColor;
            shader.uniforms.uFocusedRegionAlpha = material.userData.uFocusedRegionAlpha;
            
            shader.uniforms.uHoverTextUV = material.userData.uHoverTextUV;
            shader.uniforms.uFocusTextUV = material.userData.uFocusTextUV;

            // 1. Inyectamos los uniforms SIN redefinir variables que rompan la compilación
            shader.fragmentShader = "uniform float uRollX;\nuniform sampler2D tRegionText;\nuniform sampler2D tRegionTextGlow;\nuniform float uRegionOpacity;\nuniform sampler2D tRegionIds;\nuniform sampler2D tReferenceMap;\nuniform vec3 uHoveredRegionColor;\nuniform float uHoverRegionAlpha;\nuniform vec3 uFocusedRegionColor;\nuniform float uFocusedRegionAlpha;\nuniform vec3 uHoverTextUV;\nuniform vec3 uFocusTextUV;\nuniform sampler2D tMountainMask;\n" + shader.fragmentShader;

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