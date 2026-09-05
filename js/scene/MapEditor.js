import * as THREE from 'three';
import { MarkerManager } from './MarkerManager.js?v=3';
import { EditorUI } from '../ui/EditorUI.js';
import { AssetLoader } from '../utils/AssetLoader.js';

export class MapEditor {
    constructor(scene, camera, domElement, mapPlaneGroup, mapMaterial, referenceTexture, normalTexture, regionMasks, getSurfaceHeight, eventBus) {
        this.scene = scene;
        this.camera = camera;
        this.domElement = domElement;
        this.mapPlaneGroup = mapPlaneGroup;
        this.mapMaterial = mapMaterial;           
        this.referenceTexture = referenceTexture; 
        this.normalTexture = normalTexture;       
        this.getSurfaceHeight = getSurfaceHeight || null;

        this.enabled = false;
        this.isReferenceView = false;
        this.currentShape = 'circle'; 
        this.currentType = 'otro'; 
        this.markers = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.markerManager = new MarkerManager(this.mapPlaneGroup, this.scene, this.mapMaterial, this.camera, this.domElement, this.getSurfaceHeight, eventBus);

        this.initStorage();
        this.ui = new EditorUI(this);
        this.ui.create();

        eventBus.on('input:click', (e) => {
            this.onLeftClick(e.detail); // e.detail tiene clientX, clientY
        });

        eventBus.on('input:right-click', (e) => {
            this.onRightClick(e.detail);
        });
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'e') {
                this.enabled = !this.enabled;
                const panel = document.getElementById('map-editor-panel');
                if (panel) panel.style.display = this.enabled ? 'block' : 'none';
                if (typeof this.updateBrushState === 'function') this.updateBrushState();
                console.log(`%c[EDITOR] Modo Edición: ${this.enabled ? 'ACTIVADO' : 'APAGADO'}`, 'color: #a5d6a7; font-weight: bold;');
            }
            // La tecla 'T' ha sido reasignada a Thunderstorm en main.js
        });

        eventBus.on('editor:open-inspector', (e) => {
            if (this.enabled && e.detail && e.detail.id) {
                this.openInspector(e.detail.id);
            }
        });

        // Bloquear el drag de la cámara al hacer click con el pincel y permitir pintar con un solo click
        this.domElement.addEventListener('pointerdown', (e) => {
            if (this.enabled && this.currentShape === 'brush') {
                e.stopImmediatePropagation();
                if (e.button === 0 || e.button === 2) {
                    const isErasing = (e.button === 2);
                    const rect = this.domElement.getBoundingClientRect();
                    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                    this.raycaster.setFromCamera(this.mouse, this.camera);
                    const intersects = this.raycaster.intersectObject(this.mapPlaneGroup, true);
                    if (intersects.length > 0 && intersects[0].uv) {
                        this.paintOnMask(intersects[0].uv.x, intersects[0].uv.y, isErasing);
                    }
                }
            }
        }, { capture: true });

        // Evento de pintura continua (arrastrar) sin mover la cámara, soporta click derecho para borrar
        this.domElement.addEventListener('pointermove', (e) => {
            if (!this.enabled || this.currentShape !== 'brush') return;
            if (e.buttons !== 1 && e.buttons !== 2) return;
            
            e.stopImmediatePropagation(); // Evitar que el evento suba al window (GlobalInputManager)
            const isErasing = (e.buttons === 2);
            
            const rect = this.domElement.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObject(this.mapPlaneGroup, true);
            if (intersects.length > 0 && intersects[0].uv) {
                this.paintOnMask(intersects[0].uv.x, intersects[0].uv.y, isErasing);
            }
        });
    }



    async initStorage() {
        const saved = localStorage.getItem('vekiar_custom_markers');
        if (saved) {
            try {
                this.markers = JSON.parse(saved);

                // VALIDACIÓN: Si los marcadores guardados no tienen maskTexture, son de una versión vieja.
                // O si Islas Muertas no tiene asignado el continente IREVIE, ignoramos el localStorage.
                const hasContinentMask4 = this.markers.some(m => m.type === 'continent' && m.maskTexture === 'region_masks_4.png');
                const hasContinentType = this.markers.some(m => m.type === 'continent');
                const hasIrevieIsla = this.markers.some(m => m.name === 'ISLAS MUERTAS' && m.continent === 'IREVIE');
                if (!hasContinentMask4 || !hasContinentType || !hasIrevieIsla) {
                    console.log("[EDITOR] Marcadores antiguos detectados en LocalStorage. Forzando actualización...");
                    this.markers = [];
                    localStorage.removeItem('vekiar_custom_markers');
                    await this.loadDefaultMarkers();
                    return;
                }

                this.markers.forEach(m => {
                    if (!m.type) m.type = 'otro';
                    if (m.position === undefined) {
                        m.position = { x: m.x, y: m.y, z: m.z };
                    }
                    if (m.u !== undefined && m.v !== undefined && m.uv === undefined) {
                        m.uv = { u: m.u, v: m.v };
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
            // Force cache bypass with timestamp
            const response = await fetch('assets/data/vekiar_markers_v2.json?t=' + new Date().getTime());
            if (response.ok) {
                const data = await response.json();
                this.markers = data.markers || [];
                localStorage.setItem('vekiar_markers_v4', JSON.stringify(data));
                // Unificar coordenadas viejas (x, y, z) a objeto position para compatibilidad
                this.markers.forEach(m => {
                    if (!m.type) m.type = 'otro';
                    if (m.position === undefined) {
                        m.position = { x: m.x, y: m.y, z: m.z };
                    }
                    if (m.u !== undefined && m.v !== undefined && m.uv === undefined) {
                        m.uv = { u: m.u, v: m.v };
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

    onLeftClick(event) {
        if (!this.enabled) return;

        const rect = this.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        if (this.currentShape === 'brush') {
            return;
        }
        
        const markerIntersects = this.raycaster.intersectObjects(this.markerManager.markersGroup.children, true);
        const hitMarker = markerIntersects.find(hit => hit.object.userData && hit.object.userData.id);

        if (hitMarker) {
            this.openInspector(hitMarker.object.userData.id);
        } else {
            this.closeInspector();
        }
    }

    onRightClick(event) {
        if (!this.enabled || this.currentShape === 'brush') return;

        const rect = this.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

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
                const newId = this.createNewMarker(localPoint, uv);
                this.openInspector(newId);
            }
        }
    }

    // --- NUEVO: PINTOR DE MÁSCARA ---
    paintOnMask(u, v, isErasing = false) {
        if (!this.mapMaterial || !this.mapMaterial.userData.tCustomMask) return;
        
        const tex = this.mapMaterial.userData.tCustomMask.value;
        const canvas = tex.image;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        // Coordenadas en píxeles (v invertido según estándar WebGL vs Canvas)
        const x = u * canvas.width;
        const y = (1.0 - v) * canvas.height;
        
        // Configuramos la operación de composición
        ctx.globalCompositeOperation = isErasing ? 'destination-out' : 'source-over';
        
        // Dibujamos un círculo suave (brocha)
        const radius = 25; // Tamaño del pincel (px sobre 1024)
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        
        if (isErasing) {
            // destination-out borra en base al alfa del pincel
            gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        } else {
            gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        }
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Restaurar para evitar bugs en otras operaciones
        ctx.globalCompositeOperation = 'source-over';
        
        tex.needsUpdate = true;
    }

    updateBrushState() {
        if (this.mapMaterial && this.mapMaterial.userData.uIsPaintingMask) {
            this.mapMaterial.userData.uIsPaintingMask.value = (this.enabled && this.currentShape === 'brush') ? 1.0 : 0.0;
        }
    }

    exportMaskToPNG() {
        if (!this.mapMaterial || !this.mapMaterial.userData.tCustomMask) return;
        const tex = this.mapMaterial.userData.tCustomMask.value;
        const canvas = tex.image;
        if (!canvas) {
            console.warn("No hay canvas para exportar");
            return;
        }
        
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = 'custom_mask.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        console.log("%c[EDITOR] Máscara PNG exportada con éxito.", "color: #0277bd; font-weight: bold;");
    }

    createNewMarker(localPoint, uv) {
        const id = 'marker_' + Date.now();
        const markerData = {
            id,
            name: "Nuevo",
            region: "General",
            type: this.currentType || 'otro',
            shape: this.currentShape,
            position: {
                x: Number(localPoint.x.toFixed(3)),
                y: Number(localPoint.y.toFixed(3)),
                z: Number(localPoint.z.toFixed(3))
            },
            uv: {
                u: Number(uv.x.toFixed(4)),
                v: Number(uv.y.toFixed(4))
            },
            fontSize: 80
        };

        this.markers.push(markerData);
        this.saveToLocalStorage();
        this.markerManager.renderAll(this.markers);
        return id;
    }

    openInspector(id) {
        const markerData = this.markers.find(m => m.id === id);
        if (!markerData) return;

        document.getElementById('insp-id').value = markerData.id;
        document.getElementById('insp-name').value = markerData.name || '';
        document.getElementById('insp-region').value = markerData.region || 'General';
        document.getElementById('insp-type').value = String(markerData.type || 'otro').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        document.getElementById('insp-fontsize').value = markerData.fontSize || 80;
        document.getElementById('insp-letterspacing').value = markerData.letterSpacing !== undefined ? markerData.letterSpacing : '';
        document.getElementById('insp-rotation').value = markerData.rotation || 0;
        document.getElementById('insp-curve').value = markerData.curveRadius || 0;
        document.getElementById('insp-color').value = markerData.colorId || '';
        
        // Update color palette UI
        const paletteContainer = document.getElementById('insp-color-palette');
        if (paletteContainer) {
            Array.from(paletteContainer.children).forEach(child => {
                const isSelected = child.dataset.color === (markerData.colorId || '').toLowerCase();
                child.style.borderColor = isSelected ? '#ffffff' : 'transparent';
                child.style.transform = isSelected ? 'scale(1.1)' : 'scale(1)';
            });
        }
        
        if (markerData.uv) {
            document.getElementById('insp-u').value = markerData.uv.u.toFixed(4);
            document.getElementById('insp-v').value = markerData.uv.v.toFixed(4);
        } else {
            document.getElementById('insp-u').value = 0.5;
            document.getElementById('insp-v').value = 0.5;
        }

        const isTextSurface = ['continent', 'region', 'mar', 'oceano'].includes(String(markerData.type || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim());
        const displays = document.querySelectorAll('.region-only');
        displays.forEach(el => el.style.display = isTextSurface ? 'flex' : 'none');

        const inspector = document.getElementById('map-inspector-panel');
        if (inspector) inspector.style.display = 'block';
    }

    applyInspectorChanges(forceRender) {
        const id = document.getElementById('insp-id').value;
        const markerData = this.markers.find(m => m.id === id);
        if (!markerData) return;

        const newName = document.getElementById('insp-name').value.trim();
        const newRegion = document.getElementById('insp-region').value.trim() || 'General';
        const newType = document.getElementById('insp-type').value;
        const newFontSize = parseInt(document.getElementById('insp-fontsize').value) || 80;
        const letterSpacingRaw = document.getElementById('insp-letterspacing').value;
        const newLetterSpacing = letterSpacingRaw !== '' ? parseInt(letterSpacingRaw) : undefined;
        
        const rotationRaw = document.getElementById('insp-rotation').value;
        const newRotation = rotationRaw !== '' ? parseFloat(rotationRaw) : 0;

        const curveRaw = document.getElementById('insp-curve').value;
        const newCurveRadius = curveRaw !== '' ? parseFloat(curveRaw) : 0;
        
        const colorIdRaw = document.getElementById('insp-color').value.trim().toUpperCase();
        const newColorId = colorIdRaw !== '' ? colorIdRaw : undefined;

        const newU = parseFloat(document.getElementById('insp-u').value) || 0;
        const newV = parseFloat(document.getElementById('insp-v').value) || 0;

        let hasChanges = false;
        if (markerData.name !== newName) { markerData.name = newName; hasChanges = true; }
        if (markerData.region !== newRegion) { markerData.region = newRegion; hasChanges = true; }
        if (markerData.type !== newType) { markerData.type = newType; hasChanges = true; }
        if (markerData.fontSize !== newFontSize) { markerData.fontSize = newFontSize; hasChanges = true; }
        if (markerData.letterSpacing !== newLetterSpacing) { markerData.letterSpacing = newLetterSpacing; hasChanges = true; }
        if (markerData.rotation !== newRotation) { markerData.rotation = newRotation; hasChanges = true; }
        if (markerData.curveRadius !== newCurveRadius) { markerData.curveRadius = newCurveRadius; hasChanges = true; }
        if (markerData.colorId !== newColorId) { markerData.colorId = newColorId; hasChanges = true; }
        
        if (markerData.uv && (Math.abs(markerData.uv.u - newU) > 0.0001 || Math.abs(markerData.uv.v - newV) > 0.0001)) {
            const du = newU - markerData.uv.u;
            const dv = newV - markerData.uv.v;
            markerData.uv.u = newU;
            markerData.uv.v = newV;
            
            // Aproximación del desplazamiento 3D (asumiendo plano de ~60x40)
            if (markerData.position) {
                markerData.position.x += (du * 60);
                markerData.position.y += (dv * 40);
            }
            hasChanges = true;
        }

        if (hasChanges || forceRender) {
            this.saveToLocalStorage();
            this.markerManager.renderAll(this.markers);
            console.log(`%c[EDITOR] Marcador "${markerData.name}" guardado.`, "color: #4fc3f7; font-weight: bold;");
        }
    }

    deleteInspectorMarker() {
        const id = document.getElementById('insp-id').value;
        if (confirm("¿Eliminar este marcador?")) {
            this.markers = this.markers.filter(m => m.id !== id);
            this.saveToLocalStorage();
            this.markerManager.renderAll(this.markers);
            this.closeInspector();
        }
    }

    closeInspector() {
        const inspector = document.getElementById('map-inspector-panel');
        if (inspector) inspector.style.display = 'none';
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

        const blob = new Blob([JSON.stringify(dataStructure, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const downloadAnchor = document.createElement('a');
        downloadAnchor.href = url;
        downloadAnchor.setAttribute("download", "vekiar_markers.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        URL.revokeObjectURL(url);
        console.log("%c[EDITOR] Archivo markers.json exportado con éxito.", "color: #81c784; font-weight: bold;");
    }

    saveToLocalStorage() {
        localStorage.setItem('vekiar_custom_markers', JSON.stringify(this.markers));
    }

    initLoadedMarkers() {
        this.markerManager.renderAll(this.markers);
    }
}