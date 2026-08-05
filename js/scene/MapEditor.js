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
        this.markers = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Instanciamos el manejador visual separado
        this.markerManager = new MarkerManager(this.mapPlaneGroup);

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
        const panel = document.createElement('div');
        panel.id = 'map-editor-panel';
        panel.innerHTML = `
            <h3>PANEL DE EDICIÓN</h3>
            <div class="editor-field">
                <label>Forma:</label>
                <select id="editor-shape-select">
                    <option value="circle">Círculo</option>
                    <option value="square">Cuadrado</option>
                    <option value="triangle">Triángulo</option>
                    <option value="diamond">Rombo</option>
                </select>
            </div>
            <div class="editor-actions">
                <button id="editor-btn-undo">Borrar Último</button>
                <button id="editor-btn-clear">Limpiar Todos</button>
                <button id="editor-btn-export">Exportar JSON</button>
            </div>
        `;
        document.body.appendChild(panel);

        document.getElementById('editor-shape-select').addEventListener('change', (e) => {
            this.currentShape = e.target.value;
        });

        document.getElementById('editor-btn-undo').addEventListener('click', () => {
            this.removeLastMarker();
        });

        document.getElementById('editor-btn-clear').addEventListener('click', () => {
            if (confirm("¿Estás seguro de borrar todos los marcadores?")) {
                this.clearAllMarkers();
            }
        });

        document.getElementById('editor-btn-export').addEventListener('click', () => {
            this.exportToJsonFile();
        });
    }

    initStorage() {
        const saved = localStorage.getItem('vekiar_custom_markers');
        if (saved) {
            try {
                this.markers = JSON.parse(saved);
            } catch (e) {
                this.markers = [];
            }
        }
    }

    onClick(event) {
        if (!this.enabled) return;
        if (event.target.closest('#map-editor-panel')) return;

        const rect = this.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const markerIntersects = this.raycaster.intersectObjects(this.mapPlaneGroup.children, true);
        const hitMarker = markerIntersects.find(hit => hit.object.userData && hit.object.userData.id);

        if (hitMarker) {
            this.editMarker(hitMarker.object.userData.id);
            return;
        }

        if (markerIntersects.length > 0) {
            const hit = markerIntersects[0];
            const localPoint = hit.point.clone();
            this.mapPlaneGroup.worldToLocal(localPoint);
            const uv = hit.uv;

            if (uv) {
                this.openMarkerDialog(localPoint, uv);
            }
        }
    }

    openMarkerDialog(localPoint, uv) {
        const name = prompt("Nombre de la locación:");
        if (!name) return;

        const region = prompt("Región a la que pertenece:", "General") || "General";

        const id = 'marker_' + Date.now();
        const markerData = {
            id,
            name,
            region,
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

        markerData.name = newName !== "" ? newName : markerData.name;
        markerData.region = newRegion !== "" ? newRegion : "General";

        this.saveToLocalStorage();
        this.markerManager.renderAll(this.markers);
        console.log(`%c[EDITOR] Marcador "${markerData.name}" actualizado.`, "color: #4fc3f7; font-weight: bold;");
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