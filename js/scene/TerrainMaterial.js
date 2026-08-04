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
                
                // Mapeamos la posición del rollo
                float uvRollLeft = 0.5 - (uRollX / 100.0);
                float uvRollRight = 0.5 + (uRollX / 100.0);
                
                // Calculamos distancia a los bordes usando tu variable vGlobalPos.x
                float distLeft = vGlobalPos.x - uvRollLeft;
                float distRight = uvRollRight - vGlobalPos.x;
                float distToEdge = min(distLeft, distRight);
                
                // Generamos la sombra (0.1 de ancho UV)
                float dynamicRollShadow = smoothstep(0.0, 0.1, distToEdge);
                
                // Intensidad de la oclusión
                dynamicRollShadow = mix(0.15, 1.0, dynamicRollShadow); 
                
                // Modificamos el pixel final ya renderizado (tierra + luces + OCÉANO)
                gl_FragColor.rgb *= dynamicRollShadow;
            `);
        };

        return material;
    }
}