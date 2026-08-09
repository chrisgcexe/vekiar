import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

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
            // Generar un hitbox interactivo ajustado al texto
            const fSize = data.fontSize || 80;
            const textLen = data.name ? data.name.length : 10;
            const spacing = data.letterSpacing !== undefined ? data.letterSpacing : Math.floor(fSize * 0.25);
            
            // Aproximación de tamaño en píxeles (las mayúsculas de Georgia Bold son anchas)
            const approxWidthPx = (fSize * 0.8 * textLen) + (spacing * (textLen - 1));
            
            // Convertir a unidades de mundo (aproximado)
            // Ancho del mapa: 60 unidades = 4096 px. Alto del mapa: 40 unidades = 4096 px.
            let boxWidth = approxWidthPx * (60 / 4096);
            
            // Margen vertical generoso para facilitar el hover (1.5x)
            let boxHeight = (fSize * 1.5) * (40 / 4096);

            // Ajuste empírico para texto curvo
            if (data.curveRadius) {
                // Al curvarse, el bounding box abarca más espacio
                boxWidth *= 1.3;
                boxHeight += Math.min(Math.abs(data.curveRadius) * (40 / 4096) * 1.5, 10);
            }

            // Hitbox transparente (invisible pero clickeable)
            geometry = new THREE.PlaneGeometry(boxWidth, boxHeight);
            const material = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0, depthWrite: false });
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(posX, posY, posZ + 0.1);
            
            // Aplicar rotación
            if (data.rotation) {
                mesh.rotation.z = -data.rotation * Math.PI / 180;
            }
            
            mesh.userData = { id: data.id, name: data.name, region: data.region, type: markerType };
            this.manager.markersGroup.add(mesh);
        }

        // --- Label CSS2D ---
        if (data.name) {
            if (['mar', 'oceano'].includes(markerType)) {
                this.manager._items.push({ label: null, mesh, type: markerType, data, worldPos: new THREE.Vector3(posX, posY, posZ), isVisible: null });
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

                this.manager._items.push({ label, mesh, type: markerType, data, worldPos: worldPos.clone(), isVisible: null });
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
