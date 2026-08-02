import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

self.onmessage = function(e) {
    const { imageData, width, height, gridSize, segmentsPerChunk, chunkSize, displacementScale } = e.data;
    
    // Convert ArrayBuffer back to typed array for reading pixel data
    const data = new Uint8ClampedArray(imageData);
    
    const chunks = [];
    const transferables = [];

    // The index array is exactly the same for all chunks (same segments).
    // We will extract it once from the first chunk and share it.
    let sharedIndices = null;

    for (let cy = 0; cy < gridSize; cy++) {
        for (let cx = 0; cx < gridSize; cx++) {
            // Instantiate standard PlaneGeometry to leverage Three's native UV and Index generation
            const chunkGeometry = new THREE.PlaneGeometry(chunkSize, chunkSize, segmentsPerChunk, segmentsPerChunk);
            const vertices = chunkGeometry.attributes.position.array;
            const uvs = chunkGeometry.attributes.uv.array;
            
            // Modify UVs and Z coordinates
            for (let i = 0; i < uvs.length; i += 2) {
                const localU = uvs[i];
                const localV = uvs[i+1];
                
                // Map local chunk UV to global texture UV
                const globalU = (cx + localU) / gridSize;
                const globalV = ((gridSize - 1 - cy) + localV) / gridSize;
                
                uvs[i] = globalU;
                uvs[i+1] = globalV;
                
                // Función auxiliar para leer altura global de forma segura
                const getHeightUV = (u, v) => {
                    u = Math.max(0, Math.min(u, 1));
                    v = Math.max(0, Math.min(v, 1));
                    const x = Math.floor(u * (width - 1));
                    const y = Math.floor((1.0 - v) * (height - 1));
                    return (data[(y * width + x) * 4] / 255.0) * displacementScale;
                };
                
                const heightValue = getHeightUV(globalU, globalV);
                
                const vertexIndex = i / 2; // i is UV array index (2 floats per vertex)
                vertices[vertexIndex * 3 + 2] = heightValue; // Z is +2
                
                // --- CÁLCULO DE NORMALES ANALÍTICAS SIN COSTURAS ---
                // En vez de usar chunkGeometry.computeVertexNormals() que corta los bordes, 
                // calculamos la normal matemática perfecta sondeando la altura de los vecinos (aún si están en otro chunk).
                const deltaU = 1.0 / (gridSize * segmentsPerChunk);
                const deltaV = 1.0 / (gridSize * segmentsPerChunk);
                const deltaWorld = chunkSize / segmentsPerChunk;
                
                const hL = getHeightUV(globalU - deltaU, globalV);
                const hR = getHeightUV(globalU + deltaU, globalV);
                const hD = getHeightUV(globalU, globalV - deltaV);
                const hU = getHeightUV(globalU, globalV + deltaV);
                
                // Vector Tangente X y Tangente Y analítico cruzado
                const nx = -(hR - hL);
                const ny = -(hU - hD);
                const nz = 2.0 * deltaWorld;
                
                // Normalizamos el vector
                const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
                const normals = chunkGeometry.attributes.normal.array;
                
                normals[vertexIndex * 3] = nx / len;
                normals[vertexIndex * 3 + 1] = ny / len;
                normals[vertexIndex * 3 + 2] = nz / len;
            }
            
            // Ya no usamos computeVertexNormals() porque nuestras normales analíticas 
            // no tienen bordes cortados entre los chunks.
            
            // Extract the final buffers to send back to main thread
            const positions = chunkGeometry.attributes.position.array;
            const newUvs = chunkGeometry.attributes.uv.array;
            const normals = chunkGeometry.attributes.normal.array;
            
            // If it's the first chunk, extract the indices
            if (cx === 0 && cy === 0) {
                sharedIndices = chunkGeometry.index.array;
                transferables.push(sharedIndices.buffer);
            }

            chunks.push({
                cx, 
                cy,
                positions, 
                uvs: newUvs, 
                normals
            });
            
            // Add array buffers to transferable list for zero-copy transfer
            transferables.push(positions.buffer, newUvs.buffer, normals.buffer);
        }
    }
    
    // Post back the calculated chunks and transfer ownership of the memory buffers
    self.postMessage({
        sharedIndices,
        chunks
    }, transferables);
};
