import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class CameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        
        this.controls = new OrbitControls(camera, domElement);
        this.controls.enableRotate = false; 
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.1;   // Mucho más responsivo, elimina la sensación de 'retardo' o lag
        this.controls.zoomSpeed = 1.2;       // Zoom más rápido y dinámico
        this.controls.panSpeed = 1.0;        // Velocidad normal de arrastre
        this.controls.screenSpacePanning = false; 
        this.controls.minDistance = 25;  
        this.controls.maxDistance = 60; 
        this.controls.target.set(0, 0, 0);

        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.NONE
        };

        this.controls.touches = {
            ONE: THREE.TOUCH.PAN,       
            TWO: THREE.TOUCH.DOLLY_PAN  
        };

        // Soporte para hacer zoom con flechas del teclado (Fallback si se rompe la rueda del mouse)
        window.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                // Simulamos exactamente un evento de la rueda del mouse. 
                // Así OrbitControls respeta los límites, el damping y la velocidad.
                const wheelEvent = new WheelEvent('wheel', {
                    deltaY: e.key === 'ArrowUp' ? -100 : 100,
                    deltaMode: 0,
                    bubbles: true,
                    cancelable: true
                });
                domElement.dispatchEvent(wheelEvent);
            }
        });
    }

    updateConstraints(mapAspect) {
        if (mapAspect === 1.0) return;
        
        const mapHalfW = 50;
        const mapHalfH = 50 / mapAspect;
        const fovRad = THREE.MathUtils.degToRad(this.camera.fov / 2);
        
        const maxDistZ = mapHalfH / Math.tan(fovRad);
        const maxDistX = mapHalfW / (Math.tan(fovRad) * this.camera.aspect);
        
        this.controls.maxDistance = Math.min(maxDistZ, maxDistX) * 0.99;
        this.controls.update();
    }

    update(mapAspect) {
        const dist = this.controls.getDistance();
        let t = (dist - this.controls.minDistance) / (this.controls.maxDistance - this.controls.minDistance);
        t = THREE.MathUtils.clamp(t, 0, 1);
        
        this.zoomAlpha = t;

        this.controls.enablePan = (t < 0.9);

        // Curva Sinusoidal suave (Ease In Out Sine)
        // Esto hace que la cámara empiece a rotar suavemente desde el principio,
        // alcance su máxima velocidad de giro en el medio del zoom, y frene suavemente al final.
        // Elimina por completo los movimientos toscos o abruptos.
        const easeT = -(Math.cos(Math.PI * t) - 1) / 2; 
        const targetAngle = THREE.MathUtils.lerp(Math.PI / 4.5, 0.01, easeT); 
        
        this.controls.minPolarAngle = targetAngle;
        this.controls.maxPolarAngle = targetAngle;

        // 3. Restricciones de Paneo Elásticas (Rubber-banding)
        // Usamos una curva extrema (potencia 8) para que la "libertad" de movimiento se mantenga al 100% 
        // durante casi todo el zoom. El efecto "imán" hacia el centro (0, 0, 0) solo se activará
        // agresivamente en el último 10% del zoom out, logrando un centrado perfecto progresivo sin el bug inicial.
        const freedom = 1.0 - Math.pow(t, 8.0); 
        const maxRadiusX = 60 * freedom;
        const maxRadiusZ = (50 / mapAspect) * freedom;

        let centerDeltaX = 0;
        let centerDeltaZ = 0;

        if (Math.abs(this.controls.target.x) > maxRadiusX) {
            const newX = Math.sign(this.controls.target.x) * maxRadiusX;
            centerDeltaX = newX - this.controls.target.x;
        }
        if (Math.abs(this.controls.target.z) > maxRadiusZ) {
            const newZ = Math.sign(this.controls.target.z) * maxRadiusZ;
            centerDeltaZ = newZ - this.controls.target.z;
        }

        // Si choca contra el borde, en lugar de bloquear en seco (pared de ladrillo),
        // lo empujamos suavemente hacia adentro (efecto goma/elástico).
        if (Math.abs(centerDeltaX) > 0.0001 || Math.abs(centerDeltaZ) > 0.0001) {
            this.controls.target.x += centerDeltaX * 0.15;
            this.controls.target.z += centerDeltaZ * 0.15;
            this.camera.position.x += centerDeltaX * 0.15;
            this.camera.position.z += centerDeltaZ * 0.15;
        }

        this.controls.update();
    }
}
