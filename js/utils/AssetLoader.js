import * as THREE from 'three';

export class AssetLoader {
    static async loadVekiarAssets(renderer) {
        const textureLoader = new THREE.TextureLoader();
        
        // Cargamos las texturas en paralelo
        const [
            colorTexture, 
            mapDataPackedTexture, 
            noiseTexture, 
            packedMasksTexture, 
            flowmapTexture
        ] = await Promise.all([
            textureLoader.loadAsync('./assets/images/base_color_map.jpg'),
            textureLoader.loadAsync('./assets/images/map_data_R_elevation_B_snow_particles.png'),
            textureLoader.loadAsync('./assets/images/water_noise_distortion.jpg'),
            textureLoader.loadAsync('./assets/images/masks_2_R_river_G_lake_B_snow_A_desert.png'),
            textureLoader.loadAsync('./assets/images/river_flow_directions.png')
        ]);

        colorTexture.colorSpace = THREE.SRGBColorSpace;
        colorTexture.minFilter = THREE.LinearMipmapLinearFilter;
        colorTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        
        // OPTIMIZACIÓN: Las máscaras y mapas de altura no necesitan MipMaps (copias miniatura para antialiasing).
        // NOTA: mapDataPackedTexture usa la nieve en el canal Azul, y el shader SÍ usa MipMaps (bias) 
        // para difuminar la base de la montaña. Así que NO APAGAMOS LOS MIPMAPS en esta textura empaquetada.
        
        packedMasksTexture.generateMipmaps = false;
        packedMasksTexture.minFilter = THREE.LinearFilter;
        
        flowmapTexture.generateMipmaps = false;
        flowmapTexture.minFilter = THREE.LinearFilter;
        
        // Textura de ruido precalculada para optimización masiva de rendimiento
        noiseTexture.wrapS = noiseTexture.wrapT = THREE.RepeatWrapping;
        noiseTexture.generateMipmaps = false;
        noiseTexture.minFilter = THREE.LinearFilter;

        return {
            colorTexture,
            mapDataPackedTexture,
            noiseTexture,
            packedMasksTexture,
            flowmapTexture
        };
    }
}
