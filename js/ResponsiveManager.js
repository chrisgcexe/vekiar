export class ResponsiveManager {
    constructor() {
        this.listeners = [];
        this.isMobile = false;
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        this._checkMobile();

        // Throttle con rAF: los callbacks se ejecutan como máximo una vez por frame,
        // evitando layout thrashing cuando el usuario arrastra el borde de la ventana.
        this._rafPending = false;
        window.addEventListener('resize', () => {
            if (this._rafPending) return;
            this._rafPending = true;
            requestAnimationFrame(() => {
                this._rafPending = false;
                this._onResize();
            });
        });
    }

    // Patrón Observador: registrar funciones a llamar cuando haya resize
    subscribe(callback) {
        if (typeof callback === 'function') this.listeners.push(callback);
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
