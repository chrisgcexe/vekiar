# DocumentaciÃ³n TÃ©cnica: Proyecto VÃ©kiar

> GuÃ­a maestra del proyecto. Cubre la arquitectura completa, el flujo de ejecuciÃ³n, el pipeline de renderizado, el sistema de marcadores, las dependencias y las trampas conocidas. Actualizada al estado actual del cÃ³digo.

---

## Ãndice

1. [Stack TecnolÃ³gico](#1-stack-tecnolÃ³gico)
2. [Estructura de Directorios](#2-estructura-de-directorios)
3. [Flujo de Arranque (Boot Flow)](#3-flujo-de-arranque-boot-flow)
4. [MÃ¡quina de Estados de la CÃ¡mara](#4-mÃ¡quina-de-estados-de-la-cÃ¡mara)
5. [Pipeline de Renderizado](#5-pipeline-de-renderizado)
6. [Sistema de Texturas Empacadas](#6-sistema-de-texturas-empacadas)
7. [Pipeline de la GPU (Shaders)](#7-pipeline-de-la-gpu-shaders)
8. [Sistema de Marcadores (MarkerManager)](#8-sistema-de-marcadores-markermanager)
9. [Sistemas de Ecosistemas](#9-sistemas-de-ecosistemas)
10. [Dependencias y Restricciones de Entorno](#10-dependencias-y-restricciones-de-entorno)
11. [Trampas Conocidas y Decisiones de DiseÃ±o](#11-trampas-conocidas-y-decisiones-de-diseÃ±o)

---

## 1. Stack TecnolÃ³gico

| Capa | TecnologÃ­a | VersiÃ³n |
|---|---|---|
| Motor 3D | Three.js | v0.160.0 |
| Lenguaje | JavaScript ES Modules (ESM) | nativo del browser |
| MÃ³dulos de Three | `OrbitControls`, `CSS2DRenderer` | via `three/addons/` |
| CSS | Vanilla CSS (archivos separados por mÃ³dulo) | â |
| Paralelismo | Web Workers nativo (HTML5) | â |
| MÃ³dulos extra | Ninguno. Sin bundler, sin npm, sin build step. | â |

> **IMPORTANTE**: El proyecto corre **sin bundler**. Todo se resuelve vÃ­a `importmap` en `index.html` apuntando a unpkg CDN. Esto significa que **siempre debe correrse bajo un servidor HTTP** (ej: `python -m http.server 8080`). Si se abre `index.html` directo desde el sistema de archivos (`file://`), los Web Workers y las texturas lanzarÃ¡n error CORS y el mapa no cargarÃ¡.

---

## 2. Estructura de Directorios

```
vekiar/
âââ index.html                  # Entry point HTML + importmap de Three.js
âââ ARCHITECTURE.md             # Este archivo
â
âââ css/
â   âââ style.css               # Reset global (body, canvas)
â   âââ Ui.css                  # Pantalla idle y botÃ³n "Comenzar"
â   âââ Compass.css             # BrÃºjula flotante
â   âââ loader.css              # Pantalla de carga con barra de progreso
â   âââ MapEditor.css           # Panel del editor de marcadores (tecla E)
â   âââ markers.css             # Estilos de etiquetas CSS2D por tipo de marcador
â
âââ assets/
â   âââ images/
â       âââ base_color_map.jpg
â       âââ map_data_R_elevation_B_snow_particles.png
â       âââ masks_1_R_river_G_lake_B_snow.png
â       âââ water_noise_distortion.jpg
â       âââ river_flow_directions.png
â       âââ source_assets/      # Backups e imÃ¡genes de experimentaciÃ³n (no se cargan)
â
âââ js/
    âââ main.js                 # Orquestador principal (instancia + bucle animate)
    âââ ResponsiveManager.js    # Escucha resize y notifica a suscriptores
    â
    âââ state/
    â   âââ AppState.js         # Reloj global, zoomAlpha, LOD update, isReady gate
    â
    âââ scene/
    â   âââ SceneManager.js     # THREE.Scene, WebGLRenderer, CSS2DRenderer, luces
    â   âââ Map.js              # Ensambla el mapa: chunks LOD, rollos, unfurl
    â   âââ TerrainMaterial.js  # MeshStandardMaterial + inyecciÃ³n de shaders propios
    â   âââ MarkerManager.js    # Crea/elimina marcadores 3D y etiquetas CSS2D
    â   âââ MapEditor.js        # Editor de marcadores en runtime (tecla E)
    â   âââ Clouds.js           # Nubes perimetrales decorativas
    â
    âââ controls/
    â   âââ CameraController.js # OrbitControls extendido + mÃ¡quina de estados + lÃ­mites
    â   âââ RaycasterBounds.js  # Clampea el pan usando frustum vs bordes del mapa
    â
    âââ systems/
    â   âââ OceanSystem.js      # Actualiza uniforms del ocÃ©ano/rÃ­os por frame
    â   âââ LandSystem.js       # Actualiza uniforms de la tierra por frame
    â   âââ SnowSystem.js       # 25k partÃ­culas de nieve + PointLight pulsante
    â   âââ PermafrostMistMaterial.js  # Material aditivo de niebla helada
    â
    âââ shaders/
    â   âââ TerrainShader.js    # Orquestador: exporta los chunks GLSL inyectables
    â   âââ CloudShader.js      # Vertex + fragment de las nubes
    â   âââ SnowShader.js       # Vertex + fragment de las partÃ­culas de nieve
    â   âââ PermafrostMistShader.js
    â   âââ MountainGlowShader.js
    â   âââ chunks/
    â       âââ LandChunk.js    # GLSL: color de tierra, nieve acumulada en suelo
    â       âââ WaterChunk.js   # GLSL: ocÃ©ano, caÃºsticas, foam, rÃ­os, lagos
    â
    âââ utils/
    â   âââ AssetLoader.js      # Carga paralela de texturas con reporte de progreso
    â
    âââ workers/
        âââ mapWorker.js        # Hilo separado: convierte heightmap PNG â geometrÃ­a 3D
```

---

## 3. Flujo de Arranque (Boot Flow)

El arranque es **estrictamente secuencial y asÃ­ncrono**. Cada fase depende de que la anterior haya terminado.

```mermaid
graph TD
    A["index.html (importmap + link CSS)"] --> B["main.js â Instancia clases base"]
    B --> C["SceneManager â THREE.Scene + WebGLRenderer + CSS2DRenderer + luces"]
    B --> D["Map (vacÃ­o) â Espera assets"]
    B --> E["CameraController â OrbitControls + mÃ¡quina de estados (INIT)"]
    B --> F["AppState â isReady = false"]
    C --> G["SceneManager.initializeVekiar()"]
    G --> H["AssetLoader.loadVekiarAssets() â Carga paralela de 5 texturas"]
    H --> I["Map.build(assets) â Lanza mapWorker.js en hilo separado"]
    I --> J["mapWorker.js â Convierte canal R (heightmap) en 64 chunks de geometrÃ­a 3D con normales suavizadas"]
    J --> K["Map.js recibe geometrÃ­a â Arma LODs + clipping planes. mapGroup.rotation.x = -PI/2"]
    K --> L["TerrainMaterial.create() â MeshStandardMaterial + onBeforeCompile"]
    L --> M["Sistemas iniciados â Ocean, Land, Snow, PermafrostMist"]
    M --> N["Loader fade-out â cameraController.playIntro() + appState.setTerrainReady()"]
    N --> O["MapEditor.initLoadedMarkers() â MarkerManager.renderAll()"]
    O --> P["animate() loop â rAF continuo"]
```

### Orden de instanciaciÃ³n en `main.js`
    G --> H["AssetLoader.loadVekiarAssets() — Carga paralela de 5 texturas"]
    H --> I["Map.build(assets) — Lanza mapWorker.js en hilo separado"]
    I --> J["mapWorker.js — Convierte canal R (heightmap) en 64 chunks de geometría 3D con normales suavizadas"]
    J --> K["Map.js recibe geometría — Arma LODs + clipping planes. mapGroup.rotation.x = -PI/2"]
    K --> L["TerrainMaterial.create() — MeshStandardMaterial + onBeforeCompile"]
    L --> M["Sistemas iniciados — Ocean, Land, Snow, PermafrostMist"]
    M --> N["Loader fade-out — cameraController.playIntro() + appState.setTerrainReady()"]
    N --> O["MapEditor.initLoadedMarkers() — MarkerManager.renderAll()"]
    O --> P["animate() loop — rAF continuo"]
```

### Orden de instanciación en `main.js`

```
1. AppState          — solo inicializa propiedades, sin side effects
2. ResponsiveManager — escucha window resize, notifica por callback
3. SceneManager      — crea scene, WebGLRenderer, CSS2DRenderer, monta en DOM
4. Map               — constructor vacío (no carga nada todavía)
5. Clouds            — geometría de nubes decorativas
6. CameraController  — OrbitControls, estado INIT, limita movimiento
7. RaycasterBounds   — clampea el pan proyectando el frustum al plano Y=0
8. Compass           — lee el ángulo de OrbitControls, actualiza el div del DOM
```

Después de `startApp()` (async):
```
9.  AssetLoader.loadVekiarAssets()     — await, carga las 5 texturas en paralelo
10. Map.build(assets)                  — await, espera que el Worker termine
11. MapEditor instanciado              — recibe scene, camera, mapPlane, materiales
12. mapEditor.initLoadedMarkers()      — renderAll() de marcadores guardados en localStorage
13. animate() arranca                  — bucle rAF desde aquí en adelante
```

---

## 4. Máquina de Estados de la Cámara y Navegación

`CameraController` tiene una máquina de estados que controla la **intro cinemática** antes de entregar el control al usuario, y un sistema de vuelo (`CameraFlightSystem`) para navegar a puntos de interés.

```
INIT ──playIntro()──► DROP_1 ──llegó a idleDist──► WAIT_INPUT ──btn-start──► DROP_2 ──llegó a playableDist──► PLAYING
```

| Estado | Descripción | Controles |
|---|---|---|
| `INIT` | Estado inicial antes de que cargue el mapa | Todo bloqueado |
| `DROP_1` | Cámara cae de Y=140 a `idleDist`. El mapa se desenvuelve (`updateUnfurl`) sincronizado al progreso de la caída | Zoom y pan desactivados |
| `WAIT_INPUT` | Cámara fija en `idleDist`. Se muestra el prompt "Explorar Vékiar" | Solo aparece el botón |
| `DROP_2` | Al presionar el botón, cámara cae a `playableDist` | Zoom desactivado durante la caída |
| `PLAYING` | Control total entregado al usuario | Pan + zoom activos. Se muestra la brújula. |

### Variables clave de `CameraController`

- **`zoomAlpha`** (`0.0` = máximo zoom in, `1.0` = máximo zoom out): calculado cada frame como `(dist - minDist) / (maxDist - minDist)`. Todos los sistemas lo consumen para blending.
- **`isMapReady` / Eventos `map:ready` y `map:zoom-out`**: La cámara evalúa constantemente `zoomAlpha` frente a un umbral empírico (~0.43). Cuando la cámara cruza este umbral hacia adentro, dispara `map:ready` (haciendo que las regiones se vuelvan interactivas). Cuando el usuario hace "scroll out" y sale del umbral, dispara `map:zoom-out` (bloqueando clics y hover para entrar en estado **Overview puro**).
- **Ángulo polar**: se lockea dinámicamente. Zoom cerca → perspectiva isométrica (`PI/4.5`). Zoom lejos → top-down (`0.01`). Transición con `easeInOut`.

### Vuelo Dinámico (`fitToPoints`)

En lugar de recalcular un "zoom óptimo" (que a menudo empujaba la cámara hacia un zoom out no deseado cuando los marcadores estaban muy separados), el método `fitToPoints` ahora ejecuta un paneo inteligente. La cámara se traslada a la **coordenada baricéntrica** de los puntos de interés aplicando un offset en X para no chocar visualmente con paneles laterales (`RegionSidePanelUI`), todo esto manteniendo obligatoriamente el nivel de zoom máximo (`fullZoom = true`), resultando en una navegación veloz y sin saltos abruptos en el eje Z.

### Restricción de Pan (`RaycasterBounds`)

Cada frame, `RaycasterBounds` proyecta los 4 vÃ©rtices de la pantalla contra el plano `Y=0`. Si el frustum se sale del borde del mapa, aplica un `delta` al target y a la posiciÃ³n de la cÃ¡mara para empujarlo de vuelta. Opera en paralelo con `CameraController.update()`.

---

## 5. Pipeline de Renderizado

Cada frame de `animate()` ejecuta en este orden:

```
1. cameraController.update(aspect)
       ââ MÃ¡quina de estados, zoomAlpha, Ã¡ngulo polar, lÃ­mites de pan

2. appState.update(timeMs, cameraController, map, camera)
       ââ Avanza el reloj (time)
       ââ Calcula currentIn3DAlpha (smooth de zoomAlpha invertido)
       ââ Actualiza LODs de los 64 chunks

3. LÃ³gica de nubes (opacidad con lerp segÃºn estado PLAYING/otro)

4. clouds.update(target)  â solo si opacidad > 0.001

5. raycasterBounds.update(aspect)

6. compass.update()  â rota el div del brÃºjula segÃºn azimut de la cÃ¡mara

7. sceneManager.update(appState)
       ââ sunLight.intensity segÃºn currentIn3DAlpha
       ââ vignette opacity via DOM

8. Uniforms del terreno (desde main.js):
       ââ uZoomAlpha, uTime, displacementScale (Ã 3.5 Ã currentIn3DAlpha)
       ââ riverMaterial y lakeMaterial tambiÃ©n reciben displacementScale

9. Sistemas del ecosistema:
       ââ map.snowSystem.update(appState)   â pulsa la PointLight de nieve
       ââ map.oceanSystem.update(appState)  â actualiza uniforms del ocÃ©ano
       ââ map.landSystem.update(appState)   â actualiza uniforms de la tierra
       ââ map.update(time)                  â actualiza uTime de los rollos de pergamino

10. sceneManager.render()
        ââ renderer.render(scene, camera)       â WebGL / geometrÃ­a 3D
        ââ css2dRenderer.render(scene, camera)  â DOM / etiquetas de marcadores
```

---

## 6. Sistema de Texturas Empacadas

El mapa no usa modelos `.obj`. La geometrÃ­a, el color y todas las mÃ¡scaras se derivan de **PNG empacados por canal** para maximizar rendimiento (1 fetch = 4 mÃ¡scaras).

| Textura | Canal R | Canal G | Canal B | Canal A |
|---|---|---|---|---|
| `base_color_map.jpg` | Color base RGB | — | — | — |
| `map_data_R_elevation_B_snow_particles.png` | **Heightmap** (eleva vértices) | — | **Máscara de partículas de nieve** (spawn mask) | — |
| `masks_1_R_river_G_lake_B_snow.png` | **Ríos** | **Lagos** | **Nieve acumulada** (shader de suelo) | Libre |
| `water_noise_distortion.jpg` | Ruido de distorsión | — | — | — |
| `river_flow_directions.png` | Dirección de flujo X | Dirección de flujo Y | — | — |
| `assets/region_masks/*_mask.png` | **Región N** | **Región N+1** | **Región N+2** | — |

> **TIP**: El sistema de máscaras de regiones (`regionMasks`) lee múltiples texturas PNG, en las que cada canal RGB delimita el área territorial de una región específica. El `TerrainShader` utiliza el producto punto (`dot()`) entre el vector de color extraído del texel y un vector codificado que representa el canal activo. Así, al iluminar una región, la GPU simplemente interpola el canal deseado sin necesidad de texturas extra para estado activo.

> **TIP**: El canal A de `masks_1` estÃ¡ **libre y disponible** para agregar una quinta mÃ¡scara sin agregar un fetch extra.

### CÃ³mo usa el Worker el heightmap

`mapWorker.js` recibe el `ImageData` del canal Rojo vÃ­a `postMessage`. Lo divide en una grilla de **8Ã8 = 64 chunks**, cada uno con **3 niveles de LOD** (64, 32 y 16 segmentos). Para cada vÃ©rtice, el valor del pixel (0â255) determina su altura Z. Las normales se calculan en el worker para no bloquear el hilo principal. Ventaja: Three.js hace Frustum Culling automÃ¡tico sobre los 64 chunks independientes.

---

## 7. Pipeline de la GPU (Shaders)

El terreno usa `THREE.MeshStandardMaterial` (PBR nativo) **hackeado** con `onBeforeCompile`. Esto conserva la iluminaciÃ³n fÃ­sica realista de Three.js e inyecta matemÃ¡tica propia en los puntos exactos del pipeline GLSL.

### Puntos de inyecciÃ³n en el Vertex Shader

| `#include` reemplazado | Por quÃ© |
|---|---|
| `<common>` | Declara uniforms y varyings propios (uTime, uZoomAlpha, vGlobalPos, etc.) |
| `<uv_vertex>` | Pasa las UVs a varyings para uso en el fragment shader |
| `<begin_vertex>` | Aplica el displacement del heightmap a la posiciÃ³n del vÃ©rtice |
| `<worldpos_vertex>` | Calcula y pasa la posiciÃ³n global del vÃ©rtice (`vGlobalPos`) |

### Puntos de inyecciÃ³n en el Fragment Shader

| `#include` reemplazado | Por quÃ© |
|---|---|
| `<common>` | Declara uniforms de texturas (tMapDataPacked, tPackedMasks, tFlowMap, etc.) |
| `<map_fragment>` | **Chunk principal de color**: decide si el pixel es tierra (`LandChunk`) o agua (`WaterChunk`) |
| `<dithering_fragment>` | **Postproceso final**: aplica la sombra dinÃ¡mica de los rollos de pergamino |

### `LandChunk.js`
- Mezcla el color base con la nieve acumulada (canal B de `masks_1`) segÃºn `uZoomAlpha`.
- Ajusta la saturaciÃ³n/brillo segÃºn el nivel de zoom para mantener la legibilidad.

### `WaterChunk.js`
- Detecta si el pixel tiene agua (canal R = rÃ­os, canal G = lagos, ocÃ©ano = sin isla).
- Aplica animaciÃ³n con flowmap para que los rÃ­os fluyan en la direcciÃ³n correcta.
- Superpone caÃºsticas con `tNoise` para el efecto de luz bajo el agua.
- Agrega foam (espuma) en las costas usando la distancia al borde de la mÃ¡scara.

### Shader de los Rollos de Pergamino (`Map.js`)

Los cilindros-rollos (`leftRoll`, `rightRoll`) tienen su propio `onBeforeCompile` con:
- **Vertex**: Ruido sutil que rompe la perfecciÃ³n geomÃ©trica del tubo.
- **Fragment**: Textura de papel procedural (vetas con Perlin), viÃ±eta en los extremos, y un sistema de color dinÃ¡mico segÃºn `uZoom` que transita de `#e3d4be` (vista 2D) a tonos oscuros (vista 3D).

### ConvenciÃ³n de uniforms en `TerrainMaterial`

Los uniforms propios se guardan en `material.userData` y se linkean al shader en `onBeforeCompile`:

```js
// Para escribir en runtime:
material.userData.uTime.value = appState.time;

// NUNCA acceder a material.uniforms directamente
// (Three.js lo maneja internamente y se sobreescribe al compilar)
```

---

## 8. Sistema de Marcadores (MarkerManager)

### Arquitectura Modular

El manejo de marcadores se divide ahora en un ecosistema de clases para respetar el principio de responsabilidad única (Single Responsibility Principle):

1. **`MarkerManager.js`**: Coordinador central (Facade). Su única responsabilidad es instanciar los submódulos y enlazarlos al `EventBus`.
2. **`MarkerRaycaster.js`**: Motor matemático y de eventos DOM. Calcula intersecciones 3D/2D para detectar clics y hovers. Utiliza la bandera estricta `mapReady` para desactivar forzosamente el cursor de interacción ("manito" o pointer) cuando la cámara está muy lejos en el estado de *Overview puro*.
3. **`MarkerInteractionState.js`**: Máquina de estados. Mantiene la memoria de qué región brilla o está seleccionada, e inyecta esto al shader (con lerp continuo en `uFocusedRegionAlpha`).
4. **`MarkerLODSystem.js`**: Nivel de Detalle. Oculta etiquetas y desvanece íconos de ciudades basado en la altura de la cámara (`zoomAlpha`).
5. **`MarkerVisualController.js`**: Responsable de la transición visual (fade) de los nombres gigantes de las regiones. Cuando una región está enfocada, mantiene su etiqueta visible. Si se cierra el panel (`ui:sidepanel-closed`), desvanece suavemente la etiqueta en sincronía con el decaimiento de la luz del shader del terreno.
6. **`MarkerBuilder.js`**, **`MarkerFactory.js`**, **`MarkerPositionResolver.js`**: Trío encargado de construir visualmente los meshes 3D y etiquetas HTML.
6. **`MarkerRegistry.js`**: Base de datos en memoria para acceso rápido (`O(1)`) a los marcadores.
7. **`RegionTexturePainter.js`**: Escribe los nombres gigantes de las regiones en la textura 4K.

#### Jerarquía en el Grafo de Escena

Los marcadores interactivos (pueblos, lagos, islas) tienen **dos componentes separados** que viven en grupos distintos:

```text
THREE.Scene
âââ mapPlaneGroup (rotation.x = -PI/2, scale no uniforme)
â   âââ Mesh (hitboxes invisibles de regiones e Ã­conos 3D)
â   âââ ... chunks de terreno, LODs, rollos, etc.
â
âââ _labelRoot (Group limpio, sin rotaciÃ³n ni escala)
    âââ CSS2DObject (<div class="marker-label">) â etiqueta de texto
```

> **POR QUÃ los labels NO son hijos de `mapPlaneGroup`**: ese grupo tiene `rotation.x = -Math.PI / 2`. Si los `CSS2DObject` fueran hijos de ese grupo, CSS2DRenderer proyectarÃ­a sus posiciones desde un espacio rotado, produciendo **jitter de sub-pixel** (temblor visual). La soluciÃ³n: los labels viven en `_labelRoot` (escena raÃ­z, sin transformaciÃ³n), y sus posiciones se calculan con `mapPlaneGroup.localToWorld()`.

### Flujo de creaciÃ³n de un marcador

```text
MapEditor.onClick()
    ââ Raycaster intersecta mapPlaneGroup
    ââ hit.point â worldToLocal(localPoint) â coordenadas locales del grupo
    ââ openMarkerDialog(localPoint, uv)
        ââ prompt() nombre, region, tipo
        ââ markerData = { id, name, region, type, shape, position: {x,y,z} }
        ââ markers.push(markerData)
        ââ saveToLocalStorage()
        ââ markerManager.spawnVisualMarker(markerData)
            ââ MarkerBuilder.spawnVisualMarker()
                ââ Crea Mesh 3D â agrega a mapPlaneGroup
                ââ Crea CSS2DObject â localToWorld(pos) â agrega a _labelRoot
```

### Clases CSS por tipo de marcador

| Tipo | Clase CSS | Estilo |
|---|---|---|
| `region` | `.marker-region` | Uppercase, espaciado amplio, color verde claro |
| `isla` | `.marker-isla` | Cursiva, tono naranja cÃ¡lido |
| `lago` | `.marker-lago` | Cursiva, tono azul claro |
| `otro` | `.marker-otro` | Normal, blanco suave |

Para cambiar el aspecto visual de cualquier tipo, **solo editar `css/markers.css`** â sin tocar JS ni Three.js.

### Anti-jitter CSS

```css
.marker-label {
    will-change: transform;
    backface-visibility: hidden;
    transform: translateZ(0);
}
```

Estas tres propiedades promueven el elemento a su propia capa del compositor GPU, eliminando el recÃ¡lculo de sub-pixel en CPU que ocurre cada frame.

### Renderizado de CSS2DRenderer

En `SceneManager.render()`, siempre en este orden:
```js
this.renderer.render(scene, camera);      // Primero WebGL (geometrÃ­a 3D)
this.css2dRenderer.render(scene, camera); // DespuÃ©s DOM (etiquetas CSS)
```

El `domElement` del CSS2DRenderer es un `<div>` con `position: absolute; pointer-events: none` montado sobre el `<canvas>` WebGL. El `pointer-events: none` garantiza que los clicks al mapa pasen a travÃ©s de la capa DOM sin interceptarlos.

### Persistencia de marcadores

Los marcadores se guardan en `localStorage` con la clave `vekiar_custom_markers`. Al iniciar la app, `MapEditor.initStorage()` los recupera y `initLoadedMarkers()` los vuelve a dibujar en la escena. El editor tambiÃ©n permite exportar a JSON.

---

## 9. Sistemas de Ecosistemas

Cada sistema es **stateless respecto al frame anterior**: solo actualiza uniforms basÃ¡ndose en `appState`.

### `SnowSystem`
- En el constructor, lee el canal Azul de `mapDataPackedTexture` pixel a pixel para spawnear **25.000 partÃ­culas** solo donde el valor < 128 (zona nevada).
- Calcula el centroide geomÃ©trico de las partÃ­culas y lo guarda en `uMountainCenter` (usado por el shader de tierra para efectos alrededor del pico).
- Coloca una `THREE.PointLight` en el centroide con intensidad pulsante.
- `update()`: pulsa la luz con una suma de senos para simular parpadeo orgÃ¡nico.
- Comparte los uniforms `uTime` y `uZoomAlpha` directamente con el material del terreno (misma referencia de objeto).

### `OceanSystem` / `LandSystem`
- Actualizan uniforms del shader de terreno relacionados con animaciones de tiempo (olas, distorsiÃ³n, etc.).

### `PermafrostMistMaterial`
- Una segunda capa de geometrÃ­a sobre los mismos chunks del terreno.
- Blending aditivo con shader GLSL propio para simular niebla/vapor en zonas de permafrost.
- Recibe los mismos planos de clipping que el terreno para respetar los bordes de los rollos de pergamino.

### `Clouds`
- GeometrÃ­a decorativa perimetral.
- La opacidad se controla por lerp desde `main.js` segÃºn si la cÃ¡mara estÃ¡ en estado `PLAYING`/`DROP_2` o no.

---

## 10. Dependencias y Restricciones de Entorno

### Dependencias externas (CDN, definidas en `index.html`)

```json
{
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
}
```

MÃ³dulos de `three/addons/` usados actualmente:
- `controls/OrbitControls.js` â en `CameraController.js`
- `renderers/CSS2DRenderer.js` â en `SceneManager.js` y `MarkerManager.js`

### Iniciar el servidor HTTP

```bash
# Python (sin dependencias)
python -m http.server 8080

# Node.js
npx serve .
```

> **CAUTION**: Abrir `index.html` con `file://` rompe Web Workers (CORS). Siempre usar servidor HTTP.

---

## 11. Trampas Conocidas y Decisiones de DiseÃ±o

### No crear assets en el loop de animaciÃ³n
Crear un `CanvasTexture`, `CSS2DObject` o geometrÃ­a dentro de `requestAnimationFrame` aniquila el rendimiento. Todos los assets de marcadores se crean **una sola vez** en `MarkerManager.renderAll()`.

### `mapPlaneGroup.rotation.x = -Math.PI / 2`
El grupo principal del mapa estÃ¡ rotado 90Â° en X. Las coordenadas guardadas en el JSON de marcadores (`position.x`, `position.y`, `position.z`) son en espacio **local del grupo rotado**. Para convertirlas a coordenadas del mundo (ej: para los labels CSS2D), siempre usar `mapPlaneGroup.localToWorld()`.

### `appState.isReady` como gate de seguridad
`AppState.isReady` es `false` hasta que el Worker termina y el loader desaparece. Todos los sistemas que dependan de la geometrÃ­a deben checkear `appState.isReady` antes de operar para evitar errores de NaN en el primer frame.

### Planos de clipping en materiales secundarios
Los materiales del océano, ríos, lagos y la niebla de permafrost deben recibir los mismos `clippingPlanes` que el material principal del terreno. Si se agrega un nuevo material de capa, recordar inyectarle `clipLeft` y `clipRight` de `Map.js`.

### LODs y frustum culling
Los 64 chunks son instancias de `THREE.LOD`. `AppState.update()` llama a `lod.update(camera)` por cada chunk cada frame. El frustum culling lo hace Three.js automáticamente. No agregar código de culling manual.

### `CSS2DRenderer` y el orden del DOM
El `domElement` del `CSS2DRenderer` se monta en `document.body` en el constructor de `SceneManager`. Si se agrega algún overlay HTML que deba ir encima de los labels, ponerle un `z-index` explícito en CSS.

### Secuencia de Inicio y Animación (Dolly)
1. Al cargar la página, se muestra el botón 'Comenzar' (`#idle-prompt`) sobre el mapa estático.
2. Al hacer click en el botón, comienza la animación de entrada (Dolly).
3. La cámara desciende y se posiciona en el mapa.
4. SOLO una vez que la animación de Dolly finaliza y el usuario tiene control, se revelan los elementos interactivos de UI (etiquetas CSS2D, tooltips de hover, marcadores, etc.).

### Flujo de Interacción y Clicks (State Machine)

Para evitar comportamientos conflictivos al hacer click, el sistema respeta estrictamente el estado del mapa (`mapReady`), derivado del nivel de zoom actual (`zoomAlpha`), y emite eventos diferenciados:

1. **Estado OVERVIEW / MAP_GENERAL (`!mapReady`, `zoomAlpha > 0.43`)**
   - **Visibilidad:** Regiones, mares y océanos. Los marcadores menores están ocultos.
   - **Interactividad bloqueada:** El cursor NO cambia a "manito" (se mantiene en `grab`). El usuario puede hacer pan y zoom, pero no interactuar con regiones.
   - **Click en una región:** No tiene efecto directo (la validación `mapReady` lo impide) a menos que se trate de un click "forzado" desde un UI externo. Lo ideal es que el usuario haga zoom-in hasta cruzar el umbral.

2. **Estado INTERACTIVO / MAP_DETALLE (`mapReady`, `zoomAlpha <= 0.43`)**
   - **Visibilidad:** Aparecen los marcadores menores (isla, lago, otro). Las regiones muestran el cursor "pointer" (dedito) al hacer hover.
   - **Click en una región:**
     1. El `MarkerManager` emite `marker:region-focus` y la región se ilumina.
     2. Se recuperan todos los marcadores secundarios pertenecientes a la región.
     3. El `MarkerManager` emite `marker:region-fly-request` con todos los puntos.
     4. La cámara ejecuta un `fitToPoints`: Mantiene el máximo nivel de zoom (zoom in), se traslada al centro de gravedad de los puntos y aplica un `offsetX` horizontal para acomodar el panel lateral sin hacer "zoom out".
     5. Al finalizar el vuelo, se emite `marker:region-open-panel` y el `RegionSidePanelUI` se abre para mostrar la información, mientras el texto gigante de la región se desvanece suavemente para no obstruir la vista.

## 12. Arquitectura de UI y refactorización por responsabilidades (en curso)

> Esta sección se actualiza al finalizar **cada paso** de la hoja de ruta de
> descomposición. El objetivo: evitar scripts monolíticos mediante **un módulo =
> una responsabilidad**; los *coordinadores* orquestan, los *helpers* hacen una
> cosa sola. Cada paso se valida con `node --check` + servidor live + QA visual.

### Estado de los archivos UI (`js/ui/`)
```
RegionTooltipUI.js          # Coordinador (hover / unhover / update)
RegionSidePanelUI.js        # Coordinador de panel lateral
Compass.js                  # Brújula flotante
LoreResolver.js             # ✅ Paso 1 — lookup lore + fallback
TooltipAnchorCalculator.js  # ✅ Paso 2 — math puro de anclaje
TooltipPositioner.js        # ✅ Paso 2 — escritura DOM del anclaje
RegionTooltipFactory.js     # ✅ Paso 3 — construcción DOM del tooltip
```

### Hitos Completados (Descomposición 100%)

- **Paso 1:** `LoreResolver.js` centralizó la lógica de búsqueda de textos y fallbacks.
- **Paso 2:** `TooltipAnchorCalculator.js` y `TooltipPositioner.js` dividieron la matemática de anclaje 2D/3D y la escritura al DOM.
- **Paso 3:** `RegionTooltipFactory.js` aisló la creación de elementos HTML, dejando a `RegionTooltipUI` como un orquestador limpio.
- **Paso 4 (Pipeline de Marcadores):** `MarkerBuilder` se descompuso en `MarkerRegistry` (almacenamiento), `MarkerFactory` (meshes) y `MarkerPositionResolver` (cálculo de esquinas mundiales).
- **Paso 5 (EventBus & LOD):** `EventBus.js` reemplazó los CustomEvents globales. `CameraStateService.js` eliminó dependencias circulares. Y finalmente, `MarkerManager` se desmembró en `MarkerRaycaster`, `MarkerInteractionState`, y `MarkerLODSystem`.

El código actual está fuertemente acoplado en concepto, pero totalmente desacoplado en implementación mediante Inyección de Dependencias y Arquitectura Orientada a Eventos (Pub/Sub).
