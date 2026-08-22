import * as THREE from 'three';
import { MarkerBuilder } from './MarkerBuilder.js';
import { MarkerRegistry } from './MarkerRegistry.js';
import { RegionTexturePainter } from './RegionTexturePainter.js';
import { MarkerInteractionState } from './MarkerInteractionState.js';
import { MarkerVisualController } from './MarkerVisualController.js';
import { MarkerLODSystem } from './MarkerLODSystem.js';
import { MarkerRaycaster } from './MarkerRaycaster.js';
import { ContinentRules } from './ContinentRules.js';

export class MarkerManager {
    get _items() { return this._registry.getAll(); }
    get _itemsMap() { return this._registry.itemsMap; }

    constructor(mapPlaneGroup, scene, mapMaterial, camera, domElement, getSurfaceHeight, eventBus) {
        this.mapPlaneGroup = mapPlaneGroup;
        this.scene = scene;
        this.mapMaterial = mapMaterial;
        this.camera = camera;
        this.domElement = domElement;
        this.getSurfaceHeight = getSurfaceHeight || null;
        this.eventBus = eventBus;
        
        this._registry = new MarkerRegistry();
        this._interactionState = new MarkerInteractionState(this._registry);
        this._visualController = new MarkerVisualController(this._registry, this.mapMaterial, this._interactionState);
        this.texturePainter = new RegionTexturePainter(mapMaterial);
        
        this._lodSystem = new MarkerLODSystem(this._registry, this._interactionState, mapMaterial);

        // Debug state
        this._debugHitboxesVisible = false;
        
        this._mapReady = false;
        
        this._labelRoot = new THREE.Group();
        if (this.scene) this.scene.add(this._labelRoot);

        this.markersGroup = new THREE.Group();
        this.markersGroup.name = "markersGroup";
        if (this.mapPlaneGroup) {
            this.mapPlaneGroup.add(this.markersGroup);
            this.mapPlaneGroup.updateWorldMatrix(true, false);
        }

        this._raycasterSystem = new MarkerRaycaster(
            camera, domElement, mapPlaneGroup, this.markersGroup, 
            this._registry, getSurfaceHeight, this._interactionState
        );

        this.builder = new MarkerBuilder(this);

        this._setupEventListeners();
    }

