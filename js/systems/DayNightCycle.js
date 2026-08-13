export class DayNightCycle {
    constructor(durationMinutes = 5, timeScale = 1) {
        this.durationSeconds = durationMinutes * 60;
        // Arranca en 0.25 (la cuarta parte del ciclo, equivalente a Math.PI / 2 / sol arriba)
        this.elapsedTime = this.durationSeconds * 0.25; 
        this.timeScale = timeScale;
    }

    update(delta, sunLight, ambientLight) {
        if (!sunLight || !ambientLight) return 0;

        this.elapsedTime = (this.elapsedTime + delta * this.timeScale) % this.durationSeconds;
        const rawProgress = this.elapsedTime / this.durationSeconds;

        // Ciclo asimétrico: estiramos el día y comprimimos la noche (35% del tiempo)
        const progress = rawProgress < 0.65 
            ? rawProgress * (0.5 / 0.65)                
            : 0.5 + (rawProgress - 0.65) * (0.5 / 0.35);  

        const angle = progress * Math.PI * 2;
        const radius = 200;
        
        // --- ÓRBITA EN DIAGONAL (45 GRADOS) ---
        // Evita que los rayos del sol queden paralelos a las grillas y expongan las uniones de los chunks.
        const offsetX = Math.cos(Math.PI / 4);
        const offsetZ = Math.sin(Math.PI / 4); // <--- Acá faltaba el const

        sunLight.position.x = Math.cos(angle) * radius * offsetX;
        sunLight.position.y = Math.sin(angle) * radius;
        sunLight.position.z = Math.sin(angle) * radius * 0.5 + (radius * 0.5 * offsetZ);

        const sunHeightFactor = Math.sin(angle);

        // --- LÍMITES DE ILUMINACIÓN (PISOS Y TECHOS) ---
        const targetSunIntensity = sunHeightFactor * 1.0 + 0.4;
        sunLight.intensity = Math.max(0.2, Math.min(targetSunIntensity, 1.2));

        const normalizedFactor = (sunHeightFactor + 1) / 2;
        ambientLight.intensity = Math.max(0.3, Math.min(0.3 + normalizedFactor * 0.25, 0.55));

        return progress;
    }
}