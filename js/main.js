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
import { DynamicWeatherManager } from './systems/Weather/DynamicWeatherManager.js';

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
const dayNightCycle = new DayNightCycle(5, 7); // 5 minutos de ciclo, 7x más rápido que la vida real


// 2. Función Principal Asíncrona
async function startApp() {
    // Llamamos a la inicialización una única vez y guardamos los assets
    const assets = await sceneManager.initializeVekiar(appState, map, cameraController);

    // --- INICIALIZAMOS EL CLIMA DINÁMICO ---
    const dynamicWeatherManager = new DynamicWeatherManager(
        sceneManager.scene,
        sceneManager.camera,
        sceneManager.renderer,
        assets,
        map.material,
        map.aspect || 1.0,
        clouds,
        dayNightCycle
    );
    dynamicWeatherManager.init();
    // DEBUG: Controles manuales de clima por teclado
    window.addEventListener('keydown', (e) => {
        if (e.key === 'r' || e.key === 'R') {
            console.log("DEBUG CLIMA: Lloviendo fuerte...");
            dynamicWeatherManager.weatherService.debugSetWeather("Rain", 100, 1.0, 15);
            if(dynamicWeatherManager.systems.wind) dynamicWeatherManager.systems.wind.setVector(15, 90);
            if(dynamicWeatherManager.systems.rain) dynamicWeatherManager.systems.rain.setWind(1.0, 0.0);
        } else if (e.key === 't' || e.key === 'T') {
            console.log("DEBUG CLIMA: Tormenta eléctrica (Relámpagos)...");
            // Condition = "Thunderstorm" activa el StormSystem
            dynamicWeatherManager.weatherService.debugSetWeather("Thunderstorm", 100, 1.0, 25);
            if(dynamicWeatherManager.systems.wind) dynamicWeatherManager.systems.wind.setVector(25, 90);
            if(dynamicWeatherManager.systems.rain) dynamicWeatherManager.systems.rain.setWind(1.5, 0.0);
        } else if (e.key === 'c' || e.key === 'C') {
            console.log("DEBUG CLIMA: Despejando el cielo...");
            dynamicWeatherManager.weatherService.debugSetWeather("Clear", 10, 0.0, 2, 20); // Temp 20
            if(dynamicWeatherManager.systems.rain) dynamicWeatherManager.systems.rain.setWind(0.0, 0.0);
        } else if (e.key === 'h' || e.key === 'H') {
            console.log("DEBUG CLIMA: Calor Extremo (Ola de Calor)...");
            // Mantenemos lo que haya, solo subimos temperatura
            dynamicWeatherManager.weatherService.debugSetTemperature(38);
        } else if (e.key === 'f' || e.key === 'F') {
            console.log("DEBUG CLIMA: Frío Extremo (Helada)...");
            // Mantenemos lo que haya, solo bajamos temperatura
            dynamicWeatherManager.weatherService.debugSetTemperature(0);
        } else if (e.key === 'n' || e.key === 'N') {
            console.log("DEBUG CLIMA: Día muy nublado y ventoso (Para probar Sombras)...");
            // Muchas nubes (80%), nada de lluvia, viento fuerte (30 km/h)
            dynamicWeatherManager.weatherService.debugSetWeather("Clouds", 80, 0.0, 30);
            if(dynamicWeatherManager.systems.wind) dynamicWeatherManager.systems.wind.setVector(30, 45);
            if(dynamicWeatherManager.systems.rain) dynamicWeatherManager.systems.rain.setWind(0.0, 0.0);
        } else if (e.key === 'm' || e.key === 'M') {
            console.log("DEBUG CLIMA: Día parcialmente nublado (Medium)...");
            // Nubes medias (35%), sin lluvia, viento tranquilo (12 km/h)
            dynamicWeatherManager.weatherService.debugSetWeather("Clouds", 35, 0.0, 12);
            if(dynamicWeatherManager.systems.wind) dynamicWeatherManager.systems.wind.setVector(12, 110);
            if(dynamicWeatherManager.systems.rain) dynamicWeatherManager.systems.rain.setWind(0.0, 0.0);
        }
    });
    
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
            clouds.update(target, appState.time, delta);
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
            
            // Actualizamos los sistemas meteorológicos
            dynamicWeatherManager.update(delta, timeMs * 0.001);
            
            if (isPlaying) {
                dayNightCycle.update(delta, sceneManager.sunLight, sceneManager.ambientLight);
                
                // Throttling de la actualización de sombras (aprox 60 fps para máxima fluidez)
                // Usamos 0.016 para asegurar que las sombras se muevan con perfecta suavidad,
                // protegiendo solo a usuarios con monitores de 144Hz o 240Hz.
                _timeSinceLastShadowUpdate += delta;
                if (_timeSinceLastShadowUpdate > 0.016) {
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