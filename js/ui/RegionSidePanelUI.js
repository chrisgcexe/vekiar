import { regionLore, defaultLore } from '../../assets/data/region_lore.js';
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

        // 2. Buscás la data
        const key = name.toUpperCase();
        const data = regionLore[key] || defaultLore;
        
        // Construir DOM de forma segura (sin interpolación de strings) para evitar XSS
        // si algún nombre de lugar contiene caracteres como < o >
        const contentRoot = document.createDocumentFragment();

        // 3. Creás el contenedor dinámico y le inyectás el extendedDescription
        const descContainer = document.createElement('div');
// AGREGAR ESTA LÓGICA DE VALIDACIÓN ACÁ TAMBIÉN:
        const isExtDescriptionEmpty = data.extendedDescription === "" || data.extendedDescription === "<p></p>";
        descContainer.innerHTML = isExtDescriptionEmpty ? defaultLore.extendedDescription : data.extendedDescription;
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
                groupDiv.className = 'region-places-group';

                const typeHeading = document.createElement('h3');
                typeHeading.textContent = type;
                groupDiv.appendChild(typeHeading);

                const ul = document.createElement('ul');
                ul.style.paddingLeft = '0';

                items.forEach(itemObj => {
                    const li = document.createElement('li');
                    li.className = 'region-place-item';
                    li.dataset.id = itemObj.id;
                    li.style.cssText = 'list-style-type: none; cursor: pointer; margin-bottom: 4px;';
                    li.textContent = itemObj.name; // textContent — nunca interpreta HTML
                    ul.appendChild(li);
                });

                groupDiv.appendChild(ul);
                contentRoot.appendChild(groupDiv);
            }
        } else {
            const empty = document.createElement('p');
            empty.textContent = 'No hay lugares de interés registrados en esta región.';
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
