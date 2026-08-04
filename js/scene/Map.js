import * as THREE from 'three';
// Ya no importamos AssetLoader acá, nos lo pasan por parámetro
import { TerrainMaterial } from './TerrainMaterial.js';
import { SnowSystem } from '../systems/SnowSystem.js';
import { PermafrostMistMaterial } from '../systems/PermafrostMistMaterial.js';
import { OceanSystem } from '../systems/OceanSystem.js';
import { LandSystem } from '../systems/LandSystem.js';

export class Map {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        
        this.aspect = 1.0;
        this.plane = null;
        this.onLoadCallback = null;
        
        this.chunksLOD = []; 
        // Eliminamos la llamada automática a _initMap()
    }

    // El método asíncrono que llama SceneManager
    build(assets, updateUI) {
        return new Promise((resolve, reject) => {
            const { 
                colorTexture, 
                mapDataPackedTexture, 
                noiseTexture, 
                packedMasksTexture, 
                flowmapTexture 
            } = assets;
            
            this.aspect = colorTexture.image.width / colorTexture.image.height;
            
            const gridSize = 8; 
            const segmentsPerChunk = 64; 
            const totalSize = 100;
            const chunkSize = totalSize / gridSize;
            
            const mapGroup = new THREE.Group();
            
            // --- NUEVO: PLANOS DE CORTE Y CILINDROS ---
            // El plano izquierdo corta lo que está a la izquierda (apunta a +X)
            this.clipLeft = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
            // El plano derecho corta lo que está a la derecha (apunta a -X)
            this.clipRight = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
            const clippingPlanes = [this.clipLeft, this.clipRight];

// Cilindros base para hacer de bordes del papel
            const mapWidth = 100;
            const mapHeight = (mapWidth / this.aspect) * this.aspect; 
            const finalRollHeight = (100 / this.aspect) * 1.78; 
            
            const rollGeo = new THREE.CylinderGeometry(2, 2, finalRollHeight, 32, 64);
            const rollMat = new THREE.MeshStandardMaterial({ 
                            color: 0xe3d4be,      // Un tono base más cálido y luminoso
                            roughness: 0.98,      // Casi totalmente mate para eliminar el brillo plástico
                            metalness: 0.0,       // Cero metálico
                            roughnessMap: noiseTexture,
                            bumpMap: noiseTexture,
                            bumpScale: 0.4        // Bajamos el bump para que no parezca piedra rugosa
                        });
            
// --- INYECCIÓN DE DEFORMACIÓN Y TEXTURIZADO ORGÁNICO EN EL SHADER ---
            rollMat.onBeforeCompile = (shader) => {
                shader.uniforms.uTime = { value: 0.0 };
                rollMat.userData.shaderUniforms = shader.uniforms;

                shader.vertexShader = `
                    uniform float uTime;
                    varying vec3 vWorldPositionRoll;
                    varying vec2 vUvRoll;
                    
                    float hashRoll(vec2 p) {
                        p = fract(p * vec2(123.34, 456.21));
                        p += dot(p, p + 45.32);
                        return fract(p.x * p.y);
                    }
                    
                    float snoiseRoll(vec2 p) {
                        vec2 i = floor(p);
                        vec2 f = fract(p);
                        f = f * f * (3.0 - 2.0 * f);
                        return mix(mix(hashRoll(i + vec2(0.0, 0.0)), hashRoll(i + vec2(1.0, 0.0)), f.x),
                                   mix(hashRoll(i + vec2(0.0, 1.0)), hashRoll(i + vec2(1.0, 1.0)), f.x), f.y);
                    }
                ` + shader.vertexShader;

                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `
                    #include <begin_vertex>
                    vUvRoll = uv;
                    
                    // Calculamos la posición para usarla en el fragment shader sin distorsiones UV
                    vWorldPositionRoll = position;
                    
                    // Ruido sutil para romper la perfección del tubo geométrico
                    float noiseWave = snoiseRoll(vec2(position.y * 0.15, uTime * 0.1)) * 0.05;
                    transformed.x += transformed.x * noiseWave;
                    transformed.z += transformed.z * noiseWave;
                    `
                );

                shader.fragmentShader = `
                    varying vec3 vWorldPositionRoll;
                    varying vec2 vUvRoll;
                    
                    float hashF(vec2 p) {
                        p = fract(p * vec2(234.34, 321.21));
                        p += dot(p, p + 34.32);
                        return fract(p.x * p.y);
                    }
                    
                    float perlinF(vec2 p) {
                        vec2 i = floor(p);
                        vec2 f = fract(p);
                        f = f * f * (3.0 - 2.0 * f);
                        return mix(mix(hashF(i + vec2(0.0, 0.0)), hashF(i + vec2(1.0, 0.0)), f.x),
                                   mix(hashF(i + vec2(0.0, 1.0)), hashF(i + vec2(1.0, 1.0)), f.x), f.y);
                    }
                ` + shader.fragmentShader;

                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <color_fragment>',
                    `
                    #include <color_fragment>
                    
                    // Mapeo cilíndrico continuo basado en la posición 3D local del cilindro
                    float angle = atan(vWorldPositionRoll.x, vWorldPositionRoll.z);
                    vec2 cylindricalUv = vec2(angle * 2.0, vWorldPositionRoll.y * 0.1);
                    
                    // Capas de ruido combinadas para vetas naturales y grano de papel
                    float noiseLarge = perlinF(cylindricalUv * vec2(1.5, 4.0));
                    float noiseDetail = perlinF(cylindricalUv * vec2(8.0, 25.0));
                    float pNoise = noiseLarge * 0.7 + noiseDetail * 0.3;
                    
                // Paleta de tonos pergamino cálido (evitamos grises de hueso)
                    vec3 colorClean = vec3(0.88, 0.82, 0.70); // Marfil cálido
                    vec3 colorDark = vec3(0.72, 0.63, 0.50);  // Tostado suave (menos contraste)
                    vec3 parchmentColor = mix(colorDark, colorClean, pNoise);

                    // Viñeta sutil en los extremos del rollo (más difusa)
                    float edgeFactor = smoothstep(0.0, 0.4, vUvRoll.y) * smoothstep(1.0, 0.6, vUvRoll.y);
                    edgeFactor = mix(0.7, 1.0, edgeFactor); // Menos agresivo el oscurecimiento
                    
                    parchmentColor *= edgeFactor;

                    // Fusionamos con el color base
                    diffuseColor.rgb *= parchmentColor;
                    `
                );
            };
            // -------------------------------------------------------------------

            this.leftRoll = new THREE.Mesh(rollGeo, rollMat);
                        this.rightRoll = new THREE.Mesh(rollGeo, rollMat);
            
// --- APAGAMOS LAS SOMBRAS NATIVAS PARA USAR SOLO EL SHADER ---
            this.leftRoll.castShadow = false; 
            this.leftRoll.receiveShadow = true; // Que la reciba por si querés que algo le haga sombra al rollo
            this.rightRoll.castShadow = false;
            this.rightRoll.receiveShadow = true;
            
            // Los ubicamos con Z en 2 para que queden apoyados sobre el mapa
            this.leftRoll.position.z = 2;
            this.rightRoll.position.z = 2;
            
            mapGroup.add(this.leftRoll);
            mapGroup.add(this.rightRoll);

            this.updateUnfurl(0.0);
            // ------------------------------------------

            const mapMaterial = TerrainMaterial.create(assets);
            mapMaterial.clippingPlanes = clippingPlanes; // <-- INYECTAMOS
            mapMaterial.clipShadows = true; 
            this.material = mapMaterial; 

            const permafrostMistMaterial = PermafrostMistMaterial.create(assets, mapMaterial);
            permafrostMistMaterial.clippingPlanes = clippingPlanes; // <-- INYECTAMOS (Para que la niebla también se corte)
            this.permafrostMistMaterial = permafrostMistMaterial;

            const canvas = document.createElement('canvas');
            canvas.width = mapDataPackedTexture.image.width;
            canvas.height = mapDataPackedTexture.image.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(mapDataPackedTexture.image, 0, 0);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            const displacementScale = 3.5;

            const worker = new Worker('./js/workers/mapWorker.js', { type: 'module' });

            worker.onmessage = (e) => {
                // 1. ATAJAMOS EL PROGRESO (50% a 100%)
                if (e.data.type === 'progress') {
                    const porcentajeWorker = (e.data.procesados / e.data.total) * 50;
                    if (updateUI) updateUI(50 + porcentajeWorker);
                } 
                // 2. ATAJAMOS EL FINAL DE LA GEOMETRÍA
                else if (e.data.type === 'done') {
                    const { sharedIndices, chunks } = e.data;
                    
                    const indexAttributes = sharedIndices.map(indices => new THREE.BufferAttribute(indices, 1));
                    const lodDistances = [0, 40, 55]; 

                    for (let chunkData of chunks) {
                        const lod = new THREE.LOD();
                        
                        const posX = (-totalSize / 2) + (chunkData.cx * chunkSize) + (chunkSize / 2);
                        const posY = (totalSize / 2) - (chunkData.cy * chunkSize) - (chunkSize / 2);

                        chunkData.lods.forEach((levelData, index) => {
                            const geometry = new THREE.BufferGeometry();
                            
                            geometry.setAttribute('position', new THREE.BufferAttribute(levelData.positions, 3));
                            geometry.setAttribute('uv', new THREE.BufferAttribute(levelData.uvs, 2));
                            geometry.setAttribute('normal', new THREE.BufferAttribute(levelData.normals, 3));
                            geometry.setIndex(indexAttributes[index]);

                            const lodLevelGroup = new THREE.Group();

                            const chunkMesh = new THREE.Mesh(geometry, mapMaterial);
                            chunkMesh.castShadow = true;
                            chunkMesh.receiveShadow = true;
                            lodLevelGroup.add(chunkMesh);

                            const mistLayerMesh = new THREE.Mesh(geometry, permafrostMistMaterial);
                            lodLevelGroup.add(mistLayerMesh);

                            lod.addLevel(lodLevelGroup, lodDistances[index]);
                        });

                        lod.position.set(posX, posY, 0);
                        mapGroup.add(lod);
                        this.chunksLOD.push(lod); 
                    }

                    this.oceanSystem = new OceanSystem(mapMaterial);
                    this.landSystem = new LandSystem(mapMaterial);
                    
                    this.snowSystem = new SnowSystem(this.scene, assets, mapMaterial, this.aspect);
                    this.snowLight = this.snowSystem.snowLight;

                    mapGroup.rotation.x = -Math.PI / 2;
                    mapGroup.scale.set(1, 1 / this.aspect, 1);
                    
                    this.plane = mapGroup;
                    this.scene.add(this.plane);

                    worker.terminate();

                    if (this.onLoadCallback) {
                        this.onLoadCallback(this.aspect);
                    }

                    // Aseguramos que clave en 100%
                    if (updateUI) updateUI(100);
                    
                    // ¡Acá destrabamos el await de SceneManager!
                    resolve(); 
                }
            };

            worker.onerror = (err) => {
                console.error("Falló el worker del mapa:", err);
                reject(err);
            };

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

updateUnfurl(progress) {
        const mapHalfWidth = 50.1;
        const currentX = THREE.MathUtils.lerp(0.1, mapHalfWidth, progress);
        
        if (this.leftRoll && this.rightRoll) {
            this.leftRoll.position.x = -currentX;
            this.rightRoll.position.x = currentX;
            
            this.clipLeft.constant = currentX;
            this.clipRight.constant = currentX;

            // --- ACTUALIZAMOS LA POSICIÓN DE LA SOMBRA EN EL TERRENO ---
            if (this.material && this.material.userData && this.material.userData.uRollX) {
                this.material.userData.uRollX.value = currentX;
            }
        }
    }

    update(time) {
        // Actualizamos el tiempo de los shaders de los rollos para que respiren orgánicamente
        if (this.leftRoll && this.leftRoll.material.userData.shaderUniforms) {
            this.leftRoll.material.userData.shaderUniforms.uTime.value = time;
        }
        if (this.rightRoll && this.rightRoll.material.userData.shaderUniforms) {
            this.rightRoll.material.userData.shaderUniforms.uTime.value = time;
        }
    }
}