import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class CameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.mapInstance = null; // Referencia para sincronizar el pergamino
        
        this.controls = new OrbitControls(camera, domElement);
        this.controls.enableRotate = false; 
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.1;   
        this.controls.zoomSpeed = 1.2;       
        this.controls.panSpeed = 1.0;        
        this.controls.screenSpacePanning = false; 
        this.controls.minDistance = 25;  
        this.controls.target.set(0, 0, 0);

        // --- MÁQUINA DE ESTADOS CINEMÁTICA ---
        this.state = 'INIT'; // Fases: INIT, DROP_1, WAIT_INPUT, DROP_2, PLAYING
        
        this.controls.maxDistance = 250; 
        this.camera.position.set(0, 140, 0.1); // Arrancamos bien lejos
        
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

        // --- LÓGICA DEL BOTÓN ---
        const removeIdlePrompt = () => {
            const idlePrompt = document.getElementById('idle-prompt');
            if (idlePrompt) {
                idlePrompt.classList.remove('show-idle');
                document.getElementById('btn-start').style.pointerEvents = 'none';
            }
            
            // Desbloqueamos el límite inferior ANTES de la segunda caída
            this.controls.minDistance = 25; 
            this.controls.enableZoom = true;
            this.state = 'DROP_2';
        };

        setTimeout(() => {
            const startBtn = document.getElementById('btn-start');
            if (startBtn) {
                startBtn.addEventListener('click', removeIdlePrompt, { once: true });
            }
        }, 0);
    }

    setMap(mapInstance) {
        this.mapInstance = mapInstance;
    }

    playIntro() {
        this.state = 'DROP_1'; // SceneManager da la orden de arrancar
    }

    updateConstraints(mapAspect) {
        if (mapAspect === 1.0) return;
        
        const mapHalfW = 50;
        const mapHalfH = 50 / mapAspect;
        const fovRad = THREE.MathUtils.degToRad(this.camera.fov / 2);
        
        const maxDistZ = mapHalfH / Math.tan(fovRad);
        const maxDistX = mapHalfW / (Math.tan(fovRad) * this.camera.aspect);
        
        this.calculatedMaxDistance = Math.min(maxDistZ, maxDistX) * 0.99;
        
        if (this.state === 'PLAYING') {
            this.controls.maxDistance = this.calculatedMaxDistance;
        }
        
        this.controls.update();
    }

    update(mapAspect) {
        const playableDist = this.calculatedMaxDistance || 60;
        const idleDist = playableDist + 15; 

if (this.state === 'DROP_1') {
            this.controls.enableZoom = false;
            this.controls.enablePan = false;
            this.controls.enableDamping = false;

            if (this.controls.getDistance() > idleDist + 0.05) {
                const targetPos = new THREE.Vector3(0, idleDist, 0.1);
                this.camera.position.lerp(targetPos, 0.04); 

                const startY = 180;
                const endY = idleDist;
                let scrollProgress = (startY - this.camera.position.y) / (startY - endY);
                scrollProgress = THREE.MathUtils.clamp(scrollProgress, 0.0, 1.0);
                
                if (this.mapInstance) {
                    this.mapInstance.updateUnfurl(scrollProgress);
                }

                // --- DISPARADOR ANTICIPADO DEL BOTÓN ---
                // Si el rollo ya se abrió un 88% o más, mostramos el cartel antes de que la cámara frene del todo
                if (scrollProgress >= 0.95) {
                    const idlePrompt = document.getElementById('idle-prompt');
                    if (idlePrompt && !idlePrompt.classList.contains('show-idle')) {
                        idlePrompt.classList.add('show-idle');
                    }
                }
                // ----------------------------------------

            } else {
                this.controls.maxDistance = idleDist; 
                this.controls.minDistance = idleDist; 
                this.controls.enableDamping = true; 
                this.state = 'WAIT_INPUT';
                
                if (this.mapInstance) this.mapInstance.updateUnfurl(1.0);

                const idlePrompt = document.getElementById('idle-prompt');
                if (idlePrompt) idlePrompt.classList.add('show-idle');
            }

        } else if (this.state === 'DROP_2') {
            this.controls.enableDamping = false;
            if (this.controls.getDistance() > playableDist + 0.05) {
                const targetPos = new THREE.Vector3(0, playableDist, 0.1);
                this.camera.position.lerp(targetPos, 0.08); 
            } else {
                this.controls.maxDistance = playableDist; 
                this.controls.minDistance = 25; 
                this.controls.enableDamping = true; 
                this.state = 'PLAYING';
                
                const compassUI = document.getElementById('compass');
                if (compassUI) compassUI.classList.add('show-compass');
            }
        }

        // --- ZOOM & RESTRICCIONES ---
        const dist = this.controls.getDistance();
        let t = 1.0; 
        
        if (this.state === 'PLAYING') {
            t = (dist - 25) / (this.controls.maxDistance - 25);
            t = THREE.MathUtils.clamp(t, 0, 1);
        }
        
        this.zoomAlpha = t;
        this.controls.enablePan = (this.state === 'PLAYING' && t < 0.9);

        // --- LÓGICA DE ÁNGULO Y BORDES ---
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