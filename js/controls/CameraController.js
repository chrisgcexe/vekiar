import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class CameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        
        this.controls = new OrbitControls(camera, domElement);
        this.controls.enableRotate = false; 
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.1;   
        this.controls.zoomSpeed = 1.2;       
        this.controls.panSpeed = 1.0;        
        this.controls.screenSpacePanning = false; 
        this.controls.minDistance = 25;  
        this.controls.target.set(0, 0, 0);

        // --- SETUP CINEMÁTICO ---
        this.controls.maxDistance = 200; 
        this.camera.position.set(0, 80, 0.1); // Antes estaba en 150 
        
        // Separamos el estado en dos banderas para blindar la secuencia
        this.startCinematicDrop = false; 
        this.cinematicDone = false;     

        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.NONE
        };

        this.controls.touches = {
            ONE: THREE.TOUCH.PAN,       
            TWO: THREE.TOUCH.DOLLY_PAN  
        };

        window.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
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

    playIntro() {
        // Disparamos la caída real
        this.startCinematicDrop = true;
    }

    updateConstraints(mapAspect) {
        if (mapAspect === 1.0) return;
        
        const mapHalfW = 50;
        const mapHalfH = 50 / mapAspect;
        const fovRad = THREE.MathUtils.degToRad(this.camera.fov / 2);
        
        const maxDistZ = mapHalfH / Math.tan(fovRad);
        const maxDistX = mapHalfW / (Math.tan(fovRad) * this.camera.aspect);
        
        this.calculatedMaxDistance = Math.min(maxDistZ, maxDistX) * 0.99;
        
        // ¡CLAVE! Si la cinemática no terminó, mantenemos el límite falso en 200 
        // para que OrbitControls no nos baje la cámara de golpe.
        if (this.cinematicDone) {
            this.controls.maxDistance = this.calculatedMaxDistance;
        } else {
            this.controls.maxDistance = 200;
        }
        
        this.controls.update();
    }

    update(mapAspect) {

        // --- 1. RESOLVEMOS LA CAÍDA FÍSICA ---
        if (!this.cinematicDone && this.startCinematicDrop) {
            const targetDist = this.calculatedMaxDistance || 60;
            const currentDist = this.controls.getDistance();

            // Apagamos la fricción nativa de OrbitControls para que no pelee con la cinemática
            this.controls.enableDamping = false;

            // Achicamos el umbral de 0.5 a 0.05 para que no haya un "salto" visible al cortar
            if (currentDist > targetDist + 0.05) {
                const targetPos = new THREE.Vector3(0, targetDist, 0.1);
                this.camera.position.lerp(targetPos, 0.08); 
            } else {
                // Llegamos al piso con precisión milimétrica.
                this.cinematicDone = true;
                this.controls.maxDistance = targetDist; 
                // Restauramos el damping para que el usuario pueda interactuar normal
                this.controls.enableDamping = true; 
            }
        }

        // --- 2. CÁLCULO DE ZOOM (t) PROTEGIDO ---
        const dist = this.controls.getDistance();
        let t;
        
        // Si estamos cayendo, forzamos t=1 (2D) para que AppState no flashee luces
        if (!this.cinematicDone) {
            t = 1.0;
        } else {
            t = (dist - this.controls.minDistance) / (this.controls.maxDistance - this.controls.minDistance);
            t = THREE.MathUtils.clamp(t, 0, 1);
        }
        
        this.zoomAlpha = t;

        // --- 3. RESTO DEL UPDATE NORMAL ---
        this.controls.enablePan = (t < 0.9);

        const easeT = -(Math.cos(Math.PI * t) - 1) / 2; 
        const targetAngle = THREE.MathUtils.lerp(Math.PI / 4.5, 0.01, easeT); 
        
        this.controls.minPolarAngle = targetAngle;
        this.controls.maxPolarAngle = targetAngle;

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

        if (Math.abs(centerDeltaX) > 0.0001 || Math.abs(centerDeltaZ) > 0.0001) {
            this.controls.target.x += centerDeltaX * 0.15;
            this.controls.target.z += centerDeltaZ * 0.15;
            this.camera.position.x += centerDeltaX * 0.15;
            this.camera.position.z += centerDeltaZ * 0.15;
        }

        this.controls.update();
    }
}