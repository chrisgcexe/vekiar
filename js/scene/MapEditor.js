import * as THREE from 'three';
import { MarkerManager } from './MarkerManager.js?v=2';

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

        this.markerManager = new MarkerManager(this.mapPlaneGroup, this.scene, this.mapMaterial, this.camera, this.domElement);

        this.initStorage();
        this.createUI();

        this._mouseDownPos = new THREE.Vector2(-1000, -1000);
        
        this.domElement.addEventListener('pointerdown', (e) => {
            this._mouseDownPos.set(e.clientX, e.clientY);
        });

        this.domElement.addEventListener('pointerup', (e) => {
            const dx = e.clientX - this._mouseDownPos.x;
            const dy = e.clientY - this._mouseDownPos.y;
            if (Math.sqrt(dx * dx + dy * dy) > 5) return; // Fue un paneo, ignorar

            if (e.button === 0) { // Clic izquierdo
                this.onLeftClick(e);
            }
        });

        this.domElement.addEventListener('contextmenu', (e) => {
            e.preventDefault(); // Siempre prevenir el menú nativo en el canvas

            const dx = e.clientX - this._mouseDownPos.x;
            const dy = e.clientY - this._mouseDownPos.y;
            if (Math.sqrt(dx * dx + dy * dy) > 5) return; // Fue un paneo (con clic derecho), ignorar

            this.onRightClick(e);
        });
        
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

        window.addEventListener('editor:open-inspector', (e) => {
            if (this.enabled && e.detail && e.detail.id) {
                this.openInspector(e.detail.id);
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

        this.createInspectorUI();
    }

    createInspectorUI() {
        let inspector = document.getElementById('map-inspector-panel');
        if (!inspector) {
            inspector = document.createElement('div');
            inspector.id = 'map-inspector-panel';
            inspector.style.cssText = `
                position: fixed; top: 20px; left: 20px; z-index: 10000;
                background: rgba(23, 19, 16, 0.9); border: 1px solid #795548;
                padding: 15px; border-radius: 8px; color: #d7ccc8; font-family: sans-serif;
                display: none; box-shadow: 0 4px 10px rgba(0,0,0,0.5); width: 250px;
            `;
            inspector.innerHTML = `
                <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #ffca28; text-align: center;">INSPECTOR</h3>
                <input type="hidden" id="insp-id">
                
                <div class="editor-field" style="margin-bottom: 10px;">
                    <label style="font-size: 12px; display: block; margin-bottom: 4px;">Nombre:</label>
                    <input type="text" id="insp-name" style="width: 100%; padding: 5px; background: #3e2723; color: #fff; border: 1px solid #795548; border-radius: 4px;">
                </div>
                
                <div class="editor-field" style="margin-bottom: 10px;">
                    <label style="font-size: 12px; display: block; margin-bottom: 4px;">Región Padre:</label>
                    <input type="text" id="insp-region" style="width: 100%; padding: 5px; background: #3e2723; color: #fff; border: 1px solid #795548; border-radius: 4px;">
                </div>
                
                <div class="editor-field" style="margin-bottom: 10px;">
                    <label style="font-size: 12px; display: block; margin-bottom: 4px;">Tipo:</label>
                    <select id="insp-type" style="width: 100%; padding: 5px; background: #3e2723; color: #fff; border: 1px solid #795548; border-radius: 4px;">
                        <option value="otro">Otro</option>
                        <option value="region">Región</option>
                        <option value="mar">Mar</option>
                        <option value="oceano">Océano</option>
                        <option value="isla">Isla</option>
                        <option value="lago">Lago</option>
                    </select>
                </div>
                
                <div class="editor-field region-only" id="insp-fontsize-container" style="margin-bottom: 15px; display: none; gap: 10px;">
                    <div style="flex: 1;">
                        <label style="font-size: 12px; display: block; margin-bottom: 4px;">Tamaño (px):</label>
                        <input type="number" id="insp-fontsize" style="width: 100%; padding: 5px; background: #3e2723; color: #fff; border: 1px solid #795548; border-radius: 4px;">
                    </div>
                    <div style="flex: 1;">
                        <label style="font-size: 12px; display: block; margin-bottom: 4px;">Espaciado:</label>
                        <input type="number" id="insp-letterspacing" style="width: 100%; padding: 5px; background: #3e2723; color: #fff; border: 1px solid #795548; border-radius: 4px;" placeholder="Auto">
                    </div>
                </div>

                <div class="editor-field region-only" id="insp-transform-container" style="margin-bottom: 15px; display: none; gap: 10px;">
                    <div style="flex: 1;">
                        <label style="font-size: 12px; display: block; margin-bottom: 4px;">Rotación (°):</label>
                        <input type="number" id="insp-rotation" style="width: 100%; padding: 5px; background: #3e2723; color: #fff; border: 1px solid #795548; border-radius: 4px;" placeholder="0">
                    </div>
                    <div style="flex: 1;">
                        <label style="font-size: 12px; display: block; margin-bottom: 4px;">Curvatura:</label>
                        <input type="number" id="insp-curve" style="width: 100%; padding: 5px; background: #3e2723; color: #fff; border: 1px solid #795548; border-radius: 4px;" placeholder="0 (Recto)">
                    </div>
                </div>
                
                <div class="editor-field region-only" id="insp-color-container" style="margin-bottom: 15px; display: none;">
                    <label style="font-size: 12px; display: block; margin-bottom: 4px;">Asignar Color de Región:</label>
                    <input type="hidden" id="insp-color">
                    <div id="insp-color-palette" style="display: flex; flex-wrap: wrap; gap: 4px; background: #3e2723; padding: 5px; border-radius: 4px; border: 1px solid #795548;">
                        <!-- Colores generados dinámicamente -->
                    </div>
                </div>
                
                <div class="editor-field" style="margin-bottom: 15px; display: flex; gap: 10px;">
                    <div style="flex: 1;">
                        <label style="font-size: 12px; display: block; margin-bottom: 4px;">Ajuste X (U):</label>
                        <input type="number" step="0.001" id="insp-u" style="width: 100%; padding: 5px; background: #3e2723; color: #fff; border: 1px solid #795548; border-radius: 4px;">
                    </div>
                    <div style="flex: 1;">
                        <label style="font-size: 12px; display: block; margin-bottom: 4px;">Ajuste Y (V):</label>
                        <input type="number" step="0.001" id="insp-v" style="width: 100%; padding: 5px; background: #3e2723; color: #fff; border: 1px solid #795548; border-radius: 4px;">
                    </div>
                </div>
                
                <div class="editor-actions" style="display: flex; gap: 6px; flex-direction: column;">
                    <button id="insp-btn-save" style="padding: 6px; background: #2e7d32; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">Guardar y Cerrar</button>
                    <button id="insp-btn-delete" style="padding: 6px; background: #d32f2f; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Eliminar</button>
                    <button id="insp-btn-close" style="padding: 6px; background: #5d4037; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Cerrar Inspector</button>
                </div>
            `;
            document.body.appendChild(inspector);
            
            // Eventos del inspector
            document.getElementById('insp-type').addEventListener('change', (e) => {
                const isTextSurface = ['region', 'mar', 'oceano'].includes(e.target.value);
                const displays = document.querySelectorAll('.region-only');
                displays.forEach(el => el.style.display = isTextSurface ? 'flex' : 'none');
            });
            
            // Generar paleta de colores extraídos de la máscara
            const maskColors = ['#d1d8e4', '#ffff00', '#2b2c2e', '#00ffff', '#ff5b01', '#da007f', '#00ff00', '#ff0000', '#64788a', '#ff8fce', '#a3872d', '#0000ff', '#ff00ff'];
            const paletteContainer = document.getElementById('insp-color-palette');
            const colorInput = document.getElementById('insp-color');
            
            maskColors.forEach(color => {
                const swatch = document.createElement('div');
                swatch.style.cssText = `
                    width: 24px; height: 24px; background: ${color}; border-radius: 4px; 
                    cursor: pointer; border: 2px solid transparent; transition: transform 0.1s;
                `;
                swatch.dataset.color = color;
                
                swatch.addEventListener('click', () => {
                    colorInput.value = color;
                    this.applyInspectorChanges(false);
                    // Actualizar UI
                    Array.from(paletteContainer.children).forEach(child => {
                        child.style.borderColor = child.dataset.color === color ? '#ffffff' : 'transparent';
                        child.style.transform = child.dataset.color === color ? 'scale(1.1)' : 'scale(1)';
                    });
                });
                paletteContainer.appendChild(swatch);
            });
            
            // Auto-aplicar al salir de foco (blur) o presionar Enter
            const inputs = ['insp-name', 'insp-region', 'insp-type', 'insp-fontsize', 'insp-letterspacing', 'insp-rotation', 'insp-curve', 'insp-u', 'insp-v'];
            inputs.forEach(id => {
                const el = document.getElementById(id);
                el.addEventListener('blur', () => this.applyInspectorChanges(false));
                el.addEventListener('keydown', (e) => { 
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        el.blur();
                    }
                });
            });

            document.getElementById('insp-btn-save').addEventListener('click', () => {
                this.applyInspectorChanges(false);
                this.closeInspector();
            });
            document.getElementById('insp-btn-delete').addEventListener('click', () => this.deleteInspectorMarker());
            document.getElementById('insp-btn-close').addEventListener('click', () => this.closeInspector());
        }
    }

    async initStorage() {
        // FORZAR LA CARGA DESDE EL JSON BUSTEANDO LA CACHÉ LOCAL
        localStorage.removeItem('vekiar_custom_markers');
        const saved = localStorage.getItem('vekiar_custom_markers');
        if (saved) {
            try {
                this.markers = JSON.parse(saved);
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
            const response = await fetch('js/vekiar_markers.json?t=' + new Date().getTime());
            if (response.ok) {
                const data = await response.json();
                this.markers = data.markers || [];
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
        if (event.target.closest('#map-editor-panel') || event.target.closest('#map-inspector-panel')) return;

        const rect = this.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const markerIntersects = this.raycaster.intersectObjects(this.markerManager.markersGroup.children, true);
        const hitMarker = markerIntersects.find(hit => hit.object.userData && hit.object.userData.id);

        if (hitMarker) {
            this.openInspector(hitMarker.object.userData.id);
        } else {
            this.closeInspector();
        }
    }

    onRightClick(event) {
        if (!this.enabled) return;
        if (event.target.closest('#map-editor-panel') || event.target.closest('#map-inspector-panel')) return;

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

        const isTextSurface = ['region', 'mar', 'oceano'].includes(String(markerData.type || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim());
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