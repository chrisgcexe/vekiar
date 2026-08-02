import * as THREE from 'three';

export class RaycasterBounds {
    constructor(camera, controls) {
        this.camera = camera;
        this.controls = controls;
        
        this.raycaster = new THREE.Raycaster();
        this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        
        this.corners = [
            new THREE.Vector2(-1, -1),
            new THREE.Vector2(1, -1),
            new THREE.Vector2(-1, 1),
            new THREE.Vector2(1, 1)
        ];
    }

    update(mapAspect) {
        if (mapAspect === 1.0) return;

        this.camera.updateMatrixWorld();
        
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        let hits = 0;

        for (let c of this.corners) {
            this.raycaster.setFromCamera(c, this.camera);
            const intersect = new THREE.Vector3();
            if (this.raycaster.ray.intersectPlane(this.groundPlane, intersect)) {
                minX = Math.min(minX, intersect.x);
                maxX = Math.max(maxX, intersect.x);
                minZ = Math.min(minZ, intersect.z);
                maxZ = Math.max(maxZ, intersect.z);
                hits++;
            }
        }

        if (hits === 4) {
            // Izquierda/Derecha permitimos ver vacío (60)
            const mapHalfW = 60;
            // Arriba/Abajo lo ajustamos al límite exacto del mapa físico (49)
            const mapHalfH = 49 / mapAspect;
            
            const frustumW = maxX - minX;
            const frustumH = maxZ - minZ;

            let deltaX = 0;
            let deltaZ = 0;

            if (frustumW > mapHalfW * 2) {
                deltaX = -(maxX + minX) / 2;
            } else {
                if (maxX > mapHalfW) deltaX = mapHalfW - maxX;
                if (minX < -mapHalfW) deltaX = -mapHalfW - minX;
            }
            
            if (frustumH > mapHalfH * 2) {
                deltaZ = -(maxZ + minZ) / 2;
            } else {
                if (maxZ > mapHalfH) deltaZ = mapHalfH - maxZ;
                if (minZ < -mapHalfH) deltaZ = -mapHalfH - minZ;
            }

            if (Math.abs(deltaX) > 0.001 || Math.abs(deltaZ) > 0.001) {
                this.controls.target.x += deltaX;
                this.controls.target.z += deltaZ;
                this.camera.position.x += deltaX;
                this.camera.position.z += deltaZ;
                this.controls.update();
            }
        }
    }
}