    _setupEventListeners() {
        if (this.domElement) {
            this.eventBus.on('input:click', (e) => {
                const hoveredMeshId = this._interactionState.hoveredMeshId;
                if (hoveredMeshId) {
                    const item = this._registry.getById(hoveredMeshId);
                    if (item && ['continent', 'region'].includes(item.type)) {
                        const isOverviewClick = !this._mapReady;
                        if (!this._mapReady) {
                            if (item.type === 'continent') {
                                // Transition to PLAYING directly
                                this.eventBus.emit('ui:start-requested', { detail: {} });
                            } else {
                                return;
                            }
                        }

                        const regionName = item.data.name;
                        let placePositions = [];
                        if (item.type === 'continent') {
                            const rules = ContinentRules.getRulesFor(regionName);
                            placePositions = this._items
                                .filter(i => i.data.continent === regionName && rules.allowedTypesInPanel.includes(i.type))
                                .map(i => i.worldPos.clone());
                        } else {
                            placePositions = this._items
                                .filter(i => (i.data.region === regionName || i.data.continent === regionName)
                                    && ['otro', 'isla', 'lago', 'rio', 'ciudad', 'pueblo'].includes(i.type))
                                .map(i => i.worldPos.clone());
                        }

                        this.eventBus.emit('marker:region-fly-request', {
                            detail: {
                                worldPos: item.worldPos.clone(),
                                name: item.data.name,
                                placePositions: placePositions.length ? placePositions : null,
                                itemType: item.type,
                                isOverviewClick: isOverviewClick
                            }
                        });

                        if (this._mapReady) {
                            if (this._interactionState.getFocusedRegionId() !== null) {
                                this._interactionState.setFocusedRegion(null);
                            }
                            this._pendingFocusItem = item;
                            
                            if (this.mapMaterial) {
                                if (item.data.colorId && this.mapMaterial.userData.uFocusedRegionColor) {
                                    this.mapMaterial.userData.uFocusedRegionColor.value.setStyle(item.data.colorId);
                                }
                                let fu = -1, fv = -1;
                                if (item.data.uv) { fu = item.data.uv.u; fv = item.data.uv.v; }
                                else if (item.data.u !== undefined) { fu = item.data.u; fv = item.data.v; }
                                else if (item.data.position) { fu = (item.data.position.x + 30) / 60; fv = 1.0 - ((item.data.position.y + 20) / 40); }
                                const fwidth = item.data.textWidthUV || 0.15;
                                if (this.mapMaterial.userData.uFocusTextUV) {
                                    this.mapMaterial.userData.uFocusTextUV.value.set(fu, fv, fwidth);
                                }
                            }
                        }
                        return;
                    }
                }

                if (this._interactionState.getFocusedRegionId() !== null || this._pendingFocusItem !== undefined) {
                    this._pendingFocusItem = null;
                    this._interactionState.setFocusedRegion(null);
                    this.eventBus.emit('marker:region-unhover', { detail: {} });
                }
            });
        }

        this.eventBus.on('map:ready', () => { 
            this._mapReady = true;
            this._interactionState.setOverviewHover(null); 
        });

        this.eventBus.on('map:zoom-out', () => {
            this._mapReady = false;
            this._interactionState.setOverviewHover(null);
            if (this._interactionState.getHoveredRegionId() !== null) {
                this._interactionState.setHoveredRegion(null);
            }
            if (this._interactionState.hoveredMeshId !== null) {
                this._interactionState.hoveredMeshId = null;
            }
        });

        this.eventBus.on('marker:force-hover', (e) => {
            if (e.detail && e.detail.id) {
                this._raycasterSystem.setForcedHoverId(e.detail.id);
            }
        });

        this.eventBus.on('marker:force-unhover', (e) => {
            if (e.detail && e.detail.id === this._raycasterSystem._forcedHoverId) {
                this._raycasterSystem.setForcedHoverId(null);
            }
        });

        this.eventBus.on('region-panel-closed', () => {
            if (this._interactionState.getFocusedRegionId() !== null) {
                this._interactionState.setFocusedRegion(null);
            }
        });

        this.eventBus.on('continent-panel-closed', () => {
            if (this._interactionState.getFocusedRegionId() !== null) {
                this._interactionState.setFocusedRegion(null);
            }
        });

        this.eventBus.on('camera-flight-finished', () => {
            if (this._pendingFocusItem) {
                const item = this._pendingFocusItem;
                this._interactionState.setFocusedRegion(item.data.id);
                
                const regionName = item.data.name;
                let placesInRegion = [];
                if (item.type === 'continent') {
                    const rules = ContinentRules.getRulesFor(regionName);
                    placesInRegion = this._items
                        .filter(i => i.data.continent === regionName && rules.allowedTypesInPanel.includes(i.type));
                } else {
                    placesInRegion = this._items
                        .filter(i => (i.data.region === regionName || i.data.continent === regionName) && ['otro', 'isla', 'lago', 'rio', 'ciudad', 'pueblo'].includes(i.type));
                }

                const eventName = item.type === 'continent' ? 'marker:continent-open-panel' : 'marker:region-open-panel';
                this.eventBus.emit(eventName, {
                    detail: { 
                        worldPos: item.worldPos.clone(), 
                        name: item.data.name,
                        places: placesInRegion.map(i => i.data),
                        placePositions: placesInRegion.map(i => i.worldPos.clone())
                    }
                });
                this._pendingFocusItem = null;
            }
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === '2') {
                this._debugHitboxesVisible = !this._debugHitboxesVisible;
                this.markersGroup.children.forEach(child => {
                    const isHitbox = (child.userData && child.userData.isHitbox === true)
                        || (child.material && child.material.color && child.material.color.getHex() === 0xff0000);
                    if (isHitbox) {
                        child.material.opacity = this._debugHitboxesVisible ? 0.4 : 0.0;
                        child.material.wireframe = this._debugHitboxesVisible;
                    }
                });
            }
        });

