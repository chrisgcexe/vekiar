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
        
        // Delegación de eventos para sincronizar hover con el mundo 3D
        this.content.addEventListener('mouseover', (e) => {
            const li = e.target.closest('.region-place-item');
            if (li && li.dataset.id) {
                window.dispatchEvent(new CustomEvent('marker:force-hover', { detail: { id: li.dataset.id } }));
            }
        });

        this.content.addEventListener('mouseout', (e) => {
            const li = e.target.closest('.region-place-item');
            if (li && li.dataset.id) {
                window.dispatchEvent(new CustomEvent('marker:force-unhover', { detail: { id: li.dataset.id } }));
            }
        });

        // Cerrar al clickear fuera (en el overlay)
        this.overlay.addEventListener('click', () => {
            this.close();
        });
    }

    open(e) {
        const { name, places } = e.detail;
        this.title.textContent = name;
        
        // Generar contenido dinámico basado en los lugares, manteniendo la descripción original arriba
        let html = `
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam in dui mauris. 
            Vivamus hendrerit arcu sed erat molestie vehicula. Sed auctor neque eu tellus rhoncus ut eleifend nibh porttitor.</p>
            <p>Ut in nulla enim. Phasellus molestie magna non est bibendum non venenatis nisl tempor. 
            Suspendisse dictum feugiat nisl ut dapibus. Mauris iaculis porttitor posuere.</p>
        `;
        
        if (places && places.length > 0) {
            // Agrupar lugares por tipo
            const groups = {};
            places.forEach(p => {
                const typeName = this.formatTypeName(p.type);
                if (!groups[typeName]) groups[typeName] = [];
                groups[typeName].push(p);
            });
            
            // Construir HTML
            for (const [type, items] of Object.entries(groups)) {
                html += `<div class="region-places-group">`;
                html += `<h3>${type}</h3>`;
                html += `<ul style="padding-left: 0;">`;
                items.forEach(itemObj => {
                    html += `<li class="region-place-item" data-id="${itemObj.id}" style="list-style-type: none; cursor: pointer; margin-bottom: 4px;">${itemObj.name}</li>`;
                });
                html += `</ul>`;
                html += `</div>`;
            }
        } else {
            html = `<p>No hay lugares de interés registrados en esta región.</p>`;
        }
        
        this.content.innerHTML = html;
        
        this.panel.classList.add('open');
        this.overlay.classList.remove('hidden');
        this.overlay.classList.add('visible');
    }

    formatTypeName(type) {
        switch(type) {
            case 'otro': return 'Lugares de Interés';
            case 'isla': return 'Islas';
            case 'lago': return 'Lagos';
            case 'rio': return 'Ríos';
            case 'ciudad': return 'Ciudades';
            case 'pueblo': return 'Pueblos';
            default: return 'Otros';
        }
    }

    close() {
        this.panel.classList.remove('open');
        this.overlay.classList.remove('visible');
        this.overlay.classList.add('hidden');
        
        // Emitir evento para que la cámara y el focus se restablezcan
        window.dispatchEvent(new CustomEvent('region-panel-closed'));
    }
}
