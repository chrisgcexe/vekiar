import * as THREE from 'three';
// Se importan de forma indirecta a través de TerrainMaterial

import { AssetLoader } from '../utils/AssetLoader.js';
import { TerrainMaterial } from './TerrainMaterial.js';
import { SnowSystem } from '../systems/SnowSystem.js';
import { PermafrostMistMaterial } from '../systems/PermafrostMistMaterial.js';
import { DesertMistMaterial } from '../systems/DesertMistMaterial.js';
import { OceanSystem } from '../systems/OceanSystem.js';
import { LandSystem } from '../systems/LandSystem.js';

export class Map {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        
        this.aspect = 1.0;
        this.plane = null;
        this.onLoadCallback = null;
        
        // Array para guardar las referencias de los LODs (lo lee AppState)
        this.chunksLOD = []; 

        this._initMap();
    }

    _initMap() {
        AssetLoader.loadVekiarAssets(this.renderer).then((assets) => {
            const { 
                colorTexture, 
                mapDataPackedTexture, 
                noiseTexture, 
                packedMasksTexture, 
                flowmapTexture 
            } = assets;
            
            this.aspect = colorTexture.image.width / colorTexture.image.height;
            
            const gridSize = 8; // 8x8 chunks = 64 mallas
            const segmentsPerChunk = 64; // 64 * 8 = 512, misma densidad original
            const totalSize = 100;
            const chunkSize = totalSize / gridSize;
            
            const mapGroup = new THREE.Group();
            
            // Un solo material compartido para todos los chunks
            const mapMaterial = TerrainMaterial.create(assets);
            this.material = mapMaterial; 

            // --- MATERIAL DE HUMO DE PERMAFROST ---
            const permafrostMistMaterial = PermafrostMistMaterial.create(assets, mapMaterial);
            this.permafrostMistMaterial = permafrostMistMaterial;

            // --- MATERIAL DE NIEBLA DEL DESIERTO ---
            const desertMistMaterial = DesertMistMaterial.create(assets, mapMaterial);
            this.desertMistMaterial = desertMistMaterial;

            // Leer alturas (Canal Rojo del empaquetado)
            const canvas = document.createElement('canvas');
            canvas.width = mapDataPackedTexture.image.width;
            canvas.height = mapDataPackedTexture.image.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(mapDataPackedTexture.image, 0, 0);
            
            // Extraemos los pixeles como ArrayBuffer
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            
            const displacementScale = 3.5;

            // Inicializamos el Web Worker
            const worker = new Worker('./js/workers/mapWorker.js', { type: 'module' });

            worker.onmessage = (e) => {
                const { sharedIndices, chunks } = e.data;
                
                // sharedIndices ahora es un array con 3 sets de índices. Mapeamos a BufferAttributes.
                const indexAttributes = sharedIndices.map(indices => new THREE.BufferAttribute(indices, 1));
                
                // Distancias de LOD: Alta (0), Media (25), Baja (45). Ajustá estos números testeando la cámara.
                const lodDistances = [0, 40, 60]; 

                for (let chunkData of chunks) {
                    const lod = new THREE.LOD();
                    
                    // Posicionamiento 2D del chunk completo (se hace una sola vez, no por nivel)
                    const posX = (-totalSize / 2) + (chunkData.cx * chunkSize) + (chunkSize / 2);
                    const posY = (totalSize / 2) - (chunkData.cy * chunkSize) - (chunkSize / 2);

                    chunkData.lods.forEach((levelData, index) => {
                        const geometry = new THREE.BufferGeometry();
                        
                        // Asignamos los buffers generados por el worker para ESTE nivel de detalle
                        geometry.setAttribute('position', new THREE.BufferAttribute(levelData.positions, 3));
                        geometry.setAttribute('uv', new THREE.BufferAttribute(levelData.uvs, 2));
                        geometry.setAttribute('normal', new THREE.BufferAttribute(levelData.normals, 3));
                        geometry.setIndex(indexAttributes[index]);

                        // Agrupamos el terreno y las mallas de fx para que el LOD switchee todo junto
                        const lodLevelGroup = new THREE.Group();

                        const chunkMesh = new THREE.Mesh(geometry, mapMaterial);
                        chunkMesh.castShadow = true;
                        chunkMesh.receiveShadow = true;
                        lodLevelGroup.add(chunkMesh);

                        // CAPA 4: HUMO DE PERMAFROST
                        const mistLayerMesh = new THREE.Mesh(geometry, permafrostMistMaterial);
                        lodLevelGroup.add(mistLayerMesh);

                        // CAPA 5: NIEBLA DEL DESIERTO
                        const desertMistMesh = new THREE.Mesh(geometry, desertMistMaterial);
                        lodLevelGroup.add(desertMistMesh);

                        // Inyectamos el grupo al contenedor LOD en la distancia correspondiente
                        lod.addLevel(lodLevelGroup, lodDistances[index]);
                    });

                    // Posicionamos el contenedor LOD entero
                    lod.position.set(posX, posY, 0);
                    
                    mapGroup.add(lod);
                    this.chunksLOD.push(lod); 
                } // <--- CIERRE DEL LOOP DE CHUNKS

                // --- SISTEMAS BASE DEL TERRENO ---
                this.oceanSystem = new OceanSystem(mapMaterial);
                this.landSystem = new LandSystem(mapMaterial);
                
                // --- SISTEMA DE CLIMA FIJO A LAS MONTAÑAS ---
                this.snowSystem = new SnowSystem(this.scene, assets, mapMaterial, this.aspect);
                this.snowLight = this.snowSystem.snowLight;

                // Rotar todo el grupo para acostarlo
                mapGroup.rotation.x = -Math.PI / 2;
                mapGroup.scale.set(1, 1 / this.aspect, 1);
                
                this.plane = mapGroup;
                this.scene.add(this.plane);

                worker.terminate();

                if (this.onLoadCallback) {
                    this.onLoadCallback(this.aspect);
                }
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
}