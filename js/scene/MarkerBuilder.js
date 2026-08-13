import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RegionTexturePainter } from './RegionTexturePainter.js';
export class MarkerBuilder {
    constructor(manager) {
        this.manager = manager;
        this.shapeTextures = {
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
            const tex = this.shapeTextures[shape] || this.shapeTextures['circle'];
            const material = new THREE.MeshBasicMaterial({ 
                map: tex, 
                transparent: true, 
                depthWrite: false, 
                depthTest: false // Para evitar que se oculte debajo del terreno en relieves
            });
            
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(posX, posY, posZ + 0.1);
            
            // NOTA: Ignoramos data.rotation para las formas geométricas 3D para que su base 
            // siempre se mantenga horizontal (paralela al texto CSS2D que las acompaña).

            mesh.scale.set(1, 1, 1);
            mesh.visible = false; // Ocultos por defecto hasta que MarkerManager decida mostrarlos
            mesh.userData = { 
                id: data.id, name: data.name, region: data.region, type: markerType, 
                targetScale: 1.0, currentScale: 1.0, wasHoveredDOM: false
            };
            this.manager.markersGroup.add(mesh);
        } else if (markerType === 'region') {
            // Generar un hitbox interactivo ajustado al tamaño REAL del texto proyectado.
            if (!this._measureCtx) {
                const c = document.createElement('canvas');
                this._measureCtx = c.getContext('2d');
            }
            // Medir con measureText (misma fuente/spacing/curve/rotación que RegionTexturePainter)
            const { widthPx, heightPx, offsetPx = 0 } = RegionTexturePainter.measureTextBounds(data, this._measureCtx);

            // Convertir píxeles de textura 4096x4096 a unidades de mundo LOCALES:
            // El terreno mide 100x100 unidades locales y el UV va 0..1 sobre TODO el mapa,
            // por lo que 1px de textura = 100/4096 unidades (mismo factor en X e Y).
            // NOTA: el espacio local es CUADRADO (100x100) y la textura de regiones es 4096x4096
            // muestreada con UV cuadrado (vGlobalPos = uv). Las cajas viven en el MISMO grupo
            // escalado (mapPlaneGroup.scale.y = 1/aspect) que el terreno y el texto, así que el
            // achatamiento por aspect se aplica a ambos por igual y NO debe compensarse aquí.
            const texSize = 4096, mapUnits = 100;
            let boxWidth = widthPx * (mapUnits / texSize);
            let boxHeight = heightPx * (mapUnits / texSize);

            // Margen justo (antes 1.3): el collider se adhiere a los límites medidos del texto,
            // evitando holgura/solapamiento entre regiones vecinas.
            const HIT_MARGIN = 1.05;
            boxWidth *= HIT_MARGIN;
            boxHeight *= HIT_MARGIN;

            // Texto curvo: el centro visual del arco se desvía del ancla por la sagita (offsetPx).
            // Solo distinto de 0 si hay curveRadius (hoy ningún type:'region' lo usa; queda
            // preparado para future-proofing). Signo/magnitud = calibración empírica pendiente.
            let offsetY = 0;
            if (offsetPx) {
                offsetY = -offsetPx * (mapUnits / texSize); // eje Y del canvas ↔ local están invertidos
            }

            geometry = new THREE.PlaneGeometry(boxWidth, boxHeight);
            const material = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
            mesh = new THREE.Mesh(geometry, material);
            // El Z ancla el plano a la altura guardada del marcador (world Y = posZ tras la
            // rotación del grupo). El hit-testing intersecta en ESE plano, de modo que la caja
            // de debug (tecla '2') ES el collider exacto.
            mesh.position.set(posX, posY + offsetY, posZ);

            // Aplicar rotación (el signo negativo compensa el eje Y de canvas vs three)
            if (data.rotation) {
                mesh.rotation.z = -data.rotation * Math.PI / 180;
            }

            // AABB plano para el hit-testing por punto, anclado al plano del box.
            mesh.userData = {
                id: data.id, name: data.name, region: data.region, type: markerType, isHitbox: true,
                hit: {
                    cx: posX,
                    cy: posY + offsetY,
                    w: boxWidth,
                    h: boxHeight,
                    rot: mesh.rotation.z, // radianes, el mismo ángulo aplicado al plano
                    zAnchor: posZ // world Y del plano horizontal sobre el que se detecta
                }
            };
            this.manager.markersGroup.add(mesh);

        }

        // --- Label CSS2D ---
        if (data.name) {
            if (['mar', 'oceano'].includes(markerType)) {
                const itemData1 = { label: null, mesh, type: markerType, data, worldPos: new THREE.Vector3(posX, posY, posZ), isVisible: null };
                this.manager._items.push(itemData1);
                if (data.id) this.manager._itemsMap.set(data.id, itemData1);
            } else {
                const label = this._createTextLabel(data.name, markerType, data.id);

                const localPos = new THREE.Vector3(
                    posX,
                    shape === 'text' ? posY : posY - 1.2,
                    posZ + 0.4
                );
                this.manager.mapPlaneGroup.updateWorldMatrix(true, false);
                const worldPos = localPos.clone();
                this.manager.mapPlaneGroup.localToWorld(worldPos);

                if (label) {
                    label.position.copy(worldPos);
                    if (shape === 'text') {
                        label.userData = { id: data.id, name: data.name, region: data.region, type: markerType };
                    }
                    this.manager._labelRoot.add(label);
                }

                const itemData2 = { label, mesh, type: markerType, data, worldPos: worldPos.clone(), isVisible: null };
                this.manager._items.push(itemData2);
                if (data.id) this.manager._itemsMap.set(data.id, itemData2);
            }
        }
    }

    _createTextLabel(message, type, id) {
        if (['region', 'mar', 'oceano'].includes(type)) {
            return null; 
        }

        const div = document.createElement('div');
        div.className = `marker-label marker-${type}`;
        div.textContent = message;
        // Ocultos por defecto hasta que MarkerManager decida mostrarlos
        div.style.opacity = '0';
        div.style.pointerEvents = 'none';
        
        if (id) div.dataset.markerId = id;

        return new CSS2DObject(div);
    }
}
