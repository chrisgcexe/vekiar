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
// Compensamos exactamente la escala inversa que aplica el mapGroup
            const mapWidth = 100;
            const mapHeight = (mapWidth / this.aspect) * this.aspect; // O simplemente mapWidth, o ajustado por el aspect real
            
            // Si el mapa se aplana por (1 / this.aspect), el cilindro necesita estirarse multiplicándose por el aspect
            const correctRollHeight = (100 / this.aspect) * (this.aspect * this.aspect); 
            
            // Dicho de forma directa y limpia para que ocupe todo el alto visual:
            const finalRollHeight = (100 / this.aspect) * 1.78; // Probá este factor de escala directo en pantalla
            
            const rollGeo = new THREE.CylinderGeometry(2, 2, finalRollHeight, 32);
            const rollMat = new THREE.MeshStandardMaterial({ color: 0xd4c3a3, roughness: 0.9 });
            this.leftRoll = new THREE.Mesh(rollGeo, rollMat);
            this.rightRoll = new THREE.Mesh(rollGeo, rollMat);
            
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
        // Si progress es 0, arranca cerrado en el centro (0.1). Si es 1, llega al borde (mapHalfWidth).
        const currentX = THREE.MathUtils.lerp(0.1, mapHalfWidth, progress);
        
        if (this.leftRoll && this.rightRoll) {
            this.leftRoll.position.x = -currentX;
            this.rightRoll.position.x = currentX;
            
            this.clipLeft.constant = currentX;
            this.clipRight.constant = currentX;
        }
    }
}