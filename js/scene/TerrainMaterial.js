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
            flowmapTexture 
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
        material.userData.uMountainCenter = { value: new THREE.Vector2(0, 0) };
        
        // --- UNIFORM: Sigue la posición actual de los rollos ---
        material.userData.uRollX = { value: 50.1 }; 

material.onBeforeCompile = (shader) => {
            shader.uniforms.uZoomAlpha = material.userData.uZoomAlpha;
            shader.uniforms.uTime = material.userData.uTime;
            shader.uniforms.tMapDataPacked = material.userData.tMapDataPacked;
            shader.uniforms.tNoise = material.userData.tNoise;
            shader.uniforms.tPackedMasks = material.userData.tPackedMasks;
            shader.uniforms.tFlowMap = material.userData.tFlowMap;
            shader.uniforms.uMountainCenter = material.userData.uMountainCenter;
            shader.uniforms.uRollX = material.userData.uRollX;

            // 1. Inyectamos los uniforms SIN redefinir variables que rompan la compilación
            shader.fragmentShader = "uniform float uRollX;\n" + shader.fragmentShader;

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