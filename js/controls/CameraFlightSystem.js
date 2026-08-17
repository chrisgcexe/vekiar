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
        if (ctrl.stateMachine.state !== 'PLAYING' && ctrl.stateMachine.state !== 'FLY_TO') return;

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
