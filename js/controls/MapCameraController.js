import * as THREE from 'three';
import { CameraStateMachine } from './CameraStateMachine.js';
import { CameraMathResolver } from './CameraMathResolver.js';
import { CameraFlightSystem } from './CameraFlightSystem.js';
import { CameraInputHandler } from './CameraInputHandler.js';

export class MapCameraController {
    constructor(camera, domElement, eventBus) {
        this.camera = camera;
        this.domElement = domElement;
        this.eventBus = eventBus;
        this.mapInstance = null;
        
        // Parámetros de Cámara compartidos entre componentes
        this.target = new THREE.Vector3(0, 0, 0);
        this.distance = 250;
        this.minDistance = 25;
        this.maxDistance = 250;
        this.calculatedMaxDistance = 60;
        this.mapAspect = 1.0;
        this.zoomAlpha = 1.0;

        // Compartido para cálculos de hit test
        this.raycaster = new THREE.Raycaster();
        this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

        this.camera.position.set(0, 140, 0.1);

        // Inicializar submódulos
        this.stateMachine = new CameraStateMachine(this);
        this.mathResolver = new CameraMathResolver(this);
        this.flightSystem = new CameraFlightSystem(this);
        this.inputHandler = new CameraInputHandler(this);

        // Lógica del botón de intro
        const removeIdlePrompt = () => {
            const idlePrompt = document.getElementById('idle-prompt');
            if (idlePrompt) {
                idlePrompt.classList.remove('show-idle');
                const btn = document.getElementById('btn-start');
                if(btn) btn.style.pointerEvents = 'none';
            }
            this.stateMachine.transitionTo('DROP_2', { reason: 'start' });
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
        this.stateMachine.transitionTo('DROP_1', { reason: 'intro' });
    }

    updateConstraints(mapAspect) {
        this.mathResolver.updateConstraints(mapAspect);
    }

    update(mapAspect, delta = 0.016) {
        this.mapAspect = mapAspect;
        const playableDist = this.calculatedMaxDistance || 60;
        const idleDist = playableDist + 15; 

        // 1. Manejo de estado cinematográfico (DROP_1, WAIT_INPUT, DROP_2)
        this.stateMachine.update(idleDist, playableDist);
        
        // 2. Animación de vuelo a región
        this.flightSystem.update();

        // 3. Inercia del drag
        this.inputHandler.updateInertia(delta);

        // 4. Asegurarse que no nos pasamos de los bordes
        if (this.stateMachine.state === 'PLAYING') {
            this.mathResolver.clampTargetToBounds(delta);
        }

        // 5. Emitir eventos (map:ready, map:zoom-out) basados en la altura (zoomAlpha)
        if (this.stateMachine.state === 'PLAYING') {
            const flyLandingDist = 28;
            const landT = (flyLandingDist - this.minDistance) / (playableDist - this.minDistance);
            const ZOOM_IN_EPS  = 0.02;
            const ZOOM_OUT_EPS = 0.05;
            const readyThreshold  = landT + ZOOM_IN_EPS;
            const zoomOutThreshold = landT + ZOOM_IN_EPS + ZOOM_OUT_EPS;
            const closeEnough = this.zoomAlpha <= readyThreshold;
            const farEnough   = this.zoomAlpha >= zoomOutThreshold;
            if (closeEnough && !this._mapReady) {
                this._mapReady = true;
                this.eventBus.emit('map:ready', { detail: {} });
            } else if (farEnough && this._mapReady) {
                this._mapReady = false;
                this.eventBus.emit('map:zoom-out', { detail: {} });
            }
        } else {
            this._mapReady = false;
        }

        // 6. Aplicar toda la matemática de cámara al objeto THREE.Camera
        this.mathResolver.updateCameraPosition();
    }

    flyTo(worldPos, offsetX = 0, fullZoom = false, endDistOverride = null) {
        const playableDist = this.calculatedMaxDistance || 60;
        this.flightSystem.flyTo(worldPos, offsetX, fullZoom, endDistOverride, playableDist);
    }

    dispose() {
        this.inputHandler.dispose();
    }

    // Proxy properties needed by external systems
    get state() { return this.stateMachine.state; }
    get isDragging() { return this.inputHandler.isDragging; }
}
