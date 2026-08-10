import * as THREE from 'three';
import { RegionTexturePainter } from './RegionTexturePainter.js';
import { MarkerBuilder } from './MarkerBuilder.js';

// Umbral de zoomAlpha a partir del cual cada tipo se hace visible.
// zoomAlpha: 0.0 = máximo zoom in (cerca), 1.0 = máximo zoom out (lejos).
// Un marcador aparece cuando zoomAlpha <= su threshold.
const ZOOM_THRESHOLD = {
    region: 1.1,  // siempre visible (mayor que cualquier valor posible de zoomAlpha)
    isla:   0.60,
    lago:   0.60,
    otro:   0.30
};

export class MarkerManager {
    /**
     * @param {THREE.Group}  mapPlaneGroup - Grupo rotado del mapa (meshes 3D de iconos)
     * @param {THREE.Scene}  scene         - Escena raiz (labels CSS2D, sin rotación)
     */
    constructor(mapPlaneGroup, scene, mapMaterial, camera, domElement) {
        this.mapPlaneGroup = mapPlaneGroup;
        this.scene = scene;
        this.mapMaterial = mapMaterial;
        this.camera = camera;
        this.domElement = domElement;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2(-1, -1);
        this._lastRaycastMouse = new THREE.Vector2(-10, -10); // caché para no raycastear si no se mueve
        this.hoveredMeshId = null;
        this._focusedRegionId = null; // Región seleccionada (focus)
        
        // Tracking para diferenciar click real vs drag (paneo)
        this._mouseDownPos = new THREE.Vector2(-1000, -1000);

        // Limpiar focus si se hace click en el canvas (fuera de las etiquetas HTML)
        if (this.domElement) {
            this.domElement.addEventListener('pointerdown', (e) => {
                this._mouseDownPos.set(e.clientX, e.clientY);
            });

            this.domElement.addEventListener('pointerup', (e) => {
                const dx = e.clientX - this._mouseDownPos.x;
                const dy = e.clientY - this._mouseDownPos.y;
                if (Math.sqrt(dx * dx + dy * dy) > 5) return; // Fue un paneo, ignorar

                // Si estamos en modo editor, ignorar (el editor maneja sus propios clicks)
                const editorPanel = document.getElementById('map-editor-panel');
                if (editorPanel && editorPanel.style.display !== 'none') return;
                
                if (this.hoveredMeshId) {
                    const item = this._items.find(i => i.data && i.data.id === this.hoveredMeshId);
                if (item && ['region', 'mar', 'oceano'].includes(item.type)) {
                        // Solo volar: SIEMPRE al hacer click en una region
                        window.dispatchEvent(new CustomEvent('marker:region-fly-request', {
                            detail: { worldPos: item.worldPos.clone(), name: item.data.name }
                        }));

                        if (this._mapReady) {
                            // Solo si ya está en el estado interactuable cercano: guardar para abrir panel al aterrizar
                            if (this._focusedRegionId !== null) this.setFocusedRegion(null);
                            this._pendingFocusItem = item;
                        }
                        return;
                }
                }

                // Si llegamos hasta acá, fue un click en el WebGL canvas vacío.
                // Limpiamos el focus para volver al estado global.
                if (this._focusedRegionId !== null || this._pendingFocusItem !== undefined) {
                    this._pendingFocusItem = null;
                    this.setFocusedRegion(null);
                    window.dispatchEvent(new CustomEvent('marker:region-unhover'));
                }
            });

            // Escuchar cuando el panel lateral se cierra para limpiar el focus
            window.addEventListener('region-panel-closed', () => {
                if (this._focusedRegionId !== null) {
                    this.setFocusedRegion(null);
                }
            });

            // Escuchar cuando la cámara termina de volar para abrir el panel pendiente
            window.addEventListener('camera-flight-finished', () => {
                if (this._pendingFocusItem) {
                    const item = this._pendingFocusItem;
                    this.setFocusedRegion(item.data.id);
                    window.dispatchEvent(new CustomEvent('marker:region-open-panel', {
                        detail: { worldPos: item.worldPos.clone(), name: item.data.name }
                    }));
                    this._pendingFocusItem = null;
                }
            });
        }

        if (this.domElement) {
            this.domElement.addEventListener('mousemove', (e) => {
                const rect = this.domElement.getBoundingClientRect();
                this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                this._lastClientX = e.clientX;
                this._lastClientY = e.clientY;
            });
        }

        // Grupo plano sin rotación en la escena raíz.
        this._labelRoot = new THREE.Group();
        if (this.scene) this.scene.add(this._labelRoot);

        // Grupo dedicado para los meshes 3D de los marcadores
        this.markersGroup = new THREE.Group();
        this.markersGroup.name = "markersGroup";
        if (this.mapPlaneGroup) this.mapPlaneGroup.add(this.markersGroup);

        // Registro de todos los items activos para el sistema LOD de visibilidad.
        this._items = [];

        // Cache del último zoomAlpha procesado
        this._lastZoomAlpha = -1;
        this._lastCameraReady = null;
        this._areShapesVisible = false;

        // Flag: solo se activan hover/tooltip/focus cuando la camara llego al estado interactuable cercano
        this._mapReady = false;
        this._overviewHoveredId = null;

        window.addEventListener('map:ready', () => { 
            this._mapReady = true;
            this.setOverviewHover(null); 
        });
        window.addEventListener('map:zoom-out', () => {
            this._mapReady = false;
            this.setOverviewHover(null);
            // Limpiar hover al alejarse
            if (this._hoveredRegionId !== null) this.setHoveredRegion(null);
            if (this.hoveredMeshId !== null) {
                this.hoveredMeshId = null;
                this._updateMarkerStates();
            }
        });

        // Instanciar delegados
        this.texturePainter = new RegionTexturePainter(mapMaterial);
        this.builder = new MarkerBuilder(this);
    }

