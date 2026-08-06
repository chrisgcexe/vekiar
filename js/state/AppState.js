export class AppState {
    constructor() {
        this.time = 0;
        this.currentIn3DAlpha = 0.0;
        this.isReady = false;
    }


    setTerrainReady() {
        this.isReady = true; // Liberamos el bloqueo
    }

    // Le agregamos mapInstance y camera como parámetros (asegurate de enviarlos desde main.js)
    update(timeMs, cameraController, mapInstance, camera) {

        if (!this.isReady) return; // AGREGAR ESTO: Si no estamos listos, no calculamos nada

        const safeTimeMs = timeMs || performance.now();
        this.time = safeTimeMs / 1000.0;
        
        let baseAlpha = 1.0 - cameraController.zoomAlpha;
        let targetIn3DAlpha = Math.pow(baseAlpha, 1.5);
        
        this.currentIn3DAlpha += (targetIn3DAlpha - this.currentIn3DAlpha) * 0.05;

        // --- UPDATE DE LODs ---
        // Chequeamos si el mapa y los LODs ya están construidos
        if (mapInstance && mapInstance.chunksLOD && camera) {
            // Solo actualizar LOD si la cámara se movió más de ~0.3 unidades.
            // Evita 64 operaciones sqrt por frame cuando la cámara está quieta.
            const cpx = camera.position.x, cpy = camera.position.y, cpz = camera.position.z;
            const dx = cpx - (this._prevCpx ?? (cpx + 1));
            const dy = cpy - (this._prevCpy ?? (cpy + 1));
            const dz = cpz - (this._prevCpz ?? (cpz + 1));
            if (dx*dx + dy*dy + dz*dz > 0.09) {
                this._prevCpx = cpx; this._prevCpy = cpy; this._prevCpz = cpz;
                for (let i = 0; i < mapInstance.chunksLOD.length; i++) {
                    mapInstance.chunksLOD[i].update(camera);
                }
            }
        }
    }
}