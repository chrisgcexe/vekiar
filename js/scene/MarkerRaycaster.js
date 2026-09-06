import * as THREE from 'three';

export class MarkerRaycaster {
    constructor(camera, domElement, mapPlaneGroup, markersGroup, registry, getSurfaceHeight, interactionState) {
        this.camera = camera;
        this.domElement = domElement;
        this.mapPlaneGroup = mapPlaneGroup;
        this.markersGroup = markersGroup;
        this.registry = registry;
        this.getSurfaceHeight = getSurfaceHeight;
        this.interactionState = interactionState;
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2(-1, -1);
        this._lastRaycastMouse = new THREE.Vector2(-10, -10);
        this._lastCameraSig = null;
        
        this._mouseDownPos = new THREE.Vector2(-1000, -1000);
        this._reliefColliders = false;

        this._mapPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this._planeHit = new THREE.Vector3();
        this._localPoint = new THREE.Vector3();
        this._intersectsBuffer = [];

        this._lastRaycastTime = 0;
        this._forcedHoverId = null;

        // Bindeos
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerLeave = this._onPointerLeave.bind(this);
        this._onPointerDown = this._onPointerDown.bind(this);

        if (this.domElement) {
            this._canvasRect = this.domElement.getBoundingClientRect();
            window.addEventListener('resize', () => {
                this._canvasRect = this.domElement.getBoundingClientRect();
            }, { passive: true });

            this.domElement.addEventListener('pointermove', this._onPointerMove);
            this.domElement.addEventListener('pointerleave', this._onPointerLeave);
            this.domElement.addEventListener('pointerdown', this._onPointerDown);
        }
    }

    dispose() {
        if (this.domElement) {
            this.domElement.removeEventListener('pointermove', this._onPointerMove);
            this.domElement.removeEventListener('pointerleave', this._onPointerLeave);
            this.domElement.removeEventListener('pointerdown', this._onPointerDown);
        }
    }

    get mouseDownPos() { return this._mouseDownPos; }

    setForcedHoverId(id) {
        this._forcedHoverId = id;
        this._lastRaycastMouse.set(-999, -999);
    }

    _onPointerMove(e) {
        const rect = this._canvasRect;
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    _onPointerLeave(e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        this.mouse.x = 2;
        this.mouse.y = 2;
        this._lastRaycastMouse.set(-999, -999);
    }

    _onPointerDown(e) {
        this._mouseDownPos.set(e.clientX, e.clientY);
    }

    _cameraTransformChanged() {
        const cam = this.camera;
        if (!cam) return false;
        cam.updateWorldMatrix(true, false);
        const e = cam.matrixWorld.elements;
        const sig = this._lastCameraSig;
        if (!sig) {
            this._lastCameraSig = Array.from(e);
            return false;
        }
        for (let i = 0; i < 16; i++) {
            if (e[i] !== sig[i]) {
                for (let j = 0; j < 16; j++) sig[j] = e[j];
                return true;
            }
        }
        return false;
    }

    _regionAtPointer(raycaster) {
        let bestId = null, bestArea = Infinity;

        for (const item of this.registry.getAll()) {
            // Solo nos interesan regiones o continentes para la distancia
            if (item.type !== 'region' && item.type !== 'continent') continue;
            const mesh = item.mesh;
            if (!mesh || !mesh.userData || !mesh.userData.hit) continue;
            const hit = mesh.userData.hit;

            const planeY = (hit.zAnchor !== undefined) ? hit.zAnchor : (mesh.position ? mesh.position.z : 0);
            this._mapPlane.constant = -planeY;
            if (!raycaster.ray.intersectPlane(this._mapPlane, this._planeHit)) continue;
            this._localPoint.copy(this._planeHit);
            this.mapPlaneGroup.worldToLocal(this._localPoint);

            if (this._reliefColliders && this.getSurfaceHeight) {
                for (let it = 0; it < 3; it++) {
                    const h = this.getSurfaceHeight(this._localPoint.x, this._localPoint.y);
                    this._mapPlane.constant = -h;
                    if (!raycaster.ray.intersectPlane(this._mapPlane, this._planeHit)) break;
                    this._localPoint.copy(this._planeHit);
                    this.mapPlaneGroup.worldToLocal(this._localPoint);
                }
            }

            if (!this._pointInRect(this._localPoint.x, this._localPoint.y, hit)) continue;
            const area = hit.w * hit.h;
            if (area < bestArea) { bestArea = area; bestId = item.data.id; }
        }
        return bestId;
    }

    _pointInRect(px, py, hit) {
        const dx = px - hit.cx;
        const dy = py - hit.cy;
        if (hit.rot !== 0) {
            const c = Math.cos(-hit.rot), s = Math.sin(-hit.rot);
            const rx = dx * c - dy * s;
            const ry = dx * s + dy * c;
            return Math.abs(rx) <= hit.w / 2 && Math.abs(ry) <= hit.h / 2;
        }
        return Math.abs(dx) <= hit.w / 2 && Math.abs(dy) <= hit.h / 2;
    }

    updateRaycast(cameraState, isDragging = false, mapReady = true) {
        if (!this.raycaster || !this.camera || isDragging) {
            if (this.interactionState.hoveredMeshId !== null) {
                this.interactionState.hoveredMeshId = null;
                if (this.domElement) this.domElement.style.cursor = 'grab';
                return { hoveredId: null, changed: true };
            }
            return { hoveredId: null, changed: false };
        }

        const now = performance.now();
        if (now - this._lastRaycastTime < 30) {
            return { hoveredId: this.interactionState.hoveredMeshId, changed: false };
        }

        this._lastRaycastTime = now;
        const mouseMoved = (this.mouse.x !== this._lastRaycastMouse.x || this.mouse.y !== this._lastRaycastMouse.y);
        const cameraMoved = this._cameraTransformChanged();
        
        if (mouseMoved || cameraMoved) {
            this._lastRaycastMouse.copy(this.mouse);

            let newHoveredMeshId = null;
            this.raycaster.setFromCamera(this.mouse, this.camera);

            const regionAtPointerId = this._regionAtPointer(this.raycaster);

            this._intersectsBuffer.length = 0;
            this.raycaster.intersectObjects(this.markersGroup.children, true, this._intersectsBuffer);
            for (let i = 0; i < this._intersectsBuffer.length; i++) {
                const obj = this._intersectsBuffer[i].object;
                if (obj.visible && obj.userData && obj.userData.id
                    && !(obj.userData.isHitbox === true && (obj.userData.type === 'region' || obj.userData.type === 'continent'))) {
                    newHoveredMeshId = obj.userData.id;
                    break;
                }
            }

            if (regionAtPointerId) newHoveredMeshId = regionAtPointerId;

            if (this._forcedHoverId !== null) {
                newHoveredMeshId = this._forcedHoverId;
            }
            
            if (this.domElement) {
                let isInteractive = false;
                if (newHoveredMeshId && !this._forcedHoverId) {
                    if (cameraState === 'PLAYING' && mapReady) {
                        isInteractive = true;
                    } else {
                        const item = this.registry.getById(newHoveredMeshId);
                        if (item && item.type === 'continent') {
                            isInteractive = true;
                        }
                    }
                }
                this.domElement.style.cursor = isInteractive ? 'pointer' : 'grab';
            }

            if (this.interactionState.hoveredMeshId !== newHoveredMeshId) {
                this.interactionState.hoveredMeshId = newHoveredMeshId;
                return { hoveredId: newHoveredMeshId, changed: true };
            }
        }
        
        return { hoveredId: this.interactionState.hoveredMeshId, changed: false };
    }
}
