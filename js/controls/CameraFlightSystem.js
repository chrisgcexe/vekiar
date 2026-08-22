import * as THREE from 'three';

export class CameraFlightSystem {
    constructor(controller) {
        this.controller = controller;
        this._flyStartTarget = new THREE.Vector3();
        this._flyEndTarget = new THREE.Vector3();
        this._flyStartDist = 0;
        this._flyEndDist = 0;
        this._flyStartTime = performance.now();
        this._flyDuration = 1000;
    }

    flyTo(worldPos, offsetX = 0, fullZoom = false, endDistOverride = null, playableDist) {
        const ctrl = this.controller;
        const allowedStates = ['PLAYING', 'FLY_TO', 'WAIT_INPUT', 'DROP_2'];
        if (!allowedStates.includes(ctrl.stateMachine.state)) return;

        this._flyStartTarget.copy(ctrl.target);
        this._flyStartDist = ctrl.distance;
        this._flyStartTime = performance.now();

        let endDist;
        if (endDistOverride != null) {
            endDist = THREE.MathUtils.clamp(endDistOverride, ctrl.minDistance, ctrl.calculatedMaxDistance || ctrl.maxDistance);
        } else {
            endDist = fullZoom ? ctrl.minDistance : (this._flyStartDist <= 35 ? this._flyStartDist : 28);
        }
        
        const bounds = ctrl.mathResolver.getBoundsForDistance(endDist);
        const maxRadiusX = bounds.x;
        const maxRadiusZ = bounds.z;

        const targetWorldX = worldPos.x + offsetX;
        const clampedTargetX = THREE.MathUtils.clamp(targetWorldX, -maxRadiusX, maxRadiusX);
        const clampedTargetZ = THREE.MathUtils.clamp(worldPos.z, -maxRadiusZ, maxRadiusZ);

        this._flyEndTarget.set(clampedTargetX, 0, clampedTargetZ);
        this._flyEndDist = endDist;
        
        const travelDistance = this._flyStartTarget.distanceTo(this._flyEndTarget) + Math.abs(this._flyStartDist - this._flyEndDist);
        if (travelDistance < 0.5) {
            this._flyDuration = 0;
        } else {
            this._flyDuration = 1200; 
        }
        
        ctrl.inputHandler.panVelocity.set(0,0,0);
        ctrl.inputHandler.isDragging = false;
        ctrl.stateMachine.transitionTo('FLY_TO', { reason: 'request' });
    }

    fitToPoints(points, offsetX = 0, fullZoom = true) {
        if (!points || points.length === 0) return;

        let minX = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxZ = -Infinity;

        points.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        });

        const centerX = (minX + maxX) / 2;
        // Mover el centro un poco hacia el sur (abajo) para que no se corte el texto inferior (OVARN)
        const maxSpan = Math.max(maxX - minX, maxZ - minZ);
        const centerZ = ((minZ + maxZ) / 2) + (maxSpan * 0.1); 

        const centerPos = new THREE.Vector3(centerX, 0, centerZ);
        
        if (fullZoom) {
            this.flyTo(centerPos, offsetX, true);
        } else {
            // Alejar un pelín más la cámara (1.3 en vez de 1.2)
            const calculatedDist = Math.max(this.controller.minDistance, maxSpan * 1.3);
            this.flyTo(centerPos, offsetX, false, calculatedDist);
        }
    }

    update() {
        const ctrl = this.controller;
        if (ctrl.stateMachine.state !== 'FLY_TO') return;

        const now = performance.now();
        let progress = (now - this._flyStartTime) / this._flyDuration;
        if (progress > 1.0) progress = 1.0;
        
        const easeProgress = progress < 0.5 
            ? 2 * progress * progress 
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        ctrl.distance = THREE.MathUtils.lerp(this._flyStartDist, this._flyEndDist, easeProgress);
        ctrl.target.copy(this._flyStartTarget).lerp(this._flyEndTarget, easeProgress);

        if (progress === 1.0) {
            ctrl.stateMachine.transitionTo('PLAYING', { reason: 'flight_end' });
            ctrl.eventBus.emit('camera-flight-finished', { detail: {} });
        }
    }
}
