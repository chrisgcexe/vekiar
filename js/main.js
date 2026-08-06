import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager.js';
import { Map } from './scene/Map.js';
import { Clouds } from './scene/Clouds.js';
import { CameraController } from './controls/CameraController.js';
import { RaycasterBounds } from './controls/RaycasterBounds.js';
import { Compass } from './ui/Compass.js';
import { ResponsiveManager } from './ResponsiveManager.js';
import { AppState } from './state/AppState.js';
import { MapEditor } from './scene/MapEditor.js';

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
    // Llamamos a la inicialización una única vez y guardamos los assets
    const assets = await sceneManager.initializeVekiar(appState, map, cameraController);

    // --- INICIALIZAMOS EL EDITOR DE MARCADORES ---
    const mapEditor = new MapEditor(
        sceneManager.scene,
        sceneManager.camera,
        sceneManager.getDomElement(),
        map.plane,
        map.material,
        assets.referenceTexture, // La textura con nombres plana
        assets.colorTexture      // La textura 3D normal
    );

    // Click en una región → dolly de cámara hacia ella
    window.addEventListener('marker:region-click', (e) => {
        cameraController.flyTo(e.detail.worldPos);
    });
    // ---------------------------------------------

    // 3. Conexión de Eventos
    responsiveManager.subscribe((state) => {
        const mapAspect = map.aspect || 1.0;
        sceneManager.handleResize(state.aspect, state.width, state.height);
        cameraController.updateConstraints(mapAspect);
    });

    cameraController.updateConstraints(map.aspect); 

    // 4. Arrancamos el Bucle Principal
    // Cache de referencias a uniforms (evita lookup por string key en userData cada frame)
    let _uZoomAlpha = null, _uTime = null, _lastDispAlpha = -1;

    function animate(timeMs) {
        requestAnimationFrame(animate);
        
        const aspect = map.aspect || 1.0; 
        cameraController.update(aspect);
        appState.update(timeMs, cameraController, map, sceneManager.camera); 

        const target = cameraController.controls.target;
        
        const isPlaying = (cameraController.state === 'DROP_2' || cameraController.state === 'PLAYING');
        
        if (clouds.material && clouds.material.uniforms.uOpacity) {
            if (isPlaying) {
                const zoomFactor = cameraController.zoomAlpha !== undefined ? cameraController.zoomAlpha : 1.0;
                const targetCloudOpacity = THREE.MathUtils.lerp(0.25, 1.0, zoomFactor);
                clouds.material.uniforms.uOpacity.value += (targetCloudOpacity - clouds.material.uniforms.uOpacity.value) * 0.05;
            } else {
                clouds.material.uniforms.uOpacity.value += (0.0 - clouds.material.uniforms.uOpacity.value) * 0.05;
            }
        }

        if (clouds.material && clouds.material.uniforms.uOpacity.value > 0.001) {
            clouds.update(target, appState.time);
        }
        
        if (cameraController.state !== 'FLY_TO') {
            raycasterBounds.update(aspect);
        }
        compass.update();
        sceneManager.update(appState);

        if (appState.isReady && map.material) {
            // Inicializar cache de uniforms la primera vez que el material está listo
            if (!_uZoomAlpha) {
                _uZoomAlpha = map.material.userData.uZoomAlpha || null;
                _uTime     = map.material.userData.uTime     || null;
            }
            if (_uZoomAlpha) _uZoomAlpha.value = appState.currentIn3DAlpha;
            if (_uTime)      _uTime.value      = appState.time;

            // Escribir displacementScale solo cuando cambió más del 0.2%
            if (Math.abs(appState.currentIn3DAlpha - _lastDispAlpha) > 0.002) {
                _lastDispAlpha = appState.currentIn3DAlpha;
                const disp = 3.5 * _lastDispAlpha;
                map.material.displacementScale = disp;
                if (map.riverMaterial) map.riverMaterial.displacementScale = disp;
                if (map.lakeMaterial)  map.lakeMaterial.displacementScale  = disp;
            }
        }

        if (appState.isReady) {
            if (map.snowSystem) map.snowSystem.update(appState);
            if (map.oceanSystem) map.oceanSystem.update(appState);
            if (map.landSystem) map.landSystem.update(appState);
            
            if (typeof map.update === 'function') {
                map.update(appState.time);
            }
        }

        // Actualizar visibilidad de marcadores según el zoom actual (sistema LOD) y el estado de la cámara
        if (appState.isReady) {
            mapEditor.markerManager.update(cameraController.zoomAlpha ?? 1.0, cameraController.state);
        }

        sceneManager.render();
    }

    animate(performance.now());
}

// ¡Damos play!
startApp();