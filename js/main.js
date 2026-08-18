import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager.js';
import { Map } from './scene/Map.js';
import { Clouds } from './scene/Clouds.js';
import { GlobalInputManager } from './controls/GlobalInputManager.js';
import { MapCameraController } from './controls/MapCameraController.js';
import { Compass } from './ui/Compass.js';
import { ResponsiveManager } from './ResponsiveManager.js';
import { AppState } from './state/AppState.js';
import { CameraStateService } from './scene/CameraStateService.js';
import { EventBus } from './scene/EventBus.js';
import { MapEditor } from './scene/MapEditor.js?v=2';
import { RegionTooltipUI } from './ui/RegionTooltipUI.js';
import { RegionSidePanelUI } from './ui/RegionSidePanelUI.js';
import { DayNightCycle } from './systems/DayNightCycle.js';

// 1. Instanciamos las clases base
const appState = new AppState();
const responsiveManager = new ResponsiveManager();
const sceneManager = new SceneManager();
const eventBus = new EventBus();
const cameraStateService = new CameraStateService();


// UI 
const regionTooltip = new RegionTooltipUI(eventBus, 'ui');
const regionPanel = new RegionSidePanelUI(eventBus, 'ui');

// NOTA: Cambiamos cómo se instancia el mapa. 
// No le pasamos los assets todavía.
const map = new Map(sceneManager.scene, sceneManager.renderer); 

const clouds = new Clouds(sceneManager.scene);
const globalInput = new GlobalInputManager(sceneManager.getDomElement(), eventBus);
const cameraController = new MapCameraController(sceneManager.camera, sceneManager.getDomElement(), eventBus);
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
        map.getSurfaceHeight,    // Muestreo de altura de superficie para hitboxes de regiones
        eventBus
    );

    // Click en una región -> encuadrar todos sus marcadores directamente (un solo vuelo)
    eventBus.on('marker:region-fly-request', (e) => {
        const placePositions = e.detail.placePositions;
        if (placePositions && placePositions.length) {
            // Incluir también la posición de la región central
            const points = [...placePositions, e.detail.worldPos];
            // offsetX = 10 para esquivar el panel lateral que aparecerá
            cameraController.fitToPoints(points, 10);
        } else {
            // Si la región está vacía, solo vamos a su centro con max zoom
            cameraController.flyTo(e.detail.worldPos, 10, true); 
        }
    });

    // Cuando el vuelo termina, MarkerManager emite este evento.
    // La cámara ya está en su lugar final, así que aquí NO volvemos a volar,
    // simplemente permitimos que el UI abra el side panel escuchando este evento.
    eventBus.on('marker:region-open-panel', (e) => {
        // (El SidePanel escucha este evento por su cuenta y se abre)
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
    let _uZoomAlpha = null, _uTime = null, _lastDispAlpha = -1, _timeSinceLastShadowUpdate = 0;

    const clock = new THREE.Clock();

    function animate(timeMs) {
        requestAnimationFrame(animate);
        
        const delta = clock.getDelta();

        const aspect = map.aspect || 1.0; 
        cameraController.update(aspect, delta);
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

            // Escribir displacementScale solo cuando cambió más del 1.5% (Optimización de GPU)
            if (Math.abs(appState.currentIn3DAlpha - _lastDispAlpha) > 0.015) {
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
            cameraStateService.updateFromMarkerManager(mapEditor.markerManager);
            if (isPlaying) {
                dayNightCycle.update(delta, sceneManager.sunLight, sceneManager.ambientLight);
                
                // Throttling de la actualización de sombras (aprox 30 fps para sombras)
                // Conserva el rendimiento al evitar renderizar sombras 60 veces por seg.
                _timeSinceLastShadowUpdate += delta;
                if (_timeSinceLastShadowUpdate > 0.033) {
                    sceneManager.renderer.shadowMap.needsUpdate = true;
                    _timeSinceLastShadowUpdate = 0;
                }
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