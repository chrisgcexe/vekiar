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
    constructor(mapPlaneGroup, scene, mapMaterial) {
        this.mapPlaneGroup = mapPlaneGroup;
        this.scene = scene;
        this.mapMaterial = mapMaterial;

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
    }

    spawnVisualMarker(data) {
        let mesh = null;
        let geometry = null;
        const shape = data.shape || 'circle';
        const markerType = data.type || 'otro';

        const posX = data.position ? data.position.x : data.x;
        const posY = data.position ? data.position.y : data.y;
        const posZ = data.position ? data.position.z : data.z;

        // --- Icono 3D (solo si no es marcador puramente de texto ni de región) ---
        if (shape !== 'text' && markerType !== 'region') {
            if (shape === 'square') {
                geometry = new THREE.BoxGeometry(1.2, 1.2, 0.3);
            } else if (shape === 'triangle') {
                const triShape = new THREE.Shape();
                triShape.moveTo(0, 0.8);
                triShape.lineTo(-0.8, -0.6);
                triShape.lineTo(0.8, -0.6);
                triShape.closePath();
                geometry = new THREE.ExtrudeGeometry(triShape, { depth: 0.3, bevelEnabled: false });
                geometry.center();
            } else if (shape === 'diamond') {
                const diamShape = new THREE.Shape();
                diamShape.moveTo(0, 0.9);
                diamShape.lineTo(-0.7, 0);
                diamShape.lineTo(0, -0.9);
                diamShape.lineTo(0.7, 0);
                diamShape.closePath();
                geometry = new THREE.ExtrudeGeometry(diamShape, { depth: 0.3, bevelEnabled: false });
                geometry.center();
            } else {
                geometry = new THREE.SphereGeometry(0.8, 16, 16);
            }

            const material = new THREE.MeshBasicMaterial({ color: 0xff5252 });
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(posX, posY, posZ + 0.2);
            mesh.userData = { id: data.id, name: data.name, region: data.region, type: markerType };
            this.markersGroup.add(mesh);
        } else if (markerType === 'region') {
            // Generar un hitbox invisible para el Raycaster del Editor
            geometry = new THREE.PlaneGeometry(6, 2); // Área amplia aproximada
            const material = new THREE.MeshBasicMaterial({ visible: false });
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(posX, posY, posZ + 0.1);
            mesh.userData = { id: data.id, name: data.name, region: data.region, type: markerType };
            this.markersGroup.add(mesh);
        }

        // --- Label CSS2D ---
        if (data.name) {
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

            // Hover tracking para la textura dinámica
            div.addEventListener('mouseenter', () => {
                this._hoveredRegionId = id;
                this._updateRegionTexture(this._items.map(i => i.data));
            });
            
            div.addEventListener('mouseleave', () => {
                this._hoveredRegionId = null;
                this._updateRegionTexture(this._items.map(i => i.data));
            });
        }

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

        // Solo actualizar el resto del DOM si el zoom o el estado de preparación de la cámara cambiaron.
        if (Math.abs(zoomAlpha - this._lastZoomAlpha) < 0.005 && isCameraReady === this._lastCameraReady) return;
        this._lastZoomAlpha = zoomAlpha;
        this._lastCameraReady = isCameraReady;

        for (const item of this._items) {
            const threshold = ZOOM_THRESHOLD[item.type] ?? 0.30;
            // Solo hacer visibles los marcadores si la cámara ya terminó de explorar e inició el juego
            const visible = isCameraReady && (zoomAlpha <= threshold);

            if (item.isVisible !== visible) {
                item.isVisible = visible;
                // La transición de opacidad es suave gracias a la regla CSS transition en markers.css
                item.label.element.style.opacity = visible ? '1' : '0';

                // pointer-events: solo en regiones visibles para no bloquear el mapa
                if (item.type === 'region') {
                    item.label.element.style.pointerEvents = visible ? 'auto' : 'none';
                }

                // Icono 3D: ocultar también para no generar ruido visual
                if (item.mesh) item.mesh.visible = visible;
            }
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

        // Dibujar solo los marcadores de tipo región
        markersList.forEach(data => {
            if (data.type === 'region') {
                const u = data.uv ? data.uv.u : data.u;
                const v = data.uv ? data.uv.v : data.v;
                
                if (u !== undefined && v !== undefined) {
                    // Determinar tamaño de letra y espaciado proporcional
                    const fSize = data.fontSize || 80;
                    ctx.font = `bold ${fSize}px "Georgia", serif`;
                    if ('letterSpacing' in ctx) {
                        const spacing = data.letterSpacing !== undefined ? data.letterSpacing : Math.floor(fSize * 0.25);
                        ctx.letterSpacing = spacing + 'px';
                    }
                    // Hover check
                    if (data.id === this._hoveredRegionId) {
                        ctx.fillStyle = 'rgba(255, 230, 150, 1.0)'; // Dorado claro al hacer hover
                    } else {
                        ctx.fillStyle = 'rgba(0, 0, 0, 1.0)'; // Negro (tinta por defecto)
                    }

                    // En Three.js la coordenada V del UV está invertida respecto al canvas 2D
                    ctx.fillText(data.name.toUpperCase(), u * w, (1.0 - v) * h);
                }
            }
        });

        this.regionTexture.needsUpdate = true;
    }
}