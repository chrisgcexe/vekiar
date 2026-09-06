import * as THREE from 'three';

export class CameraInputHandler {
    constructor(controller) {
        this.controller = controller;
        this.panVelocity = new THREE.Vector3();
        this._accumulatedPan = new THREE.Vector3(); // Para calcular velocidad real
        
        // --- VEKIAR OPTIMIZATION: Zero-allocation loop ---
        this._frameOffset = new THREE.Vector3();
        this._currentVelocity = new THREE.Vector3();
        // -------------------------------------------------

        this.isDragging = false;
        
        // Fricción exponencial por segundo (~10.0 es similar a 0.85 por frame a 60fps)
        this.friction = 10.0;

        this.targetDistance = null;
        this.isZooming = false;
        this.zoomClientX = 0;
        this.zoomClientY = 0;

        this._pointerNDC = new THREE.Vector2();
        this._intersectionTarget = new THREE.Vector3();
        this._zoomDelta = new THREE.Vector3(); 
        this._pointBeforeZoom = new THREE.Vector3();

        this.onPanStart = this.onPanStart.bind(this);
        this.onPanMove = this.onPanMove.bind(this);
        this.onPanEnd = this.onPanEnd.bind(this);
        this.onZoom = this.onZoom.bind(this);
        this.onDoubleClick = this.onDoubleClick.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);

