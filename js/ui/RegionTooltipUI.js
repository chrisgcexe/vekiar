import * as THREE from 'three';
import { regionLore, defaultLore } from '../../assets/data/region_lore.js';
export class RegionTooltipUI {
    constructor(uiContainerId = 'ui') {
        this.container = document.getElementById(uiContainerId);
        
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'region-tooltip hidden';
        this.container.appendChild(this.tooltip);

        this.title = document.createElement('h3');
        this.tooltip.appendChild(this.title);

       this.description = document.createElement('div');
        this.tooltip.appendChild(this.description);



        // Vector3 preallocado — evita crear un objeto nuevo en cada frame de update()
        this._projVec = new THREE.Vector3();

        // Rectángulo rotado del texto (esquinas mundo de la hitbox de la región) y buffers
        // de proyección reutilizables. null => usar la lógica clásica por worldPos.
        this._textCorners = null;
        this._projCorners = null;
        this._tooltipMeasured = false;
        this._tooltipW = 250;
        this._tooltipH = 120;

        // Cuando es true (recomendado), el tooltip rota en pantalla junto con la inclinación
        // del texto de la región (ej. "OVARN" a -25°), quedando paralelo a él y pegado a su
        // borde superior sin taparlo. Cambiar a false si se prefiere el tooltip siempre
        // horizontal (en ese caso se ancla igual al borde superior del texto rotado).
        this.rotateWithText = true;

        // Cache de dimensiones de ventana — window.innerWidth/Height puede forzar layout queries
        this._vpW = window.innerWidth;
        this._vpH = window.innerHeight;
        window.addEventListener('resize', () => {
            this._vpW = window.innerWidth;
            this._vpH = window.innerHeight;
        }, { passive: true });

        // Conectar a los eventos globales
        window.addEventListener('marker:region-hover', this.onHover.bind(this));
        window.addEventListener('marker:region-unhover', this.onUnhover.bind(this));
        // Ocultar tooltip cuando se hace click en una región (inicia vuelo) o se abre el panel
        window.addEventListener('marker:region-fly-request', this.onUnhover.bind(this));
        
        this.isDisabled = false;
        window.addEventListener('marker:region-open-panel', () => {
            this.isDisabled = true;
            this.onUnhover();
        });
        window.addEventListener('region-panel-closed', () => {
            this.isDisabled = false;
        });
    }

    onHover(e) {
        if (this.isDisabled) return;
        
        const { name, worldPos } = e.detail;
        
        this.title.textContent = name;
// 3. Buscás la data. Si no existe la key, cae al defaultLore
        const key = name.toUpperCase();
        const data = regionLore[key] || defaultLore; 
// Evaluamos si el string está vacío o tiene etiquetas inútiles
    const isDescriptionEmpty = data.shortDescription === "" || data.shortDescription === "<p></p>";


        
        this.title.textContent = name;
        // Inyectás el shortDescription
       this.description.innerHTML = isDescriptionEmpty ? defaultLore.shortDescription : data.shortDescription;
        
        this.targetWorldPos = worldPos;

        // Si el evento trajo las esquinas MUNDO del rectángulo rotado del texto (hitbox),
        // guardarlas para que update() calcule el AABB en pantalla y no tape el texto rotado.
        // Si no llegan (ej. regiones sin hitbox), se usa la lógica clásica por worldPos.
        const corners = e.detail.rectCorners;
        if (Array.isArray(corners) && corners.length >= 4) {
            this._textCorners = corners;
            if (!this._projCorners || this._projCorners.length !== corners.length) {
                this._projCorners = corners.map(() => new THREE.Vector3());
            }
        } else {
            this._textCorners = null;
        }
        this._tooltipMeasured = false; // Re-medir el box del tooltip (cambió el contenido)

        this.tooltip.classList.remove('hidden');
        this.tooltip.classList.add('visible');
    }

    onUnhover() {
        this.targetWorldPos = null;
        this._textCorners = null;
        this.tooltip.classList.remove('visible');
        this.tooltip.classList.add('hidden');
    }

