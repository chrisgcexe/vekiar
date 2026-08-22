import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

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
        const noisePromise       = textureLoader.loadAsync('./assets/images/water_noise_distortion.jpg');
        const colorPromise        = ktx2Loader.loadAsync('./assets/images/base_color_map.ktx2');
        const mapDataPromise      = textureLoader.loadAsync('./assets/images/map_data_R_elevation_B_snow_particles.png');
        const packedMasksPromise  = textureLoader.loadAsync('./assets/images/masks_2_R_river_G_lake_B_snow_A_desert.png');
        const flowmapPromise      = textureLoader.loadAsync('./assets/images/river_flow_directions.png');
        const rm0Promise          = textureLoader.loadAsync('./assets/images/region_masks_0.png');
        const rm1Promise          = textureLoader.loadAsync('./assets/images/region_masks_1.png');
        const rm2Promise          = textureLoader.loadAsync('./assets/images/region_masks_2.png');
        const rm3Promise          = textureLoader.loadAsync('./assets/images/region_masks_3.png');
        const rm4Promise          = textureLoader.loadAsync('./assets/images/region_masks_4.png');
        const mountainMaskPromise = textureLoader.loadAsync('./assets/images/mountain_snow_mask.png');
        // mapa_referencia.jpg (5.9 MB) se carga en lazy — solo cuando el editor la necesita

        let colorTexture, noiseTexture, mapDataPackedTexture, packedMasksTexture, flowmapTexture, rm0, rm1, rm2, rm3, rm4, mountainMaskTexture;
        try {
            [
                colorTexture,
                noiseTexture,
                mapDataPackedTexture,
                packedMasksTexture,
                flowmapTexture,
                rm0, rm1, rm2, rm3, rm4,
                mountainMaskTexture
            ] = await Promise.all([
                colorPromise,
                noisePromise,
                mapDataPromise,
                packedMasksPromise,
                flowmapPromise,
                rm0Promise,
                rm1Promise,
                rm2Promise,
                rm3Promise,
                rm4Promise,
                mountainMaskPromise
            ]);
        } catch (err) {
            [colorTexture, noiseTexture, mapDataPackedTexture, packedMasksTexture, flowmapTexture, rm0, rm1, rm2, rm3, rm4, mountainMaskTexture]
                .forEach(t => t?.dispose());
            ktx2Loader.dispose();
            throw new Error(`AssetLoader: fallo al cargar uno o más assets. Causa: ${err.message}`);
        }

        colorTexture.colorSpace   = THREE.SRGBColorSpace;
        
        const regionMasksTextures = [rm0, rm1, rm2, rm3, rm4];
        regionMasksTextures.forEach(t => {
            t.colorSpace = THREE.NoColorSpace;
            t.generateMipmaps = false;
            t.minFilter = THREE.LinearFilter;
            t.magFilter = THREE.LinearFilter;
            t.needsUpdate = true;
        });

        // La mascara de montañas ya viene pre-blureada — sin mipmaps
        mountainMaskTexture.generateMipmaps = false;
        mountainMaskTexture.minFilter = THREE.LinearFilter;
        mountainMaskTexture.magFilter = THREE.LinearFilter;
        
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
            flowmapTexture,
            regionMasksTextures,
            mountainMaskTexture,
            referenceTexture: null // lazy — usar loadReferenceMap() cuando el editor la necesite
        };
    }

    /** Carga mapa_referencia.jpg solo cuando el editor la necesita (5.9 MB diferidos) */
    static async loadReferenceMap() {
        const textureLoader = new THREE.TextureLoader();
        const tex = await textureLoader.loadAsync('./assets/images/mapa_referencia.jpg');
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }
}