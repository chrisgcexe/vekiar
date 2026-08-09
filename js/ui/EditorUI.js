export class EditorUI {
    constructor(mapEditor) {
        this.editor = mapEditor;
    }

    create() {
        this.createMainPanel();
        this.createInspectorPanel();
    }

    createMainPanel() {
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
                this.editor.currentShape = e.target.value;
            });
        }

        const typeSelect = document.getElementById('editor-type-select');
        if (typeSelect) {
            typeSelect.addEventListener('change', (e) => {
                this.editor.currentType = e.target.value;
            });
        }

        const btnUndo = document.getElementById('editor-btn-undo');
        if (btnUndo) {
            btnUndo.addEventListener('click', () => this.editor.removeLastMarker());
        }

        const btnClear = document.getElementById('editor-btn-clear');
        if (btnClear) {
            btnClear.addEventListener('click', () => {
                if (confirm("¿Estás seguro de borrar todos los marcadores?")) {
                    this.editor.clearAllMarkers();
                }
            });
        }

        const btnExport = document.getElementById('editor-btn-export');
        if (btnExport) {
            btnExport.addEventListener('click', () => this.editor.exportToJsonFile());
        }
    }

    createInspectorPanel() {
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
                    this.editor.applyInspectorChanges(false);
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
                el.addEventListener('blur', () => this.editor.applyInspectorChanges(false));
                el.addEventListener('keydown', (e) => { 
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        el.blur();
                    }
                });
            });

            document.getElementById('insp-btn-save').addEventListener('click', () => {
                this.editor.applyInspectorChanges(false);
                this.editor.closeInspector();
            });
            document.getElementById('insp-btn-delete').addEventListener('click', () => this.editor.deleteInspectorMarker());
            document.getElementById('insp-btn-close').addEventListener('click', () => this.editor.closeInspector());
        }
    }
}
