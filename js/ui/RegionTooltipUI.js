export class RegionTooltipUI {
    constructor(uiContainerId = 'ui') {
        this.container = document.getElementById(uiContainerId);
        
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'region-tooltip hidden';
        this.container.appendChild(this.tooltip);

        this.title = document.createElement('h3');
        this.tooltip.appendChild(this.title);

        this.description = document.createElement('p');
        this.tooltip.appendChild(this.description);

        this.tabsContainer = document.createElement('div');
        this.tabsContainer.className = 'region-tooltip-tabs';
        this.tooltip.appendChild(this.tabsContainer);

        // Crear pestañas dummy
        ['1', '2', '3'].forEach(num => {
            const tab = document.createElement('div');
            tab.className = 'region-tooltip-tab';
            tab.textContent = num;
            this.tabsContainer.appendChild(tab);
        });

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
        this.description.textContent = "Descripción de región provisoria.";
        
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

        // Proyectar la posición 3D al espacio de la pantalla 2D
        const vector = this.targetWorldPos.clone();
        vector.project(camera);

        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = -(vector.y * 0.5 - 0.5) * window.innerHeight;

        // Posicionar (como Ui.css tiene top: 0, left: 100% y transform: translateY(-100%), 
        // le setearemos el left y top explícitos y eliminaremos las dependencias de parent)
        this.tooltip.style.left = `${x}px`;
        this.tooltip.style.top = `${y}px`;
    }
}
