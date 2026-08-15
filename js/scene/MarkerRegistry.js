import * as THREE from 'three';

/**
 * MarkerRegistry
 * --------------
 * Responsabilidad única: mantener el tracking de todos los items activos
 * del sistema de marcadores (`_items` array + `_itemsMap` lookup O(1) por ID).
 *
 * Separa el estado del núcleo de coordinación de MarkerManager, permitiendo
 * que MarkerManager se enfoque en LOD/raycast/hover sin preocuparse por
 * la integridad del registro.
 */
export class MarkerRegistry {
    constructor() {
        /** @type {Array} Lista ordenada de todos los items activos (para iteraciones LOD/fade). */
        this.items = [];
        /** @type {Map<string, object>} Lookup O(1) por ID único. */
        this.itemsMap = new Map();
    }

    /**
     * Registra un nuevo item.
     * @param {object} itemData - Objeto con { label, mesh, type, data, worldPos, isVisible, ... }
     * @returns {object} El item registrado (misma referencia).
     */
    add(itemData) {
        this.items.push(itemData);
        if (itemData.data && itemData.data.id) {
            this.itemsMap.set(itemData.data.id, itemData);
        }
        return itemData;
    }

    /**
     * Busca un item por su ID único.
     * @param {string} id
     * @returns {object|undefined}
     */
    getById(id) {
        return this.itemsMap.get(id);
    }

    /**
     * Lista de todos los items (referencia directa al array interno).
     * @returns {Array}
     */
    getAll() {
        return this.items;
    }

    /**
     * Limpia completamente el registro, incluyendo disposal de geometrías
     * y materiales de los meshes para evitar fugas de memoria de GPU.
     *
     * No toca los grupos `THREE.Group` en escena (eso lo hace el caller
     * que conoce la estructura del grupo), pero sí libera los recursos
     * asociados a cada item registrado.
     */
    clearAndDispose() {
        for (const item of this.items) {
            if (item.mesh) {
                if (item.mesh.geometry) {
                    item.mesh.geometry.dispose();
                }
                if (item.mesh.material) {
                    if (item.mesh.material.map) {
                        item.mesh.material.map.dispose();
                    }
                    item.mesh.material.dispose();
                }
            }
        }
        this.items = [];
        this.itemsMap.clear();
    }

    /**
     * Simplemente vacía el registro sin dispose (útil para casos donde
     * los meshes se reutilizan o se limpian externamente).
     */
    clear() {
        this.items = [];
        this.itemsMap.clear();
    }

    /**
     * Filtra items por tipo.
     * @param {...string} types
     * @returns {Array}
     */
    filterByTypes(...types) {
        const set = new Set(types);
        return this.items.filter(i => set.has(i.type));
    }

    /**
     * Items que pertenecen a una región específica (por nombre).
     * @param {string} regionName
     * @returns {Array}
     */
    getByRegion(regionName) {
        return this.items.filter(i => i.data && i.data.region === regionName);
    }
}
