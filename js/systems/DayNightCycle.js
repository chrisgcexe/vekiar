import * as THREE from 'three';

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
        
        const targetSunIntensity = sunHeightFactor * 1.0 + 0.4;
        const normalizedFactor = (sunHeightFactor + 1) / 2;

        // --- MODIFICADOR DE CLIMA (TORMENTAS / NUBES) ---
        // this.weatherDimmer va de 0.0 (Despejado) a 1.0 (Tormenta fuerte)
        const dimmer = this.weatherDimmer || 0.0;
        
        // En tormenta, la luz del sol (sombras duras) casi desaparece y la luz ambiental (luz difusa) toma el control
        const sunIntensityBase = Math.max(0.45, Math.min(targetSunIntensity, 1.2));
        sunLight.intensity = THREE.MathUtils.lerp(sunIntensityBase, sunIntensityBase * 0.15, dimmer);
        
        const ambientIntensityBase = Math.max(0.55, Math.min(0.55 + normalizedFactor * 0.15, 0.70));
        // Mantenemos la luz ambiental un poco más alta en tormentas diurnas para compensar la falta de sol directo
        ambientLight.intensity = THREE.MathUtils.lerp(ambientIntensityBase, ambientIntensityBase * 1.1, dimmer);
        
        // --- TEMPERATURA DE COLOR ---
        let sr, sg, sb; // Sun RGB
        let ar, ag, ab; // Ambient RGB
        
        if (sunHeightFactor > 0.0) {
            // Horizonte al Mediodía (0.0 -> 1.0)
            const t = Math.min(sunHeightFactor / 0.35, 1.0); 
            
            // Desde Atardecer (Naranja) hacia Mediodía (Blanco MÁS cálido/amarillento: 1.0, 0.90, 0.75)
            sr = 1.0;
            sg = 0.55 + (0.35 * t);
            sb = 0.15 + (0.60 * t);
            
            // Ambient desde Atardecer hacia Mediodía
            ar = 0.35 + (0.15 * t);
            ag = 0.25 + (0.25 * t);
            ab = 0.30 + (0.25 * t);
        } else {
            // Noche profunda al Horizonte (-1.0 -> 0.0)
            const t = 1.0 + Math.max(sunHeightFactor, -1.0); 
            
            // Desde Noche hacia Atardecer
            sr = 0.30 + (0.70 * t);
            sg = 0.50 + (0.05 * t);
            sb = 0.90 - (0.75 * t);
            
            // Ambient
            ar = 0.15 + (0.20 * t);
            ag = 0.25 + (0.00 * t);
            ab = 0.45 - (0.15 * t);
        }
        
        // --- APLICAR EFECTO DEL CLIMA SOBRE EL COLOR ---
        // En días nublados o tormenta, todo se vuelve grisáceo/azulado y se pierde la calidez del sol
        const stormR = 0.45;
        const stormG = 0.50;
        const stormB = 0.55;
        
        // Interpolar los colores hacia el gris plomizo de la tormenta (solo si es de día, de noche ya es azul)
        const stormEffect = dimmer * Math.max(0.0, sunHeightFactor); // Solo afecta cuando el sol está arriba
        
        sr = THREE.MathUtils.lerp(sr, stormR * 1.2, stormEffect);
        sg = THREE.MathUtils.lerp(sg, stormG * 1.2, stormEffect);
        sb = THREE.MathUtils.lerp(sb, stormB * 1.2, stormEffect);
        
        ar = THREE.MathUtils.lerp(ar, stormR * 0.8, stormEffect);
        ag = THREE.MathUtils.lerp(ag, stormG * 0.8, stormEffect);
        ab = THREE.MathUtils.lerp(ab, stormB * 0.8, stormEffect);
        
        // --- MODIFICADOR TÉRMICO (DÍAS FRÍOS Y CALUROSOS) ---
        // Base = 20°C. Calor = +35°C (+15), Frío = +5°C (-15).
        const temp = this.weatherTemperature !== undefined ? this.weatherTemperature : 20.0;
        
        // thermalFactor va de -1.0 (Frío Extremo) a +1.0 (Calor Extremo)
        let thermalFactor = (temp - 20.0) / 15.0; 
        thermalFactor = Math.max(-1.0, Math.min(thermalFactor, 1.0));
        
        // Solo afecta durante el día y disminuye si hay tormenta
        const dayThermal = thermalFactor * Math.max(0.0, sunHeightFactor) * (1.0 - stormEffect);
        
        if (dayThermal > 0.0) {
            // Días de calor: Luz más fuerte y amarillenta (pero sutil, no sepia exagerado)
            sunLight.intensity += dayThermal * 0.2; // Hasta +0.2 de intensidad
            sr += dayThermal * 0.15; // Un poco más de rojo
            sg += dayThermal * 0.05;
            sb -= dayThermal * 0.15; // Menos azul (más cálido)
        } else if (dayThermal < 0.0) {
            // Días de frío: Luz levemente más pálida y azulada/celeste
            sunLight.intensity += dayThermal * 0.15; // Hasta -0.15 de intensidad
            sr += dayThermal * 0.10; // Menos rojo (dayThermal es negativo, así que resta)
            sg -= dayThermal * 0.05; 
            sb -= dayThermal * 0.15; // Más azul (dayThermal es negativo, resta un negativo -> suma)
        }
        
        if (sunLight.color) sunLight.color.setRGB(Math.max(0, Math.min(sr, 1)), Math.max(0, Math.min(sg, 1)), Math.max(0, Math.min(sb, 1)));
        if (ambientLight.color) ambientLight.color.setRGB(Math.max(0, Math.min(ar, 1)), Math.max(0, Math.min(ag, 1)), Math.max(0, Math.min(ab, 1)));

        return progress;
    }
}