import * as THREE from 'three';

export class MarkerInteractionState {
    constructor(registry, mapMaterial) {
        this.registry = registry;
        this.mapMaterial = mapMaterial;
        
        this.hoveredMeshId = null;
        this._hoveredRegionId = null;
        this._focusedRegionId = null;
        this._focusedRegionName = null;
        this._overviewHoveredId = null;
        
        this._lastFocusedRegionId = null;
        this._needsRedraw = false;
        
        this._hoverTextUV = new THREE.Vector3(-1, -1, 1);
        this._hoverTextUVTarget = new THREE.Vector3(-1, -1, 1);
    }

    consumeNeedsRedraw() {
        const changed = this._lastFocusedRegionId !== this._focusedRegionId;
        this._lastFocusedRegionId = this._focusedRegionId;
        if (changed) this._needsRedraw = true;
        
        const res = this._needsRedraw;
        this._needsRedraw = false;
        return res;
    }

    getFocusedRegionName() {
        return this._focusedRegionName;
    }

    getFocusedRegionId() {
        return this._focusedRegionId;
    }
    
    getHoveredRegionId() {
        return this._hoveredRegionId;
    }

    setHoveredRegion(regionId) {
        if (this._hoveredRegionId !== regionId) {
            this._hoveredRegionId = regionId;
            this._updateShaderRegionColor();
            return true;
        }
        return false;
    }

    setFocusedRegion(regionId) {
        if (this._focusedRegionId !== regionId) {
            this._focusedRegionId = regionId;
            if (regionId) {
                const r = this.registry.getById(regionId);
                this._focusedRegionName = r ? r.data.name : null;
            } else {
                this._focusedRegionName = null;
            }
            this._updateShaderRegionColor();
            this.updateMarkerStates();
            return true;
        }
        return false;
    }

    setOverviewHover(regionId) {
        if (this._overviewHoveredId === regionId) return;
        this._overviewHoveredId = regionId;

        if (!this.mapMaterial || !this.mapMaterial.userData.uHoveredRegionColor) return;
        
        if (regionId) {
            const item = this.registry.getById(regionId);
            if (item && item.data.colorId) {
                this.mapMaterial.userData.uHoveredRegionColor.value.setStyle(item.data.colorId);
                
                let u = -1, v = -1;
                if (item.data.uv) { u = item.data.uv.u; v = item.data.uv.v; }
                else if (item.data.u !== undefined) { u = item.data.u; v = item.data.v; }
                else if (item.data.position) { u = (item.data.position.x + 30) / 60; v = 1.0 - ((item.data.position.y + 20) / 40); }
                const width = item.data.textWidthUV || 0.15;
                this._hoverTextUVTarget.set(u, v, width);
            }
        } else {
            this.mapMaterial.userData.uHoveredRegionColor.value.setRGB(-1, -1, -1);
            this._hoverTextUVTarget.set(-1, -1, 1);
        }
    }

    clearHovers() {
        if (this.hoveredMeshId !== null) {
            this.hoveredMeshId = null;
            
            if (this._overviewHoveredId !== null) {
                this.setOverviewHover(null);
            }
            if (this._hoveredRegionId !== null) {
                this.setHoveredRegion(null);
            }
            this.updateMarkerStates();
        }
    }

