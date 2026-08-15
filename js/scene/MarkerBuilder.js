import * as THREE from 'three';
import { MarkerFactory } from './MarkerFactory.js';
import { MarkerPositionResolver } from './MarkerPositionResolver.js';

/**
 * MarkerBuilder
 * -------------
 * Orquestador de marcadores. Delega la creación visual a MarkerFactory
 * y el posicionamiento a MarkerPositionResolver, manteniendo la API
 * pública `spawnVisualMarker(data)` intacta para compatibilidad con
 * MarkerManager.
 *
 * Responsabilidad única: coordinar la creación de marcadores, pero
 * delegar la lógica de texturas/meshes/hitboxes a MarkerFactory
 * y la lógica de posición (local→world, rectCorners) a MarkerPositionResolver.
 */
export class MarkerBuilder {
    /**
     * @param {object} manager - Instancia de MarkerManager (expondrá markersGroup, _labelRoot, _items, _itemsMap, mapPlaneGroup)
     * @param {MarkerFactory} [factory] - Instancia inyectada (default: nueva)
     * @param {MarkerPositionResolver} [resolver] - Instancia inyectada (default: nueva)
     */
    constructor(manager, factory = null, resolver = null) {
        this.manager = manager;
        this.factory = factory || new MarkerFactory();
        this.resolver = resolver || new MarkerPositionResolver(manager.mapPlaneGroup);
    }

    /**
     * Crea un marcador visual a partir de los datos proporcionados.
     * Esta es la API pública principal, llamada por MarkerManager.renderAll().
     *
     * @param {object} data - Datos del marcador: { type, shape, position?, x, y, z, name, rotation?, region, id }
     * @returns {void} (side-effect: agrega mesh/label al manager)
     */
    spawnVisualMarker(data) {
        const shape = data.shape || 'circle';
        const markerType = String(data.type || 'otro').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

        const posX = data.position ? data.position.x : data.x;
        const posY = data.position ? data.position.y : data.y;
        const posZ = data.position ? data.position.z : data.z;
        const pos = new THREE.Vector3(posX, posY, posZ);

        let mesh = null;
        const isTextSurface = ['region', 'mar', 'oceano'].includes(markerType);

        // --- Icono 3D ---
        if (!isTextSurface && shape !== 'text') {
            const result = this.factory.createIconMesh({ data, shape, markerType, pos });
            mesh = result.mesh;
            this.manager.markersGroup.add(mesh);

        } else if (markerType === 'region') {
            const result = this.factory.createRegionHitbox({ data, markerType, pos, rotation: data.rotation });
            mesh = result.mesh;
            this.manager.markersGroup.add(mesh);
        }

        // --- Label CSS2D ---
        if (data.name) {
            if (['mar', 'oceano'].includes(markerType)) {
                // Labels fijos enworld para mar/océano: posición world directa
                const worldPos = this.resolver.resolveWorldPos(pos);
                const itemData1 = { label: null, mesh, type: markerType, data, worldPos, isVisible: null };
                this.manager._registry.add(itemData1);
            } else {
                // Labels para pueblos, islas, etc.: usar fábrica CSS2D
                const label = this.factory.createTextLabel(data.name, markerType, data.id);

                // Posición del label: text → alineado al centro, icono → flota 1.2 arriba
                const labelY = this.resolver.resolveLabelOffsetY(posY, shape);
                const localPos = new THREE.Vector3(posX, labelY, posZ + 0.4);
                const worldPos = this.resolver.resolveWorldPos(localPos);

                if (label) {
                    label.position.copy(worldPos);
                    if (shape === 'text') {
                        label.userData = { id: data.id, name: data.name, region: data.region, type: markerType };
                    }
                    this.manager._labelRoot.add(label);
                }

                const itemData2 = { label, mesh, type: markerType, data, worldPos: worldPos.clone(), isVisible: null };
                this.manager._registry.add(itemData2);
            }
        }
    }
}
