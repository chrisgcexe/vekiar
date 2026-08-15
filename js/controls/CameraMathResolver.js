import * as THREE from 'three';

export class CameraMathResolver {
    constructor(controller) {
        this.controller = controller;
    }

    updateConstraints(mapAspect) {
        const ctrl = this.controller;
        ctrl.mapAspect = mapAspect;
        
        const mapHalfW = 50;
        const mapHalfH = 50 / mapAspect;
        const fovRad = THREE.MathUtils.degToRad(ctrl.camera.fov / 2);
        
        const maxDistZ = mapHalfH / Math.tan(fovRad);
        const maxDistX = mapHalfW / (Math.tan(fovRad) * ctrl.camera.aspect);
        
        ctrl.calculatedMaxDistance = Math.min(maxDistZ, maxDistX) * 0.99;
        
        if (ctrl.stateMachine.state === 'PLAYING') {
            ctrl.maxDistance = ctrl.calculatedMaxDistance;
        }
    }

    clampTargetToBounds() {
        const ctrl = this.controller;
        const playableDist = ctrl.calculatedMaxDistance || 60;
        let t = 1.0;
        const distRange = playableDist - ctrl.minDistance;
        if (distRange > 0) {
            t = (ctrl.distance - ctrl.minDistance) / distRange;
            t = THREE.MathUtils.clamp(t, 0, 1);
        }

        const freedom = 1.0 - Math.pow(t, 4.0) * 0.7; 
        const maxRadiusX = 72 * freedom; 
        const maxRadiusZ = (56 / ctrl.mapAspect) * freedom;

        ctrl.target.x = THREE.MathUtils.clamp(ctrl.target.x, -maxRadiusX, maxRadiusX);
        ctrl.target.z = THREE.MathUtils.clamp(ctrl.target.z, -maxRadiusZ, maxRadiusZ);
    }

    updateCameraPosition() {
        const ctrl = this.controller;
        let tTilt = 1.0;
        const tiltRefMax = 180;
        const distRangeTilt = tiltRefMax - ctrl.minDistance;
        if (distRangeTilt > 0) {
            tTilt = (ctrl.distance - ctrl.minDistance) / distRangeTilt;
            tTilt = THREE.MathUtils.clamp(tTilt, 0, 1);
        }

        const playableDist = ctrl.calculatedMaxDistance || 60;
        let tAlpha = 1.0;
        const distRangeAlpha = playableDist - ctrl.minDistance;
        if (distRangeAlpha > 0) {
            tAlpha = (ctrl.distance - ctrl.minDistance) / distRangeAlpha;
            tAlpha = THREE.MathUtils.clamp(tAlpha, 0, 1);
        }
        ctrl.zoomAlpha = tAlpha;

        const easeT = -(Math.cos(Math.PI * tTilt) - 1) / 2; 
        const polarAngle = THREE.MathUtils.lerp(Math.PI / 4.5, Math.PI / 8, easeT); 

        ctrl.camera.position.x = ctrl.target.x;
        ctrl.camera.position.y = ctrl.target.y + ctrl.distance * Math.cos(polarAngle);
        ctrl.camera.position.z = ctrl.target.z + ctrl.distance * Math.sin(polarAngle);

        ctrl.camera.lookAt(ctrl.target);
    }
}
