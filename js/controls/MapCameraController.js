import * as THREE from 'three';

export class MapCameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        this.mapInstance = null;
        
        // Estado cinemático
        this.state = 'INIT'; // INIT, DROP_1, WAIT_INPUT, DROP_2, PLAYING, FLY_TO

        // Parámetros de Cámara
        this.target = new THREE.Vector3(0, 0, 0);
        this.distance = 250;
        this.minDistance = 25;
        this.maxDistance = 250;
        this.calculatedMaxDistance = 60;
        this.mapAspect = 1.0;

        // Inercia y Paneo
        this.panVelocity = new THREE.Vector3();
        this.isDragging = false;
        this.dragStartScreen = new THREE.Vector2();
        this.dragStartWorld = new THREE.Vector3();
        this.dragStartTarget = new THREE.Vector3();

        // Parámetros de Inercia
        this.friction = 0.85; 
        
        // Variables para FLY_TO
        this._flyProgress = 0;
        this._flyStartTarget = new THREE.Vector3();
        this._flyEndTarget = new THREE.Vector3();
        this._flyStartDist = 0;
        this._flyEndDist = 0;
        this._flyStartTime = performance.now();
        this._flyDuration = 1000;

        this.zoomAlpha = 1.0;

        this.raycaster = new THREE.Raycaster();
        this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

        this.camera.position.set(0, 140, 0.1);

        // Bindings
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onWheel = this.onWheel.bind(this);

        this.domElement.addEventListener('pointerdown', this.onPointerDown);
        this.domElement.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp); // Captura soltar fuera del canvas
        this.domElement.addEventListener('wheel', this.onWheel, { passive: false });

        // Soporte para hacer zoom con las flechas (teclado)
        window.addEventListener('keydown', (e) => {
            if (this.state !== 'PLAYING') return;
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const zoomDelta = e.key === 'ArrowUp' ? -15 : 15;
                this.distance += zoomDelta;
                this.distance = THREE.MathUtils.clamp(this.distance, this.minDistance, this.maxDistance);
                this.clampTargetToBounds();
                this.updateCameraPosition();
            }
        });

        // Evitar menú contextual
        this.domElement.addEventListener('contextmenu', e => e.preventDefault());

        // Lógica del botón de intro
        const removeIdlePrompt = () => {
            const idlePrompt = document.getElementById('idle-prompt');
            if (idlePrompt) {
                idlePrompt.classList.remove('show-idle');
                const btn = document.getElementById('btn-start');
                if(btn) btn.style.pointerEvents = 'none';
            }
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
        this.state = 'DROP_1';
    }

    updateConstraints(mapAspect) {
        if (mapAspect === 1.0) return;
        this.mapAspect = mapAspect;
        
        const mapHalfW = 50;
        const mapHalfH = 50 / mapAspect;
        const fovRad = THREE.MathUtils.degToRad(this.camera.fov / 2);
        
        const maxDistZ = mapHalfH / Math.tan(fovRad);
        const maxDistX = mapHalfW / (Math.tan(fovRad) * this.camera.aspect);
        
        this.calculatedMaxDistance = Math.min(maxDistZ, maxDistX) * 0.99;
        
        if (this.state === 'PLAYING') {
            this.maxDistance = this.calculatedMaxDistance;
        }
    }

    // --- INPUT HANDLING ---
    
    getPointerIntersection(clientX, clientY) {
        const rect = this.domElement.getBoundingClientRect();
        const pointer = new THREE.Vector2();
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(pointer, this.camera);
        const target = new THREE.Vector3();
        const hit = this.raycaster.ray.intersectPlane(this.plane, target);
        return hit ? target : null;
    }

    onPointerDown(e) {
        // Permitir interrumpir el vuelo
        if (this.state === 'FLY_TO') this.state = 'PLAYING';
        if (this.state !== 'PLAYING') return;
        if (e.button !== 0 && e.pointerType !== 'touch') return; // Solo click izquierdo o touch

        this._isPointerDown = true;
        this.isDragging = false; // Solo es arrastre si se mueve el mouse
        this.panVelocity.set(0, 0, 0); // Resetear inercia
        
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        
        this.domElement.setPointerCapture(e.pointerId); // Asegura que move y up lleguen incluso fuera del canvas
    }

    onPointerMove(e) {
        if (!this._isPointerDown || this.state !== 'PLAYING') return;

        // Solo empezamos a arrastrar oficialmente si el mouse se mueve unos píxeles
        if (!this.isDragging) {
            const dist = Math.hypot(e.clientX - this.lastPointerX, e.clientY - this.lastPointerY);
            if (dist > 3) {
                this.isDragging = true;
                this.domElement.style.cursor = 'grabbing';
            } else {
                return; // No hacer paneo todavía
            }
        }

        const movementX = e.clientX - this.lastPointerX;
        const movementY = e.clientY - this.lastPointerY;
        
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;

        // Calculamos el ángulo polar actual para escalar correctamente el eje Z
        let tTilt = 1.0;
        const tiltRefMax = 180;
        const distRangeTilt = tiltRefMax - this.minDistance;
        if (distRangeTilt > 0) {
            tTilt = (this.distance - this.minDistance) / distRangeTilt;
            tTilt = THREE.MathUtils.clamp(tTilt, 0, 1);
        }
        const easeT = -(Math.cos(Math.PI * tTilt) - 1) / 2; 
        const polarAngle = THREE.MathUtils.lerp(Math.PI / 4.5, Math.PI / 8, easeT); 

        // Escalar la velocidad en base a la distancia para que el arrastre sea 1:1 aproximado
        const speed = this.distance * 0.0022; 
        
        const deltaX = -movementX * speed;
        // Al estar la cámara inclinada, arrastrar hacia arriba/abajo en la pantalla requiere más movimiento en Z
        const deltaZ = -movementY * speed / Math.cos(polarAngle);

        this.panVelocity.set(deltaX, 0, deltaZ);
        this.target.add(this.panVelocity);
    }

    onPointerUp(e) {
        this._isPointerDown = false;
        this.isDragging = false;
        this.domElement.style.cursor = 'grab';
        try {
            this.domElement.releasePointerCapture(e.pointerId);
        } catch (err) {}
    }

    onWheel(e) {
        // Permitir interrumpir el vuelo
        if (this.state === 'FLY_TO') this.state = 'PLAYING';
        if (this.state !== 'PLAYING') {
            e.preventDefault();
            return;
        }
        e.preventDefault();

        // 1. Dónde apunta el mouse AHORA en el mundo
        const pointBeforeZoom = this.getPointerIntersection(e.clientX, e.clientY);

        // 2. Aplicar el zoom (cambiar distancia)
        const zoomDelta = Math.sign(e.deltaY) * 2.0; 
        this.distance += zoomDelta;
        this.distance = THREE.MathUtils.clamp(this.distance, this.minDistance, this.maxDistance);

        if (!pointBeforeZoom) return;

        // 3. Si no moviéramos el target, ¿dónde caería el mouse después del zoom?
        this.updateCameraPosition();
        const pointAfterZoom = this.getPointerIntersection(e.clientX, e.clientY);

        if (pointAfterZoom) {
            // 4. Mover el target para compensar el deslizamiento (Zoom-to-Mouse)
            const delta = new THREE.Vector3().subVectors(pointBeforeZoom, pointAfterZoom);
            this.target.add(delta);
            this.clampTargetToBounds();
            this.updateCameraPosition(); // Re-actualizar cámara con el nuevo target
        }
    }

    // --- CÁLCULO FÍSICO DE LA CÁMARA ---
    
    updateCameraPosition() {

        // 1. Calcular ángulo polar de forma absolutamente continua basada en la distancia física.
        // Usamos una referencia fija (180) para que nunca haya saltos cuando cambian los límites jugables.
        let tTilt = 1.0;
        const tiltRefMax = 180;
        const distRangeTilt = tiltRefMax - this.minDistance;
        if (distRangeTilt > 0) {
            tTilt = (this.distance - this.minDistance) / distRangeTilt;
            tTilt = THREE.MathUtils.clamp(tTilt, 0, 1);
        }

        // El zoomAlpha real (para marcadores y UI) sí se normaliza al área jugable
        const playableDist = this.calculatedMaxDistance || 60;
        let tAlpha = 1.0;
        const distRangeAlpha = playableDist - this.minDistance;
        if (distRangeAlpha > 0) {
            tAlpha = (this.distance - this.minDistance) / distRangeAlpha;
            tAlpha = THREE.MathUtils.clamp(tAlpha, 0, 1);
        }
        this.zoomAlpha = tAlpha;

        const easeT = -(Math.cos(Math.PI * tTilt) - 1) / 2; 
        
        // Nunca se pone 100% cenital (0.01). Tope en Math.PI/8 (22.5 grados) para mantener 3D
        const polarAngle = THREE.MathUtils.lerp(Math.PI / 4.5, Math.PI / 8, easeT); 

        // 2. Aplicar coordenadas esféricas (Azimuth fijo en 0 -> mira hacia -Z)
        this.camera.position.x = this.target.x;
        this.camera.position.y = this.target.y + this.distance * Math.cos(polarAngle);
        this.camera.position.z = this.target.z + this.distance * Math.sin(polarAngle);

        this.camera.lookAt(this.target);
    }

    clampTargetToBounds() {
        const playableDist = this.calculatedMaxDistance || 60;
        let t = 1.0;
        const distRange = playableDist - this.minDistance;
        if (distRange > 0) {
            t = (this.distance - this.minDistance) / distRange;
            t = THREE.MathUtils.clamp(t, 0, 1);
        }

        // Suavizar la restricción en max distance (overview) para permitir panear el mapa
        const freedom = 1.0 - Math.pow(t, 4.0) * 0.7; 
        const maxRadiusX = 72 * freedom; 
        const maxRadiusZ = (56 / this.mapAspect) * freedom;

        this.target.x = THREE.MathUtils.clamp(this.target.x, -maxRadiusX, maxRadiusX);
        this.target.z = THREE.MathUtils.clamp(this.target.z, -maxRadiusZ, maxRadiusZ);
    }

    update(mapAspect) {
        this.mapAspect = mapAspect;
        const playableDist = this.calculatedMaxDistance || 60;
        const idleDist = playableDist + 15; 

        if (this.state === 'DROP_1') {
            if (this.distance > idleDist + 0.05) {
                this.distance = THREE.MathUtils.lerp(this.distance, idleDist, 0.04);
                
                const startDist = 250;
                let scrollProgress = (startDist - this.distance) / (startDist - idleDist);
                scrollProgress = THREE.MathUtils.clamp(scrollProgress, 0.0, 1.0);
                
                if (this.mapInstance) this.mapInstance.updateUnfurl(scrollProgress);

                if (scrollProgress >= 0.95) {
                    const idlePrompt = document.getElementById('idle-prompt');
                    if (idlePrompt && !idlePrompt.classList.contains('show-idle')) {
                        idlePrompt.classList.add('show-idle');
                    }
                }
            } else {
                this.distance = idleDist;
                this.maxDistance = idleDist; 
                this.state = 'WAIT_INPUT';
                if (this.mapInstance) this.mapInstance.updateUnfurl(1.0);
                const idlePrompt = document.getElementById('idle-prompt');
                if (idlePrompt) idlePrompt.classList.add('show-idle');
            }

        } else if (this.state === 'DROP_2') {
            if (this.distance > playableDist + 0.05) {
                this.distance = THREE.MathUtils.lerp(this.distance, playableDist, 0.12);
            } else {
                this.distance = playableDist;
                this.maxDistance = playableDist; 
                this.state = 'PLAYING';
                const compassUI = document.getElementById('compass');
                if (compassUI) compassUI.classList.add('show-compass');
            }

        } else if (this.state === 'FLY_TO') {
            const now = performance.now();
            let progress = (now - this._flyStartTime) / this._flyDuration;
            if (progress > 1.0) progress = 1.0;
            
            // Suavizado Ease-In-Out Cuadrático (más cinematográfico)
            const easeProgress = progress < 0.5 
                ? 2 * progress * progress 
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;
            
            this.distance = THREE.MathUtils.lerp(this._flyStartDist, this._flyEndDist, easeProgress);
            this.target.copy(this._flyStartTarget).lerp(this._flyEndTarget, easeProgress);

            if (progress === 1.0) {
                this.state = 'PLAYING';
                window.dispatchEvent(new CustomEvent('camera-flight-finished'));
                window.dispatchEvent(new CustomEvent('map:ready'));
                this._mapReady = true;
            }
        }

        // --- INERCIA (Damping) ---
        if (this.state === 'PLAYING') {
            if (!this.isDragging) {
                this.target.add(this.panVelocity);
                this.panVelocity.multiplyScalar(this.friction);
                if (this.panVelocity.lengthSq() < 0.0001) this.panVelocity.set(0, 0, 0);
            }
        }

        if (this.state === 'PLAYING') {
            this.clampTargetToBounds();
        }

        // --- DETECCIÓN DE ESTADO INTERACTUABLE (map:ready / map:zoom-out) ---
        if (this.state === 'PLAYING') {
            const flyLandingDist = 28;
            const playableDist = this.calculatedMaxDistance || 60;
            const readyThreshold = (flyLandingDist - this.minDistance) / (playableDist - this.minDistance) + 0.02;
            const closeEnough = this.zoomAlpha <= readyThreshold;
            if (closeEnough && !this._mapReady) {
                this._mapReady = true;
                window.dispatchEvent(new CustomEvent('map:ready'));
            } else if (!closeEnough && this._mapReady) {
                this._mapReady = false;
                window.dispatchEvent(new CustomEvent('map:zoom-out'));
            }
        } else {
            this._mapReady = false;
        }

        this.updateCameraPosition();
    }

    flyTo(worldPos, offsetX = 0) {
        if (this.state !== 'PLAYING' && this.state !== 'FLY_TO') return;

        // Si ya estamos volando o en PLAYING, capturamos el inicio exacto actual
        this._flyStartTarget.copy(this.target);
        this._flyStartDist = this.distance;
        this._flyStartTime = performance.now();

        const endDist  = this._flyStartDist <= 35 ? this._flyStartDist : 28;
        
        const playableDist = this.calculatedMaxDistance || 60;
        let tEnd = 1.0;
        const distRange = playableDist - this.minDistance;
        if (distRange > 0) {
            tEnd = (endDist - this.minDistance) / distRange;
            tEnd = THREE.MathUtils.clamp(tEnd, 0, 1);
        }

        const freedom = 1.0 - Math.pow(tEnd, 4.0) * 0.7;
        const maxRadiusX = 72 * freedom;
        const maxRadiusZ = (56 / (this.mapAspect || 1.0)) * freedom;

        const targetWorldX = worldPos.x + offsetX;
        const clampedTargetX = THREE.MathUtils.clamp(targetWorldX, -maxRadiusX, maxRadiusX);
        const clampedTargetZ = THREE.MathUtils.clamp(worldPos.z, -maxRadiusZ, maxRadiusZ);

        this._flyEndTarget.set(clampedTargetX, 0, clampedTargetZ);
        this._flyEndDist = endDist;
        
        // Calcular si ya estamos prácticamente en la posición de destino
        const travelDistance = this._flyStartTarget.distanceTo(this._flyEndTarget) + Math.abs(this._flyStartDist - this._flyEndDist);
        if (travelDistance < 0.5) {
            this._flyDuration = 0; // Viaje instantáneo, no hay que esperar la animación
        } else {
            this._flyDuration = 1200; // Mayor duración para un vuelo más fluido (1.2 seg)
        }
        
        this.panVelocity.set(0,0,0);
        this.isDragging = false;
        this.state = 'FLY_TO';
    }

    dispose() {
        this.domElement.removeEventListener('pointerdown', this.onPointerDown);
        this.domElement.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        this.domElement.removeEventListener('wheel', this.onWheel);
    }
}
