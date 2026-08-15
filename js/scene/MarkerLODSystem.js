import * as THREE from 'three';

const ZOOM_THRESHOLD = {
    region: 1.1,  // siempre visible
    isla:   0.60,
    lago:   0.60,
    otro:   0.30
};

export class MarkerLODSystem {
    constructor(registry, interactionState) {
        this.registry = registry;
        this.interactionState = interactionState;
        this._lastZoomAlpha = -1;
        this._lastShowVisualMarkers = true;
    }

    update(zoomAlpha, cameraState) {
        const isCameraReady = (cameraState === 'PLAYING' || cameraState === 'FLY_TO');
        const shouldFreezeLOD = (cameraState === 'INIT' || cameraState === 'WAIT_INPUT');
        const currentShowVisual = window._showVisualMarkers !== false;
        
        // El interactionState maneja su propio flag de redraw si el focus cambió
        const needsRedraw = this.interactionState.consumeNeedsRedraw();

        if (shouldFreezeLOD) return; 

        if (!needsRedraw && Math.abs(zoomAlpha - this._lastZoomAlpha) < 0.005 && currentShowVisual === this._lastShowVisualMarkers) return;
        
        this._lastZoomAlpha = zoomAlpha;
        this._lastShowVisualMarkers = currentShowVisual;
        
        const focusedRegionName = this.interactionState.getFocusedRegionName();

        for (const item of this.registry.getAll()) {
            const threshold = ZOOM_THRESHOLD[item.type] ?? 0.30;
            // Solo hacer visibles los marcadores si la cámara ya terminó de explorar e inició el juego
            let visible = isCameraReady && (zoomAlpha <= threshold);
            
            // Si hay un focus activo y este es un marcador 'otro', ocultarlo si no pertenece a la región enfocada
            if (visible && focusedRegionName && item.type === 'otro') {
                if (item.data.region !== focusedRegionName) {
                    visible = false;
                }
            }

            const shouldMeshBeVisible = visible && currentShowVisual && item.type !== 'region';

            if (item.isVisible !== visible || (item.mesh && item.mesh.visible !== shouldMeshBeVisible)) {
                item.isVisible = visible;
                
                if (item.label) {
                    item.label.element.style.opacity = visible ? '1' : '0';
                }

                if (item.mesh && !['region', 'mar', 'oceano'].includes(item.type)) {
                    if (shouldMeshBeVisible && !item.mesh.visible) {
                        if (item.mesh.userData) {
                            item.mesh.userData.currentScale = 0.0;
                            item.mesh.scale.set(0, 0, 1.0);
                        }
                    }
                    
                    item.mesh.visible = shouldMeshBeVisible;
                    
                    if (item.mesh.userData) {
                        if (shouldMeshBeVisible) {
                            item.mesh.userData.targetScale = item.originalScale || 1.0;
                        } else {
                            item.mesh.userData.targetScale = 0.001;
                        }
                    }
                }
            }
        }
    }
}
