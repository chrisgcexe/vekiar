import { SceneManager } from './scene/SceneManager.js';
import { Map } from './scene/Map.js';
import { Clouds } from './scene/Clouds.js';
import { CameraController } from './controls/CameraController.js';
import { RaycasterBounds } from './controls/RaycasterBounds.js';
import { Compass } from './ui/Compass.js';

import { ResponsiveManager } from './ResponsiveManager.js';

// --- INICIALIZACIÓN DE SISTEMAS ---
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

// Referencias a elementos de la UI
const vignetteElement = document.getElementById('vignette');

// Variable global para suavizar la transición en el tiempo (Delay/Lerp)
let currentIn3DAlpha = 1.0;

// --- BUCLE PRINCIPAL ---
function animate() {
    requestAnimationFrame(animate);
    
    // 1. Lógica de cámara (Transición 2D/3D y centrado)
    cameraController.update(map.aspect);

    // 2. Animar entorno y nubes (le pasamos el target para el Fog of War dinámico)
    const target = cameraController.controls.target;
    clouds.update(target);

    // 3. Lógica de colisiones físicas (Raycasting)
    raycasterBounds.update(map.aspect);

    // 4. Actualizar la brújula UI
    compass.update();

    // 5. Actualizar UI dinámica, Luz Focal y Shader de Niebla (Transición 2D/3D)
    let baseAlpha = 1.0 - cameraController.zoomAlpha;
    
    let targetIn3DAlpha = Math.pow(baseAlpha, 1.5);
    
    // Interpolación en el tiempo (Lerp). 
    // Esto crea exactamente el retraso de "unos milisegundos" que pide el usuario.
    // La variable no salta a 0 al instante, sino que se desliza suavemente.
    currentIn3DAlpha += (targetIn3DAlpha - currentIn3DAlpha) * 0.05;
    
    if (vignetteElement) {
        vignetteElement.style.opacity = currentIn3DAlpha;
    }
    
    // La luz del sol se atenúa un poco en 2D, pero NO se apaga, para mantener el color vivo
    if (sceneManager.sunLight) {
        sceneManager.sunLight.intensity = 0.8 + currentIn3DAlpha * 0.7;
    }

    // La niebla en los bordes del mapa se desvanece en 2D y aparece en 3D
    if (map.material) {
        if (map.material.userData.uZoomAlpha) {
            map.material.userData.uZoomAlpha.value = currentIn3DAlpha;
        }
        if (map.material.userData.uTime) {
            map.material.userData.uTime.value = performance.now() / 1000.0;
        }
        // Aplana el relieve físicamente cuando se hace zoom out (plano 2D perfecto)
        map.material.displacementScale = 3.5 * currentIn3DAlpha;
        if (map.riverMaterial) map.riverMaterial.displacementScale = 3.5 * currentIn3DAlpha;
        if (map.lakeMaterial) map.lakeMaterial.displacementScale = 3.5 * currentIn3DAlpha;
    }

    // Animamos la luz focal de la nieve (pulso mágico)
    if (map.snowLight) {
        const time = performance.now() / 1000.0;
        // Oscilación caótica pero sutil (12.0 a 18.0 aprox)
        let pulse = Math.sin(time * 2.0) * 3.0 + Math.cos(time * 3.5) * 1.5;
        map.snowLight.intensity = (map.snowLightBaseIntensity + pulse) * currentIn3DAlpha;
    }

    // 6. Renderizar frame
    sceneManager.render();
}

animate();
