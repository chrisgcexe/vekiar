import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { KTX2Loader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/KTX2Loader.js';

export class AssetLoader {
    static async loadVekiarAssets(renderer) {
        const textureLoader = new THREE.TextureLoader();
        
        // Inicializamos el loader de KTX2
        const ktx2Loader = new KTX2Loader()
            // Apuntamos al CDN oficial de Three.js para los archivos WebAssembly (.wasm)
            .setTranscoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/basis/')
            // Le pasamos tu WebGLRenderer para que detecte qué formato soporta la placa de video del usuario
            .detectSupport(renderer);

        // 1. Cargar Assets Visuales (Comprimidos en VRAM)
        const noisePromise = textureLoader.loadAsync('./assets/images/water_noise_distortion.jpg');
        const colorPromise = ktx2Loader.loadAsync('./assets/images/base_color_map.ktx2');
  

        // 2. Cargar Assets de Datos (Crudos en PNG para no perder matemática)
        const mapDataPromise = textureLoader.loadAsync('./assets/images/map_data_R_elevation_B_snow_particles.png');
        const packedMasksPromise = textureLoader.loadAsync('./assets/images/masks_2_R_river_G_lake_B_snow_A_desert.png');
        const flowmapPromise = textureLoader.loadAsync('./assets/images/river_flow_directions.png');

        // Esperamos a que baje todo en paralelo
        const [
            colorTexture, 
            noiseTexture, 
            mapDataPackedTexture, 
            packedMasksTexture, 
            flowmapTexture
        ] = await Promise.all([
            colorPromise, 
            noisePromise, 
            mapDataPromise, 
            packedMasksPromise, 
            flowmapPromise
        ]);

        // Seteamos el color space para que no se vea lavado
        colorTexture.colorSpace = THREE.SRGBColorSpace;
        
        // Configuramos el wrap para el ruido del agua
        noiseTexture.wrapS = THREE.RepeatWrapping;
        noiseTexture.wrapT = THREE.RepeatWrapping;

        // Limpiamos la memoria del decodificador KTX2 porque ya no lo necesitamos
        ktx2Loader.dispose();

        return {
            colorTexture,
            noiseTexture,
            mapDataPackedTexture,
            packedMasksTexture,
            flowmapTexture
        };
    }
}