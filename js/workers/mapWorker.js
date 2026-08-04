import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

self.onmessage = function(e) {
    const { imageData, width, height, gridSize, segmentsPerChunk, chunkSize, displacementScale } = e.data;
    const data = new Uint8ClampedArray(imageData);
    
    const chunks = [];
    const transferables = [];

    let sharedIndicesLOD = []; 
    const lodDivisors = [1, 2, 4]; 
    const totalChunks = gridSize * gridSize;

    for (let cy = 0; cy < gridSize; cy++) {
        for (let cx = 0; cx < gridSize; cx++) {
            
            const chunkLODs = [];

            lodDivisors.forEach((divisor, lodIndex) => {
                const currentSegments = segmentsPerChunk / divisor;
                
                const chunkGeometry = new THREE.PlaneGeometry(chunkSize, chunkSize, currentSegments, currentSegments);
                const vertices = chunkGeometry.attributes.position.array;
                const uvs = chunkGeometry.attributes.uv.array;
                
                for (let i = 0; i < uvs.length; i += 2) {
                    const localU = uvs[i];
                    const localV = uvs[i+1];
                    
                    const globalU = (cx + localU) / gridSize;
                    const globalV = ((gridSize - 1 - cy) + localV) / gridSize;
                    
                    uvs[i] = globalU;
                    uvs[i+1] = globalV;
                    
                    const getHeightUV = (u, v) => {
                        u = Math.max(0, Math.min(u, 1));
                        v = Math.max(0, Math.min(v, 1));
                        const x = Math.floor(u * (width - 1));
                        const y = Math.floor((1.0 - v) * (height - 1));
                        return (data[(y * width + x) * 4] / 255.0) * displacementScale;
                    };
                    
                    const heightValue = getHeightUV(globalU, globalV);
                    const vertexIndex = i / 2; 
                    vertices[vertexIndex * 3 + 2] = heightValue; 
                    
                    const deltaU = 1.0 / (gridSize * currentSegments);
                    const deltaV = 1.0 / (gridSize * currentSegments);
                    const deltaWorld = chunkSize / currentSegments;
                    
                    const hL = getHeightUV(globalU - deltaU, globalV);
                    const hR = getHeightUV(globalU + deltaU, globalV);
                    const hD = getHeightUV(globalU, globalV - deltaV);
                    const hU = getHeightUV(globalU, globalV + deltaV);
                    
                    const nx = -(hR - hL);
                    const ny = -(hU - hD);
                    const nz = 2.0 * deltaWorld;
                    
                    const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
                    const normals = chunkGeometry.attributes.normal.array;
                    
                    normals[vertexIndex * 3] = nx / len;
                    normals[vertexIndex * 3 + 1] = ny / len;
                    normals[vertexIndex * 3 + 2] = nz / len;
                }
                
                const positions = chunkGeometry.attributes.position.array;
                const newUvs = chunkGeometry.attributes.uv.array;
                const normals = chunkGeometry.attributes.normal.array;
                
                if (cx === 0 && cy === 0) {
                    sharedIndicesLOD[lodIndex] = chunkGeometry.index.array;
                    transferables.push(sharedIndicesLOD[lodIndex].buffer);
                }

                chunkLODs.push({
                    positions, 
                    uvs: newUvs, 
                    normals
                });
                
                transferables.push(positions.buffer, newUvs.buffer, normals.buffer);
            });

            chunks.push({
                cx, 
                cy,
                lods: chunkLODs
            });

            // --- AVISO DE PROGRESO AL HILO PRINCIPAL ---
            const procesados = (cy * gridSize) + cx + 1;
            self.postMessage({
                type: 'progress',
                procesados: procesados,
                total: totalChunks
            });
        }
    }
    
    // --- ENVÍO FINAL Y CÓDIGO DE ÉXITO ---
    self.postMessage({
        type: 'done', // ¡Clave! Esto lo ataja Map.js para armar la geometría
        sharedIndices: sharedIndicesLOD, 
        chunks
    }, transferables);
};