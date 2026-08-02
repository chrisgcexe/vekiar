export class AppState {
    constructor() {
        this.time = 0;
        this.currentIn3DAlpha = 1.0;
    }

    // Le agregamos mapInstance y camera como parámetros (asegurate de enviarlos desde main.js)
    update(timeMs, cameraController, mapInstance, camera) {
        const safeTimeMs = timeMs || performance.now();
        this.time = safeTimeMs / 1000.0;
        
        let baseAlpha = 1.0 - cameraController.zoomAlpha;
        let targetIn3DAlpha = Math.pow(baseAlpha, 1.5);
        
        this.currentIn3DAlpha += (targetIn3DAlpha - this.currentIn3DAlpha) * 0.05;

        // --- UPDATE DE LODs ---
        // Chequeamos si el mapa y los LODs ya están construidos
        if (mapInstance && mapInstance.chunksLOD && camera) {
            for (let i = 0; i < mapInstance.chunksLOD.length; i++) {
                mapInstance.chunksLOD[i].update(camera);
            }
        }
    }
}