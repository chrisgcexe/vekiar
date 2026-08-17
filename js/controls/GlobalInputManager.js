import * as THREE from 'three';

export class GlobalInputManager {
    constructor(domElement, eventBus) {
        this.domElement = domElement;
        this.eventBus = eventBus;
        
        this.isPointerDown = false;
        this.isDragging = false;
        this.startPointerX = 0;
        this.startPointerY = 0;
        this.lastPointerX = 0;
        this.lastPointerY = 0;
        this.dragThreshold = 3.0; // Pixels to move before considering it a pan
        
        this.lastClickTime = 0;

        // Ligar métodos al this
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onPointerCancel = this.onPointerCancel.bind(this);
        this.onWheel = this.onWheel.bind(this);
        this.onContextMenu = this.onContextMenu.bind(this);

        this.attachEvents();
    }

    attachEvents() {
        if (!this.domElement) return;
        
        // Listeners en el canvas para iniciar interacción
        this.domElement.addEventListener('pointerdown', this.onPointerDown);
        this.domElement.addEventListener('wheel', this.onWheel, { passive: false });
        this.domElement.addEventListener('contextmenu', this.onContextMenu);
        
        // Listeners globales para el movimiento y finalización
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('pointercancel', this.onPointerCancel);
    }

    dispose() {
        if (!this.domElement) return;
        this.domElement.removeEventListener('pointerdown', this.onPointerDown);
        this.domElement.removeEventListener('wheel', this.onWheel);
        this.domElement.removeEventListener('contextmenu', this.onContextMenu);
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('pointercancel', this.onPointerCancel);
    }

    // Devuelve true si el evento se originó o ocurrió sobre una UI
    isOverUI(e) {
        // Si el event target no es el canvas, asumimos que es UI.
        if (e.target && e.target.tagName !== 'CANVAS') {
            return true;
        }
        return false;
    }

    onPointerDown(e) {
        // Solo botón primario o touch
        if (e.button !== 0 && e.pointerType !== 'touch') return;
        if (this.isOverUI(e)) return;

        this.isPointerDown = true;
        this.isDragging = false;
        
        this.startPointerX = e.clientX;
        this.startPointerY = e.clientY;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        
        try { this.domElement.setPointerCapture(e.pointerId); } catch (err) {}
    }

    onPointerMove(e) {
        if (!this.isPointerDown) return;

        const movementX = e.clientX - this.lastPointerX;
        const movementY = e.clientY - this.lastPointerY;

        if (!this.isDragging) {
            const dist = Math.hypot(e.clientX - this.startPointerX, e.clientY - this.startPointerY);
            if (dist > this.dragThreshold) {
                this.isDragging = true;
                this.domElement.style.cursor = 'grabbing';
                this.eventBus.emit('input:pan-start', { detail: { x: e.clientX, y: e.clientY } });
            }
        }

        if (this.isDragging) {
            this.eventBus.emit('input:pan-move', { 
                detail: { 
                    movementX, 
                    movementY, 
                    clientX: e.clientX, 
                    clientY: e.clientY 
                } 
            });
        }
        
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
    }

    onPointerUp(e) {
        if (e.button !== 0 && e.pointerType !== 'touch') return;
        
        try { this.domElement.releasePointerCapture(e.pointerId); } catch (err) {}
        this.domElement.style.cursor = 'grab';

        if (!this.isPointerDown) return;
        this.isPointerDown = false;

        if (this.isDragging) {
            this.eventBus.emit('input:pan-end', { detail: {} });
            this.isDragging = false;
        } else {
            // Fue un click limpio
            if (!this.isOverUI(e)) {
                const now = performance.now();
                if (now - this.lastClickTime < 300) {
                    this.eventBus.emit('input:double-click', { 
                        detail: { clientX: e.clientX, clientY: e.clientY } 
                    });
                    this.lastClickTime = 0; // reset
                } else {
                    this.eventBus.emit('input:click', { 
                        detail: { clientX: e.clientX, clientY: e.clientY } 
                    });
                    this.lastClickTime = now;
                }
            }
        }
    }

    onPointerCancel(e) {
        if (e.button !== 0 && e.pointerType !== 'touch') return;
        
        try { this.domElement.releasePointerCapture(e.pointerId); } catch (err) {}
        this.domElement.style.cursor = 'grab';
        
        this.isPointerDown = false;
        if (this.isDragging) {
            this.eventBus.emit('input:pan-end', { detail: {} });
            this.isDragging = false;
        }
    }

    onWheel(e) {
        if (this.isOverUI(e)) return;
        e.preventDefault(); 
        
        this.eventBus.emit('input:zoom', {
            detail: {
                deltaY: e.deltaY,
                clientX: e.clientX,
                clientY: e.clientY
            }
        });
    }

    onContextMenu(e) {
        if (this.isOverUI(e)) return;
        e.preventDefault();
        
        // Emitir un evento de click derecho para el Editor
        this.eventBus.emit('input:right-click', {
            detail: { clientX: e.clientX, clientY: e.clientY }
        });
    }
}