        const eventBus = this.controller.eventBus;
        if (eventBus) {
            eventBus.on('input:pan-start', this.onPanStart);
            eventBus.on('input:pan-move', this.onPanMove);
            eventBus.on('input:pan-end', this.onPanEnd);
            eventBus.on('input:zoom', this.onZoom);
            eventBus.on('input:double-click', this.onDoubleClick);
        }
        window.addEventListener('pointermove', this.onPointerMove);
    }

    dispose() {
        const eventBus = this.controller.eventBus;
        if (eventBus) {
            eventBus.off('input:pan-start', this.onPanStart);
            eventBus.off('input:pan-move', this.onPanMove);
            eventBus.off('input:pan-end', this.onPanEnd);
            eventBus.off('input:zoom', this.onZoom);
            eventBus.off('input:double-click', this.onDoubleClick);
        }
        window.removeEventListener('pointermove', this.onPointerMove);
    }

    onPointerMove(e) {
        if (this.isZooming) {
            this.zoomClientX = e.clientX;
            this.zoomClientY = e.clientY;
        }
    }

    getPointerIntersection(clientX, clientY) {
        const ctrl = this.controller;
        if (!ctrl._canvasRect) ctrl._canvasRect = ctrl.domElement.getBoundingClientRect();
        const rect = ctrl._canvasRect;

        this._pointerNDC.x = ((clientX - rect.left) / rect.width)  * 2 - 1;
        this._pointerNDC.y = -((clientY - rect.top)  / rect.height) * 2 + 1;

        ctrl.raycaster.setFromCamera(this._pointerNDC, ctrl.camera);
        const hit = ctrl.raycaster.ray.intersectPlane(ctrl.plane, this._intersectionTarget);
        return hit ? this._intersectionTarget : null;
    }

    onPanStart(e) {
        const ctrl = this.controller;
        if (ctrl.stateMachine.state === 'FLY_TO') ctrl.stateMachine.transitionTo('PLAYING', { reason: 'flight-interrupt' });
        if (ctrl.stateMachine.state !== 'PLAYING') return;

        this.isDragging = true;
        this.panVelocity.set(0, 0, 0);
        this._accumulatedPan.set(0, 0, 0);
    }

    onPanMove(e) {
        const ctrl = this.controller;
        if (ctrl.stateMachine.state !== 'PLAYING' || !this.isDragging) return;

        const { movementX, movementY } = e.detail;

        const polarAngle = ctrl.mathResolver.getPolarAngle(ctrl.distance);

        // Matemáticas para un Paneo 1:1 con el cursor
        const fovRad = THREE.MathUtils.degToRad(ctrl.camera.fov / 2);
        const screenHeight = ctrl.domElement.clientHeight || window.innerHeight;
        const speed = (Math.tan(fovRad) * ctrl.distance * 2) / screenHeight;
        
        const deltaX = -movementX * speed;
        const deltaZ = -movementY * speed / Math.cos(polarAngle);

        this._frameOffset.set(deltaX, 0, deltaZ);
        ctrl.target.add(this._frameOffset);
        
        // Acumular para calcular la velocidad real en el update()
        this._accumulatedPan.add(this._frameOffset);
    }

    onPanEnd(e) {
        this.isDragging = false;
    }

    onZoom(e) {
        const ctrl = this.controller;
        if (ctrl.stateMachine.state === 'FLY_TO') ctrl.stateMachine.transitionTo('PLAYING', { reason: 'flight-interrupt' });
        if (ctrl.stateMachine.state !== 'PLAYING') return;

        const { deltaY, clientX, clientY } = e.detail;

        if (this.targetDistance === null) this.targetDistance = ctrl.distance;

        // Usamos el deltaY nativo escalado. Trackpads envían valores pequeños muy rápido (inercia nativa).
        const zoomDelta = deltaY * 0.03; 
        
        this.targetDistance += zoomDelta;
        this.targetDistance = THREE.MathUtils.clamp(this.targetDistance, ctrl.minDistance, ctrl.maxDistance);

        this.isZooming = true;
        this.zoomClientX = clientX;
        this.zoomClientY = clientY;
    }

    onDoubleClick(e) {
        const ctrl = this.controller;
        if (ctrl.stateMachine.state !== 'PLAYING') return;
        
        const { clientX, clientY } = e.detail;
        const hit = this.getPointerIntersection(clientX, clientY);
        
        if (hit) {
            // Volar al punto con el zoom al máximo (tope de zoom in)
            ctrl.flyTo(hit, 0, false, ctrl.minDistance);
        }
    }

    updateInertia(delta = 0.016) {
        const ctrl = this.controller;
        
        if (ctrl.stateMachine.state !== 'PLAYING') {
            this.targetDistance = ctrl.distance; // Sync al estar en cinemática
            return;
        }

        if (this.targetDistance === null) this.targetDistance = ctrl.distance;

        // Inercia y cálculo de velocidad de paneo
        if (this.isDragging) {
            // Velocidad instantánea en este frame (unidades / segundo)
            this._currentVelocity.copy(this._accumulatedPan).divideScalar(delta);
            this._accumulatedPan.set(0, 0, 0);

            // Filtro pasa-bajos (Low-Pass Filter) independiente de framerate
            const filterDamping = 1.0 - Math.exp(-12.0 * delta);
            this.panVelocity.lerp(this._currentVelocity, filterDamping);
        } else {
            // Aplicar inercia basada en la velocidad filtrada
            ctrl.target.addScaledVector(this.panVelocity, delta);
            
            // Decaimiento exponencial (fricción)
            const damping = Math.exp(-this.friction * delta);
            this.panVelocity.multiplyScalar(damping);
            if (this.panVelocity.lengthSq() < 0.0001) this.panVelocity.set(0, 0, 0);
        }

        // Smooth Zoom Lerping con anclaje al cursor usando decaimiento exponencial independiente del framerate
        if (Math.abs(ctrl.distance - this.targetDistance) > 0.01) {
            let hitBefore = null;
            if (this.isZooming) {
                hitBefore = this.getPointerIntersection(this.zoomClientX, this.zoomClientY);
                if (hitBefore) this._pointBeforeZoom.copy(hitBefore);
            }

            const zoomDamping = 1.0 - Math.exp(-12.0 * delta);
            ctrl.distance = THREE.MathUtils.lerp(ctrl.distance, this.targetDistance, zoomDamping);
            ctrl.mathResolver.updateCameraPosition();

            if (hitBefore) {
                const hitAfter = this.getPointerIntersection(this.zoomClientX, this.zoomClientY);
                if (hitAfter) {
                    this._zoomDelta.subVectors(this._pointBeforeZoom, hitAfter);
                    ctrl.target.add(this._zoomDelta);
                    // clampTargetToBounds lo llama MapCameraController después de esto
                    ctrl.mathResolver.updateCameraPosition();
                }
            }
        } else {
            this.isZooming = false;
        }
    }
}