    update(camera) {
        if (!this.targetWorldPos || !camera) return;

        // Reusar el mismo Vector3 en lugar de crear uno nuevo cada frame con .clone()
        this._projVec.copy(this.targetWorldPos);
        this._projVec.project(camera);

        const x = (this._projVec.x * 0.5 + 0.5) * this._vpW;
        const y = -(this._projVec.y * 0.5 - 0.5) * this._vpH;

        // Si conocemos las esquinas MUNDO del rectángulo rotado del texto (hitbox de la
        // región), el tooltip se ancla al borde superior REAL del texto y se rota para
        // acompañar su inclinación (ej. "OVARN" a -25°). Al quedar el tooltip PARALELO al
        // texto y con un gap sobre su normal, nunca llega a taparlo.
        if (this._textCorners) {
            // 1) Proyectar las 4 esquinas del mundo a pantalla.
            const pts = this._projCorners.map((p, i) => {
                const v = p.copy(this._textCorners[i]).project(camera);
                return {
                    x: (v.x * 0.5 + 0.5) * this._vpW,
                    y: -(v.y * 0.5 - 0.5) * this._vpH
                };
            });
            // pts[0..3] = [ (+hw,+hh), (-hw,+hh), (-hw,-hh), (+hw,-hh) ] en el espacio del
            // texto: las aristas 0-1 y 2-3 son los bordes "superior"/"inferior". En pantalla
            // la cara de arriba es cuyo punto medio queda más alto (menor y), así la
            // detectamos igual aunque la cámara no esté perfectamente cenital.
            const mid01 = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
            const mid23 = { x: (pts[2].x + pts[3].x) / 2, y: (pts[2].y + pts[3].y) / 2 };
            const topOnEdge01 = mid01.y <= mid23.y;
            const topMid = topOnEdge01 ? mid01 : mid23;
            const botMid = topOnEdge01 ? mid23 : mid01;
            const eA = topOnEdge01 ? pts[0] : pts[2];
            const eB = topOnEdge01 ? pts[1] : pts[3];

            // Ángulo del texto en pantalla (grados, mismo convenio que el rotate() de CSS).
            // La arista superior se recorre de la esquina derecha a la izquierda (0→1 o 2→3),
            // es decir en sentido OPUESTO a la lectura del texto. Sin corregir, un texto a
            // -25° produce angDeg ≈ +155°, y rotate(155°) deja el tooltip DE CABEZA. Se
            // normaliza a (-90°, 90°] para que quede siempre paralelo al texto (155° y -25°
            // son la misma recta) pero con el contenido legible y la flecha apuntando al texto.
            let angDeg = Math.atan2(eB.y - eA.y, eB.x - eA.x) * 180 / Math.PI;
            angDeg = ((angDeg + 180) % 360 + 360) % 360 - 180; // -> (-180, 180]
            if (angDeg > 90) angDeg -= 180;
            else if (angDeg < -90) angDeg += 180;
            const rad = angDeg * Math.PI / 180;

            // Medir una sola vez por hover (evita forzar layout en cada frame).
            if (!this._tooltipMeasured) {
                this._tooltipW = this.tooltip.offsetWidth || 250;
                this._tooltipH = this.tooltip.offsetHeight || 120;
                this._tooltipMeasured = true;
            }

            // AABB aproximado del tooltip YA rotado (para clampearlo dentro de pantalla).
            const ca = Math.abs(Math.cos(rad));
            const sa = Math.abs(Math.sin(rad));
            const bw = this._tooltipW * ca + this._tooltipH * sa;
            const bh = this._tooltipW * sa + this._tooltipH * ca;

            // Normal del borde inferior al superior, escalada por el gap: el tooltip se
            // separa del texto a lo largo de la MISMA inclinación y acompaña la rotación.
            const dx = topMid.x - botMid.x;
            const dy = topMid.y - botMid.y;
            const len = Math.hypot(dx, dy) || 1;
            const GAP = 20;
            const nx = (dx / len) * GAP;
            const ny = (dy / len) * GAP;

            const clampX = (v) => Math.min(Math.max(v, bw / 2 + 8), this._vpW - bw / 2 - 8);

            // Ancla ARRIBA: la flecha queda a 20px del borde superior del texto, sobre su normal.
            const ax = topMid.x + nx;
            const ay = topMid.y + ny;
            // Ancla ABAJO (variante .below): 20px por debajo del borde inferior del texto.
            const bx = botMid.x - nx;
            const by = botMid.y - ny;

            const fitsAbove = (ay - bh) >= 0;
            const fitsBelow = (by + bh) <= this._vpH;

            if (this.rotateWithText) {
                if (fitsAbove || !fitsBelow) {
                    this.tooltip.classList.remove('below');
                    this.tooltip.style.transformOrigin = '50% 100%';
                    this.tooltip.style.transform = `translate(-50%, -100%) rotate(${angDeg.toFixed(2)}deg)`;
                    this.tooltip.style.left = `${clampX(ax)}px`;
                    this.tooltip.style.top = `${ay}px`;
                } else {
                    this.tooltip.classList.add('below');
                    this.tooltip.style.transformOrigin = '50% 0%';
                    this.tooltip.style.transform = `translate(-50%, 0%) rotate(${angDeg.toFixed(2)}deg)`;
                    this.tooltip.style.left = `${clampX(bx)}px`;
                    this.tooltip.style.top = `${by}px`;
                }
            } else {
                // Variante horizontal: anclado al borde superior del texto rotado, sin rotar.
                this.tooltip.classList.remove('below');
                this.tooltip.style.transformOrigin = '50% 100%';
                this.tooltip.style.transform = 'translate(-50%, -100%)';
                this.tooltip.style.left = `${clampX(topMid.x)}px`;
                this.tooltip.style.top = `${topMid.y - GAP}px`;
            }
            return;
        }

        // Fallback sin hitbox de texto: anclado clásico al worldPos, sin rotaciones residuales.
        this.tooltip.classList.remove('below');
        this.tooltip.style.transform = '';
        this.tooltip.style.transformOrigin = '';
        this.tooltip.style.left = `${x}px`;
        this.tooltip.style.top = `${y}px`;
    }
}
