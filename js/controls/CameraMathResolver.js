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

    getBoundsForDistance(distance) {
        const ctrl = this.controller;
        const playableDist = ctrl.calculatedMaxDistance || 60;
        let t = 1.0;
        const distRange = playableDist - ctrl.minDistance;
        if (distRange > 0) {
            t = (distance - ctrl.minDistance) / distRange;
            t = THREE.MathUtils.clamp(t, 0, 1);
        }

        // Al cambiar de 0.7 a 1.0, cuando t=1 (máximo zoom out), freedom=0.
        // Esto forza a que el target se centre perfectamente en (0,0) y no se pueda panear a los bordes.
        const freedom = 1.0 - Math.pow(t, 4.0); 
        const maxRadiusX = 72 * freedom; 
        const maxRadiusZ = (56 / (ctrl.mapAspect || 1.0)) * freedom;

        return { x: maxRadiusX, z: maxRadiusZ };
    }

    clampTargetToBounds(delta = 0.016) {
        const ctrl = this.controller;
        const bounds = this.getBoundsForDistance(ctrl.distance);
        const maxRadiusX = bounds.x;
        const maxRadiusZ = bounds.z;

        const isDragging = ctrl.isDragging;
        
        if (isDragging) {
            // Límite de "Gomita" (Rubber band)
            const rubberLimitX = maxRadiusX + 15;
            const rubberLimitZ = maxRadiusZ + 15;
            ctrl.target.x = THREE.MathUtils.clamp(ctrl.target.x, -rubberLimitX, rubberLimitX);
            ctrl.target.z = THREE.MathUtils.clamp(ctrl.target.z, -rubberLimitZ, rubberLimitZ);
        } else {
            // Lerp de vuelta a los bordes legales suavemente (Efecto resorte)
            const springForce = 12.0 * delta;
            if (ctrl.target.x > maxRadiusX) ctrl.target.x = THREE.MathUtils.lerp(ctrl.target.x, maxRadiusX, springForce);
            if (ctrl.target.x < -maxRadiusX) ctrl.target.x = THREE.MathUtils.lerp(ctrl.target.x, -maxRadiusX, springForce);
            if (ctrl.target.z > maxRadiusZ) ctrl.target.z = THREE.MathUtils.lerp(ctrl.target.z, maxRadiusZ, springForce);
            if (ctrl.target.z < -maxRadiusZ) ctrl.target.z = THREE.MathUtils.lerp(ctrl.target.z, -maxRadiusZ, springForce);
        }
    }

    getPolarAngle(distance) {
        const ctrl = this.controller;
        let tTilt = 1.0;
        // Corregimos tiltRefMax: antes era 180 por lo que el lerp nunca llegaba al final en el zoom normal (60)
        const tiltRefMax = ctrl.calculatedMaxDistance || 60; 
        const distRangeTilt = tiltRefMax - ctrl.minDistance;
        if (distRangeTilt > 0) {
            tTilt = (distance - ctrl.minDistance) / distRangeTilt;
            tTilt = THREE.MathUtils.clamp(tTilt, 0, 1);
        }

        const easeT = -(Math.cos(Math.PI * tTilt) - 1) / 2; 
        // Tope zoom in: ~51.4º (PI/3.5)
        // Tope zoom out: 22.5º (PI/8) (Menos cenital, con un poco de contrapicado)
        return THREE.MathUtils.lerp(Math.PI / 3.5, Math.PI / 8, easeT);
    }

    updateCameraPosition() {
        const ctrl = this.controller;
        const playableDist = ctrl.calculatedMaxDistance || 60;
        let tAlpha = 1.0;
        const distRangeAlpha = playableDist - ctrl.minDistance;
        if (distRangeAlpha > 0) {
            tAlpha = (ctrl.distance - ctrl.minDistance) / distRangeAlpha;
            tAlpha = THREE.MathUtils.clamp(tAlpha, 0, 1);
        }
        ctrl.zoomAlpha = tAlpha;

        const polarAngle = this.getPolarAngle(ctrl.distance);

        ctrl.camera.position.x = ctrl.target.x;
        ctrl.camera.position.y = ctrl.target.y + ctrl.distance * Math.cos(polarAngle);
        ctrl.camera.position.z = ctrl.target.z + ctrl.distance * Math.sin(polarAngle);

        ctrl.camera.lookAt(ctrl.target);
    }
}