    spawnVisualMarker(data) {
        this.builder.spawnVisualMarker(data);
    }

    setHoveredRegion(regionId, silent = false) {
        if (this._hoveredRegionId !== regionId) {
            this._hoveredRegionId = regionId;
            if (!silent) {
                this._updateShaderRegionColor();

                if (regionId) {
                    const item = this._items.find(i => i.data.id === regionId);
                    
                    window.dispatchEvent(new CustomEvent('marker:region-hover', {
                        detail: { name: item.data.name, worldPos: item.worldPos.clone() }
                    }));
                } else {
                    window.dispatchEvent(new CustomEvent('marker:region-unhover'));
                }
            }
        }
    }

    setOverviewHover(regionId, silent = false) {
        if (this._overviewHoveredId === regionId) return;
        this._overviewHoveredId = regionId;

        if (!this.mapMaterial || !this.mapMaterial.userData.uHoveredRegionColor) return;
        
        if (regionId) {
            const item = this._items.find(i => i.data.id === regionId);
            if (item && item.data.colorId) {
                this.mapMaterial.userData.uHoveredRegionColor.value.setStyle(item.data.colorId);
                
                let u = -1, v = -1;
                if (item.data.uv) { u = item.data.uv.u; v = item.data.uv.v; }
                else if (item.data.u !== undefined) { u = item.data.u; v = item.data.v; }
                else if (item.data.position) { u = (item.data.position.x + 30) / 60; v = 1.0 - ((item.data.position.y + 20) / 40); }
                const width = item.data.textWidthUV || 0.15;
                if (this.mapMaterial.userData.uHoverTextUV) {
                    this.mapMaterial.userData.uHoverTextUV.value.set(u, v, width);
                }
            }
        } else {
            this.mapMaterial.userData.uHoveredRegionColor.value.setRGB(-1, -1, -1);
            if (this.mapMaterial.userData.uHoverTextUV) {
                this.mapMaterial.userData.uHoverTextUV.value.set(-1, -1, 1);
            }
        }
    }

