import * as THREE from 'three';
import { ContinentRules } from './ContinentRules.js';

const ZOOM_THRESHOLD = {
    // Definimos umbrales según el 'level' o el 'type'
    continent: 1.1,  // siempre visible en overview
    oceano: 1.1,     // siempre visible
    mar: 0.60,       // visible en estado playing junto con regiones
    region: 0.60,    // visible en estado playing (zoom medio)
    place: 0.25,     // visible en zoom máximo (islas, ciudades, lagos, ríos, otro)
    isla: 0.25,
    lago: 0.25,
    otro: 0.25,
    ciudad: 0.25,
    pueblo: 0.25
};

export class MarkerLODSystem {
    constructor(registry, interactionState, mapMaterial) {
        this.registry = registry;
        this.interactionState = interactionState;
        this.mapMaterial = mapMaterial;
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

        // threshold region is 0.60. Let's fade them in between 0.85 (zoomAlpha) and 0.60
        const microAlpha = THREE.MathUtils.clamp((0.85 - zoomAlpha) / 0.25, 0.0, 1.0);
        if (this.mapMaterial && this.mapMaterial.userData && this.mapMaterial.userData.uMicroTextAlpha) {
            this.mapMaterial.userData.uMicroTextAlpha.value = microAlpha;
        }

        const focusedRegionName = this.interactionState.getFocusedRegionId() 
            ? this.registry.getById(this.interactionState.getFocusedRegionId())?.data?.name 
            : null;

        if (!needsRedraw && Math.abs(zoomAlpha - this._lastZoomAlpha) < 0.005 && currentShowVisual === this._lastShowVisualMarkers) return;
        
        this._lastZoomAlpha = zoomAlpha;
        this._lastShowVisualMarkers = currentShowVisual;
        
        for (const item of this.registry.getAll()) {
            // Buscamos el umbral. Primero por level, sino por type.
            let thresholdKey = item.type;
            if (item.data.level === 'continent') thresholdKey = 'continent';
            else if (item.data.level === 'region') thresholdKey = 'region';
            else if (item.data.level === 'place') thresholdKey = 'place';

            let threshold = ZOOM_THRESHOLD[thresholdKey] ?? 0.25;
            
            // Aplicar reglas específicas de continente (ej: forzar tribus a actuar como regiones)
            if (item.data.continent) {
                const rules = ContinentRules.getRulesFor(item.data.continent);
                if (rules.lodOverrides && rules.lodOverrides[item.type]) {
                    threshold = ZOOM_THRESHOLD[rules.lodOverrides[item.type]];
                }
            }
            
            // Solo hacer visibles los marcadores si la cámara ya terminó de explorar e inició el juego
            let visible = isCameraReady && (zoomAlpha <= threshold);
            
            // Si hay un focus activo y este es un marcador 'place'/'otro', ocultarlo si no pertenece a la región enfocada
            if (visible && focusedRegionName && (item.data.level === 'place' || item.type === 'otro')) {
                if (item.data.region !== focusedRegionName && item.data.continent !== focusedRegionName) {
                    visible = false;
                }
            }

            const shouldMeshBeVisible = visible && currentShowVisual && item.type !== 'region' && item.type !== 'continent';

            if (item.isVisible !== visible || (item.mesh && item.mesh.visible !== shouldMeshBeVisible)) {
                item.isVisible = visible;
                
                if (item.label) {
                    item.label.element.style.opacity = visible ? '1' : '0';
                }

                if (item.mesh && !['continent', 'region', 'mar', 'oceano'].includes(item.type)) {
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
