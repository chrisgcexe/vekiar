import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager.js';
import { Map } from './scene/Map.js';
import { Clouds } from './scene/Clouds.js';
import { MapCameraController } from './controls/MapCameraController.js';
import { Compass } from './ui/Compass.js';
import { ResponsiveManager } from './ResponsiveManager.js';
import { AppState } from './state/AppState.js';
import { MapEditor } from './scene/MapEditor.js?v=2';
import { RegionTooltipUI } from './ui/RegionTooltipUI.js';
import { RegionSidePanelUI } from './ui/RegionSidePanelUI.js';
import { DayNightCycle } from './systems/DayNightCycle.js';

// 1. Instanciamos las clases base
const appState = new AppState();
const responsiveManager = new ResponsiveManager();
const sceneManager = new SceneManager();

// UI 
const regionTooltip = new RegionTooltipUI('ui');
const regionPanel = new RegionSidePanelUI('ui');

// NOTA: Cambiamos cómo se instancia el mapa. 
// No le pasamos los assets todavía.
const map = new Map(sceneManager.scene, sceneManager.renderer); 

const clouds = new Clouds(sceneManager.scene);
const cameraController = new MapCameraController(sceneManager.camera, sceneManager.getDomElement());
// --- CONECTAMOS EL MAPA AL CONTROLADOR ACÁ ---
cameraController.setMap(map);
const compass = new Compass(cameraController);
const dayNightCycle = new DayNightCycle(5, 10);


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
        assets.colorTexture,     // La textura 3D normal
        assets.regionMasks,      // Texturas PNG pre-subidas a VRAM
        map.getSurfaceHeight     // Muestreo de altura de superficie para hitboxes de regiones
    );

    // Click en una región (de lejos) -> dolly de cámara hacia ella hasta el tope de zoom
    window.addEventListener('marker:region-fly-request', (e) => {
        // Offset positivo mueve el target a la derecha, por lo que el objeto queda a la izquierda en la pantalla
        // fullZoom=true: el dolly aterriza en el tope de zoom (minDistance)
        cameraController.flyTo(e.detail.worldPos, 10, true); 
    });

    // Click en una región (de cerca) -> abrir panel
    window.addEventListener('marker:region-open-panel', (e) => {
        // Hacemos el dolly también para centrarlo (el panel lo escuchará para abrirse)
        cameraController.flyTo(e.detail.worldPos, 10); 
    });
    


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

    const clock = new THREE.Clock();

    function animate(timeMs) {
        requestAnimationFrame(animate);
        
        const delta = clock.getDelta();

        const aspect = map.aspect || 1.0; 
        cameraController.update(aspect);
        appState.update(timeMs, cameraController, map, sceneManager.camera); 

        const target = cameraController.target;
        
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
            // El clamping ahora ocurre nativamente en MapCameraController
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
                
                // Las sombras solo necesitan recalcularse cuando la geometría del mapa cambia físicamente
                sceneManager.renderer.shadowMap.needsUpdate = true;
            }
        }

        if (appState.isReady) {
            if (map.snowSystem) map.snowSystem.update(appState);
            if (map.oceanSystem) map.oceanSystem.update(appState);
            if (map.landSystem) map.landSystem.update(appState);
            
            if (typeof map.update === 'function') {
                map.update(appState.time, cameraController.state, sceneManager.camera);
            }
        }

        // Actualizar visibilidad de marcadores según el zoom actual (sistema LOD) y el estado de la cámara
        if (appState.isReady) {
            mapEditor.markerManager.update(cameraController.zoomAlpha ?? 1.0, cameraController.state, cameraController.isDragging);
            if (isPlaying) {
            dayNightCycle.update(delta, sceneManager.sunLight, sceneManager.ambientLight);
            }
        }

        // IMPORTANTE: Actualizar tooltip DESPUÉS de la cámara para evitar temblor
        regionTooltip.update(sceneManager.camera);

        sceneManager.render();
    }

    animate(performance.now());
}

// ¡Damos play!
startApp();