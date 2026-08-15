/**
 * EventBus
 * --------
 * Responsabilidad única: proveer un sistema de publicación/suscripción
 * (pub/sub) para comunicación desacoplada entre módulos.
 *
 * Evita que los módulos dependan directamente el uno del otro,
 * permitiendo que emitan y reciban eventos de forma segura.
 *
 * Ejemplo de uso:
 *   const bus = new EventBus();
 *   bus.on('marker:hover', (data) => { ... });
 *   bus.emit('marker:hover', data);
 */
export class EventBus {
    constructor() {
        this._handlers = new Map(); // eventName -> Array<function>
    }

    /**
     * Suscribirse a un evento.
     * @param {string} eventName - Nombre del evento
     * @param {function} handler - Función callback que recibe los datos del evento
     * @returns {void}
     */
    on(eventName, handler) {
        if (!this._handlers.has(eventName)) {
            this._handlers.set(eventName, []);
        }
        this._handlers.get(eventName).push(handler);
    }

    /**
     * Desuscribirse de un evento.
     * @param {string} eventName - Nombre del evento
     * @param {function} handler - Función callback a remover
     * @returns {void}
     */
    off(eventName, handler) {
        const handlers = this._handlers.get(eventName);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Emitir un evento a todos los suscriptores.
     * @param {string} eventName - Nombre del evento
     * @param {...any} data - Datos para pasar a los handlers
     * @returns {boolean} - true si hubo suscriptores, false en otro caso
     */
    emit(eventName, ...data) {
        const handlers = this._handlers.get(eventName);
        if (handlers && handlers.length > 0) {
            handlers.forEach(handler => handler(...data));
            return true;
        }
        return false;
    }

    /**
     * Verificar si hay suscriptores para un evento.
     * @param {string} eventName - Nombre del evento
     * @returns {boolean}
     */
    hasListeners(eventName) {
        const handlers = this._handlers.get(eventName);
        return handlers && handlers.length > 0;
    }

    /**
     * Limpiar todos los handlers (útil para cleanup en runtime).
     * @returns {void}
     */
    clear() {
        this._handlers.clear();
    }
}
