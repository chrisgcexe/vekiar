export class Compass {
    constructor(cameraController) {
        this.cameraController = cameraController;
        this.lastX = this.cameraController.target.x;
        this.lastZ = this.cameraController.target.z;

        this.elN = document.querySelector('.dir.n');
        this.elS = document.querySelector('.dir.s');
        this.elE = document.querySelector('.dir.e');
        this.elW = document.querySelector('.dir.w');

        // Trackear el estado anterior para evitar writes al DOM sin cambios
        this._prevActive = { n: false, s: false, e: false, w: false };
    }

    _setDir(el, key, active) {
        if (active === this._prevActive[key]) return; // Sin cambio: no tocar el DOM
        this._prevActive[key] = active;
        if (active) el.classList.add('active');
        else el.classList.remove('active');
    }

    update() {
        const currentX = this.cameraController.target.x;
        const currentZ = this.cameraController.target.z;

        const dx = currentX - this.lastX;
        const dz = currentZ - this.lastZ;
        
        this.lastX = currentX;
        this.lastZ = currentZ;

        // Umbral de movimiento para que no se active con temblores minúsculos
        const threshold = 0.02;

        // Eje Z (Norte / Sur) - Recuerda que en Three.js el Norte (hacia arriba en el plano) es -Z
        this._setDir(this.elN, 'n', dz < -threshold);
        this._setDir(this.elS, 's', dz >  threshold);

        // Eje X (Este / Oeste)
        this._setDir(this.elE, 'e', dx >  threshold);
        this._setDir(this.elW, 'w', dx < -threshold);
    }
}
