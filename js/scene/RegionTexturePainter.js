import * as THREE from 'three';

export class RegionTexturePainter {
    constructor(mapMaterial) {
        this.mapMaterial = mapMaterial;
        this.normalCanvas = null;
        this.normalCtx = null;
        this.normalTexture = null;

        this.glowCanvas = null;
        this.glowCtx = null;
        this.glowTexture = null;
        this.isInitialized = false;
    }

    /**
     * Dibuja los textos de regiones, mares y océanos en DOS texturas 4K
     * de una sola vez durante la inicialización.
     * 
     * @param {Array} markersList - Lista plana de datos de marcadores
     */
    initTextures(markersList, force = false) {
        if (!this.mapMaterial) return;
        if (this.isInitialized && !force) return;

        this._initCanvases();

        const nw = this.normalCanvas.width;
        const nh = this.normalCanvas.height;

        this.normalCtx.clearRect(0, 0, nw, nh);
        this.glowCtx.clearRect(0, 0, nw, nh);

        // Estilos base compartidos
        this.normalCtx.textAlign = 'center';
        this.normalCtx.textBaseline = 'middle';
        
        this.glowCtx.textAlign = 'center';
        this.glowCtx.textBaseline = 'middle';

        markersList.forEach(data => {
            const mType = String(data.type || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const isTextSurface = ['region', 'mar', 'oceano'].includes(mType);
            
            if (!isTextSurface) return;

            // Intentar recuperar (u,v), si no existe calcular aproximación usando x, y
            let u = data.uv ? data.uv.u : data.u;
            let v = data.uv ? data.uv.v : data.v;
            
            if (u === undefined || v === undefined) {
                const posX = data.position ? data.position.x : data.x;
                const posY = data.position ? data.position.y : data.y;
                if (posX !== undefined && posY !== undefined) {
                    u = (posX + 50) / 100;
                    v = (posY + 50) / 100;
                }
            }
            
            if (u !== undefined && v !== undefined) {
                const cx = u * nw;
                const cy = (1.0 - v) * nh;

                // Dibujar versión normal
                this._drawText(this.normalCtx, data, cx, cy, mType, false);
                
                // Dibujar versión glow y guardar el ancho estimado del texto en UV
                const tw = this._drawText(this.glowCtx, data, cx, cy, mType, true);
                
                // Guardamos el ancho (textWidthUV) en la data para pasarlo luego al shader
                data.textWidthUV = tw / nw; 
            }
        });

        this.normalTexture.needsUpdate = true;
        this.glowTexture.needsUpdate = true;
        this.isInitialized = true;
    }

    _initCanvases() {
        // Textura Normal
        this.normalCanvas = document.createElement('canvas');
        this.normalCanvas.width = 4096;
        this.normalCanvas.height = 4096;
        this.normalCtx = this.normalCanvas.getContext('2d');
        this.normalTexture = new THREE.CanvasTexture(this.normalCanvas);
        this.normalTexture.anisotropy = 4;
        this.normalTexture.minFilter = THREE.LinearMipmapLinearFilter;

        // Textura con Brillo (Glow)
        this.glowCanvas = document.createElement('canvas');
        this.glowCanvas.width = 4096;
        this.glowCanvas.height = 4096;
        this.glowCtx = this.glowCanvas.getContext('2d');
        this.glowTexture = new THREE.CanvasTexture(this.glowCanvas);
        this.glowTexture.anisotropy = 4;
        this.glowTexture.minFilter = THREE.LinearMipmapLinearFilter;

        // Asignar texturas al material del terreno
        if (this.mapMaterial.userData.tRegionText) {
            this.mapMaterial.userData.tRegionText.value = this.normalTexture;
        }
        if (this.mapMaterial.userData.tRegionTextGlow) {
            this.mapMaterial.userData.tRegionTextGlow.value = this.glowTexture;
        }
    }

    /**
     * Libera las dos texturas 4K de la VRAM del GPU.
     * Llamar antes de re-instanciar o cuando el mapa se destruye.
     */
    dispose() {
        if (this.normalTexture) { this.normalTexture.dispose(); this.normalTexture = null; }
        if (this.glowTexture)   { this.glowTexture.dispose();   this.glowTexture   = null; }
        this.normalCanvas = null;
        this.normalCtx    = null;
        this.glowCanvas   = null;
        this.glowCtx      = null;
            this.isInitialized = false;
    }

    /**
     * Mide el bounding box axial (en píxeles de textura 4096x4096) del nombre de
     * la región, usando EXACTAMENTE la misma fuente, spacing, curvatura y rotación
     * que `_drawText`. Devuelve widthPx/heightPx.
     *
     * Centraliza la medición para que MarkerBuilder construya la hitbox 3D con el
     * mismo tamaño que el texto proyectado, evitando que las hitboxes se
     * superpongan entre regiones vecinas (causa del hover que "a veces salta").
     *
     * @param {object} data  Datos del marcador (name, fontSize, letterSpacing, curveRadius, rotation)
     * @param {CanvasRenderingContext2D} ctx  Contexto 2D (se le asigna font/textAlign/textBaseline)
     * @returns {{widthPx:number, heightPx:number}}
     */
    static measureTextBounds(data, ctx) {
        const fSize = data.fontSize || 80;
        const font = `bold ${fSize}px "Georgia", serif`;
        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const spacing = data.letterSpacing !== undefined ? data.letterSpacing : Math.floor(fSize * 0.25);
        const message = (data.name || '').toUpperCase();

        if (!message) return { widthPx: fSize, heightPx: fSize * 1.5 };

        // Ancho recto idéntico al que usa _drawText para textWidthPixels.
        // El letter-spacing real solo se aplica ENTRE caracteres: (len - 1) * spacing.
        const straightWidth = ctx.measureText(message).width + ((message.length - 1) * spacing);

        // Alto real via métricas del browser (ascent + descent)
        const m = ctx.measureText(message);
        const heightPx = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0) || (fSize * 1.2);

        let widthPx = straightWidth;
        let outH = heightPx;
        // Desvío vertical (en px de textura) del centro visual del arco respecto del ancla:
        // solo distinto de 0 para textos curvados. Se usa para centrar la hitbox/glow sobre
        // el texto curvo. Magnitud = sagita del arco (no es un porcentaje fijo del radio).
        let offsetPx = 0;

        const curveRadius = data.curveRadius || 0;
        const rotationDeg = data.rotation || 0;

        if (curveRadius !== 0) {
            const radius = Math.abs(curveRadius);
            let totalAngle = 0;
            for (let i = 0; i < message.length; i++) {
                const cw = ctx.measureText(message[i]).width;
                totalAngle += (cw + spacing) / radius;
            }
            totalAngle -= spacing / radius;
            // Envolvente del arco: radio exterior = radius + mitad del glyph
            const outerR = radius + (fSize * 0.5);
            widthPx = (2 * outerR * Math.sin(totalAngle / 2)) + (fSize * 0.3);
            outH = radius * (1 - Math.cos(totalAngle / 2)) + (fSize * 1.0);
            // Sagita del arco con el signo de la curvatura (deriva del centro del arco).
            offsetPx = Math.sign(curveRadius) * (radius * (1 - Math.cos(totalAngle / 2)));
        }

        if (rotationDeg !== 0) {
            const r = rotationDeg * Math.PI / 180;
            const c = Math.abs(Math.cos(r));
            const s = Math.abs(Math.sin(r));
            const w = widthPx, h = outH;
            widthPx = w * c + h * s;
            outH = w * s + h * c;
            // NOTA: para texto curvo+rotado la dirección del offset también rota; hoy no hay
            // regiones con ese caso, se aplica a lo largo del eje local para mantener simplicidad.
        }

        return { widthPx, heightPx: outH, offsetPx };
    }

