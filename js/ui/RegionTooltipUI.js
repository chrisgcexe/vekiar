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
        
        this.tooltip.classList.remove('hidden');
        this.tooltip.classList.add('visible');
    }

    onUnhover() {
        this.targetWorldPos = null;
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

        this.tooltip.style.left = `${x}px`;
        this.tooltip.style.top = `${y}px`;
    }
}
