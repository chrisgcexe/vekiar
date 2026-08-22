import { LoreResolver } from './LoreResolver.js';
export class ContinentSidePanelUI {
    constructor(eventBus, uiContainerId = 'ui') {
        this.eventBus = eventBus;
        this.container = document.getElementById(uiContainerId);
        
        // Crear overlay oscuro
        this.overlay = document.createElement('div');
        this.overlay.className = 'continent-panel-overlay hidden';
        this.container.appendChild(this.overlay);

        // Crear el panel
        this.panel = document.createElement('div');
        this.panel.className = 'continent-side-panel';
        this.container.appendChild(this.panel);

        // Header del panel
        this.header = document.createElement('div');
        this.header.className = 'continent-panel-header';
        
        this.title = document.createElement('h2');
        this.header.appendChild(this.title);

        this.closeBtn = document.createElement('button');
        this.closeBtn.className = 'continent-panel-close';
        this.closeBtn.innerHTML = '&times;';
        this.closeBtn.onclick = () => this.close();
        this.header.appendChild(this.closeBtn);

        this.panel.appendChild(this.header);

       // Contenido del panel
        this.content = document.createElement('div');
        this.content.className = 'continent-panel-content';
        this.panel.appendChild(this.content);

        // Eventos
        this.eventBus.on('marker:continent-open-panel', this.open.bind(this));
        
        this.activeItemId = null;

        // Delegación de eventos para sincronizar hover con el mundo 3D
        this.content.addEventListener('mouseover', (e) => {
            const item = e.target.closest('.continent-place-item');
            if (item && item.dataset.id) {
                // Si hay un botón activo, NO hacemos hover sobre otros en el mapa
                if (!this.activeItemId) {
                    this.eventBus.emit('marker:force-hover', { detail: { id: item.dataset.id } });
                }
            }
        });

        this.content.addEventListener('mouseout', (e) => {
            const item = e.target.closest('.continent-place-item');
            if (item && item.dataset.id) {
                // Si hay un botón activo, la iluminación del mapa ya está bloqueada en él
                if (!this.activeItemId) {
                    this.eventBus.emit('marker:force-unhover', { detail: { id: item.dataset.id } });
                }
            }
        });

        // Click para volar al lugar o deseleccionar
        this.content.addEventListener('click', (e) => {
            const item = e.target.closest('.continent-place-item');
            if (item && item.dataset.id) {
                // Seleccionar nuevo item
                this.activeItemId = item.dataset.id;
                this.content.querySelectorAll('.continent-place-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                
                this.eventBus.emit('ui:sidepanel-item-clicked', { detail: { id: item.dataset.id } });
                this.eventBus.emit('marker:force-hover', { detail: { id: this.activeItemId } });
            } else {
                // Click fuera de un botón -> deseleccionar todo
                if (this.activeItemId) {
                    this.eventBus.emit('marker:force-unhover', { detail: { id: this.activeItemId } });
                    this.activeItemId = null;
                    this.content.querySelectorAll('.continent-place-item').forEach(el => el.classList.remove('active'));
                }
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

        // Construir DOM de forma segura (sin interpolación de strings) para evitar XSS
        // si algún nombre de lugar contiene caracteres como < o >
        const contentRoot = document.createDocumentFragment();

        // El lore se resuelve en un único lugar (lookup + fallback + detección de vacío)
        const descContainer = document.createElement('div');
        descContainer.innerHTML = LoreResolver.getExtendedDescription(name);
        while (descContainer.firstChild) contentRoot.appendChild(descContainer.firstChild);

        if (places && places.length > 0) {
            const groups = {};
            places.forEach(p => {
                const typeName = this.formatTypeName(p.type);
                if (!groups[typeName]) groups[typeName] = [];
                groups[typeName].push(p);
            });

            for (const [type, items] of Object.entries(groups)) {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'continent-places-group';

                const typeHeading = document.createElement('h3');
                typeHeading.textContent = type;
                groupDiv.appendChild(typeHeading);

                // Contenedor con la clase de CSS en lugar de un <ul>
                const gridContainer = document.createElement('div');
                gridContainer.className = 'continent-places-grid';

                items.forEach(itemObj => {
                    const li = document.createElement('div'); // Cambiado a div para la grilla
                    li.className = 'continent-place-item';
                    li.dataset.id = itemObj.id;
                    li.textContent = itemObj.name; // textContent para evitar XSS
                    gridContainer.appendChild(li);
                });

                groupDiv.appendChild(gridContainer);
                contentRoot.appendChild(groupDiv);
            }
        } else {
            const empty = document.createElement('p');
            empty.textContent = 'No hay regiones registradas en este continente.';
            contentRoot.appendChild(empty);
        }

        this.content.innerHTML = ''; // Limpiar contenido anterior
        this.content.appendChild(contentRoot);
        
        this.panel.classList.add('open');
        this.overlay.classList.remove('hidden');
        this.overlay.classList.add('visible');
    }

    formatTypeName(type) {
        switch(type) {
            case 'region': return 'Regiones';
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
        if (this.activeItemId) {
            this.eventBus.emit('marker:force-unhover', { detail: { id: this.activeItemId } });
            this.activeItemId = null;
            this.content.querySelectorAll('.continent-place-item').forEach(el => el.classList.remove('active'));
        }

        this.panel.classList.remove('open');
        this.overlay.classList.remove('visible');
        this.overlay.classList.add('hidden');
        
        // Emitir evento para que la cámara y el focus se restablezcan
        this.eventBus.emit('continent-panel-closed', { detail: {} });
    }
}
