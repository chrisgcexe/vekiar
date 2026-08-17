import * as THREE from 'three';

export class MarkerVisualController {
    constructor(registry, mapMaterial, interactionState) {
        this.registry = registry;
        this.mapMaterial = mapMaterial;
        this.state = interactionState;
        
        this._hoverTextUV = new THREE.Vector3(-1, -1, 1);
        this._hoverTextUVTarget = new THREE.Vector3(-1, -1, 1);

        this._lastHoveredMeshId = null;
        this._lastHoveredRegionId = null;
        this._lastFocusedRegionId = null;
        this._lastOverviewHoveredId = null;
    }

    // Detectar si hubo un cambio lógico para disparar actualizaciones fuertes (colores, targets)
    _checkStateChanges() {
        if (
            this.state.hoveredMeshId !== this._lastHoveredMeshId ||
            this.state.getHoveredRegionId() !== this._lastHoveredRegionId ||
            this.state.getFocusedRegionId() !== this._lastFocusedRegionId ||
            this.state._overviewHoveredId !== this._lastOverviewHoveredId
        ) {
            this._lastHoveredMeshId = this.state.hoveredMeshId;
            this._lastHoveredRegionId = this.state.getHoveredRegionId();
            this._lastFocusedRegionId = this.state.getFocusedRegionId();
            this._lastOverviewHoveredId = this.state._overviewHoveredId;
            
            this.updateTargetStates();
        }
    }

    updateTargetStates() {
        this._updateShaderRegionColor();
        this._updateMarkerTargetScales();
    }

    _updateMarkerTargetScales() {
        const hoveredRegionId = this.state.getHoveredRegionId();
        const hoveredMeshId = this.state.hoveredMeshId;
        const focusedRegionName = this.state.getFocusedRegionName();

        for (const item of this.registry.getAll()) {
            if (item.mesh && item.mesh.userData && 'targetScale' in item.mesh.userData) {
                const us = item.mesh.userData;
                const isHovered = (item.data.id === hoveredRegionId || item.data.id === hoveredMeshId);
                
                let isFocused = true;
                if (focusedRegionName && item.type === 'otro') {
                    isFocused = (item.data.region === focusedRegionName);
                }

                if (!isFocused) {
                    us.targetScale = 0.0;
                } else {
                    us.targetScale = isHovered ? 1.5 : 1.0;
                }

                if (item.label && item.type === 'otro') {
                    if (isHovered && !us.wasHoveredDOM && isFocused) {
                        item.label.element.style.setProperty('font-size', '14px', 'important');
                        us.wasHoveredDOM = true;
                    } else if ((!isHovered || !isFocused) && us.wasHoveredDOM) {
                        item.label.element.style.removeProperty('font-size');
                        us.wasHoveredDOM = false;
                    }
                }
            }
        }
    }

    _updateShaderRegionColor() {
        if (!this.mapMaterial) return;
        
        const hoveredRegionId = this.state.getHoveredRegionId();
        const overviewHoveredId = this.state._overviewHoveredId;
        const focusedRegionId = this.state.getFocusedRegionId() || this._pendingFocusId;

        // Hover shader logic
        if (this.mapMaterial.userData.tHoverMask) {
            const activeHoverId = hoveredRegionId || overviewHoveredId;
            if (activeHoverId) {
                const item = this.registry.getById(activeHoverId);
                if (item) {
                    if (item.data.maskTexture && item.data.maskChannel) {
                        const maskIdx = parseInt(item.data.maskTexture.replace("region_masks_", "").replace(".png", ""));
                        const textures = this.mapMaterial.userData.regionMasksTextures;
                        if (textures && textures[maskIdx]) {
                            this.mapMaterial.userData.tHoverMask.value = textures[maskIdx];
                            this.mapMaterial.userData.uHoverChannel.value.fromArray(item.data.maskChannel);
                        }
                    } else {
                        this.mapMaterial.userData.uHoverChannel.value.set(0, 0, 0, 0);
                    }
                    
                    let u = -1, v = -1;
                    if (item.data.uv) { u = item.data.uv.u; v = item.data.uv.v; }
                    else if (item.data.u !== undefined) { u = item.data.u; v = item.data.v; }
                    else if (item.data.position) { u = (item.data.position.x + 30) / 60; v = 1.0 - ((item.data.position.y + 20) / 40); }
                    const width = item.data.textWidthUV || 0.15;
                    this._hoverTextUVTarget.set(u, v, width);
                } else {
                    // Mantenemos la UV y el canal anterior para que el fade out tenga la forma correcta.
                    // uHoverTextAlpha / uHoverRegionAlpha se encargan de ocultarlo.
                    this._hoverTextUVTarget.set(-1, -1, 1);
                }
            } else {
                this._hoverTextUVTarget.set(-1, -1, 1);
            }
        }
        
        // Focus shader logic
        if (this.mapMaterial.userData.tFocusMask) {
            if (focusedRegionId) {
                const item = this.registry.getById(focusedRegionId);
                if (item) {
                    if (item.data.maskTexture && item.data.maskChannel) {
                        const maskIdx = parseInt(item.data.maskTexture.replace("region_masks_", "").replace(".png", ""));
                        const textures = this.mapMaterial.userData.regionMasksTextures;
                        if (textures && textures[maskIdx]) {
                            this.mapMaterial.userData.tFocusMask.value = textures[maskIdx];
                            this.mapMaterial.userData.uFocusChannel.value.fromArray(item.data.maskChannel);
                        }
                    }
                    
                    let u = -1, v = -1;
                    if (item.data.uv) { u = item.data.uv.u; v = item.data.uv.v; }
                    else if (item.data.u !== undefined) { u = item.data.u; v = item.data.v; }
                    else if (item.data.position) { u = (item.data.position.x + 30) / 60; v = 1.0 - ((item.data.position.y + 20) / 40); }
                    const width = item.data.textWidthUV || 0.15;
                    if (this.mapMaterial.userData.uFocusTextUV) {
                        this.mapMaterial.userData.uFocusTextUV.value.set(u, v, width);
                    }
                }
            }
            // NO limpiamos uFocusChannel ni uFocusTextUV aquí.
            // Queremos que el shader siga teniendo la máscara y UV viejas mientras 
            // uFocusedRegionAlpha hace lerp lentamente a 0 para que sea un FADE OUT suave.
        }
    }

