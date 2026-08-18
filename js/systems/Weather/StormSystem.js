import * as THREE from 'three';

export class StormSystem {
    constructor(scene) {
        this.scene = scene;
        this.isActive = false;
        
        this.timeSinceLastFlash = 0;
        this.nextFlashTime = 3.0; // Segundos hasta el primer relámpago
        
        // Estado del relámpago actual
        this.isFlashing = false;
        this.flashDuration = 0;
        this.flashTimer = 0;
        this.flashIntensity = 0;
        
        // Luces para el relámpago
        this.flashAmbient = new THREE.AmbientLight(0xccddff, 0.0); // Luz general
        this.flashDirectional = new THREE.DirectionalLight(0xffffff, 0.0); // Luz direccional para dar volumen
        
        // Posicionamos la luz direccional ligeramente de lado para crear sombras dramáticas (sin generar shadowmap real para optimizar)
        this.flashDirectional.position.set(100, 100, 50);
        
        this.scene.add(this.flashAmbient);
        this.scene.add(this.flashDirectional);
    }
    
    setActive(value) {
        this.isActive = value;
        if (!value) {
            // Apagar instantáneamente si se desactiva
            this.isFlashing = false;
            this.flashAmbient.intensity = 0;
            this.flashDirectional.intensity = 0;
        }
    }
    
    _triggerFlash() {
        this.isFlashing = true;
        this.flashTimer = 0;
        // Un relámpago dura entre 0.2 y 0.5 segundos
        this.flashDuration = 0.2 + Math.random() * 0.3; 
        
        // Programar el siguiente relámpago (entre 3 y 10 segundos)
        this.timeSinceLastFlash = 0;
        this.nextFlashTime = 3.0 + Math.random() * 7.0;
        
        // Intensidad base de este relámpago
        this.flashIntensity = 1.0 + Math.random() * 2.0; 
        
        // Cambiar la posición de la luz direccional para que los relámpagos vengan de distintos lados
        const angle = Math.random() * Math.PI * 2;
        this.flashDirectional.position.set(Math.cos(angle) * 100, 100, Math.sin(angle) * 100);
    }
    
    update(delta, time) {
        if (!this.isActive && !this.isFlashing) return;
        
        if (this.isActive) {
            this.timeSinceLastFlash += delta;
            if (this.timeSinceLastFlash >= this.nextFlashTime) {
                this._triggerFlash();
            }
        }
        
        if (this.isFlashing) {
            this.flashTimer += delta;
            
            if (this.flashTimer >= this.flashDuration) {
                // Termina el relámpago
                this.isFlashing = false;
                this.flashAmbient.intensity = 0;
                this.flashDirectional.intensity = 0;
            } else {
                // Matemática del parpadeo (flicker) del relámpago
                // Usamos múltiples funciones seno súper rápidas para simular el estallido errático de la electricidad
                let flicker = Math.sin(this.flashTimer * 50.0) * Math.sin(this.flashTimer * 30.0);
                flicker = Math.abs(flicker); // Siempre positivo
                
                // Hacemos que la curva general decaiga hacia el final del relámpago (fade out)
                let decay = 1.0 - (this.flashTimer / this.flashDuration);
                
                let finalIntensity = flicker * decay * this.flashIntensity;
                
                // El primer frame siempre debe ser súper brillante
                if (this.flashTimer < 0.05) finalIntensity = this.flashIntensity;
                
                this.flashAmbient.intensity = finalIntensity * 0.4;
                this.flashDirectional.intensity = finalIntensity * 1.5;
            }
        }
    }
}
