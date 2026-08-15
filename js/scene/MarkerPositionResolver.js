import * as THREE from 'three';

/**
 * MarkerPositionResolver
 * ----------------------
 * Responsabilidad única: matemática pura y cálculo de posiciones/world-space
 * para los marcadores. NO toca el DOM ni el renderer.
 *
 * Extrae:
 *  - localPos → worldPos (via mapPlaneGroup.localToWorld)
 *  - Offset Y diferencial (labels vs meshes)
 *  - Rotación del plano hitbox (compensación eje Y canvas ↔ three)
 *  - Cálculo de las 4 esquinas del AABB rotado en world space (fix overlap Ovarn)
 */
export class MarkerPositionResolver {
    /**
     * @param {THREE.Group} mapPlaneGroup - Grupo rotado del mapa (meshes 3D de iconos)
     */
    constructor(mapPlaneGroup) {
        this.mapPlaneGroup = mapPlaneGroup;
    }

    /**
     * Resuelve una posición local (dentro de mapPlaneGroup) a world space.
     * Reemplaza el patrón repetido de clone() + localToWorld().
     *
     * @param {THREE.Vector3} localPos - Posición en espacio local del mapa
     * @returns {THREE.Vector3} Nueva posición en world space
     */
    resolveWorldPos(localPos) {
        const worldPos = localPos.clone();
        if (this.mapPlaneGroup) {
            this.mapPlaneGroup.updateWorldMatrix(true, false);
            this.mapPlaneGroup.localToWorld(worldPos);
        }
        return worldPos;
    }

    /**
     * Calcula el offset Y vertical para un label CSS2D.
     *
     * Para shapes tipo 'text' (regiones curvas): el label se ancla al centro
     * del texto (offsetY = 0). Para iconos geométricos: el label flota 1.2
     * unidades arriba del mesh.
     *
     * @param {number} posY - Posición Y base del marcador
     * @param {string} shape - Tipo de shape ('text', 'circle', etc.)
     * @returns {number} Offset Y a aplicar
     */
    resolveLabelOffsetY(posY, shape) {
        return shape === 'text' ? posY : posY - 1.2;
    }

    /**
     * Calcula las 4 esquinas del AABB rotado de una hitbox/región en world space.
     *
     * Este es el fix del overlap de Ovarn: en lugar de usar el center mundial
     * del mesh (que puede estar desplazado del texto real por la rotación),
     * se calculan las 4 esquinas exactas del rectángulo rotado proyectado
     * al mundo, permitiendo al tooltip/CullingAABB posicionarse correctamente
     * arriba/abajo del texto.
     *
     * @param {{cx:number,cy:number,w:number,h:number,rot:number,zAnchor:number}} hit - Datos del hitbox
     * @returns {THREE.Vector3[]} Array de 4 vectores en world space (orden: top-right, top-left, bottom-left, bottom-right)
     */
    resolveRectCorners(hit) {
        if (!hit || !this.mapPlaneGroup) return null;

        this.mapPlaneGroup.updateWorldMatrix(true, false);

        const cos = Math.cos(hit.rot);
        const sin = Math.sin(hit.rot);
        const hw = hit.w / 2;
        const hh = hit.h / 2;

        // Esquinas en espacio local del mapa (relativas al centro del hitbox)
        const localCorners = [
            [ hw,  hh], // top-right  (local)
            [-hw,  hh], // top-left
            [-hw, -hh], // bottom-left
            [ hw, -hh]  // bottom-right
        ];

        return localCorners.map(([ox, oy]) => {
            // Rotar el offset al sistema del rectángulo (compensa -hit.rot)
            const worldX = hit.cx + ox * cos - oy * sin;
            const worldY = hit.cy + ox * sin + oy * cos;
            const p = new THREE.Vector3(worldX, worldY, hit.zAnchor);
            // Transformar de local a world
            return this.mapPlaneGroup.localToWorld(p);
        });
    }

    /**
     * Calcula el AABB (axis-aligned bounding box) en world space a partir
     * de un conjunto de esquinas. Útil para CullingAABB y tooltip positioning.
     *
     * @param {THREE.Vector3[]} corners - Array de vectores en world space
     * @returns {{min:THREE.Vector3, max:THREE.Vector3}} Bounding box
     */
    resolveWorldAABB(corners) {
        if (!corners || corners.length === 0) {
            return { min: new THREE.Vector3(), max: new THREE.Vector3() };
        }
        const min = new THREE.Vector3(Infinity, Infinity, Infinity);
        const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
        for (const p of corners) {
            min.x = Math.min(min.x, p.x);
            min.y = Math.min(min.y, p.y);
            min.z = Math.min(min.z, p.z);
            max.x = Math.max(max.x, p.x);
            max.y = Math.max(max.y, p.y);
            max.z = Math.max(max.z, p.z);
        }
        return { min, max };
    }

    /**
     * Extrae el offset Y para texto curvo (sagita) dado un offsetPx en
     * coordenadas de textura 4096x4096 → unidades de mundo locales.
     *
     * @param {number} offsetPx - Desplazamiento en píxeles de la textura (0 si no hay curvatura)
     * @param {number} mapUnits - Unidades de mundo (default 100)
     * @param {number} texSize - Resolución de la textura (default 4096)
     * @returns {number} Offset en unidades de mundo (0 si offsetPx es falsy)
     */
    resolveCurveOffsetY(offsetPx, mapUnits = 100, texSize = 4096) {
        if (!offsetPx) return 0;
        // eje Y del canvas ↔ local están invertidos
        return -offsetPx * (mapUnits / texSize);
    }
}
