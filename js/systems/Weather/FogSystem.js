import * as THREE from 'three';

export class FogSystem {
    constructor(scene) {
        this.scene = scene;
        
        // Asumimos que SceneManager ya creó this.scene.fog como THREE.Fog
        // Guardamos los valores base de niebla "despejada" (noche/día normales)
        this.baseColor = new THREE.Color(0x171310);
        this.baseNear = 50;
        this.baseFar = 95;
        
        // Valores objetivo para interpolar
        this.targetColor = new THREE.Color(0x171310);
        this.targetNear = 50;
        this.targetFar = 95;
        
        // Color de tormenta/lluvia
        this.stormColor = new THREE.Color(0x2a303c); // Gris azulado oscuro
    }
    
    setWeather(condition, rainIntensity) {
        if (!this.scene.fog || !this.scene.fog.isFog) return;
        
        if (condition === 'Rain' || condition === 'Thunderstorm') {
            // Lluvia espesa: la niebla se vuelve gris y se acerca a la cámara
            this.targetColor.copy(this.baseColor).lerp(this.stormColor, rainIntensity);
            
            // Si la lluvia es de 1.0 (máxima), la niebla empieza a los 30 metros y termina a los 75
            this.targetNear = THREE.MathUtils.lerp(this.baseNear, 30, rainIntensity);
            this.targetFar = THREE.MathUtils.lerp(this.baseFar, 75, rainIntensity);
        } 
        else if (condition === 'Fog') {
            // Niebla densa blanca/grisácea
            this.targetColor.setHex(0x556677);
            this.targetNear = 10;
            this.targetFar = 40;
        } 
        else {
            // Despejado
            this.targetColor.copy(this.baseColor);
            this.targetNear = this.baseNear;
            this.targetFar = this.baseFar;
        }
    }
    
    update(delta, time) {
        if (!this.scene.fog || !this.scene.fog.isFog) return;
        
        // Interpolar lentamente hacia los valores objetivo (tarda unos segundos)
        const lerpSpeed = 0.5 * delta;
        
        this.scene.fog.color.lerp(this.targetColor, lerpSpeed);
        this.scene.fog.near += (this.targetNear - this.scene.fog.near) * lerpSpeed;
        this.scene.fog.far += (this.targetFar - this.scene.fog.far) * lerpSpeed;
    }
}
