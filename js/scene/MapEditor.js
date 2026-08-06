import * as THREE from 'three';
import { MarkerManager } from './MarkerManager.js';

export class MapEditor {
    constructor(scene, camera, domElement, mapPlaneGroup, mapMaterial, referenceTexture, normalTexture) {
        this.scene = scene;
        this.camera = camera;
        this.domElement = domElement;
        this.mapPlaneGroup = mapPlaneGroup;
        this.mapMaterial = mapMaterial;           
        this.referenceTexture = referenceTexture; 
        this.normalTexture = normalTexture;       

        this.enabled = false;
        this.isReferenceView = false;
        this.currentShape = 'circle'; 
        this.currentType = 'otro'; 
        this.markers = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.markerManager = new MarkerManager(this.mapPlaneGroup, this.scene);

        this.initStorage();
        this.createUI();

        this.domElement.addEventListener('click', (e) => this.onClick(e));
        
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'e') {
                this.enabled = !this.enabled;
                const panel = document.getElementById('map-editor-panel');
                if (panel) panel.style.display = this.enabled ? 'block' : 'none';
                console.log(`%c[EDITOR] Modo Edición: ${this.enabled ? 'ACTIVADO' : 'APAGADO'}`, 'color: #a5d6a7; font-weight: bold;');
            }
            
