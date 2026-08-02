export class AppState {
    constructor() {
        this.time = 0;
        this.currentIn3DAlpha = 1.0;
    }

    update(timeMs, cameraController) {
        // timeMs puede ser undefined en el primer frame si se llama manualmente
        const safeTimeMs = timeMs || performance.now();
        this.time = safeTimeMs / 1000.0;
        
        let baseAlpha = 1.0 - cameraController.zoomAlpha;
        let targetIn3DAlpha = Math.pow(baseAlpha, 1.5);
        
        // Interpolación en el tiempo (Lerp)
        this.currentIn3DAlpha += (targetIn3DAlpha - this.currentIn3DAlpha) * 0.05;
    }
}
