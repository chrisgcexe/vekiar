import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RegionTexturePainter } from './RegionTexturePainter.js';

/**
 * MarkerFactory
 * -------------
 * Responsabilidad única: instanciar mallas 3D, hitboxes y etiquetas CSS2D
 * para los marcadores del mapa. NO contiene lógica de posicionamiento
 * (eso es responsabilidad de MarkerPositionResolver) ni de tracking
 * (MarkerRegistry).
 *
 * Extrae:
 *  - shapeTextures (canvas → texture)
 *  - createIconMesh (PlaneGeometry texturizado)
 *  - createRegionHitbox (plano rojo de debug)
 *  - createTextLabel (CSS2DObject)
 */
export class MarkerFactory {
    constructor() {
        this.shapeTextures = {
            'circle': this._createShapeTexture('circle'),
            'square': this._createShapeTexture('square'),
            'triangle': this._createShapeTexture('triangle'),
            'diamond': this._createShapeTexture('diamond'),
            'star': this._createShapeTexture('star')
        };
                this._measureCtx = null;
    }

    /**
     * Crea una textura CanvasTexture con la forma geométrica especificada.
     * @param {string} shape - 'circle', 'square', 'triangle', 'diamond', 'star'
     * @returns {THREE.CanvasTexture}
     */
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

    /**
     * Crea un mesh 3D para un marcador de ícono (pueblos, islas, lagos, etc.).
     *
     * @param {object} params - { data, shape, markerType, pos }
     * @returns {{mesh: THREE.Mesh, originalScale: number}}
     */
    createIconMesh({ data, shape, markerType, pos }) {
        const sizeInWorld = 1.2; // Escala base en unidades del mundo
        const geometry = new THREE.PlaneGeometry(sizeInWorld, sizeInWorld);
        const tex = this.shapeTextures[shape] || this.shapeTextures['circle'];
        const material = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            depthTest: false
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(pos.x, pos.y, pos.z + 0.1);

        // NOTA: Ignoramos data.rotation para las formas geométricas 3D para que
        // su base siempre se mantenga horizontal (paralela al texto CSS2D).
        mesh.scale.set(1, 1, 1);
        mesh.visible = false; // Ocultos por defecto hasta que MarkerManager decida mostrarlos

        mesh.userData = {
            id: data.id,
            name: data.name,
            region: data.region,
            type: markerType,
            targetScale: 1.0,
            currentScale: 1.0,
            wasHoveredDOM: false
        };

        return { mesh, originalScale: 1.0 };
    }

    /**
     * Crea un hitbox planar rojo (invisible por defecto) para regiones.
     * El tamaño se mide con RegionTexturePainter.measureTextBounds para
     * coincidir exactamente con el texto proyectado.
     *
     * @param {object} params - { data, markerType, pos, rotation }
     * @returns {{mesh: THREE.Mesh, originalScale: number}}
     */
    createRegionHitbox({ data, markerType, pos, rotation }) {
        if (!this._measureCtx) {
            const c = document.createElement('canvas');
            this._measureCtx = c.getContext('2d');
        }

        /** Medir bounds del texto (misma font/spacing/curve/rotación que RegionTexturePainter) */
        const { widthPx, heightPx, straightWidth = widthPx, straightHeight = heightPx, offsetPx = 0 } =
            RegionTexturePainter.measureTextBounds(data, this._measureCtx);

        /** Convertir píxeles textura 4096x4096 a unidades de mundo locales */
        const texSize = 4096, mapUnits = 100;
        /** Usar dimensiones SIN rotar: el plano ya se rota abajo */
        let boxWidth = straightWidth * (mapUnits / texSize);
        let boxHeight = straightHeight * (mapUnits / texSize);

        /** Margen justo (antes 1.3): el collider se adhiere a los límites medidos */
        const HIT_MARGIN = 1.05;
        boxWidth *= HIT_MARGIN;
        boxHeight *= HIT_MARGIN;

        /** Texto curvo: desvío del centro visual por la sagita (offsetPx) */
        const offsetY = offsetPx ? -offsetPx * (mapUnits / texSize) : 0;

        const posX = pos.x;
        const posY = pos.y + offsetY;
        const posZ = pos.z;

        const geometry = new THREE.PlaneGeometry(boxWidth, boxHeight);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: false
        });
        const mesh = new THREE.Mesh(geometry, material);
        /** Z ancla el plano a la altura del marcador */
        mesh.position.set(posX, posY, posZ);

        /** Aplicar rotación (signo negativo compensa eje Y canvas ↔ three) */
        if (rotation) {
            mesh.rotation.z = -rotation * Math.PI / 180;
        }

        /** AABB plano para hit-testing, anclado al plano del box */
        mesh.userData = {
            id: data.id,
            name: data.name,
            region: data.region,
            type: markerType,
            isHitbox: true,
            originalScale: 1.0,
            hit: {
                cx: posX,
                cy: posY,
                w: boxWidth,
                h: boxHeight,
                                rot: rotation ? -rotation * Math.PI / 180 : 0,
                zAnchor: posZ
            }
        };

        return { mesh, originalScale: 1.0 };
    }

    /**
     * Crea una etiqueta CSS2D (THREE.CSS2DObject) para un marcador.
     *
     * @param {string} message - Texto a mostrar
     * @param {string} type - Tipo de marcador (determina la clase CSS)
     * @param {string} [id] - ID opcional del marcador
     * @returns {CSS2DObject|null} null para regiones/mareas (no usan labels CSS2D)
     */
    createTextLabel(message, type, id) {
        if (['continent', 'region', 'mar', 'oceano'].includes(type)) {
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