            if (e.key.toLowerCase() === 't' && this.referenceTexture) {
                this.isReferenceView = !this.isReferenceView;
                this.mapMaterial.map = this.isReferenceView ? this.referenceTexture : this.normalTexture;
                this.mapMaterial.needsUpdate = true;
            }
        });
    }

    createUI() {
        let panel = document.getElementById('map-editor-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'map-editor-panel';
            panel.style.cssText = `
                position: fixed; top: 20px; right: 20px; z-index: 10000;
                background: rgba(23, 19, 16, 0.9); border: 1px solid #795548;
                padding: 15px; border-radius: 8px; color: #d7ccc8; font-family: sans-serif;
                display: none; box-shadow: 0 4px 10px rgba(0,0,0,0.5); width: 220px;
            `;
            panel.innerHTML = `
                <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #ffca28; text-align: center;">PANEL DE EDICIÓN</h3>
                <div class="editor-field" style="margin-bottom: 10px;">
                    <label style="font-size: 12px; display: block; margin-bottom: 4px;">Forma:</label>
                    <select id="editor-shape-select" style="width: 100%; padding: 5px; background: #3e2723; color: #fff; border: 1px solid #795548; border-radius: 4px;">
                        <option value="circle">Círculo</option>
                        <option value="square">Cuadrado</option>
                        <option value="triangle">Triángulo</option>
                        <option value="diamond">Rombo</option>
                        <option value="text">Solo Texto</option>
                    </select>
                </div>
                <div class="editor-field" style="margin-bottom: 10px;">
                    <label style="font-size: 12px; display: block; margin-bottom: 4px;">Tipo (Categoría):</label>
                    <select id="editor-type-select" style="width: 100%; padding: 5px; background: #3e2723; color: #fff; border: 1px solid #795548; border-radius: 4px;">
                        <option value="otro">Otro</option>
                        <option value="region">Región</option>
                        <option value="isla">Isla</option>
                        <option value="lago">Lago</option>
                    </select>
                </div>
                <div class="editor-actions" style="display: flex; gap: 6px; flex-direction: column;">
                    <button id="editor-btn-undo" style="padding: 6px; background: #d32f2f; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Borrar Último</button>
                    <button id="editor-btn-clear" style="padding: 6px; background: #b71c1c; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Limpiar Todos</button>
                    <button id="editor-btn-export" style="padding: 6px; background: #2e7d32; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">Exportar JSON</button>
                </div>
            `;
            document.body.appendChild(panel);
        }

        const shapeSelect = document.getElementById('editor-shape-select');
        if (shapeSelect) {
            shapeSelect.addEventListener('change', (e) => {
                this.currentShape = e.target.value;
            });
        }

        const typeSelect = document.getElementById('editor-type-select');
        if (typeSelect) {
            typeSelect.addEventListener('change', (e) => {
                this.currentType = e.target.value;
            });
        }

        const btnUndo = document.getElementById('editor-btn-undo');
        if (btnUndo) {
            btnUndo.addEventListener('click', () => this.removeLastMarker());
        }

        const btnClear = document.getElementById('editor-btn-clear');
        if (btnClear) {
            btnClear.addEventListener('click', () => {
                if (confirm("¿Estás seguro de borrar todos los marcadores?")) {
                    this.clearAllMarkers();
                }
            });
        }

        const btnExport = document.getElementById('editor-btn-export');
        if (btnExport) {
            btnExport.addEventListener('click', () => this.exportToJsonFile());
        }
    }

    async initStorage() {
        const saved = localStorage.getItem('vekiar_custom_markers');
        if (saved) {
            try {
                this.markers = JSON.parse(saved);
                this.markers.forEach(m => {
                    if (!m.type) m.type = 'otro';
                    if (m.position === undefined) {
                        m.position = { x: m.x, y: m.y, z: m.z };
                    }
                });
                this.initLoadedMarkers();
            } catch (e) {
                console.error("Error al parsear marcadores locales:", e);
                await this.loadDefaultMarkers();
            }
        } else {
            await this.loadDefaultMarkers();
        }
    }

    async loadDefaultMarkers() {
        try {
            console.log("%c[EDITOR] Cargando marcadores por defecto desde JSON...", "color: #b0bec5; font-style: italic;");
            const response = await fetch('./js/vekiar_markers.json');
            if (response.ok) {
                const data = await response.json();
                this.markers = data.markers || [];
                // Unificar coordenadas viejas (x, y, z) a objeto position para compatibilidad
                this.markers.forEach(m => {
                    if (!m.type) m.type = 'otro';
                    if (m.position === undefined) {
                        m.position = { x: m.x, y: m.y, z: m.z };
                    }
                });
                this.saveToLocalStorage();
                this.initLoadedMarkers();
                console.log(`%c[EDITOR] ${this.markers.length} marcadores predeterminados cargados.`, "color: #81c784; font-weight: bold;");
            } else {
                console.warn("No se pudo obtener el archivo vekiar_markers.json.");
            }
        } catch (e) {
            console.error("Error cargando marcadores por defecto:", e);
        }
    }

    onClick(event) {
        if (!this.enabled) return;
        if (event.target.closest('#map-editor-panel')) return;

        const rect = this.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // 1. Raycast optimizado contra los meshes 3D de marcadores únicamente
        const markerIntersects = this.raycaster.intersectObjects(this.markerManager.markersGroup.children, true);
        const hitMarker = markerIntersects.find(hit => hit.object.userData && hit.object.userData.id);

        if (hitMarker) {
            this.editMarker(hitMarker.object.userData.id);
            return;
        }

        // 2. Si no clickeamos un marcador, raycast contra la superficie del mapa para ubicar uno nuevo
        const mapIntersects = this.raycaster.intersectObjects(this.mapPlaneGroup.children, true);
        const hitTerrain = mapIntersects.find(hit => {
            let parent = hit.object;
            while (parent) {
                if (parent === this.markerManager.markersGroup || (parent.userData && parent.userData.id)) {
                    return false;
                }
                parent = parent.parent;
            }
            return true;
        });

        if (hitTerrain) {
            const localPoint = hitTerrain.point.clone();
            this.mapPlaneGroup.worldToLocal(localPoint);
            const uv = hitTerrain.uv;

            if (uv) {
                this.openMarkerDialog(localPoint, uv);
            }
        }
    }

    openMarkerDialog(localPoint, uv) {
        const name = prompt("Nombre de la locación:");
        if (!name) return;

        const region = prompt("Región a la que pertenece:", "General") || "General";
        const type = this.currentType || 'otro';

        const id = 'marker_' + Date.now();
        const markerData = {
            id,
            name,
            region,
            type,
            shape: this.currentShape,
            position: {
                x: Number(localPoint.x.toFixed(3)),
                y: Number(localPoint.y.toFixed(3)),
                z: Number(localPoint.z.toFixed(3))
            },
            uv: {
                u: Number(uv.x.toFixed(4)),
                v: Number(uv.y.toFixed(4))
            }
        };

        this.markers.push(markerData);
        this.saveToLocalStorage();
        this.markerManager.spawnVisualMarker(markerData);
    }

    editMarker(id) {
        const markerData = this.markers.find(m => m.id === id);
        if (!markerData) return;

        const newName = prompt("Editar nombre de la locación:", markerData.name);
        if (newName === null) return;

        const newRegion = prompt("Editar región:", markerData.region || "General");
        if (newRegion === null) return;

        const currentType = markerData.type || 'otro';
        const newTypeInput = prompt(`Editar tipo (region, isla, lago, otro):`, currentType);
        if (newTypeInput === null) return;

        const validTypes = ['region', 'isla', 'lago', 'otro'];
        const normalizedType = newTypeInput.trim().toLowerCase();
        const finalType = validTypes.includes(normalizedType) ? normalizedType : 'otro';

        markerData.name = newName !== "" ? newName : markerData.name;
        markerData.region = newRegion !== "" ? newRegion : "General";
        markerData.type = finalType;

        this.saveToLocalStorage();
        this.markerManager.renderAll(this.markers);
        console.log(`%c[EDITOR] Marcador "${markerData.name}" actualizado (Tipo: ${markerData.type}).`, "color: #4fc3f7; font-weight: bold;");
    }

    removeLastMarker() {
        if (this.markers.length === 0) return;
        this.markers.pop();
        this.saveToLocalStorage();
        this.markerManager.renderAll(this.markers);
    }

    clearAllMarkers() {
        this.markers = [];
        this.saveToLocalStorage();
        this.markerManager.renderAll(this.markers);
    }

    exportToJsonFile() {
        const dataStructure = {
            version: "1.0.0",
            map: "Vekiar",
            totalMarkers: this.markers.length,
            markers: this.markers
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataStructure, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "vekiar_markers.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        console.log("%c[EDITOR] Archivo markers.json exportado con éxito.", "color: #81c784; font-weight: bold;");
    }

    saveToLocalStorage() {
        localStorage.setItem('vekiar_custom_markers', JSON.stringify(this.markers));
    }

    initLoadedMarkers() {
        this.markerManager.renderAll(this.markers);
    }
}