        window.addEventListener('map:lod-text-change', (e) => {
            const lodLevel = e.detail.lod;
            this.texturePainter.initTextures(this._items.map(i => i.data), true, lodLevel);
        });
    }

    update(zoomAlpha, cameraState, isDragging = false) {
        const pendingFocusId = this._pendingFocusItem ? this._pendingFocusItem.data.id : null;
        this._visualController.updateFrame(this._mapReady, cameraState, pendingFocusId);
        this._lodSystem.update(zoomAlpha, cameraState);

        const { hoveredId, changed } = this._raycasterSystem.updateRaycast(cameraState, isDragging, this._mapReady);
        
        if (changed) {
            const item = this._registry.getById(hoveredId);
            if (item && (item.type === 'region' || item.type === 'continent')) {
                if (this._mapReady) {
                    if (this._interactionState.setHoveredRegion(hoveredId)) {
                        const detail = { name: item.data.name, worldPos: item.worldPos.clone() };
                        const box = item.mesh && item.mesh.userData && item.mesh.userData.hit;
                        if (box && this.mapPlaneGroup) {
                            this.mapPlaneGroup.updateWorldMatrix(true, false);
                            const cos = Math.cos(box.rot), sin = Math.sin(box.rot);
                            const hw = box.w / 2, hh = box.h / 2;
                            detail.rectCorners = [
                                [ hw,  hh], [-hw,  hh],
                                [-hw, -hh], [ hw, -hh]
                            ].map(([ox, oy]) => {
                                const p = new THREE.Vector3(
                                    box.cx + ox * cos - oy * sin,
                                    box.cy + ox * sin + oy * cos,
                                    box.zAnchor
                                );
                                return this.mapPlaneGroup.localToWorld(p);
                            });
                        }
                        this.eventBus.emit('marker:region-hover', { detail });
                    }
                } else {
                    if (item.type === 'continent') {
                        this._interactionState.setOverviewHover(hoveredId);
                    } else {
                        this._interactionState.setOverviewHover(null);
                    }
                }
            } else if (!hoveredId || (item && item.type !== 'region' && item.type !== 'continent')) {
                if (this._mapReady) {
                    if (this._interactionState.setHoveredRegion(null)) {
                        this.eventBus.emit('marker:region-unhover', { detail: {} });
                    }
                } else {
                    this._interactionState.setOverviewHover(null);
                }
            }
        } else if (!this.camera || cameraState !== 'PLAYING' || isDragging) {
            if (this._interactionState.hoveredMeshId !== null) {
                this._interactionState.hoveredMeshId = null;
                this._interactionState.setOverviewHover(null);
                const hadHover = this._interactionState.setHoveredRegion(null);
                
                if (hadHover && !this._pendingFocusItem) {
                    this.eventBus.emit('marker:region-unhover', { detail: {} });
                }
            }
        }
    }

    spawnVisualMarker(data) {
        this.builder.spawnVisualMarker(data);
    }

    clearSceneMarkers() {
        if (this.markersGroup) {
            const toRemove = [...this.markersGroup.children];
            toRemove.forEach(obj => {
                this.markersGroup.remove(obj);
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (obj.material.map) obj.material.map.dispose();
                    obj.material.dispose();
                }
            });
        }
        const labelsToRemove = [...this._labelRoot.children];
        labelsToRemove.forEach(obj => {
            this._labelRoot.remove(obj);
            if (obj.element && obj.element.parentNode) {
                obj.element.parentNode.removeChild(obj.element);
            }
        });
        this._registry.clearAndDispose();
    }

    renderAll(markersList) {
        this.clearSceneMarkers();
        markersList.forEach(data => this.spawnVisualMarker(data));
        this.texturePainter.initTextures(markersList);
    }
}