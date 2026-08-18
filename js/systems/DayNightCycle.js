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

        // --- LÍMITES DE ILUMINACIÓN (INTENSIDAD) ---
        const targetSunIntensity = sunHeightFactor * 1.0 + 0.4;
        // Subimos el mínimo de 0.35 a 0.45 para que la luz de luna sea todavía más clara
        sunLight.intensity = Math.max(0.45, Math.min(targetSunIntensity, 1.2));

        const normalizedFactor = (sunHeightFactor + 1) / 2;
        // Subimos el mínimo de 0.45 a 0.55 para aclarar aún más el mapa en la noche profunda
        ambientLight.intensity = Math.max(0.55, Math.min(0.55 + normalizedFactor * 0.15, 0.70));
        
        // --- TEMPERATURA DE COLOR ---
        let sr, sg, sb; // Sun RGB
        let ar, ag, ab; // Ambient RGB
        
        if (sunHeightFactor > 0.0) {
            // Horizonte al Mediodía (0.0 -> 1.0)
            const t = Math.min(sunHeightFactor / 0.35, 1.0); 
            
            // Desde Atardecer (Naranja) hacia Mediodía (Blanco MÁS cálido/amarillento: 1.0, 0.90, 0.75)
            sr = 1.0;
            sg = 0.55 + (0.35 * t); // Llega a 0.90
            sb = 0.15 + (0.60 * t); // Llega a 0.75
            
            // Ambient desde Atardecer hacia Mediodía (Ligeramente más cálido: 0.50, 0.50, 0.55)
            ar = 0.35 + (0.15 * t);
            ag = 0.25 + (0.25 * t);
            ab = 0.30 + (0.25 * t);
        } else {
            // Noche profunda al Horizonte (-1.0 -> 0.0)
            const t = 1.0 + Math.max(sunHeightFactor, -1.0); 
            
            // Desde Noche (Azul místico/luna: 0.30, 0.50, 0.90) hacia Atardecer (Naranja: 1.0, 0.55, 0.15)
            sr = 0.30 + (0.70 * t);
            sg = 0.50 + (0.05 * t);
            sb = 0.90 - (0.75 * t);
            
            // Ambient desde Noche (Azul purpúreo claro: 0.15, 0.25, 0.45) hacia Atardecer (0.35, 0.25, 0.30)
            ar = 0.15 + (0.20 * t);
            ag = 0.25 + (0.00 * t);
            ab = 0.45 - (0.15 * t);
        }
        
        if (sunLight.color) sunLight.color.setRGB(sr, sg, sb);
        if (ambientLight.color) ambientLight.color.setRGB(ar, ag, ab);

        return progress;
    }
}