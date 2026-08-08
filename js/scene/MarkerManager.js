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
                        // Clickeamos una región 3D
                        this.setFocusedRegion(item.data.id);
                        window.dispatchEvent(new CustomEvent('marker:region-click', {
                            detail: { worldPos: item.worldPos.clone(), name: item.data.name }
                        }));
                        return; // Consumimos el click
                    }
                }

                // Si llegamos hasta acá, fue un click en el WebGL canvas vacío.
                // Limpiamos el focus para volver al estado global.
                if (this._focusedRegionId !== null) {
                    this.setFocusedRegion(null);
                }
            });
        }

        if (this.domElement) {
            this.domElement.addEventListener('mousemove', (e) => {
                const rect = this.domElement.getBoundingClientRect();
                this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
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

        // Instanciar delegados
        this.texturePainter = new RegionTexturePainter(mapMaterial);
        this.builder = new MarkerBuilder(this);
    }

    spawnVisualMarker(data) {
        this.builder.spawnVisualMarker(data);
    }

    setHoveredRegion(regionId) {
        if (this._hoveredRegionId !== regionId) {
            this._hoveredRegionId = regionId;
            this.texturePainter.updateRegionTexture(this._items.map(i => i.data), this._hoveredRegionId, this._focusedRegionId);
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
            this.texturePainter.updateRegionTexture(this._items.map(i => i.data), this._hoveredRegionId, this._focusedRegionId);
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

        const currentShowVisual = window._showVisualMarkers !== false;
        
        const areShapesVisible = isCameraReady && (zoomAlpha <= 0.30);
        let needsRedraw = false;
        if (this._areShapesVisible !== areShapesVisible) {
            this._areShapesVisible = areShapesVisible;
            needsRedraw = true;
        }
        
        // Forzar chequeo de LOD si el focus cambió
        if (this._lastFocusedRegionId !== this._focusedRegionId) {
            this._lastFocusedRegionId = this._focusedRegionId;
            needsRedraw = true;
        }

        // Determinar qué figura 3D está bajo el cursor con Raycaster (optimizado)
        if (this.camera && isCameraReady) { // Hacemos raycast siempre que estemos explorando
            if (this.mouse.x !== this._lastRaycastMouse.x || this.mouse.y !== this._lastRaycastMouse.y) {
                this._lastRaycastMouse.copy(this.mouse);
                
                let newHoveredMeshId = null;
                
                this.raycaster.setFromCamera(this.mouse, this.camera);
                const intersects = this.raycaster.intersectObjects(this.markersGroup.children, false);
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
                        this.domElement.style.cursor = newHoveredMeshId ? 'pointer' : 'default';
                    }
                    
                    // Si el mesh que hovereamos es una region, la establecemos como hoveredRegion
                    const item = this._items.find(i => i.data && i.data.id === newHoveredMeshId);
                    if (item && ['region', 'mar', 'oceano'].includes(item.type)) {
                        this.setHoveredRegion(newHoveredMeshId);
                    } else if (!newHoveredMeshId || (item && !['region', 'mar', 'oceano'].includes(item.type))) {
                        // Si dejamos de hoverear una region, limpiamos la textura
                        if (this._hoveredRegionId !== null) {
                            this.setHoveredRegion(null);
                        }
                    }
                }
            }
        } else {
            if (this.hoveredMeshId !== null) {
                this.hoveredMeshId = null;
                if (this._hoveredRegionId !== null) this.setHoveredRegion(null);
            }
        }

        // Determinar qué marcadores interactivos están hovered y enfocados
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

                // Lerp suave del scale solo si no ha alcanzado la meta
                if (Math.abs(us.currentScale - us.targetScale) > 0.001) {
                    us.currentScale = THREE.MathUtils.lerp(us.currentScale, us.targetScale, 0.15);
                    item.mesh.scale.set(us.currentScale, us.currentScale, 1.0);
                }
            }
        }

        // Solo actualizar el resto del DOM si el zoom, el estado de cámara o el toggle cambiaron.
        if (!needsRedraw && Math.abs(zoomAlpha - this._lastZoomAlpha) < 0.005 && isCameraReady === this._lastCameraReady && currentShowVisual === this._lastShowVisualMarkers) return;
        this._lastZoomAlpha = zoomAlpha;
        this._lastCameraReady = isCameraReady;
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
                    // La transición de opacidad es suave gracias a la regla CSS transition en markers.css
                    item.label.element.style.opacity = visible ? '1' : '0';
                    // Habilitar pointer-events solo si es visible, para todas las etiquetas
                    item.label.element.style.pointerEvents = visible ? 'auto' : 'none';
                }

                // Icono 3D: ocultar también para no generar ruido visual
                if (item.mesh && !['region', 'mar', 'oceano'].includes(item.type)) {
                    item.mesh.visible = shouldMeshBeVisible;
                }
            }
        }
        
        if (needsRedraw) {
            this.texturePainter.updateRegionTexture(this._items.map(i => i.data), this._hoveredRegionId, this._focusedRegionId);
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
        this.texturePainter.updateRegionTexture(markersList, this._hoveredRegionId, this._focusedRegionId);
    }
}