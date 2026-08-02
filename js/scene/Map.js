import * as THREE from 'three';
// Se importan de forma indirecta a través de TerrainMaterial


import { AssetLoader } from '../utils/AssetLoader.js';
import { TerrainMaterial } from './TerrainMaterial.js';
import { SnowSystem } from '../systems/SnowSystem.js';
import { PermafrostMistMaterial } from '../systems/PermafrostMistMaterial.js';

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
            this.material = mapMaterial; // Lo exponemos para actualizarlo desde main.js

            // --- MATERIAL DE HUMO DE PERMAFROST ---
            const permafrostMistMaterial = PermafrostMistMaterial.create(assets, mapMaterial);
            this.permafrostMistMaterial = permafrostMistMaterial;


            // Leer alturas (Canal Rojo del empaquetado)
            const canvas = document.createElement('canvas');
            canvas.width = mapDataPackedTexture.image.width;
            canvas.height = mapDataPackedTexture.image.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(mapDataPackedTexture.image, 0, 0);
            
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



                    // CAPA 4: HUMO DE PERMAFROST
                    const mistLayerMesh = new THREE.Mesh(geometry, permafrostMistMaterial);
                    mistLayerMesh.position.copy(chunkMesh.position);
                    mapGroup.add(mistLayerMesh);
                } // <--- CERRAR EL LOOP DE CHUNKS AQUÍ

                // --- SISTEMA DE CLIMA FIJO A LAS MONTAÑAS ---
                this.snowSystem = new SnowSystem(this.scene, assets, mapMaterial, this.aspect);
                // Exponemos la luz de la nieve para que la UI o main.js pueda verificar si existe, 
                // aunque ahora se anima sola dentro de SnowSystem.
                this.snowLight = this.snowSystem.snowLight;

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
