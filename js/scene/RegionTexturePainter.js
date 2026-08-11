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
                    u = (posX + 30) / 60;
                    v = 1.0 - ((posY + 20) / 40);
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

    _drawText(ctx, data, cx, cy, mType, isGlow) {
        const fSize = data.fontSize || 80;
        ctx.font = `bold ${fSize}px "Georgia", serif`;
        const spacing = data.letterSpacing !== undefined ? data.letterSpacing : Math.floor(fSize * 0.25);
        const message = (data.name || '').toUpperCase();
        const curveRadius = data.curveRadius || 0;
        const rotationDeg = data.rotation || 0;
        
        // Medir ancho para la máscara elíptica del shader
        const textWidthPixels = ctx.measureText(message).width + (message.length * spacing);
        
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
