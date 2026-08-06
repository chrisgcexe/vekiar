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
    constructor(mapPlaneGroup, scene) {
        this.mapPlaneGroup = mapPlaneGroup;
        this.scene = scene;

        // Grupo plano sin rotación en la escena raíz.
        // Los CSS2DObjects deben vivir aquí y NO en mapPlaneGroup (que tiene rotation.x = -PI/2
        // y escala no uniforme), para evitar jitter de sub-pixel en la proyección CSS2D.
        this._labelRoot = new THREE.Group();
        if (this.scene) this.scene.add(this._labelRoot);

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

        // --- Icono 3D (solo si no es marcador puramente de texto) ---
        if (shape !== 'text') {
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
            this.mapPlaneGroup.add(mesh);
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
            // pointer-events: auto en el hijo funciona aunque el contenedor CSS2DRenderer
            // tenga pointer-events: none.
            div.style.pointerEvents = 'auto';
            div.style.cursor = 'pointer';

            div.addEventListener('click', () => {
                // Buscar la worldPos pre-calculada del item correspondiente
                const item = this._items.find(i => i.data && i.data.id === id);
                if (item) {
                    window.dispatchEvent(new CustomEvent('marker:region-click', {
                        detail: { worldPos: item.worldPos.clone(), name: message }
                    }));
                }
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

        // Solo actualizar si el zoom o el estado de preparación de la cámara cambiaron.
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
        // Limpiar meshes 3D del grupo del mapa
        const toRemove = [];
        this.mapPlaneGroup.traverse((child) => {
            if (child.userData && child.userData.id) toRemove.push(child);
        });
        toRemove.forEach(obj => {
            this.mapPlaneGroup.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (obj.material.map) obj.material.map.dispose();
                obj.material.dispose();
            }
        });

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
    }
}