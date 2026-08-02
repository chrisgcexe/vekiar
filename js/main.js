import { SceneManager } from './scene/SceneManager.js';
import { Map } from './scene/Map.js';
import { Clouds } from './scene/Clouds.js';
import { CameraController } from './controls/CameraController.js';
import { RaycasterBounds } from './controls/RaycasterBounds.js';
import { Compass } from './ui/Compass.js';

import { ResponsiveManager } from './ResponsiveManager.js';
import { AppState } from './state/AppState.js';

// --- INICIALIZACIÓN DE SISTEMAS ---
const appState = new AppState();
const responsiveManager = new ResponsiveManager();
const sceneManager = new SceneManager();
const map = new Map(sceneManager.scene, sceneManager.renderer);
const clouds = new Clouds(sceneManager.scene);
const cameraController = new CameraController(sceneManager.camera, sceneManager.getDomElement());
const raycasterBounds = new RaycasterBounds(sceneManager.camera, cameraController.controls);
const compass = new Compass(cameraController);

// --- CONEXIÓN DE EVENTOS ---
// 1. Cuando la pantalla cambia de tamaño
responsiveManager.subscribe((state) => {
    // Si el mapa ya cargó su textura, aspect será válido
    const mapAspect = map.aspect || 1.0;
    
    sceneManager.handleResize(state.aspect, state.width, state.height);
    cameraController.updateConstraints(mapAspect);
});

// 2. Cuando el mapa termina de cargar su textura
map.onLoad((aspect) => {
    cameraController.updateConstraints(aspect);
});

// --- BUCLE PRINCIPAL ---
function animate(timeMs) {
    requestAnimationFrame(animate);
    
    // 1. Lógica de cámara (Transición 2D/3D y centrado)
    cameraController.update(map.aspect);

    // 2. Actualizar el estado global (necesita zoomAlpha calculado por la cámara)
    appState.update(timeMs, cameraController);

    // 2. Animar entorno y nubes (le pasamos el target para el Fog of War dinámico)
    const target = cameraController.controls.target;
    clouds.update(target);

    // 3. Lógica de colisiones físicas (Raycasting)
    raycasterBounds.update(map.aspect);

    // 4. Actualizar la brújula UI
    compass.update();

    // 5. Actualizar UI dinámica, Luz Focal y Shader de Niebla (Transición 2D/3D)
    sceneManager.update(appState);

    // La niebla en los bordes del mapa se desvanece en 2D y aparece en 3D
    if (map.material) {
        if (map.material.userData.uZoomAlpha) {
            map.material.userData.uZoomAlpha.value = appState.currentIn3DAlpha;
        }
        if (map.material.userData.uTime) {
            map.material.userData.uTime.value = appState.time;
        }
        // Aplana el relieve físicamente cuando se hace zoom out (plano 2D perfecto)
        map.material.displacementScale = 3.5 * appState.currentIn3DAlpha;
        if (map.riverMaterial) map.riverMaterial.displacementScale = 3.5 * appState.currentIn3DAlpha;
        if (map.lakeMaterial) map.lakeMaterial.displacementScale = 3.5 * appState.currentIn3DAlpha;
    }

    // Animamos la luz focal de la nieve (pulso mágico)
    if (map.snowLight) {
        // Oscilación caótica pero sutil (12.0 a 18.0 aprox)
        let pulse = Math.sin(appState.time * 2.0) * 3.0 + Math.cos(appState.time * 3.5) * 1.5;
        map.snowLight.intensity = (map.snowLightBaseIntensity + pulse) * appState.currentIn3DAlpha;
    }

    // 6. Renderizar frame
    sceneManager.render();
}

animate();
