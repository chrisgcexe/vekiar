export class Compass {
    constructor(cameraController) {
        this.cameraController = cameraController;
        this.lastX = this.cameraController.controls.target.x;
        this.lastZ = this.cameraController.controls.target.z;

        this.elN = document.querySelector('.dir.n');
        this.elS = document.querySelector('.dir.s');
        this.elE = document.querySelector('.dir.e');
        this.elW = document.querySelector('.dir.w');
    }

    update() {
        const currentX = this.cameraController.controls.target.x;
        const currentZ = this.cameraController.controls.target.z;

        const dx = currentX - this.lastX;
        const dz = currentZ - this.lastZ;
        
        this.lastX = currentX;
        this.lastZ = currentZ;

        // Umbral de movimiento para que no se active con temblores minúsculos
        const threshold = 0.02;

        // Eje Z (Norte / Sur) - Recuerda que en Three.js el Norte (hacia arriba en el plano) es -Z
        if (dz < -threshold) {
            this.elN.classList.add('active');
        } else {
            this.elN.classList.remove('active');
        }

        if (dz > threshold) {
            this.elS.classList.add('active');
        } else {
            this.elS.classList.remove('active');
        }
        
        // Eje X (Este / Oeste)
        if (dx > threshold) {
            this.elE.classList.add('active');
        } else {
            this.elE.classList.remove('active');
        }

        if (dx < -threshold) {
            this.elW.classList.add('active');
        } else {
            this.elW.classList.remove('active');
        }
    }
}
