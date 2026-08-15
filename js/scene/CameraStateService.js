/**
 * CameraStateService
 * ------------------
 * Responsabilidad única: exponer el estado de la cámara de forma
 * desacoplada para su consumo por otros módulos (EventBus, MarkerManager, UI).
 *
 * Extrae datos puros sin exponer la clase MarkerManager completa.
 */
export class CameraStateService {
    /**
     * @param {object} markerManager - Instancia de MarkerManager (opcional, para extraer estado interno)
     */
    constructor(markerManager = null) {
        this._zoomAlpha = 0;
        this._cameraSig = null;
        this._isReady = false;

        if (markerManager && markerManager._lastZoomAlpha !== undefined) {
            this._zoomAlpha = markerManager._lastZoomAlpha;
            this._cameraSig = markerManager._lastCameraSig;
            this._isReady = true;
        }
    }

    /**
     * Obtiene el valor actual de zoomAlpha.
     * 0.0 = máximo zoom in (cerca), 1.0 = máximo zoom out (lejos).
     * @returns {number}
     */
    getZoomAlpha() {
        return this._zoomAlpha;
    }

    /**
     * Verifica si la cámara está lista para interactuar con marcadores.
     * @returns {boolean}
     */
    isCameraReady() {
        return this._isReady;
    }

    /**
     * Obtiene la firma (signature) de la cámara para detectar cambios.
     * Si el posición/rotación de la cámara cambia aunque el puntero esté quieto,
     * se fuerza un re-casteo para seguir el mundo en movimiento.
     * @returns {number|null}
     */
    getCameraSignature() {
        return this._cameraSig;
    }

    /**
     * Actualiza el estado interno desde una instancia de MarkerManager.
     * @param {object} markerManager - Instancia de MarkerManager
     * @returns {this}
     */
    updateFromMarkerManager(markerManager) {
        if (markerManager && markerManager._lastZoomAlpha !== undefined) {
            this._zoomAlpha = markerManager._lastZoomAlpha;
            this._cameraSig = markerManager._lastCameraSig;
            this._isReady = true;
        }
        return this;
    }
}
