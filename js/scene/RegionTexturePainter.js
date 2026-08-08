import * as THREE from 'three';

export class RegionTexturePainter {
    constructor(mapMaterial) {
        this.mapMaterial = mapMaterial;
        this.regionCanvas = null;
        this.regionCtx = null;
        this.regionTexture = null;
    }

    /**
     * Dibuja los textos de regiones, mares y océanos en una textura 4K
     * que luego es leída por el shader del terreno.
     * 
     * @param {Array} markersList - Lista plana de datos de marcadores
     * @param {string|null} hoveredRegionId - ID de la región actualmente focuseada/hover
     * @param {string|null} focusedRegionId - ID de la región enfocada
     */
    updateRegionTexture(markersList, hoveredRegionId, focusedRegionId) {
        if (!this.mapMaterial) return;

        if (!this.regionCanvas) {
            this._initCanvas();
        }

        const ctx = this.regionCtx;
        const w = this.regionCanvas.width;
        const h = this.regionCanvas.height;

        // Limpiar canvas
        ctx.clearRect(0, 0, w, h);

        // Estilos base compartidos
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

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
                const cx = u * w;
                const cy = (1.0 - v) * h;

                this._drawText(ctx, data, cx, cy, mType, hoveredRegionId, focusedRegionId);
            }
        });

        this.regionTexture.needsUpdate = true;
    }

    _initCanvas() {
        this.regionCanvas = document.createElement('canvas');
        // Alta resolución para textos nítidos
        this.regionCanvas.width = 4096;
        this.regionCanvas.height = 4096;
        this.regionCtx = this.regionCanvas.getContext('2d');
        this.regionTexture = new THREE.CanvasTexture(this.regionCanvas);
        this.regionTexture.anisotropy = 4;
        this.regionTexture.minFilter = THREE.LinearMipmapLinearFilter;
        // Asignar textura al material del terreno
        if (this.mapMaterial.userData.tRegionText) {
            this.mapMaterial.userData.tRegionText.value = this.regionTexture;
        }
    }

    _drawText(ctx, data, cx, cy, mType, hoveredRegionId, focusedRegionId) {
        const fSize = data.fontSize || 80;
        ctx.font = `bold ${fSize}px "Georgia", serif`;
        const spacing = data.letterSpacing !== undefined ? data.letterSpacing : Math.floor(fSize * 0.25);
        const message = (data.name || '').toUpperCase();
        const curveRadius = data.curveRadius || 0;
        const rotationDeg = data.rotation || 0;
        
        if (data.id === hoveredRegionId || data.id === focusedRegionId) {
            ctx.fillStyle = 'rgba(255, 230, 150, 1.0)';
            ctx.shadowColor = 'rgba(255, 200, 50, 0.8)';
            ctx.shadowBlur = 15;
        } else {
            if (['mar', 'oceano'].includes(mType)) {
                // Celeste suave y semitransparente para que se fusione con el mar
                ctx.fillStyle = 'rgba(118, 175, 215, 0.26)'; 
                ctx.shadowColor = 'rgba(0,0,0,0)';
                ctx.shadowBlur = 0;
            } else {
                ctx.fillStyle = 'rgba(32, 30, 17, 0.78)'; // Negro para regiones terrestres
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
            // Texto curvo (desactivar letterSpacing nativo porque se calcula manualmente)
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
            totalAngle -= spacing / absRadius; // Quitar el último espaciado

            // Mover el pivote al centro del círculo para que el texto siga anclado en (cx, cy)
            ctx.translate(0, radius);

            ctx.rotate(-sign * (totalAngle / 2));

            for (let i = 0; i < message.length; i++) {
                const charAngle = charAngles[i];
                ctx.rotate(sign * (charAngle / 2));
                
                ctx.save();
                ctx.translate(0, -radius);
                if (sign < 0) {
                    ctx.rotate(Math.PI); // Enderezar si la curva es invertida
                }
                ctx.fillText(message[i], 0, 0);
                ctx.restore();

                ctx.rotate(sign * (charAngle / 2));
            }
        } else {
            // Texto recto
            if ('letterSpacing' in ctx) {
                ctx.letterSpacing = spacing + 'px';
            }
            ctx.fillText(message, 0, 0);
        }
        
        ctx.restore();
    }
}
