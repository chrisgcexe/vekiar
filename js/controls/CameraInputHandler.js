import * as THREE from 'three';

export class CameraInputHandler {
    constructor(controller) {
        this.controller = controller;
        this.panVelocity = new THREE.Vector3();
        this.isDragging = false;
        
        this._isPointerDown = false;
        this.startPointerX = 0;
        this.startPointerY = 0;
        this.lastPointerX = 0;
        this.lastPointerY = 0;
        this.friction = 0.85;

        this._pointerNDC = new THREE.Vector2();
        this._intersectionTarget = new THREE.Vector3();
        this._zoomDelta = new THREE.Vector3(); 
        this._pointBeforeZoom = new THREE.Vector3();

        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onPointerCancel = this.onPointerCancel.bind(this);
        this.onWheel = this.onWheel.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);

        const domElement = this.controller.domElement;
        if (domElement) {
            domElement.addEventListener('pointerdown', this.onPointerDown);
            domElement.addEventListener('pointermove', this.onPointerMove);
            window.addEventListener('pointerup', this.onPointerUp); 
            window.addEventListener('pointercancel', this.onPointerCancel); 
            domElement.addEventListener('wheel', this.onWheel, { passive: false });
            window.addEventListener('keydown', this.onKeyDown);
            domElement.addEventListener('contextmenu', e => e.preventDefault());
        }
    }

    dispose() {
        const domElement = this.controller.domElement;
        if (domElement) {
            domElement.removeEventListener('pointerdown', this.onPointerDown);
            domElement.removeEventListener('pointermove', this.onPointerMove);
            window.removeEventListener('pointerup', this.onPointerUp);
            window.removeEventListener('pointercancel', this.onPointerCancel);
            domElement.removeEventListener('wheel', this.onWheel);
            window.removeEventListener('keydown', this.onKeyDown);
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

    onPointerDown(e) {
        const ctrl = this.controller;
        if (ctrl.stateMachine.state === 'FLY_TO') ctrl.stateMachine.transitionTo('PLAYING', { reason: 'flight-interrupt' });
        if (ctrl.stateMachine.state !== 'PLAYING') return;
        if (e.button !== 0 && e.pointerType !== 'touch') return; 

        this._isPointerDown = true;
        this.isDragging = false; 
        this.panVelocity.set(0, 0, 0); 
        
        this.startPointerX = e.clientX;
        this.startPointerY = e.clientY;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        
        ctrl.domElement.setPointerCapture(e.pointerId); 
    }

    onPointerMove(e) {
        const ctrl = this.controller;
        if (!this._isPointerDown || ctrl.stateMachine.state !== 'PLAYING') return;

        if (!this.isDragging) {
            const dist = Math.hypot(e.clientX - this.startPointerX, e.clientY - this.startPointerY);
            if (dist > 3) {
                this.isDragging = true;
                ctrl.domElement.style.cursor = 'grabbing';
                this.lastPointerX = e.clientX;
                this.lastPointerY = e.clientY;
            }
        }

        if (!this.isDragging) return;

        const movementX = e.clientX - this.lastPointerX;
        const movementY = e.clientY - this.lastPointerY;
        
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;

        let tTilt = 1.0;
        const tiltRefMax = 180;
        const distRangeTilt = tiltRefMax - ctrl.minDistance;
        if (distRangeTilt > 0) {
            tTilt = (ctrl.distance - ctrl.minDistance) / distRangeTilt;
            tTilt = THREE.MathUtils.clamp(tTilt, 0, 1);
        }
        const easeT = -(Math.cos(Math.PI * tTilt) - 1) / 2; 
        const polarAngle = THREE.MathUtils.lerp(Math.PI / 4.5, Math.PI / 8, easeT); 

        const speed = ctrl.distance * 0.0022; 
        
        const deltaX = -movementX * speed;
        const deltaZ = -movementY * speed / Math.cos(polarAngle);

        this.panVelocity.set(deltaX, 0, deltaZ);
        ctrl.target.add(this.panVelocity);
    }

    onPointerUp(e) {
        if (e.button !== 0 && e.pointerType !== 'touch') return;
        this._isPointerDown = false;
        this.isDragging = false;
        if (this.controller.domElement) {
            this.controller.domElement.style.cursor = 'grab';
            try { this.controller.domElement.releasePointerCapture(e.pointerId); } catch (err) {}
        }
    }

    onPointerCancel(e) {
        if (e.button !== 0 && e.pointerType !== 'touch') return;
        this._isPointerDown = false;
        this.isDragging = false;
        this.panVelocity.set(0, 0, 0);
        if (this.controller.domElement) {
            this.controller.domElement.style.cursor = 'grab';
            try { this.controller.domElement.releasePointerCapture(e.pointerId); } catch (err) {}
        }
    }

    onWheel(e) {
        const ctrl = this.controller;
        if (ctrl.stateMachine.state === 'FLY_TO') ctrl.stateMachine.transitionTo('PLAYING', { reason: 'flight-interrupt' });
        if (ctrl.stateMachine.state !== 'PLAYING') {
            e.preventDefault();
            return;
        }
        e.preventDefault();

        const hit1 = this.getPointerIntersection(e.clientX, e.clientY);
        if (!hit1) return;
        this._pointBeforeZoom.copy(hit1);

        const zoomDelta = Math.sign(e.deltaY) * 2.0;
        ctrl.distance += zoomDelta;
        ctrl.distance = THREE.MathUtils.clamp(ctrl.distance, ctrl.minDistance, ctrl.maxDistance);

        ctrl.mathResolver.updateCameraPosition();
        const hit2 = this.getPointerIntersection(e.clientX, e.clientY);

        if (hit2) {
            this._zoomDelta.subVectors(this._pointBeforeZoom, hit2);
            ctrl.target.add(this._zoomDelta);
            ctrl.mathResolver.clampTargetToBounds();
            ctrl.mathResolver.updateCameraPosition();
        }
    }

    onKeyDown(e) {
        const ctrl = this.controller;
        if (ctrl.stateMachine.state !== 'PLAYING') return;
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const zoomDelta = e.key === 'ArrowUp' ? -15 : 15;
            ctrl.distance += zoomDelta;
            ctrl.distance = THREE.MathUtils.clamp(ctrl.distance, ctrl.minDistance, ctrl.maxDistance);
            ctrl.mathResolver.clampTargetToBounds();
            ctrl.mathResolver.updateCameraPosition();
        }
    }

    updateInertia() {
        const ctrl = this.controller;
        if (ctrl.stateMachine.state === 'PLAYING') {
            if (this.isDragging) {
                this.panVelocity.multiplyScalar(this.friction);
                if (this.panVelocity.lengthSq() < 0.0001) this.panVelocity.set(0, 0, 0);
            } else {
                ctrl.target.add(this.panVelocity);
                this.panVelocity.multiplyScalar(this.friction);
                if (this.panVelocity.lengthSq() < 0.0001) this.panVelocity.set(0, 0, 0);
            }
        }
    }
}
