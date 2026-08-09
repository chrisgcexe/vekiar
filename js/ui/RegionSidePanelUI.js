export class RegionSidePanelUI {
    constructor(uiContainerId = 'ui') {
        this.container = document.getElementById(uiContainerId);
        
        // Crear overlay oscuro
        this.overlay = document.createElement('div');
        this.overlay.className = 'region-panel-overlay hidden';
        this.container.appendChild(this.overlay);

        // Crear el panel
        this.panel = document.createElement('div');
        this.panel.className = 'region-side-panel';
        this.container.appendChild(this.panel);

        // Header del panel
        this.header = document.createElement('div');
        this.header.className = 'region-panel-header';
        
        this.title = document.createElement('h2');
        this.header.appendChild(this.title);

        this.closeBtn = document.createElement('button');
        this.closeBtn.className = 'region-panel-close';
        this.closeBtn.innerHTML = '&times;';
        this.closeBtn.onclick = () => this.close();
        this.header.appendChild(this.closeBtn);

        this.panel.appendChild(this.header);

        // Contenido del panel
        this.content = document.createElement('div');
        this.content.className = 'region-panel-content';
        this.content.innerHTML = `
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam in dui mauris. 
            Vivamus hendrerit arcu sed erat molestie vehicula. Sed auctor neque eu tellus rhoncus ut eleifend nibh porttitor.</p>
            <p>Ut in nulla enim. Phasellus molestie magna non est bibendum non venenatis nisl tempor. 
            Suspendisse dictum feugiat nisl ut dapibus. Mauris iaculis porttitor posuere.</p>
        `;
        this.panel.appendChild(this.content);

        // Eventos
        window.addEventListener('marker:region-open-panel', this.open.bind(this));
        
        // Cerrar al clickear fuera (en el overlay)
        this.overlay.addEventListener('click', () => {
            this.close();
        });
    }

    open(e) {
        const { name } = e.detail;
        this.title.textContent = name;
        
        this.panel.classList.add('open');
        this.overlay.classList.remove('hidden');
        this.overlay.classList.add('visible');
    }

    close() {
        this.panel.classList.remove('open');
        this.overlay.classList.remove('visible');
        this.overlay.classList.add('hidden');
        
        // Emitir evento para que la cámara y el focus se restablezcan
        window.dispatchEvent(new CustomEvent('region-panel-closed'));
    }
}
