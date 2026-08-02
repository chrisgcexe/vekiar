import * as THREE from 'three';
import { 
    mapVertexCommon, 
    mapVertexUv, 
    mapVertexBegin, 
    mapVertexWorldPos, 
    mapFragmentCommon, 
    mapOceanFragment,
    mapFragmentColorChunk
} from '../shaders/OceanShader.js';

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
        
        // Creamos las variables que recibirán datos desde JS
        material.userData.uZoomAlpha = { value: 1.0 };
        material.userData.uTime = { value: 0.0 };
        material.userData.tMapDataPacked = { value: mapDataPackedTexture };
        material.userData.tNoise = { value: noiseTexture };
        material.userData.tPackedMasks = { value: packedMasksTexture };
        material.userData.tFlowMap = { value: flowmapTexture };
        material.userData.uMountainCenter = { value: new THREE.Vector2(0, 0) };

        // Inyectamos el código del shader modularizado (OceanShader.js)
        material.onBeforeCompile = (shader) => {
            shader.uniforms.uZoomAlpha = material.userData.uZoomAlpha;
            shader.uniforms.uTime = material.userData.uTime;
            shader.uniforms.tMapDataPacked = material.userData.tMapDataPacked;
            shader.uniforms.tNoise = material.userData.tNoise;
            shader.uniforms.tPackedMasks = material.userData.tPackedMasks;
            shader.uniforms.tFlowMap = material.userData.tFlowMap;
            shader.uniforms.uMountainCenter = material.userData.uMountainCenter;

            shader.vertexShader = shader.vertexShader.replace('#include <common>', mapVertexCommon);
            shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', mapVertexUv);
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', mapVertexBegin);
            shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', mapVertexWorldPos);
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', mapFragmentCommon);
            shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', mapFragmentColorChunk);
            shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', mapOceanFragment);
        };

        return material;
    }
}