    _drawText(ctx, data, cx, cy, mType, isGlow) {
        const fSize = data.fontSize || 80;
        ctx.font = `bold ${fSize}px "Georgia", serif`;
        const spacing = data.letterSpacing !== undefined ? data.letterSpacing : Math.floor(fSize * 0.25);
        const message = (data.name || '').toUpperCase();
        const curveRadius = data.curveRadius || 0;
        const rotationDeg = data.rotation || 0;
        
        // Medir ancho para la máscara elíptica del shader ((len - 1) espaciados entre caracteres)
        const textWidthPixels = ctx.measureText(message).width + ((message.length - 1) * spacing);
        
        if (isGlow) {
            // Todos los textos en esta textura tienen el brillo amarillo
            ctx.fillStyle = 'rgba(255, 230, 150, 1.0)';
            ctx.shadowColor = 'rgba(255, 200, 50, 0.8)';
            ctx.shadowBlur = 15;
        } else {
            // Textura normal: colores según tipo
            if (['mar', 'oceano'].includes(mType)) {
                ctx.fillStyle = 'rgba(118, 175, 215, 0.26)'; 
                ctx.shadowColor = 'rgba(0,0,0,0)';
                ctx.shadowBlur = 0;
            } else {
                ctx.fillStyle = 'rgba(32, 30, 17, 0.78)'; 
                ctx.shadowColor = 'rgba(0,0,0,0)';
                ctx.shadowBlur = 0;
            }
        }

        ctx.save();
        ctx.translate(cx, cy);
        
        if (rotationDeg !== 0) {
            ctx.rotate(rotationDeg * Math.PI / 180);
        }

        if (curveRadius !== 0) {
            if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

            const radius = curveRadius;
            const sign = Math.sign(radius);
            const absRadius = Math.abs(radius);

            let totalAngle = 0;
            const charAngles = [];
            for (let i = 0; i < message.length; i++) {
                const charWidth = ctx.measureText(message[i]).width;
                const angle = (charWidth + spacing) / absRadius;
                charAngles.push(angle);
                totalAngle += angle;
            }
            totalAngle -= spacing / absRadius; 

            ctx.translate(0, radius);
            ctx.rotate(-sign * (totalAngle / 2));

            for (let i = 0; i < message.length; i++) {
                const charAngle = charAngles[i];
                ctx.rotate(sign * (charAngle / 2));
                
                ctx.save();
                ctx.translate(0, -radius);
                if (sign < 0) {
                    ctx.rotate(Math.PI); 
                }
                ctx.fillText(message[i], 0, 0);
                ctx.restore();

                ctx.rotate(sign * (charAngle / 2));
            }
        } else {
            if ('letterSpacing' in ctx) {
                ctx.letterSpacing = spacing + 'px';
            }
            ctx.fillText(message, 0, 0);
        }
        
        ctx.restore();
        
        return textWidthPixels;
    }
}
