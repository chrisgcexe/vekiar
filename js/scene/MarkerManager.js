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
        // Estado para la transición suave del texto de región:
        // _hoverTextUV (posición real lerpeada por frame) y _hoverTextUVTarget (objetivo).
        this._hoverTextUV = new THREE.Vector3(-1, -1, 1);
        this._hoverTextUVTarget = new THREE.Vector3(-1, -1, 1);


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
                    const item = this._itemsMap.get(this.hoveredMeshId);
                if (item && ['region', 'mar', 'oceano'].includes(item.type)) {
                        // Solo volar: SIEMPRE al hacer click en una region
                        window.dispatchEvent(new CustomEvent('marker:region-fly-request', {
                            detail: { worldPos: item.worldPos.clone(), name: item.data.name }
                        }));

                        if (this._mapReady) {
                            // Solo si ya está en el estado interactuable cercano: guardar para abrir panel al aterrizar
                            if (this._focusedRegionId !== null) this.setFocusedRegion(null);
                            this._pendingFocusItem = item;
                            
                            // Iluminar el texto del focus durante el vuelo (sin esperar a aterrizar),
                            // para que la luz persista de forma continua al pasar de hover a focus.
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
                    
                    // Buscar los lugares que pertenecen a esta región
                    const regionName = item.data.name;
                    const placesInRegion = this._items
                        .map(i => i.data)
                        .filter(d => d.region === regionName && ['otro', 'isla', 'lago', 'rio', 'ciudad', 'pueblo'].includes(d.type));

                    window.dispatchEvent(new CustomEvent('marker:region-open-panel', {
                        detail: { 
                            worldPos: item.worldPos.clone(), 
                            name: item.data.name,
                            places: placesInRegion 
                        }
                    }));
                    this._pendingFocusItem = null;
                }
            });
        }

        if (this.domElement) {
            // Cachear el rect del canvas — getBoundingClientRect() fuerza un layout reflow si se llama cada mousemove.
            this._canvasRect = this.domElement.getBoundingClientRect();
            window.addEventListener('resize', () => {
                this._canvasRect = this.domElement.getBoundingClientRect();
            }, { passive: true });

            this.domElement.addEventListener('pointermove', (e) => {
                const rect = this._canvasRect;
                this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                this._lastClientX = e.clientX;
                this._lastClientY = e.clientY;
            });

            // Al salir del canvas, sacar el cursor fuera de rango para provocar un raycast
            // que limpie el hover (el rayo ya no tocará ninguna hitbox/región).
            this.domElement.addEventListener('pointerleave', (e) => {
                if (e.pointerType && e.pointerType !== 'mouse') return;
                this.mouse.x = 2;
                this.mouse.y = 2;
                this._lastRaycastMouse.set(-999, -999); // Forzar reevaluación inmediata
                this._lastClientX = -1;
                this._lastClientY = -1;
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
        // Lookup O(1) por ID para evitar _items.find() en el bucle de renderizado.
        this._itemsMap = new Map();
        // Buffer reutilizable para el raycaster — evita crear un nuevo Array en cada cast.
        this._intersectsBuffer = [];

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

        // Hover interactivo remoto desde la UI HTML
        this._forcedHoverId = null;
        window.addEventListener('marker:force-hover', (e) => {
            if (e.detail && e.detail.id) {
                this._forcedHoverId = e.detail.id;
                if (this._lastRaycastMouse) this._lastRaycastMouse.set(-999, -999); // Forzar reevaluación inmediata
            }
        });
        window.addEventListener('marker:force-unhover', (e) => {
            if (e.detail && e.detail.id === this._forcedHoverId) {
                this._forcedHoverId = null;
                if (this._lastRaycastMouse) this._lastRaycastMouse.set(-999, -999); // Forzar reevaluación inmediata
            }
        });

        // Debug: Toggle de hitboxes con la tecla '2'
        this._debugHitboxesVisible = false;
        window.addEventListener('keydown', (e) => {
            if (e.key === '2') {
                this._debugHitboxesVisible = !this._debugHitboxesVisible;
                this.markersGroup.children.forEach(child => {
                    // Solo las hitboxes que creamos en MarkerBuilder (flag userData.isHitbox).
                    // Se mantiene el chequeo por color rojo como respaldo por si el flag falta.
                    const isHitbox = (child.userData && child.userData.isHitbox === true)
                        || (child.material && child.material.color && child.material.color.getHex() === 0xff0000);
                    if (isHitbox) {
                        child.material.opacity = this._debugHitboxesVisible ? 0.4 : 0.0;
                        child.material.wireframe = this._debugHitboxesVisible;
                    }
                });
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
                    const item = this._itemsMap.get(regionId);
                    
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
            const item = this._itemsMap.get(regionId);
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

    setFocusedRegion(regionId) {
        if (this._focusedRegionId !== regionId) {
            this._focusedRegionId = regionId;
            if (regionId) {
                const r = this._itemsMap.get(regionId);
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
                const item = this._itemsMap.get(this._hoveredRegionId);
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
                const item = this._itemsMap.get(this._focusedRegionId);
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
    update(zoomAlpha, cameraState, isDragging = false) {
        const isCameraReady = (cameraState === 'PLAYING' || cameraState === 'FLY_TO');

        // Manejar la opacidad global de la textura dinámica de regiones en el shader.
        // Ramp rápido para que las etiquetas (y por tanto el hover) sean visibles apenas
        // aparece el overview, sin tener que hacer un ciclo de zoom para verlas.
        if (this.mapMaterial && this.mapMaterial.userData.uRegionOpacity) {
            const targetOpacity = isCameraReady ? 1.0 : 0.0;
            this.mapMaterial.userData.uRegionOpacity.value = THREE.MathUtils.lerp(
                this.mapMaterial.userData.uRegionOpacity.value, 
                targetOpacity, 
                0.15
            );
        }

        // Manejar el fade in/out del mapa político (Hover)
        if (this.mapMaterial && this.mapMaterial.userData.uHoverRegionAlpha) {
            // El hover no se muestra si la misma región está focuseada (para no mezclar textura y color).
            // Funciona igual en overview (!_mapReady) que en el modo interactuable cercano.
            const overviewHoverActive = !this._mapReady && this._overviewHoveredId !== null;
            const hoveredId = this._hoveredRegionId || (overviewHoverActive ? this._overviewHoveredId : null);
            const targetHoverAlpha = (hoveredId && hoveredId !== this._focusedRegionId) ? 1.0 : 0.0;
            this.mapMaterial.userData.uHoverRegionAlpha.value = THREE.MathUtils.lerp(
                this.mapMaterial.userData.uHoverRegionAlpha.value, 
                targetHoverAlpha, 
                0.1
            );
        }
        // Fade del texto en hover: ilumina el texto bajo el cursor con el MISMO brillo de siempre,
        // tanto en modo interactuable (cercano) como en modo overview (!_mapReady).
        if (this.mapMaterial && this.mapMaterial.userData.uHoverTextAlpha) {
            const overviewHoverActive = !this._mapReady && this._overviewHoveredId !== null;
            const targetHoverText = (this._hoveredRegionId !== null || overviewHoverActive) ? 1.0 : 0.0;
            this.mapMaterial.userData.uHoverTextAlpha.value = THREE.MathUtils.lerp(
                this.mapMaterial.userData.uHoverTextAlpha.value, 
                targetHoverText, 
                0.12
            );
        }
        // Uniform de modo conservado por compatibilidad (ya no modifica el muestreo del shader).
        if (this.mapMaterial && this.mapMaterial.userData.uOverviewMode) {
            this.mapMaterial.userData.uOverviewMode.value = this._mapReady ? 0.0 : 1.0;
        }
        // Posición del texto de hover: se entrega de forma INSTANTÁNEA (sin barrido) sobre el
        // elemento hovereado, y el encendido/apagado se hace con el fade de alpha (más arriba).
        // Al desactivar (objetivo x < 0) CONSERVAMOS la última posición mientras el alpha esté
        // decayendo, para que el glow se apague suavemente desde esa misma región (fade out).
        // Solo cuando el alpha ya se apagó del todo neutralizamos la posición a un punto fuera
        // de la textura, garantizando que NO quede iluminación residual "pegada" a la última
        // región (regresión: antes esto se hacía directamente en setOverviewHover(null)).
        if (this.mapMaterial && this.mapMaterial.userData.uHoverTextUV) {
            const hovering = (this._hoveredRegionId !== null || this._overviewHoveredId !== null);
            const hoverAlpha = this.mapMaterial.userData.uHoverTextAlpha ?
                               this.mapMaterial.userData.uHoverTextAlpha.value : 0;
            if (this._hoverTextUVTarget.x >= 0) {
                // Hover activo: apuntar la posición al texto bajo el cursor (cambio instantáneo).
                this._hoverTextUV.copy(this._hoverTextUVTarget);
            } else if (!hovering && hoverAlpha <= 0.005) {
                // Sin hover y con el fade ya apagado: neutralizar para que isHoveredText ≈ 0
                // en todo el mapa y el glow no pueda quedarse encendido en una posición vieja.
                this._hoverTextUV.set(-1, -1, 1);
            }
            // Si hay objetivo pendiente o el fade aún está decayendo (hovering o hoverAlpha alto),
            // no tocamos _hoverTextUV y el glow se apaga desde la última posición.
            this.mapMaterial.userData.uHoverTextUV.value.copy(this._hoverTextUV);
        }
        

        

        
        // Manejar el fade in/out del mapa político (Focus).
        // Enciende desde el click (vuelo pendiente) y persiste hasta cerrar la ventana,
        // para que la luz no se apague durante el vuelo ni al abrir el panel.
        if (this.mapMaterial && this.mapMaterial.userData.uFocusedRegionAlpha) {
            const targetFocusAlpha = (this._focusedRegionId !== null || this._pendingFocusItem !== null) ? 1.0 : 0.0;
            this.mapMaterial.userData.uFocusedRegionAlpha.value = THREE.MathUtils.lerp(
                this.mapMaterial.userData.uFocusedRegionAlpha.value, 
                targetFocusAlpha, 
                0.15
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

        // Raycasting: activo en PLAYING siempre (excepto cuando se está arrastrando/paneando).
        // En modo overview (!_mapReady): solo ilumina el shader (sin tooltip ni textura).
        // En modo interactuable (_mapReady): hover completo con tooltip y efectos.
        if (this.camera && cameraState === 'PLAYING' && !isDragging) {
            const now = performance.now();
            if (!this._lastRaycastTime || now - this._lastRaycastTime > 50) { // Throttling: max ~20 FPS
                this._lastRaycastTime = now;
                if (this.mouse.x !== this._lastRaycastMouse.x || this.mouse.y !== this._lastRaycastMouse.y) {
                    this._lastRaycastMouse.copy(this.mouse);
                    
                    let newHoveredMeshId = null;
                    
                    this.raycaster.setFromCamera(this.mouse, this.camera);
                    this._intersectsBuffer.length = 0; // Limpiar sin crear nuevo Array
                    this.raycaster.intersectObjects(this.markersGroup.children, true, this._intersectsBuffer);
                    for (let i = 0; i < this._intersectsBuffer.length; i++) {
                        const obj = this._intersectsBuffer[i].object;
                        if (obj.visible && obj.userData && obj.userData.id) {
                            newHoveredMeshId = obj.userData.id;
                            break;
                        }
                    }
                    
                    if (this._forcedHoverId !== null) {
                        newHoveredMeshId = this._forcedHoverId;
                    }
                    
                    if (this.hoveredMeshId !== newHoveredMeshId) {
                        this.hoveredMeshId = newHoveredMeshId;
                        
                        if (this.domElement) {
                            this.domElement.style.cursor = newHoveredMeshId && !this._forcedHoverId ? 'pointer' : 'grab';
                        }
                        
                        // Si el mesh que hovereamos es una region, la establecemos como hoveredRegion u overviewHovered
                        const item = this._itemsMap.get(newHoveredMeshId);
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

        // Limpiar registro LOD + índice de búsqueda
        this._items = [];
        this._itemsMap.clear(); // Evita que el Map retenga referencias a objetos ya destruidos
    }

    renderAll(markersList) {
        this.clearSceneMarkers();
        markersList.forEach(data => this.spawnVisualMarker(data));
        this.texturePainter.initTextures(markersList);
    }
}