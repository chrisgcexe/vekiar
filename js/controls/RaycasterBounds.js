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
        // Pre-alocar para evitar 4 allocaciones de Vector3 por frame (presión GC)
        this._intersect = new THREE.Vector3();
        // Para el delta-check de movimiento
        this._prevCx = null;
    }

    update(mapAspect) {
        if (mapAspect === 1.0) return;

        // Solo procesar si la cámara o el target se movieron: evita 4 ray casts
        // + camera.updateMatrixWorld() en frames donde nada cambió.
        const cx = this.camera.position.x, cy = this.camera.position.y, cz = this.camera.position.z;
        const tx = this.controls.target.x, tz = this.controls.target.z;
        if (this._prevCx !== null) {
            const dx = cx - this._prevCx, dy = cy - this._prevCy, dz = cz - this._prevCz;
            const dtx = tx - this._prevTx, dtz = tz - this._prevTz;
            if (dx*dx + dy*dy + dz*dz + dtx*dtx + dtz*dtz < 0.0025) return;
        }
        this._prevCx = cx; this._prevCy = cy; this._prevCz = cz;
        this._prevTx = tx; this._prevTz = tz;

        this.camera.updateMatrixWorld();
        
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        let hits = 0;

        for (let c of this.corners) {
            this.raycaster.setFromCamera(c, this.camera);
            if (this.raycaster.ray.intersectPlane(this.groundPlane, this._intersect)) {
                minX = Math.min(minX, this._intersect.x);
                maxX = Math.max(maxX, this._intersect.x);
                minZ = Math.min(minZ, this._intersect.z);
                maxZ = Math.max(maxZ, this._intersect.z);
                hits++;
            }
        }

        if (hits === 4) {
            // Izquierda/Derecha permitimos ver vacío (72)
            const mapHalfW = 72;
            // Arriba/Abajo lo ajustamos para permitir centrar regiones periféricas (56)
            const mapHalfH = 56 / mapAspect;
            
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
                this.controls.target.x += deltaX * 0.15;
                this.controls.target.z += deltaZ * 0.15;
                this.camera.position.x += deltaX * 0.15;
                this.camera.position.z += deltaZ * 0.15;
                this.controls.update();
            }
        }
    }
}
