export class LandSystem {
    constructor(mapMaterial) {
        this.uTime = mapMaterial.userData.uTime;
        this.uZoomAlpha = mapMaterial.userData.uZoomAlpha;
    }

    update(appState) {
        // En el futuro acá podemos controlar las estaciones del año, 
        // hacer que el pasto se seque, o cambiar la intensidad de la niebla de los bordes.
    }
}
