import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager.js';
import { Map } from './scene/Map.js';
import { Clouds } from './scene/Clouds.js';
import { CameraController } from './controls/CameraController.js';
import { RaycasterBounds } from './controls/RaycasterBounds.js';
import { Compass } from './ui/Compass.js';
import { ResponsiveManager } from './ResponsiveManager.js';
import { AppState } from './state/AppState.js';

// 1. Instanciamos las clases base
const appState = new AppState();
const responsiveManager = new ResponsiveManager();
const sceneManager = new SceneManager();

// NOTA: Cambiamos cómo se instancia el mapa. 
// No le pasamos los assets todavía.
const map = new Map(sceneManager.scene, sceneManager.renderer); 

const clouds = new Clouds(sceneManager.scene);
const cameraController = new CameraController(sceneManager.camera, sceneManager.getDomElement());
// --- CONECTAMOS EL MAPA AL CONTROLADOR ACÁ ---
cameraController.setMap(map);
const raycasterBounds = new RaycasterBounds(sceneManager.camera, cameraController.controls);
const compass = new Compass(cameraController);

// 2. Función Principal Asíncrona
async function startApp() {
    // Acá ocurre la magia: le pedimos a SceneManager que cargue todo
    // y no avanza a la siguiente línea hasta que termina (await)
   await sceneManager.initializeVekiar(appState, map, cameraController);

    // 3. Conexión de Eventos (Ahora que sabemos que el mapa existe)
    responsiveManager.subscribe((state) => {
        const mapAspect = map.aspect || 1.0;
        sceneManager.handleResize(state.aspect, state.width, state.height);
        cameraController.updateConstraints(mapAspect);
    });

    cameraController.updateConstraints(map.aspect); // Constraint inicial

    // 4. Arrancamos el Bucle Principal
    function animate(timeMs) {
        requestAnimationFrame(animate);
        
        // cameraController y raycasterBounds dependen de map.aspect
        // asegurate de que tengan fallbacks si el aspecto aún no se calculó
        const aspect = map.aspect || 1.0; 

        cameraController.update(aspect);
        
        // OJO: Le paso map y sceneManager.camera como agregamos en AppState.js
        appState.update(timeMs, cameraController, map, sceneManager.camera); 

const target = cameraController.controls.target;
        
        // --- CONTROL DE OPACIDAD DINÁMICA DE LAS NUBES ---
        const isPlaying = (cameraController.state === 'DROP_2' || cameraController.state === 'PLAYING');
        
        if (clouds.material && clouds.material.uniforms.uOpacity) {
            if (isPlaying) {
                // Cuando estamos jugando, la opacidad se adapta al zoom de la cámara (zoomAlpha).
                // Si zoomAlpha es 1.0 (lejos), opacidad 1.0. Si zoomAlpha es 0.0 (cerca), 
                // bajamos a 0.25 para que sigan sutilmente visibles como bruma alta.
                const zoomFactor = cameraController.zoomAlpha !== undefined ? cameraController.zoomAlpha : 1.0;
                const targetCloudOpacity = THREE.MathUtils.lerp(0.25, 1.0, zoomFactor);
                
                clouds.material.uniforms.uOpacity.value += (targetCloudOpacity - clouds.material.uniforms.uOpacity.value) * 0.05;
            } else {
                // Durante la intro y espera, se quedan ocultas (0.0)
                clouds.material.uniforms.uOpacity.value += (0.0 - clouds.material.uniforms.uOpacity.value) * 0.05;
            }
        }

        // Actualizamos las nubes si tienen algo de visibilidad
        if (clouds.material && clouds.material.uniforms.uOpacity.value > 0.001) {
            clouds.update(target);
        }
        // -------------------------------------------------
        
        raycasterBounds.update(aspect);
        compass.update();
        sceneManager.update(appState);

        // Si AppState está bloqueado, no actualizamos materiales
        if (appState.isReady && map.material) {
            if (map.material.userData.uZoomAlpha) {
                map.material.userData.uZoomAlpha.value = appState.currentIn3DAlpha;
            }
            if (map.material.userData.uTime) {
                map.material.userData.uTime.value = appState.time;
            }
            map.material.displacementScale = 3.5 * appState.currentIn3DAlpha;
            if (map.riverMaterial) map.riverMaterial.displacementScale = 3.5 * appState.currentIn3DAlpha;
            if (map.lakeMaterial) map.lakeMaterial.displacementScale = 3.5 * appState.currentIn3DAlpha;
        }

        if (appState.isReady) {
            if (map.snowSystem) map.snowSystem.update(appState);
            if (map.oceanSystem) map.oceanSystem.update(appState);
            if (map.landSystem) map.landSystem.update(appState);
        }

        sceneManager.render();
    }

    animate(performance.now());
}

// ¡Damos play!
startApp();