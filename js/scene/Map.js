import * as THREE from 'three';
// Ya no importamos AssetLoader acá, nos lo pasan por parámetro
import { TerrainMaterial } from './TerrainMaterial.js';
import { SnowSystem } from '../systems/SnowSystem.js';
import { OceanSystem } from '../systems/OceanSystem.js';
import { LandSystem } from '../systems/LandSystem.js';
import { applyParchmentShader } from '../shaders/ParchmentShader.js';

export class Map {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        
        this.aspect = 1.0;
        this.plane = null;
        
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
            const finalRollHeight = 103.5; // Ajustado a 103.5 para coincidir físicamente y cubrir todo el terreno sin dejar pedazos libres
            
            const rollGeo = new THREE.CylinderGeometry(2, 2, finalRollHeight, 32, 64, true); // true = openEnded (sin tapas duras)
            const rollMat = new THREE.MeshStandardMaterial({ 
                            color: 0xffffff,      // Blanco puro para que el shader decida los tonos finales
                            roughness: 1.0,      // Casi totalmente mate para eliminar el brillo plástico
                            metalness: 0.0,       // Cero metálico
                            bumpMap: noiseTexture,  // Textura de ruido para simular el relieve del papel
                            bumpScale: 1.2,        // Escala de la textura de relieve
                        });
                // --- INYECCIÓN DE DEFORMACIÓN Y TEXTURIZADO ORGÁNICO EN EL SHADER ---
            applyParchmentShader(rollMat);
            // ----------------------------------------------------------------------------------------------

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
                        lod.autoUpdate = false; // Desactivar actualización automática para controlarla por estado
                        
                        const posX = (-totalSize / 2) + (chunkData.cx * chunkSize) + (chunkSize / 2);
                        const posY = (totalSize / 2) - (chunkData.cy * chunkSize) - (chunkSize / 2);

                        chunkData.lods.forEach((levelData, index) => {
                            const geometry = new THREE.BufferGeometry();
                            
                            geometry.setAttribute('position', new THREE.BufferAttribute(levelData.positions, 3));
                            geometry.setAttribute('uv', new THREE.BufferAttribute(levelData.uvs, 2));
                            geometry.setAttribute('normal', new THREE.BufferAttribute(levelData.normals, 3));
                            // Instanciar un BufferAttribute independiente por geometría—compartir la misma instancia
                            // entre múltiples BufferGeometry puede corromper el estado interno de WebGL.
                            geometry.setIndex(new THREE.BufferAttribute(sharedIndices[index].slice(), 1));

                            const lodLevelGroup = new THREE.Group();

                            const chunkMesh = new THREE.Mesh(geometry, mapMaterial);
                            chunkMesh.castShadow = true;
                            chunkMesh.receiveShadow = true;
                            lodLevelGroup.add(chunkMesh);

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

                    // LOD controlado por eventos del gestor de estados.
                    // Durante overview y dolly, usamos calidad media (LOD 1) para evitar costuras.
                    // Se activa 1 segundo DESPUES de map:ready para mostrar calidad completa de cerca.
                    this._lodEnabled = false;
                    this._lodEnableTimeout = null;
                    window.addEventListener('map:ready', () => {
                        this._lodEnableTimeout = setTimeout(() => {
                            this._lodEnabled = true;
                        }, 1000);
                    });
                    window.addEventListener('map:zoom-out', () => {
                        clearTimeout(this._lodEnableTimeout);
                        this._lodEnabled = false;
                    });
                    
                    mapGroup.rotation.x = -Math.PI / 2;
                    mapGroup.scale.set(1, 1 / this.aspect, 1);
                    
                    this.plane = mapGroup;
                    this.scene.add(this.plane);

                    worker.terminate();

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

    update(time, cameraState, camera) {
        // Robamos el valor de zoom actual directo del material del terreno
        let currentZoom = 1.0;
        if (this.material && this.material.userData && this.material.userData.uZoomAlpha) {
            currentZoom = this.material.userData.uZoomAlpha.value;
        }

        // Actualizamos el tiempo y el zoom de los shaders en cada frame
        if (this.leftRoll && this.leftRoll.material.userData.shaderUniforms) {
            this.leftRoll.material.userData.shaderUniforms.uTime.value = time;
            this.leftRoll.material.userData.shaderUniforms.uZoom.value = currentZoom;
        }
        if (this.rightRoll && this.rightRoll.material.userData.shaderUniforms) {
            this.rightRoll.material.userData.shaderUniforms.uTime.value = time;
            this.rightRoll.material.userData.shaderUniforms.uZoom.value = currentZoom;
        }

        // --- LOD: ON/OFF controlado por map:ready / map:zoom-out ---
        if (this.chunksLOD && camera) {
            for (let i = 0; i < this.chunksLOD.length; i++) {
                const lod = this.chunksLOD[i];
                if (this._lodEnabled) {
                    lod.update(camera); // Actualización dinámica fina (AppState también ayuda, pero lo aseguramos acá)
                } else {
                    // Si estamos volando o en overview, forzamos calidad Media (index 1) a todo el mapa
                    // Esto oculta las costuras y mantiene altísimo rendimiento
                    lod.levels.forEach((level, index) => {
                        level.object.visible = (index === 1);
                    });
                }
            }
        }
    }
}