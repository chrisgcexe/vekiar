// js/ui/RegionTooltipFactory.js
// Responsabilidad ÚNICA: construir el árbol DOM del tooltip.
// RegionTooltipUI consume los nodos devueltos ({tooltip, title, description}) y
// mantiene la lógica de posicionamiento / hover / lifecycle. Mantener la
// construcción del DOM aislada del resto evita que la geometría de update() se
// vea contaminada por detalles de markup (clases, orden de append, etc.).

export class RegionTooltipFactory {
    /**
     * @param {HTMLElement} container  contenedor pad (normalmente #ui)
     * @returns {{tooltip:HTMLDivElement,title:HTMLHeadingElement,description:HTMLDivElement}}
     */
    static create(container) {
        const tooltip = document.createElement('div');
        tooltip.className = 'region-tooltip hidden';
        container.appendChild(tooltip);

        const title = document.createElement('h3');
        tooltip.appendChild(title);

        const description = document.createElement('div');
        tooltip.appendChild(description);

        return { tooltip, title, description };
    }
}
