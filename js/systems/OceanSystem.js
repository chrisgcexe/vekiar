export class OceanSystem {
    constructor(mapMaterial) {
        this.uTime = mapMaterial.userData.uTime;
        this.uZoomAlpha = mapMaterial.userData.uZoomAlpha;
    }

    update(appState) {
        // En el futuro acá podemos controlar las mareas, la intensidad de los destellos, 
        // o el caudal de los ríos modificando las variables.
        // Por ahora, solo depende del tiempo global, que ya se actualiza en main.js 
        // a través de map.material.userData.uTime, pero podemos independizarlo.
    }
}
