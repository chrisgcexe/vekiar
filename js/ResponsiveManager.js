export class ResponsiveManager {
    constructor() {
        this.listeners = [];
        this.isMobile = false;
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        this._checkMobile();

        // Escucha centralizada
        window.addEventListener('resize', this._onResize.bind(this));
    }

    // Patrón Observador: registrar funciones a llamar cuando haya resize
    subscribe(callback) {
        this.listeners.push(callback);
    }

    _checkMobile() {
        // Asumimos móvil si el ancho es menor a 768px
        this.isMobile = this.width < 768;
    }

    _onResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this._checkMobile();

        // Notificar a todos los suscriptores
        for (const callback of this.listeners) {
            callback({
                width: this.width,
                height: this.height,
                isMobile: this.isMobile,
                aspect: this.width / this.height
            });
        }
    }
}
