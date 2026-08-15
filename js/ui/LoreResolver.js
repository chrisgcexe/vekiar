// js/ui/LoreResolver.js
// Responsabilidad ÚNICA: resolver la lore de una región a partir de su nombre.
//
// Centraliza lo que antes se repetía (duplicación) en:
//   - RegionTooltipUI.onHover   (lookup de shortDescription)
//   - RegionSidePanelUI.open    (lookup de extendedDescription)
//
// Antes hacía: key = name.toUpperCase() -> regionLore[key] || defaultLore ->
// detección de vacío ("", "<p></p>") -> fallback a defaultLore. TODO eso
// vive ahora acá, en un solo lugar. Los consumidores solo piden:
//   LoreResolver.getShortDescription(name) / getExtendedDescription(name).

import { regionLore, defaultLore } from '../../assets/data/region_lore.js';

// Valores que consideramos "vacíos" (sin contenido real).
const EMPTY_VALUES = ['', '<p></p>'];

export class LoreResolver {
    /**
     * Data completa de lore de la región (o defaultLore si no existe).
     * @param {string} name nombre de la región
     * @returns {object}
     */
    static resolve(name) {
        const key = String(name || '').toUpperCase().trim();
        return regionLore[key] || defaultLore;
    }

    /**
     * Texto corto del tooltip. Cae a defaultLore.shortDescription si está vacío.
     * @param {string} name nombre de la región
     * @returns {string} HTML del shortDescription
     */
    static getShortDescription(name) {
        const data = LoreResolver.resolve(name);
        return LoreResolver._withFallback(data.shortDescription, defaultLore.shortDescription);
    }

    /**
     * Texto extendido del panel lateral. Cae a defaultLore.extendedDescription si está vacío.
     * @param {string} name nombre de la región
     * @returns {string} HTML del extendedDescription
     */
    static getExtendedDescription(name) {
        const data = LoreResolver.resolve(name);
        return LoreResolver._withFallback(data.extendedDescription, defaultLore.extendedDescription);
    }

    /**
     * @param {string|undefined} value
     * @param {string} fallback
     * @private
     */
    static _withFallback(value, fallback) {
        return (value == null || EMPTY_VALUES.includes(value)) ? fallback : value;
    }
}
