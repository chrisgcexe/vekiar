import * as THREE from 'three';
import { LoreResolver } from './LoreResolver.js';
import { TooltipAnchorCalculator } from './TooltipAnchorCalculator.js';
import { TooltipPositioner } from './TooltipPositioner.js';
import { RegionTooltipFactory } from './RegionTooltipFactory.js';

export class RegionTooltipUI {
    constructor(eventBus, uiContainerId = 'ui') {
        this.eventBus = eventBus;
        this.container = document.getElementById(uiContainerId);
        
                // Árbol DOM del tooltip construido por RegionTooltipFactory (SRP: sólo markup).
        const nodes = RegionTooltipFactory.create(this.container);
        this.tooltip = nodes.tooltip;
        this.title = nodes.title;
        this.description = nodes.description;



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
        this.eventBus.on('marker:region-hover', this.onHover.bind(this));
        this.eventBus.on('marker:region-unhover', this.onUnhover.bind(this));
        // Ocultar tooltip cuando se hace click en una región (inicia vuelo) o se abre el panel
        this.eventBus.on('marker:region-fly-request', this.onUnhover.bind(this));
        
        this.isDisabled = false;
        this.eventBus.on('marker:region-open-panel', () => {
            this.isDisabled = true;
            this.onUnhover();
        });
        this.eventBus.on('region-panel-closed', () => {
            this.isDisabled = false;
        });
    }

    onHover(e) {
        if (this.isDisabled) return;
        
        const { name, worldPos } = e.detail;
        
        this.title.textContent = name;
        this.description.innerHTML = LoreResolver.getShortDescription(name);
        
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

        // Si conocemos las esquinas MUNDO del rectángulo rotado del texto (hitbox),
        // anclamos al borde superior REAL y rotamos el tooltip para acompañar la
        // inclinación del texto (ej. "OVARN" a -25°) sin taparlo.
        if (this._textCorners) {
            // Medir el box del tooltip una sola vez por hover (evita layout queries por frame).
            if (!this._tooltipMeasured) {
                this._tooltipW = this.tooltip.offsetWidth || 250;
                this._tooltipH = this.tooltip.offsetHeight || 120;
                this._tooltipMeasured = true;
            }

            // Proyectar las 4 esquinas del mundo a pantalla (reutiliza Vector3).
            const screenCorners = this._projectCorners(camera);

            // Cálculo puro del anclaje (math; el DOM lo escribe TooltipPositioner).
            const anchor = TooltipAnchorCalculator.calculate(
                screenCorners, this._tooltipW, this._tooltipH, this._vpW, this._vpH,
                { rotateWithText: this.rotateWithText }
            );
            TooltipPositioner.apply(this.tooltip, anchor);
            return;
        }

        // Fallback sin hitbox de texto: anclado clásico al worldPos, sin rotaciones residuales.
        this._projVec.copy(this.targetWorldPos);
        this._projVec.project(camera);
        const x = (this._projVec.x * 0.5 + 0.5) * this._vpW;
        const y = -(this._projVec.y * 0.5 - 0.5) * this._vpH;
        TooltipPositioner.apply(this.tooltip, {
            left: x,
            top: y,
            transform: '',
            transformOrigin: '',
            isBelow: false
        });
    }

    // Proyecta las esquinas MUNDO del texto a pantalla reutilizando los Vector3 preallocados.
    _projectCorners(camera) {
        return this._projCorners.map((p, i) => {
            const v = p.copy(this._textCorners[i]).project(camera);
            return {
                x: (v.x * 0.5 + 0.5) * this._vpW,
                y: -(v.y * 0.5 - 0.5) * this._vpH
            };
        });
    }
}
