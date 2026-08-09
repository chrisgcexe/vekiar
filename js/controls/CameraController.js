import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class CameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.mapInstance = null; // Referencia para sincronizar el pergamino
        
        this.controls = new OrbitControls(camera, domElement);
        this.controls.enableRotate = false; 
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;  // Más bajo = más "peso" y fluidez al arrastrar (default era 0.1)
        this.controls.zoomSpeed = 0.8;       // Rueda del ratón más suave
        this.controls.panSpeed = 0.8;        // Paneo más orgánico
        this.controls.screenSpacePanning = false; 
        this.controls.minDistance = 25;  
        this.controls.target.set(0, 0, 0);

        // Variables para el estado FLY_TO
        this._flyProgress    = 0;
        this._flyStartTarget = new THREE.Vector3();
        this._flyEndTarget   = new THREE.Vector3();
        // Esféricos para tween sin snap: polar, azimutal y distancia se interpolan juntos
        this._flyStartPhi    = 0;
        this._flyEndPhi      = 0;
        this._flyAzimuthal   = 0;
        this._flyStartDist   = 0;
        this._flyEndDist     = 28;

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
        this.mapAspect = mapAspect; // Guardar para calcular límites en flyTo
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

        } else if (this.state === 'FLY_TO') {
            const now = performance.now();
            let p = (now - this._flyStartTime) / this._flyDuration;
            p = Math.min(1.0, p);

            // Ease-in-out Sine (movimiento de péndulo, muy natural y sin aceleraciones agresivas)
            const ease = -(Math.cos(Math.PI * p) - 1) / 2;

            // Pan: interpolar target
            this.controls.target.lerpVectors(this._flyStartTarget, this._flyEndTarget, ease);

            // Interpolación directa de distancia sin arco parabólico
            const dist = THREE.MathUtils.lerp(this._flyStartDist, this._flyEndDist, ease);

            // Calcular dinámicamente el ángulo polar (phi) basado en la distancia
            const maxDist = this.calculatedMaxDistance || 55;
            const tPhi = THREE.MathUtils.clamp((dist - 25) / (maxDist - 25), 0, 1);
            const easeTPhi = -(Math.cos(Math.PI * tPhi) - 1) / 2;
            const phi = THREE.MathUtils.lerp(Math.PI / 4.5, 0.01, easeTPhi);

            // Reconstruir posición (azimutal fijo → cero rotación horizontal)
            this.camera.position.set(
                this.controls.target.x + dist * Math.sin(phi) * Math.sin(this._flyAzimuthal),
                this.controls.target.y + dist * Math.cos(phi),
                this.controls.target.z + dist * Math.sin(phi) * Math.cos(this._flyAzimuthal)
            );

            // CLAVE: abrir el constraint de ángulo polar durante el vuelo.
            // Si no se hace, controls.update() aplica el minPolarAngle/maxPolarAngle
            // del último frame de PLAYING (el ángulo PRE-vuelo) y resetea la cámara
            // → fight a 60fps → jitter y teleportación.
            this.controls.minPolarAngle = 0;
            this.controls.maxPolarAngle = Math.PI;

            // Sincronizar estado interno de OrbitControls (input desactivado = sync puro).
            this.controls.update();

            if (p >= 1.0) {
                this.controls.enableDamping = true;
                this.controls.enabled = true;
                this.controls.maxDistance = this.calculatedMaxDistance;
                this.state = 'PLAYING';
            }
        }

        // --- ZOOM & RESTRICCIONES ---
        const dist = this.controls.getDistance();
        let t = 1.0;

        // Calculamos zoomAlpha también durante FLY_TO para que los sistemas de marcadores
        // y ecosistemas respondan en tiempo real mientras la cámara vuela.
        if (this.state === 'PLAYING' || this.state === 'FLY_TO') {
            const maxDist = this.calculatedMaxDistance || this.controls.maxDistance;
            t = (dist - 25) / (maxDist - 25);
            t = THREE.MathUtils.clamp(t, 0, 1);
        }

        this.zoomAlpha = t;
        this.controls.enablePan = (this.state === 'PLAYING' && t < 0.9);

        // --- LÓGICA DE ÁNGULO Y BORDES ---
        // Durante FLY_TO se omite el lock de ángulo polar: la cámara mantiene
        // la dirección capturada en flyTo() y OrbitControls no debe interferir.
        // Al volver a PLAYING el lock se retoma naturalmente en el siguiente frame.
        if (this.state !== 'FLY_TO') {
            const easeT = -(Math.cos(Math.PI * t) - 1) / 2; 
            const targetAngle = THREE.MathUtils.lerp(Math.PI / 4.5, 0.01, easeT); 
            
            this.controls.minPolarAngle = targetAngle;
            this.controls.maxPolarAngle = targetAngle;
        }

        // Restricción de bordes: se omite durante FLY_TO para no pelear con la animación.
        if (this.state !== 'FLY_TO') {
            const freedom = 1.0 - Math.pow(t, 8.0); 
            const maxRadiusX = 72 * freedom; // Límite extendido para permitir centrar regiones del borde
            const maxRadiusZ = (56 / mapAspect) * freedom;

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
        }

        // FLY_TO: NO llamar controls.update() aquí.
        // Durante el vuelo, la cámara se posiciona mediante tween manual.
        // Si controls.update() corre, sobreescribe camera.position con el estado
        // esférico interno de OrbitControls → teleportación y fight.
        // Solo se llama cuando la animación termina (dentro del bloque FLY_TO arriba).
        if (this.state !== 'FLY_TO') {
            this.controls.update();
        }
    }

    /**
     * Anima la cámara hacia la posición mundo de una región (dolly cinematográfico).
     * Solo funciona desde el estado PLAYING.
     * @param {THREE.Vector3} worldPos - Posición mundo del marcador (output de localToWorld)
     * @param {number} offsetX - Desplazamiento opcional en X para el centro de enfoque
     */
    flyTo(worldPos, offsetX = 0) {
        if (this.state !== 'PLAYING') return;

        // --- Esféricos actuales de la cámara ---
        const offset    = this.camera.position.clone().sub(this.controls.target);
        const startDist = offset.length();
        // Ángulo polar (0 = top-down, PI/2 = horizontal)
        const startPhi  = Math.acos(THREE.MathUtils.clamp(offset.y / startDist, -1, 1));
        // Ángulo azimutal: no cambiará durante el vuelo → sin rotación horizontal
        const theta     = Math.atan2(offset.x, offset.z);

        // --- Ángulo polar objetivo ---
        // Si ya estamos cerca (vista 3D), mantenemos la distancia actual. Si estamos lejos, bajamos al tope (28).
        const endDist  = startDist <= 35 ? startDist : 28;
        const maxDist  = this.calculatedMaxDistance || 55;
        const tEnd     = THREE.MathUtils.clamp((endDist - 25) / (maxDist - 25), 0, 1);
        const easeTEnd = -(Math.cos(Math.PI * tEnd) - 1) / 2;
        const endPhi   = THREE.MathUtils.lerp(Math.PI / 4.5, 0.01, easeTEnd);

        // --- Pre-restringir target final de la cámara ---
        // Limita el target en el plano Y=0 según los límites extendidos que se aplicarán en PLAYING.
        const aspect = this.mapAspect || 1.0;
        const freedom = 1.0 - Math.pow(tEnd, 8.0);
        const maxRadiusX = 72 * freedom;
        const maxRadiusZ = (56 / aspect) * freedom;

        // Aplicamos el offset X al target final
        const targetWorldX = worldPos.x + offsetX;
        
        const clampedTargetX = THREE.MathUtils.clamp(targetWorldX, -maxRadiusX, maxRadiusX);
        const clampedTargetZ = THREE.MathUtils.clamp(worldPos.z, -maxRadiusZ, maxRadiusZ);

        // Guardar para el tween
        this._flyStartTarget.copy(this.controls.target);
        this._flyEndTarget.set(clampedTargetX, 0, clampedTargetZ);
        this._flyStartPhi  = startPhi;
        this._flyEndPhi    = endPhi;
        this._flyAzimuthal = theta;
        this._flyStartDist = startDist;
        this._flyEndDist   = endDist;
        
        // Animación basada en tiempo y dependiente de la distancia
        this._flyStartTime = performance.now();
        const travelDist = worldPos.distanceTo(this.controls.target);
        this._flyDuration = Math.min(2000, 900 + travelDist * 12); // Base 0.9s, max 2.0s

        // Flush de deltas pendientes de OrbitControls antes del vuelo:
        // damping off + update() = aplica y zeroa cualquier delta acumulado.
        this.controls.enableDamping = false;
        this.controls.update();
        // Desactivar eventos de input durante el vuelo.
        // controls.update() sigue funcionando para sincronizar estado interno.
        this.controls.enabled = false;
        this.state = 'FLY_TO';
    }
}