    // Llamar cada frame
    updateFrame(mapReady, cameraState, pendingFocusId) {
        if (this._pendingFocusId !== pendingFocusId) {
            this._pendingFocusId = pendingFocusId;
            this._updateShaderRegionColor();
        }
        
        this._checkStateChanges();

        const isCameraReady = (cameraState === 'PLAYING' || cameraState === 'FLY_TO');

        if (this.mapMaterial && this.mapMaterial.userData.uRegionOpacity) {
            const targetOpacity = isCameraReady ? 1.0 : 0.0;
            this.mapMaterial.userData.uRegionOpacity.value = THREE.MathUtils.lerp(
                this.mapMaterial.userData.uRegionOpacity.value, targetOpacity, 0.15
            );
        }

        if (this.mapMaterial && this.mapMaterial.userData.uHoverRegionAlpha) {
            const overviewHoverActive = !mapReady && this.state._overviewHoveredId !== null;
            const hoveredId = this.state.getHoveredRegionId() || (overviewHoverActive ? this.state._overviewHoveredId : null);
            const targetHoverAlpha = (hoveredId && hoveredId !== this.state.getFocusedRegionId()) ? 1.0 : 0.0;
            this.mapMaterial.userData.uHoverRegionAlpha.value = THREE.MathUtils.lerp(
                this.mapMaterial.userData.uHoverRegionAlpha.value, targetHoverAlpha, 0.1
            );
        }

        if (this.mapMaterial && this.mapMaterial.userData.uHoverTextAlpha) {
            const overviewHoverActive = !mapReady && this.state._overviewHoveredId !== null;
            const targetHoverText = (this.state.getHoveredRegionId() !== null || overviewHoverActive) ? 1.0 : 0.0;
            this.mapMaterial.userData.uHoverTextAlpha.value = THREE.MathUtils.lerp(
                this.mapMaterial.userData.uHoverTextAlpha.value, targetHoverText, 0.12
            );
        }

        if (this.mapMaterial && this.mapMaterial.userData.uOverviewMode) {
            this.mapMaterial.userData.uOverviewMode.value = mapReady ? 0.0 : 1.0;
        }

        if (this.mapMaterial && this.mapMaterial.userData.uHoverTextUV) {
            const hovering = (this.state.getHoveredRegionId() !== null || this.state._overviewHoveredId !== null);
            const hoverAlpha = this.mapMaterial.userData.uHoverTextAlpha ?
                               this.mapMaterial.userData.uHoverTextAlpha.value : 0;
            if (this._hoverTextUVTarget.x >= 0) {
                this._hoverTextUV.copy(this._hoverTextUVTarget);
            } else if (!hovering && hoverAlpha <= 0.005) {
                this._hoverTextUV.set(-1, -1, 1);
            }
            this.mapMaterial.userData.uHoverTextUV.value.copy(this._hoverTextUV);
        }

        if (this.mapMaterial && this.mapMaterial.userData.uFocusedRegionAlpha) {
            const targetFocusAlpha = (this.state.getFocusedRegionId() !== null || !!pendingFocusId) ? 1.0 : 0.0;
            this.mapMaterial.userData.uFocusedRegionAlpha.value = THREE.MathUtils.lerp(
                this.mapMaterial.userData.uFocusedRegionAlpha.value, targetFocusAlpha, 0.15
            );
        }

        // Lerp del scale de los meshes 3D
        for (const item of this.registry.getAll()) {
            if (item.mesh && item.mesh.userData && 'targetScale' in item.mesh.userData) {
                const us = item.mesh.userData;
                if (Math.abs(us.currentScale - us.targetScale) > 0.001) {
                    us.currentScale = THREE.MathUtils.lerp(us.currentScale, us.targetScale, 0.15);
                    item.mesh.scale.set(us.currentScale, us.currentScale, 1.0);
                }
            }
        }
    }
}
