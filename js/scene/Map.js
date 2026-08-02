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
import {
    riverVertexCommon,
    riverVertexUv,
    riverFragmentCommon,
    riverFragment
} from '../shaders/RiverShader.js';
import {
    lakeVertexCommon,
    lakeVertexUv,
    lakeFragmentCommon,
    lakeFragment
} from '../shaders/LakeShader.js';
import {
    snowParticleVertex,
    snowParticleFragment
} from '../shaders/SnowShader.js';
import {
    permafrostMistVertex,
    permafrostMistFragment
} from '../shaders/PermafrostMistShader.js';

export class Map {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        
        this.aspect = 1.0;
        this.plane = null;
        this.onLoadCallback = null;

        this._initMap();
    }

    _initMap() {
        const textureLoader = new THREE.TextureLoader();
        
        // Cargamos las texturas en paralelo
        Promise.all([
            textureLoader.loadAsync('./assets/images/vekiar_sin_letras.jpg'),
            textureLoader.loadAsync('./assets/images/vekiar_sin_letras_h7.jpg'),
            textureLoader.loadAsync('./assets/images/vekiar_water_mask.jpg'),
            textureLoader.loadAsync('./assets/images/noise.jpg'),
            textureLoader.loadAsync('./assets/images/biomas_packed_R_river_G_lake_B_desert_A_snow.png'),
            textureLoader.loadAsync('./assets/images/flowmap.png'),
            textureLoader.loadAsync('./assets/images/vekiar_m_nevadas_mask.jpg')
        ]).then(([colorTexture, heightTexture, waterMaskTexture, noiseTexture, packedMasksTexture, flowmapTexture, snowMaskTexture]) => {
            
            colorTexture.colorSpace = THREE.SRGBColorSpace;
            colorTexture.minFilter = THREE.LinearMipmapLinearFilter;
            colorTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
            
            // OPTIMIZACIÓN: Las máscaras y mapas de altura no necesitan MipMaps (copias miniatura para antialiasing).
            // Apagarlos ahorra un 33% extra de VRAM por cada máscara.
            heightTexture.generateMipmaps = false;
            heightTexture.minFilter = THREE.LinearFilter;
            
            waterMaskTexture.generateMipmaps = false;
            waterMaskTexture.minFilter = THREE.LinearFilter;
            
            // Textura de ruido precalculada para optimización masiva de rendimiento
            noiseTexture.wrapS = noiseTexture.wrapT = THREE.RepeatWrapping;
            noiseTexture.generateMipmaps = false;
            noiseTexture.minFilter = THREE.LinearFilter;
            
            this.aspect = colorTexture.image.width / colorTexture.image.height;
            
            const gridSize = 8; // 8x8 chunks = 64 mallas
            const segmentsPerChunk = 64; // 64 * 8 = 512, misma densidad original
            const totalSize = 100;
            const chunkSize = totalSize / gridSize;
            
            const mapGroup = new THREE.Group();
            
            // Un solo material compartido para todos los chunks
            const mapMaterial = new THREE.MeshStandardMaterial({ 
                map: colorTexture,
                roughness: 0.8,
                metalness: 0.1,
            });
            this.material = mapMaterial; // Lo exponemos para actualizarlo desde main.js
            
            // Creamos las variables que recibirán datos desde JS
            mapMaterial.userData.uZoomAlpha = { value: 1.0 };
            mapMaterial.userData.uTime = { value: 0.0 };
            mapMaterial.userData.tWaterMask = { value: waterMaskTexture };
            mapMaterial.userData.tNoise = { value: noiseTexture };
            mapMaterial.userData.tPackedMasks = { value: packedMasksTexture };
            mapMaterial.userData.tSnowMask = { value: snowMaskTexture };
            mapMaterial.userData.uMountainCenter = { value: new THREE.Vector2(0, 0) };

            // Inyectamos el código del shader modularizado (OceanShader.js)
            mapMaterial.onBeforeCompile = (shader) => {
                shader.uniforms.uZoomAlpha = mapMaterial.userData.uZoomAlpha;
                shader.uniforms.uTime = mapMaterial.userData.uTime;
                shader.uniforms.tWaterMask = mapMaterial.userData.tWaterMask;
                shader.uniforms.tNoise = mapMaterial.userData.tNoise;
                shader.uniforms.tPackedMasks = mapMaterial.userData.tPackedMasks;
                shader.uniforms.tSnowMask = mapMaterial.userData.tSnowMask;
                shader.uniforms.uMountainCenter = mapMaterial.userData.uMountainCenter;

                shader.vertexShader = shader.vertexShader.replace('#include <common>', mapVertexCommon);
                shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', mapVertexUv);
                shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', mapVertexBegin);
                shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', mapVertexWorldPos);
                shader.fragmentShader = shader.fragmentShader.replace('#include <common>', mapFragmentCommon);
                shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', mapFragmentColorChunk);
                shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', mapOceanFragment);
            };

            // --- MATERIAL DEL RÍO ---
            const riverMaterial = mapMaterial.clone();
            riverMaterial.transparent = true;
            riverMaterial.depthWrite = false; 

            // Guardar la referencia en la clase
            this.riverMaterial = riverMaterial;

            riverMaterial.userData.uTime = mapMaterial.userData.uTime;
            riverMaterial.userData.uZoomAlpha = mapMaterial.userData.uZoomAlpha;
            riverMaterial.userData.tPackedMasks = { value: packedMasksTexture };
            riverMaterial.userData.tFlowMap = { value: flowmapTexture };

            riverMaterial.onBeforeCompile = (shader) => {
                shader.uniforms.uTime = riverMaterial.userData.uTime;
                shader.uniforms.uZoomAlpha = riverMaterial.userData.uZoomAlpha;
                // Le pasamos la textura empaquetada (R=Ríos, G=Lagos, B=Desierto, A=Nieve)
                shader.uniforms.tPackedMasks = riverMaterial.userData.tPackedMasks;
                shader.uniforms.tFlowMap = riverMaterial.userData.tFlowMap;

                shader.vertexShader = shader.vertexShader.replace('#include <common>', riverVertexCommon);
                shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', riverVertexUv);
                
                shader.fragmentShader = shader.fragmentShader.replace('#include <common>', riverFragmentCommon);
                shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', riverFragment);
            };

            // --- MATERIAL DEL LAGO ---
            const lakeMaterial = mapMaterial.clone();
            lakeMaterial.transparent = true;
            lakeMaterial.depthWrite = false; 

            // Guardar la referencia en la clase
            this.lakeMaterial = lakeMaterial;

            lakeMaterial.userData.uTime = mapMaterial.userData.uTime;
            lakeMaterial.userData.uZoomAlpha = mapMaterial.userData.uZoomAlpha;
            lakeMaterial.userData.tPackedMasks = { value: packedMasksTexture };
            lakeMaterial.userData.tFlowMap = { value: flowmapTexture };

            lakeMaterial.onBeforeCompile = (shader) => {
                shader.uniforms.uTime = lakeMaterial.userData.uTime;
                shader.uniforms.uZoomAlpha = lakeMaterial.userData.uZoomAlpha;
                shader.uniforms.tPackedMasks = lakeMaterial.userData.tPackedMasks;
                shader.uniforms.tFlowMap = lakeMaterial.userData.tFlowMap;

                shader.vertexShader = shader.vertexShader.replace('#include <common>', lakeVertexCommon);
                shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', lakeVertexUv);
                
                shader.fragmentShader = shader.fragmentShader.replace('#include <common>', lakeFragmentCommon);
                shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', lakeFragment);
            };

            // --- MATERIAL DE HUMO DE PERMAFROST ---
            const permafrostMistMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    tPackedMasks: { value: packedMasksTexture },
                    tSnowMask: { value: snowMaskTexture },
                    tNoise: { value: noiseTexture },
                    uTime: mapMaterial.userData.uTime,
                    uZoomAlpha: mapMaterial.userData.uZoomAlpha
                },
                vertexShader: permafrostMistVertex,
                fragmentShader: permafrostMistFragment,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending // Additive blending hace que el humo brille como escarcha
            });
            this.permafrostMistMaterial = permafrostMistMaterial;


            // Leer alturas
            const canvas = document.createElement('canvas');
            canvas.width = heightTexture.image.width;
            canvas.height = heightTexture.image.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(heightTexture.image, 0, 0);
            
            // Extraemos los pixeles como ArrayBuffer
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            
            // Aumentamos la escala para exagerar las montañas y valles físicamente
            const displacementScale = 3.5;

            // Inicializamos el Web Worker (es un módulo ES6)
            const worker = new Worker('./js/workers/mapWorker.js', { type: 'module' });

            // Configuramos qué hacer cuando el worker termine su trabajo
            worker.onmessage = (e) => {
                const { sharedIndices, chunks } = e.data;
                
                // Creamos un BufferAttribute para los índices (compartido entre todos los chunks)
                const indexAttribute = new THREE.BufferAttribute(sharedIndices, 1);

                for (let chunkData of chunks) {
                    const geometry = new THREE.BufferGeometry();
                    
                    // Asignamos los buffers de memoria procesados por el worker
                    geometry.setAttribute('position', new THREE.BufferAttribute(chunkData.positions, 3));
                    geometry.setAttribute('uv', new THREE.BufferAttribute(chunkData.uvs, 2));
                    geometry.setAttribute('normal', new THREE.BufferAttribute(chunkData.normals, 3));
                    geometry.setIndex(indexAttribute);

                    const chunkMesh = new THREE.Mesh(geometry, mapMaterial);
                    
                    // Posicionar chunk en el espacio 2D del mapa (-50 a 50)
                    chunkMesh.position.x = (-totalSize / 2) + (chunkData.cx * chunkSize) + (chunkSize / 2);
                    chunkMesh.position.y = (totalSize / 2) - (chunkData.cy * chunkSize) - (chunkSize / 2);
                    
                    chunkMesh.castShadow = true;
                    chunkMesh.receiveShadow = true;
                    
                    mapGroup.add(chunkMesh);

                    // CAPA 2: RÍOS
                    // Usamos la misma geometría exacta, pero con el material de los ríos
                    const riverLayerMesh = new THREE.Mesh(geometry, riverMaterial);
                    riverLayerMesh.position.copy(chunkMesh.position);
                    // No necesita sombras porque es transparente
                    mapGroup.add(riverLayerMesh);

                    // CAPA 3: LAGOS
                    const lakeLayerMesh = new THREE.Mesh(geometry, lakeMaterial);
                    lakeLayerMesh.position.copy(chunkMesh.position);
                    mapGroup.add(lakeLayerMesh);

                    // CAPA 4: HUMO DE PERMAFROST
                    const mistLayerMesh = new THREE.Mesh(geometry, permafrostMistMaterial);
                    mistLayerMesh.position.copy(chunkMesh.position);
                    mapGroup.add(mistLayerMesh);
                } // <--- CERRAR EL LOOP DE CHUNKS AQUÍ

                // --- SISTEMA DE CLIMA FIJO A LAS MONTAÑAS (DENSIDAD EXTREMA) ---
                // Leemos la textura de nieve en un canvas para saber exactamente dónde hay nieve
                const maskCanvas = document.createElement('canvas');
                maskCanvas.width = snowMaskTexture.image.width;
                maskCanvas.height = snowMaskTexture.image.height;
                const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
                maskCtx.drawImage(snowMaskTexture.image, 0, 0);
                const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;

                const particleCount = 25000; // Reducido levemente por optimización extrema, tamaño compensado en shader
                const particleGeometry = new THREE.BufferGeometry();
                const particlePositions = new Float32Array(particleCount * 3);
                const particleRandoms = new Float32Array(particleCount);
                const particleSpeeds = new Float32Array(particleCount);

                let spawned = 0;
                let sumX = 0;
                let sumZ = 0;
                let attempts = 0;

                // Buscamos coordenadas válidas al azar hasta llenar las 20.000 partículas
                while(spawned < particleCount && attempts < 500000) {
                    attempts++;
                    const rx = Math.random();
                    const ry = Math.random(); // UV Y (0 = abajo, 1 = arriba)
                    
                    const px = Math.floor(rx * maskCanvas.width);
                    // Invertimos Y para leer el canvas correctamente (0 = arriba en canvas)
                    const py = Math.floor((1.0 - ry) * maskCanvas.height);
                    
                    const index = (py * maskCanvas.width + px) * 4;
                    // El usuario proveyó un JPG blanco y negro, donde la nieve es negra (R=0).
                    const redValue = maskData[index];
                    
                    if (redValue < 128) {
                        // Mapeamos (rx, ry) a las coordenadas del mundo (-50 a 50)
                        // Eliminamos el "sangrado" para que caigan exactamente y de forma densa sobre la máscara negra
                        const worldX = (rx - 0.5) * totalSize;
                        const worldZ = - (ry - 0.5) * totalSize / this.aspect;
                        
                        particlePositions[spawned*3] = worldX; 
                        particlePositions[spawned*3+1] = Math.random() * 15.0; // Altura inicial aleatoria (0 a 15)
                        particlePositions[spawned*3+2] = worldZ;
                        
                        particleRandoms[spawned] = Math.random();
                        particleSpeeds[spawned] = 0.5 + Math.random() * 1.5; // Velocidad de caída MÁS LENTA
                        
                        sumX += worldX;
                        sumZ += worldZ;
                        
                        spawned++;
                    }
                }

                // --- PUNTO DE LUZ (FOCAL) SOBRE LA MONTAÑA ---
                // Calculamos el centro de masa de la montaña nevada usando el promedio de las partículas
                const avgX = sumX / spawned;
                const avgZ = sumZ / spawned;
                
                // Actualizamos el shader con el centro matemático de la montaña para el radio de nieve
                mapMaterial.userData.uMountainCenter.value.set(avgX, avgZ);
                
                // Creamos una PointLight potente de color blanco frío (hielo)
                const snowLight = new THREE.PointLight(0xdff0ff, 15.0, 40.0, 1.5);
                snowLight.position.set(avgX, 12.0, avgZ); // Elevada 12 unidades sobre el centro de la montaña
                
                // Animamos la luz focal en el render loop para que oscile sutilmente
                this.snowLight = snowLight;
                this.snowLightBaseIntensity = 15.0;
                this.scene.add(snowLight);

                particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
                particleGeometry.setAttribute('aRandom', new THREE.BufferAttribute(particleRandoms, 1));
                particleGeometry.setAttribute('aSpeed', new THREE.BufferAttribute(particleSpeeds, 1));
                
                // CRÍTICO para Optimización: Ahora que las partículas están en posiciones fijas del mundo (con Y variando entre 0 y 50),
                // podemos calcular el Bounding Sphere original, y Three.js hará un Frustum Culling perfecto
                // apagando el sistema entero si no estamos mirando ninguna montaña.
                particleGeometry.computeBoundingSphere();

                const snowParticleMaterial = new THREE.ShaderMaterial({
                    uniforms: {
                        uTime: mapMaterial.userData.uTime,
                        uZoomAlpha: mapMaterial.userData.uZoomAlpha
                    },
                    vertexShader: snowParticleVertex,
                    fragmentShader: snowParticleFragment,
                    transparent: true,
                    depthWrite: false,
                    blending: THREE.NormalBlending
                });

                const particleSystem = new THREE.Points(particleGeometry, snowParticleMaterial);
                
                // Lo añadimos directamente a la ESCENA GLOBAL
                this.scene.add(particleSystem);

                // Rotar todo el grupo para acostarlo
                mapGroup.rotation.x = -Math.PI / 2;
                mapGroup.scale.set(1, 1 / this.aspect, 1);
                
                this.plane = mapGroup;
                this.scene.add(this.plane);

                // Limpiamos el worker para liberar memoria
                worker.terminate();

                if (this.onLoadCallback) {
                    this.onLoadCallback(this.aspect);
                }
            };

            // Enviamos los datos pesados al worker (Transfiriendo el ArrayBuffer original por performance)
            worker.postMessage({
                imageData: imageData.buffer,
                width: canvas.width,
                height: canvas.height,
                gridSize,
                segmentsPerChunk,
                chunkSize,
                displacementScale
            }, [imageData.buffer]);
        });
    }

    onLoad(callback) {
        this.onLoadCallback = callback;
    }
}
