import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

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
        this.hoveredMeshId = null;

        if (this.domElement) {
            this.domElement.addEventListener('mousemove', (e) => {
                const rect = this.domElement.getBoundingClientRect();
                this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            });
        }

        // Grupo plano sin rotación en la escena raíz.
        // Los CSS2DObjects deben vivir aquí y NO en mapPlaneGroup (que tiene rotation.x = -PI/2
        // y escala no uniforme), para evitar jitter de sub-pixel en la proyección CSS2D.
        this._labelRoot = new THREE.Group();
        if (this.scene) this.scene.add(this._labelRoot);

        // Grupo dedicado para los meshes 3D de los marcadores (dentro del mapPlaneGroup)
        // para optimizar raycasting y limpieza.
        this.markersGroup = new THREE.Group();
        this.markersGroup.name = "markersGroup";
        if (this.mapPlaneGroup) this.mapPlaneGroup.add(this.markersGroup);

        // Registro de todos los items activos para el sistema LOD de visibilidad.
        this._items = [];

        // Cache del último zoomAlpha procesado: evita tocar el DOM cada frame
        // cuando el zoom no cambió significativamente (ahorro de layout/paint).
        this._lastZoomAlpha = -1;
        this._lastCameraReady = null;
        this._areShapesVisible = false;

        this._shapeTextures = {
            'circle': this._createShapeTexture('circle'),
            'square': this._createShapeTexture('square'),
            'triangle': this._createShapeTexture('triangle'),
            'diamond': this._createShapeTexture('diamond'),
            'star': this._createShapeTexture('star')
        };
    }

    _createShapeTexture(shape) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const size = 22;
        const cx = 32;
        const cy = 32;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'; // Negro sólido
        ctx.strokeStyle = 'rgba(240, 215, 140, 1.0)'; // Borde pergamino
        ctx.lineWidth = 4;

        ctx.translate(cx, cy);
        ctx.beginPath();
        if (shape === 'square') {
            ctx.rect(-size, -size, size * 2, size * 2);
        } else if (shape === 'triangle') {
            ctx.moveTo(0, -size);
            ctx.lineTo(size, size);
            ctx.lineTo(-size, size);
            ctx.closePath();
        } else if (shape === 'diamond') {
            ctx.moveTo(0, -size);
            ctx.lineTo(size, 0);
            ctx.lineTo(0, size);
            ctx.lineTo(-size, 0);
            ctx.closePath();
        } else if (shape === 'star') {
            const spikes = 5;
            const outer = size;
            const inner = size / 2.5;
            for (let i = 0; i < spikes * 2; i++) {
                const r = (i % 2 === 0) ? outer : inner;
                const angle = (i * Math.PI) / spikes - (Math.PI / 2);
                if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
                else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
            }
            ctx.closePath();
        } else {
            ctx.arc(0, 0, size, 0, Math.PI * 2);
        }
        
        ctx.fill();
        ctx.stroke();

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        return tex;
    }

    spawnVisualMarker(data) {
        let mesh = null;
        let geometry = null;
        const shape = data.shape || 'circle';
        const markerType = String(data.type || 'otro').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

        const posX = data.position ? data.position.x : data.x;
        const posY = data.position ? data.position.y : data.y;
        const posZ = data.position ? data.position.z : data.z;

        // --- Icono 3D ---
        const isTextSurface = ['region', 'mar', 'oceano'].includes(markerType);

        if (!isTextSurface && shape !== 'text') {
            // Reemplazamos los meshes 3D genéricos por planos texturizados con la figura elegida
            const sizeInWorld = 1.2; // Escala base en unidades del mundo
            geometry = new THREE.PlaneGeometry(sizeInWorld, sizeInWorld);
            const tex = this._shapeTextures[shape] || this._shapeTextures['circle'];
            const material = new THREE.MeshBasicMaterial({ 
                map: tex, 
                transparent: true, 
                depthWrite: false, 
                depthTest: false // Para evitar que se oculte debajo del terreno en relieves
            });
            
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(posX, posY, posZ + 0.1);
            
            // Si el marcador tiene rotación, se la aplicamos (sobre Z local porque es un plano XY)
            if (data.rotation) {
                mesh.rotation.z = -data.rotation * Math.PI / 180;
            }

            // Escala por defecto
            mesh.scale.set(1, 1, 1);
            // Guardar escala objetivo para el lerp de animación
            mesh.userData = { 
                id: data.id, name: data.name, region: data.region, type: markerType, 
                targetScale: 1.0, currentScale: 1.0 
            };
            this.markersGroup.add(mesh);
        } else if (isTextSurface) {
            // Generar un hitbox interactivo ajustado al texto
            const fSize = data.fontSize || 80;
            const textLen = data.name ? data.name.length : 10;
            const spacing = data.letterSpacing !== undefined ? data.letterSpacing : Math.floor(fSize * 0.25);
            
            // Aproximación de tamaño en píxeles
            const pixelWidth = textLen * (fSize * 0.65 + spacing);
            const pixelHeight = fSize * 2.0; // margen vertical
            
            // Convertir píxeles a unidades 3D (mapa de 60x40, textura de 4096x4096)
            let boxWidth = pixelWidth * (60 / 4096);
            let boxHeight = pixelHeight * (40 / 4096);
            
            // Si hay curvatura, hacemos el hitbox más alto para abarcar el arco
            if (data.curveRadius && Math.abs(data.curveRadius) > 0) {
                boxHeight += Math.min(Math.abs(data.curveRadius) * (40 / 4096) * 0.5, 10);
            }

            // Hitbox transparente (invisible pero clickeable)
            geometry = new THREE.PlaneGeometry(boxWidth, boxHeight);
            const material = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0, depthWrite: false });
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(posX, posY, posZ + 0.1);
            
            // Aplicar rotación (Three.js Z es antihorario, Canvas es horario, por eso el signo negativo)
            if (data.rotation) {
                mesh.rotation.z = -data.rotation * Math.PI / 180;
            }
            
            mesh.userData = { id: data.id, name: data.name, region: data.region, type: markerType };
            this.markersGroup.add(mesh);
        }

        // --- Label CSS2D ---
        if (data.name) {
            if (['mar', 'oceano'].includes(markerType)) {
                // Mares y océanos no tienen etiqueta interactiva CSS2D, solo textura de canvas
                this._items.push({ label: null, mesh, type: markerType, data, worldPos: new THREE.Vector3(posX, posY, posZ), isVisible: null });
            } else {
                const label = this._createTextLabel(data.name, markerType, data.id);

                // Convertir posición local del mapPlaneGroup a coordenadas del mundo.
                // mapPlaneGroup tiene rotation.x = -PI/2 y scale no uniforme, por eso usamos localToWorld.
                const localPos = new THREE.Vector3(
                    posX,
                    shape === 'text' ? posY : posY - 1.2,
                    posZ + 0.4
                );
                // Forzar actualización de la matriz del grupo antes de la conversión
                this.mapPlaneGroup.updateWorldMatrix(true, false);
                const worldPos = localPos.clone();
                this.mapPlaneGroup.localToWorld(worldPos);

                label.position.copy(worldPos);

                if (shape === 'text') {
                    label.userData = { id: data.id, name: data.name, region: data.region, type: markerType };
                }

                this._labelRoot.add(label);

                // Registrar en el sistema LOD (guardamos isVisible como null inicialmente)
                this._items.push({ label, mesh, type: markerType, data, worldPos: worldPos.clone(), isVisible: null });
            }
        }
    }

    /**
     * Crea un <div> CSS2DObject para el label.
     * Las regiones son clickeables: al hacer clic emiten 'marker:region-click'
     * para que CameraController haga un flyTo hacia esa región.
     */
    _createTextLabel(message, type, id) {
        const div = document.createElement('div');
        div.className = `marker-label marker-${type}`;
        div.textContent = message;
        if (id) div.dataset.markerId = id;

        if (type === 'region') {
            // Las regiones capturan clicks para el dolly de cámara.
            div.style.pointerEvents = 'auto';
            div.style.cursor = 'pointer';

            div.addEventListener('click', (e) => {
                // Verificar si el editor está activo. Si es así, no movemos la cámara, abrimos el inspector.
                const editorPanel = document.getElementById('map-editor-panel');
                if (editorPanel && editorPanel.style.display !== 'none') {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent('editor:open-inspector', { detail: { id } }));
                    return;
                }

                const item = this._items.find(i => i.data && i.data.id === id);
                if (item) {
                    window.dispatchEvent(new CustomEvent('marker:region-click', {
                        detail: { worldPos: item.worldPos.clone(), name: message }
                    }));
                }
            });
        }

        // Hover tracking para la textura dinámica (para todos los marcadores interactivos)
        div.addEventListener('mouseenter', () => {
            this._hoveredRegionId = id;
            this._updateRegionTexture(this._items.map(i => i.data));
        });
        
        div.addEventListener('mouseleave', () => {
            this._hoveredRegionId = null;
            this._updateRegionTexture(this._items.map(i => i.data));
        });

        return new CSS2DObject(div);
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
            // Lerp para suavizar la transición (fade in/out) similar a CSS transition
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

        // Determinar qué figura 3D está bajo el cursor con Raycaster
        this.hoveredMeshId = null;
        if (this.camera && this._areShapesVisible) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.markersGroup.children, false);
            for (let i = 0; i < intersects.length; i++) {
                const obj = intersects[i].object;
                if (obj.visible && obj.userData && obj.userData.id) {
                    this.hoveredMeshId = obj.userData.id;
                    break;
                }
            }
        }

        // Determinar qué marcadores interactivos están hovered
        for (const item of this._items) {
            if (item.mesh && item.mesh.userData && 'targetScale' in item.mesh.userData) {
                // Si el item tiene un label, está hovereado si coincide con _hoveredRegionId o hoveredMeshId
                const isHovered = (item.data.id === this._hoveredRegionId || item.data.id === this.hoveredMeshId);
                item.mesh.userData.targetScale = isHovered ? 1.5 : 1.0;
                
                // Forzar agrandar la fuente en el DOM si el raycaster intersecta el Mesh
                if (item.label && item.type === 'otro') {
                    if (isHovered) {
                        item.label.element.style.setProperty('font-size', '14px', 'important');
                    } else {
                        item.label.element.style.removeProperty('font-size'); // Vuelve al comportamiento default CSS
                    }
                }

                // Lerp suave del scale
                const us = item.mesh.userData;
                us.currentScale = THREE.MathUtils.lerp(us.currentScale, us.targetScale, 0.15);
                item.mesh.scale.set(us.currentScale, us.currentScale, 1.0);
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
            const visible = isCameraReady && (zoomAlpha <= threshold);

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
            this._updateRegionTexture(this._items.map(i => i.data));
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
        this._updateRegionTexture(markersList);
    }

    _updateRegionTexture(markersList) {
        if (!this.mapMaterial) return;

        if (!this.regionCanvas) {
            this.regionCanvas = document.createElement('canvas');
            // Alta resolución para textos nítidos
            this.regionCanvas.width = 4096;
            this.regionCanvas.height = 4096;
            this.regionCtx = this.regionCanvas.getContext('2d');
            this.regionTexture = new THREE.CanvasTexture(this.regionCanvas);
            this.regionTexture.anisotropy = 4;
            this.regionTexture.minFilter = THREE.LinearMipmapLinearFilter;
            // Asignar textura al material del terreno
            if (this.mapMaterial.userData.tRegionText) {
                this.mapMaterial.userData.tRegionText.value = this.regionTexture;
            }
        }

        const ctx = this.regionCtx;
        const w = this.regionCanvas.width;
        const h = this.regionCanvas.height;

        // Limpiar canvas
        ctx.clearRect(0, 0, w, h);

        // Estilos base compartidos
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        markersList.forEach(data => {
            const mType = String(data.type || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const isTextSurface = ['region', 'mar', 'oceano'].includes(mType);
            const shape = data.shape || 'circle';

            // Intentar recuperar (u,v), si no existe calcular aproximación usando x, y
            let u = data.uv ? data.uv.u : data.u;
            let v = data.uv ? data.uv.v : data.v;
            
            if (u === undefined || v === undefined) {
                const posX = data.position ? data.position.x : data.x;
                const posY = data.position ? data.position.y : data.y;
                if (posX !== undefined && posY !== undefined) {
                    u = (posX + 30) / 60;
                    v = 1.0 - ((posY + 20) / 40);
                }
            }
            
            if (u !== undefined && v !== undefined) {
                const cx = u * w;
                const cy = (1.0 - v) * h;

                if (isTextSurface) {
                    const fSize = data.fontSize || 80;
                    ctx.font = `bold ${fSize}px "Georgia", serif`;
                    const spacing = data.letterSpacing !== undefined ? data.letterSpacing : Math.floor(fSize * 0.25);
                    const message = (data.name || '').toUpperCase();
                    const curveRadius = data.curveRadius || 0;
                    const rotationDeg = data.rotation || 0;
                    
                    if (data.id === this._hoveredRegionId) {
                        ctx.fillStyle = 'rgba(255, 230, 150, 1.0)'; // Dorado claro al hacer hover
                    } else {
                        if (['mar', 'oceano'].includes(mType)) {
                            // Celeste suave y semitransparente para que se fusione con el mar
                            ctx.fillStyle = 'rgba(118, 175, 215, 0.26)'; 
                        } else {
                            ctx.fillStyle = 'rgba(32, 30, 17, 0.78)'; // Negro para regiones terrestres
                        }
                    }

                    ctx.save();
                    ctx.translate(cx, cy);
                    
                    if (rotationDeg !== 0) {
                        ctx.rotate(rotationDeg * Math.PI / 180);
                    }

                    if (curveRadius !== 0) {
                        // Texto curvo (desactivar letterSpacing nativo porque se calcula manualmente)
                        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

                        const radius = curveRadius;
                        const sign = Math.sign(radius);
                        const absRadius = Math.abs(radius);

                        let totalAngle = 0;
                        const charAngles = [];
                        for (let i = 0; i < message.length; i++) {
                            const charWidth = ctx.measureText(message[i]).width;
                            const angle = (charWidth + spacing) / absRadius;
                            charAngles.push(angle);
                            totalAngle += angle;
                        }
                        totalAngle -= spacing / absRadius; // Quitar el último espaciado

                        // Mover el pivote al centro del círculo para que el texto siga anclado en (cx, cy)
                        ctx.translate(0, radius);

                        ctx.rotate(-sign * (totalAngle / 2));

                        for (let i = 0; i < message.length; i++) {
                            const charAngle = charAngles[i];
                            ctx.rotate(sign * (charAngle / 2));
                            
                            ctx.save();
                            ctx.translate(0, -radius);
                            if (sign < 0) {
                                ctx.rotate(Math.PI); // Enderezar si la curva es invertida
                            }
                            ctx.fillText(message[i], 0, 0);
                            ctx.restore();

                            ctx.rotate(sign * (charAngle / 2));
                        }
                    } else {
                        // Texto recto
                        if ('letterSpacing' in ctx) {
                            ctx.letterSpacing = spacing + 'px';
                        }
                        ctx.fillText(message, 0, 0);
                    }
                    
                    ctx.restore();
                }
            }
        });

        this.regionTexture.needsUpdate = true;
    }
}