    setFocusedRegion(regionId) {
        if (this._focusedRegionId !== regionId) {
            this._focusedRegionId = regionId;
            if (regionId) {
                const r = this._items.find(i => i.data.id === regionId);
                this._focusedRegionName = r ? r.data.name : null;
            } else {
                this._focusedRegionName = null;
            }
            this._updateShaderRegionColor();
            this._updateMarkerStates();
        }
    }

    _updateMarkerStates() {
        for (const item of this._items) {
            if (item.mesh && item.mesh.userData && 'targetScale' in item.mesh.userData) {
                const us = item.mesh.userData;
                const isHovered = (item.data.id === this._hoveredRegionId || item.data.id === this.hoveredMeshId);
                
                // Lógica de Focus: si hay un foco activo, el targetScale de los ajenos va a 0
                let isFocused = true;
                if (this._focusedRegionName && item.type === 'otro') {
                    isFocused = (item.data.region === this._focusedRegionName);
                }

                if (!isFocused) {
                    us.targetScale = 0.0;
                } else {
                    us.targetScale = isHovered ? 1.5 : 1.0;
                }

                // Forzar agrandar la fuente en el DOM sin thrashing (solo al cambiar estado)
                if (item.label && item.type === 'otro') {
                    if (isHovered && !us.wasHoveredDOM && isFocused) {
                        item.label.element.style.setProperty('font-size', '14px', 'important');
                        us.wasHoveredDOM = true;
                    } else if ((!isHovered || !isFocused) && us.wasHoveredDOM) {
                        item.label.element.style.removeProperty('font-size'); // Vuelve al comportamiento default CSS
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
                const item = this._items.find(i => i.data && i.data.id === this._hoveredRegionId);
                if (item && item.data.colorId) {
                    this.mapMaterial.userData.uHoveredRegionColor.value.setStyle(item.data.colorId);
                    
                    let u = -1, v = -1;
                    if (item.data.uv) { u = item.data.uv.u; v = item.data.uv.v; }
                    else if (item.data.u !== undefined) { u = item.data.u; v = item.data.v; }
                    else if (item.data.position) { u = (item.data.position.x + 30) / 60; v = 1.0 - ((item.data.position.y + 20) / 40); }
                    const width = item.data.textWidthUV || 0.15;
                    if (this.mapMaterial.userData.uHoverTextUV) {
                        this.mapMaterial.userData.uHoverTextUV.value.set(u, v, width);
                    }
                } else {
                    this.mapMaterial.userData.uHoveredRegionColor.value.setRGB(-1, -1, -1);
                    if (this.mapMaterial.userData.uHoverTextUV) {
                        this.mapMaterial.userData.uHoverTextUV.value.set(-1, -1, 1);
                    }
                }
            } else {
                this.mapMaterial.userData.uHoveredRegionColor.value.setRGB(-1, -1, -1);
                if (this.mapMaterial.userData.uHoverTextUV) {
                    this.mapMaterial.userData.uHoverTextUV.value.set(-1, -1, 1);
                }
            }
        }
        
        // Focus
        if (this.mapMaterial.userData.uFocusedRegionColor) {
            if (this._focusedRegionId) {
                const item = this._items.find(i => i.data && i.data.id === this._focusedRegionId);
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

    /**
     * Actualizar visibilidad de marcadores según el nivel de zoom actual.
     * Llamar cada frame desde el bucle animate().
     *
     * @param {number} zoomAlpha - 0.0 = máximo zoom in (cerca), 1.0 = máximo zoom out (lejos)
     */
    update(zoomAlpha, cameraState) {
        const isCameraReady = (cameraState === 'PLAYING' || cameraState === 'FLY_TO');

        // Manejar la opacidad global de la textura dinámica de regiones en el shader
        if (this.mapMaterial && this.mapMaterial.userData.uRegionOpacity) {
            const targetOpacity = isCameraReady ? 1.0 : 0.0;
            this.mapMaterial.userData.uRegionOpacity.value = THREE.MathUtils.lerp(
                this.mapMaterial.userData.uRegionOpacity.value, 
                targetOpacity, 
                0.05
            );
        }

        // Manejar el fade in/out del mapa político (Hover)
        if (this.mapMaterial && this.mapMaterial.userData.uHoverRegionAlpha) {
            // El hover no se muestra si la misma región está focuseada (para no mezclar textura y color)
            const targetHoverAlpha = (this._hoveredRegionId && this._hoveredRegionId !== this._focusedRegionId) ? 1.0 : 0.0;
            this.mapMaterial.userData.uHoverRegionAlpha.value = THREE.MathUtils.lerp(
                this.mapMaterial.userData.uHoverRegionAlpha.value, 
                targetHoverAlpha, 
                0.1
            );
        }
        
        // Manejar el fade in/out del mapa político (Focus)
        if (this.mapMaterial && this.mapMaterial.userData.uFocusedRegionAlpha) {
            const targetFocusAlpha = this._focusedRegionId ? 1.0 : 0.0;
            this.mapMaterial.userData.uFocusedRegionAlpha.value = THREE.MathUtils.lerp(
                this.mapMaterial.userData.uFocusedRegionAlpha.value, 
                targetFocusAlpha, 
                0.1
            );
        }

        // Determinar si debemos congelar la actualización masiva de DOM/Meshes del LOD
        // Como ya optimizamos la textura, el LOD es muy liviano. NO congelamos en FLY_TO
        // para que las ciudades "florezcan" orgánicamente mientras nos acercamos.
        const shouldFreezeLOD = (cameraState === 'INIT' || cameraState === 'WAIT_INPUT');

        const currentShowVisual = window._showVisualMarkers !== false;
        
        let needsRedraw = false;
        
        // Forzar chequeo de LOD si el focus cambió (solo si no estamos congelados)
        if (!shouldFreezeLOD && this._lastFocusedRegionId !== this._focusedRegionId) {
            this._lastFocusedRegionId = this._focusedRegionId;
            needsRedraw = true;
        }

        // Raycasting: activo en PLAYING siempre.
        // En modo overview (!_mapReady): solo ilumina el shader (sin tooltip ni textura).
        // En modo interactuable (_mapReady): hover completo con tooltip y efectos.
        if (this.camera && cameraState === 'PLAYING') {
            const now = performance.now();
            if (!this._lastRaycastTime || now - this._lastRaycastTime > 50) { // Throttling: max ~20 FPS
                this._lastRaycastTime = now;
                if (this.mouse.x !== this._lastRaycastMouse.x || this.mouse.y !== this._lastRaycastMouse.y) {
                    this._lastRaycastMouse.copy(this.mouse);
                    
                    let newHoveredMeshId = null;
                    
                    this.raycaster.setFromCamera(this.mouse, this.camera);
                    // recursive=true para detectar meshes dentro de grupos (lodLevelGroup)
                    const intersects = this.raycaster.intersectObjects(this.markersGroup.children, true);
                    for (let i = 0; i < intersects.length; i++) {
                        const obj = intersects[i].object;
                        if (obj.visible && obj.userData && obj.userData.id) {
                            newHoveredMeshId = obj.userData.id;
                            break;
                        }
                    }
                    
                    if (this.hoveredMeshId !== newHoveredMeshId) {
                        this.hoveredMeshId = newHoveredMeshId;
                        
                        if (this.domElement) {
                            this.domElement.style.cursor = newHoveredMeshId ? 'pointer' : 'grab';
                        }
                        
                        // Si el mesh que hovereamos es una region, la establecemos como hoveredRegion u overviewHovered
                        const item = this._items.find(i => i.data && i.data.id === newHoveredMeshId);
                        if (item && item.type === 'region') {
                            if (this._mapReady) {
                                this.setHoveredRegion(newHoveredMeshId);
                            } else {
                                this.setOverviewHover(newHoveredMeshId);
                            }
                        } else if (!newHoveredMeshId || (item && item.type !== 'region')) {
                            if (this._mapReady) {
                                if (this._hoveredRegionId !== null) this.setHoveredRegion(null);
                            } else {
                                this.setOverviewHover(null);
                            }
                        }
                        this._updateMarkerStates();
                    }
                }
            }
        } else {
            if (this.hoveredMeshId !== null) {
                this.hoveredMeshId = null;
                
                if (this._overviewHoveredId !== null) {
                    if (this._pendingFocusItem) {
                        this.setOverviewHover(null, true);
                    } else {
                        this.setOverviewHover(null);
                    }
                }

                if (this._hoveredRegionId !== null) {
                    // Si hay un vuelo pendiente a una región, limpiar el hover en silencio
                    // para evitar el repintado pesado del canvas 4096x4096 durante el primer frame del vuelo.
                    if (this._pendingFocusItem) {
                        this._hoveredRegionId = null;
                        if (this.mapMaterial && this.mapMaterial.userData.uHoveredRegionColor) {
                            this.mapMaterial.userData.uHoveredRegionColor.value.setRGB(-1, -1, -1);
                        }
                    } else {
                        this.setHoveredRegion(null);
                    }
                }
                this._updateMarkerStates();
            }
        }

        // Lerp del scale hacia targetScale
        for (const item of this._items) {
            if (item.mesh && item.mesh.userData && 'targetScale' in item.mesh.userData) {
                const us = item.mesh.userData;
                // Lerp suave del scale solo si no ha alcanzado la meta
                if (Math.abs(us.currentScale - us.targetScale) > 0.001) {
                    us.currentScale = THREE.MathUtils.lerp(us.currentScale, us.targetScale, 0.15);
                    item.mesh.scale.set(us.currentScale, us.currentScale, 1.0);
                }
            }
        }

        // Solo actualizar el resto del DOM si el zoom o el toggle cambiaron.
        if (shouldFreezeLOD) return; 

        if (!needsRedraw && Math.abs(zoomAlpha - this._lastZoomAlpha) < 0.005 && currentShowVisual === this._lastShowVisualMarkers) return;
        this._lastZoomAlpha = zoomAlpha;
        this._lastShowVisualMarkers = currentShowVisual;

        for (const item of this._items) {
            const threshold = ZOOM_THRESHOLD[item.type] ?? 0.30;
            // Solo hacer visibles los marcadores si la cámara ya terminó de explorar e inició el juego
            let visible = isCameraReady && (zoomAlpha <= threshold);
            
            // Si hay un focus activo y este es un marcador 'otro', ocultarlo si no pertenece a la región enfocada
            if (visible && this._focusedRegionName && item.type === 'otro') {
                if (item.data.region !== this._focusedRegionName) {
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
        
        if (needsRedraw) {
            // Ya no repintamos textura en CPU, todo pasa en GPU!
        }
    }

    clearSceneMarkers() {
        // Limpiar meshes 3D de markersGroup de forma directa sin traverse recursivo
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

        // Limpiar labels CSS2D
        const labelsToRemove = [...this._labelRoot.children];
        labelsToRemove.forEach(obj => {
            this._labelRoot.remove(obj);
            if (obj.element && obj.element.parentNode) {
                obj.element.parentNode.removeChild(obj.element);
            }
        });

        // Limpiar registro LOD
        this._items = [];
    }

    renderAll(markersList) {
        this.clearSceneMarkers();
        markersList.forEach(data => this.spawnVisualMarker(data));
        this.texturePainter.initTextures(markersList);
    }
}