    updateMarkerStates() {
        for (const item of this.registry.getAll()) {
            if (item.mesh && item.mesh.userData && 'targetScale' in item.mesh.userData) {
                const us = item.mesh.userData;
                const isHovered = (item.data.id === this._hoveredRegionId || item.data.id === this.hoveredMeshId);
                
                // Lógica de Focus
                let isFocused = true;
                if (this._focusedRegionName && item.type === 'otro') {
                    isFocused = (item.data.region === this._focusedRegionName);
                }

                if (!isFocused) {
                    us.targetScale = 0.0;
                } else {
                    us.targetScale = isHovered ? 1.5 : 1.0;
                }

                // Agrandar la fuente en el DOM
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
        
        // Hover
        if (this.mapMaterial.userData.uHoveredRegionColor) {
            if (this._hoveredRegionId) {
                const item = this.registry.getById(this._hoveredRegionId);
                if (item && item.data.colorId) {
                    this.mapMaterial.userData.uHoveredRegionColor.value.setStyle(item.data.colorId);
                    
                    let u = -1, v = -1;
                    if (item.data.uv) { u = item.data.uv.u; v = item.data.uv.v; }
                    else if (item.data.u !== undefined) { u = item.data.u; v = item.data.v; }
                    else if (item.data.position) { u = (item.data.position.x + 30) / 60; v = 1.0 - ((item.data.position.y + 20) / 40); }
                    const width = item.data.textWidthUV || 0.15;
                    this._hoverTextUVTarget.set(u, v, width);
                } else {
                    this.mapMaterial.userData.uHoveredRegionColor.value.setRGB(-1, -1, -1);
                    this._hoverTextUVTarget.set(-1, -1, 1);
                }
            } else {
                this.mapMaterial.userData.uHoveredRegionColor.value.setRGB(-1, -1, -1);
                this._hoverTextUVTarget.set(-1, -1, 1);
            }
        }
        
        // Focus
        if (this.mapMaterial.userData.uFocusedRegionColor) {
            if (this._focusedRegionId) {
                const item = this.registry.getById(this._focusedRegionId);
                if (item && item.data.colorId) {
                    this.mapMaterial.userData.uFocusedRegionColor.value.setStyle(item.data.colorId);
                    
                    let u = -1, v = -1;
                    if (item.data.uv) { u = item.data.uv.u; v = item.data.uv.v; }
                    else if (item.data.u !== undefined) { u = item.data.u; v = item.data.v; }
                    else if (item.data.position) { u = (item.data.position.x + 30) / 60; v = 1.0 - ((item.data.position.y + 20) / 40); }
                    const width = item.data.textWidthUV || 0.15;
                    if (this.mapMaterial.userData.uFocusTextUV) {
                        this.mapMaterial.userData.uFocusTextUV.value.set(u, v, width);
                    }
                } else {
                    this.mapMaterial.userData.uFocusedRegionColor.value.setRGB(-1, -1, -1);
                    if (this.mapMaterial.userData.uFocusTextUV) {
                        this.mapMaterial.userData.uFocusTextUV.value.set(-1, -1, 1);
                    }
                }
            } else {
                this.mapMaterial.userData.uFocusedRegionColor.value.setRGB(-1, -1, -1);
                if (this.mapMaterial.userData.uFocusTextUV) {
                    this.mapMaterial.userData.uFocusTextUV.value.set(-1, -1, 1);
                }
            }
        }
    }

    // Llamar cada frame desde MarkerManager.update
    updateFrame(mapReady, cameraState, hasPendingFocus) {
        const isCameraReady = (cameraState === 'PLAYING' || cameraState === 'FLY_TO');

        if (this.mapMaterial && this.mapMaterial.userData.uRegionOpacity) {
            const targetOpacity = isCameraReady ? 1.0 : 0.0;
            this.mapMaterial.userData.uRegionOpacity.value = THREE.MathUtils.lerp(
                this.mapMaterial.userData.uRegionOpacity.value, targetOpacity, 0.15
            );
        }

        if (this.mapMaterial && this.mapMaterial.userData.uHoverRegionAlpha) {
            const overviewHoverActive = !mapReady && this._overviewHoveredId !== null;
            const hoveredId = this._hoveredRegionId || (overviewHoverActive ? this._overviewHoveredId : null);
            const targetHoverAlpha = (hoveredId && hoveredId !== this._focusedRegionId) ? 1.0 : 0.0;
            this.mapMaterial.userData.uHoverRegionAlpha.value = THREE.MathUtils.lerp(
                this.mapMaterial.userData.uHoverRegionAlpha.value, targetHoverAlpha, 0.1
            );
        }

        if (this.mapMaterial && this.mapMaterial.userData.uHoverTextAlpha) {
            const overviewHoverActive = !mapReady && this._overviewHoveredId !== null;
            const targetHoverText = (this._hoveredRegionId !== null || overviewHoverActive) ? 1.0 : 0.0;
            this.mapMaterial.userData.uHoverTextAlpha.value = THREE.MathUtils.lerp(
                this.mapMaterial.userData.uHoverTextAlpha.value, targetHoverText, 0.12
            );
        }

        if (this.mapMaterial && this.mapMaterial.userData.uOverviewMode) {
            this.mapMaterial.userData.uOverviewMode.value = mapReady ? 0.0 : 1.0;
        }

        if (this.mapMaterial && this.mapMaterial.userData.uHoverTextUV) {
            const hovering = (this._hoveredRegionId !== null || this._overviewHoveredId !== null);
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
            const targetFocusAlpha = (this._focusedRegionId !== null || hasPendingFocus) ? 1.0 : 0.0;
            this.mapMaterial.userData.uFocusedRegionAlpha.value = THREE.MathUtils.lerp(
                this.mapMaterial.userData.uFocusedRegionAlpha.value, targetFocusAlpha, 0.15
            );
        }

        // Lerp del scale
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
