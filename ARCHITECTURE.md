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

```
1. AppState          â solo inicializa propiedades, sin side effects
2. ResponsiveManager â escucha window resize, notifica por callback
3. SceneManager      â crea scene, WebGLRenderer, CSS2DRenderer, monta en DOM
4. Map               â constructor vacÃ­o (no carga nada todavÃ­a)
5. Clouds            â geometrÃ­a de nubes decorativas
6. CameraController  â OrbitControls, estado INIT, limita movimiento
7. RaycasterBounds   â clampea pan proyectando el frustum al plano Y=0
8. Compass           â lee el Ã¡ngulo de OrbitControls, actualiza el div del DOM
```

DespuÃ©s de `startApp()` (async):
```
9.  AssetLoader.loadVekiarAssets()     â await, carga las 5 texturas en paralelo
10. Map.build(assets)                  â await, espera que el Worker termine
11. MapEditor instanciado              â recibe scene, camera, mapPlane, materiales
12. mapEditor.initLoadedMarkers()      â renderAll() de marcadores guardados en localStorage
13. animate() arranca                  â bucle rAF desde aquÃ­ en adelante
```

---

## 4. MÃ¡quina de Estados de la CÃ¡mara

`CameraController` tiene una mÃ¡quina de estados que controla la **intro cinemÃ¡tica** antes de entregar el control al usuario.

```
INIT ââplayIntro()âââº DROP_1 ââllegÃ³ a idleDistâââº WAIT_INPUT ââbtn-startâââº DROP_2 ââllegÃ³ a playableDistâââº PLAYING
```

| Estado | DescripciÃ³n | Controles |
|---|---|---|
| `INIT` | Estado inicial antes de que cargue el mapa | Todo bloqueado |
| `DROP_1` | CÃ¡mara cae de Y=140 a `idleDist`. El mapa se desenvuelve (`updateUnfurl`) sincronizado al progreso de la caÃ­da | Zoom y pan desactivados |
| `WAIT_INPUT` | CÃ¡mara fija en `idleDist`. Se muestra el prompt "Explorar VÃ©kiar" | Solo aparece el botÃ³n |
| `DROP_2` | Al presionar el botÃ³n, cÃ¡mara cae a `playableDist` | Zoom desactivado durante la caÃ­da |
| `PLAYING` | Control total entregado al usuario | Pan + zoom activos. Se muestra la brÃºjula. |

### Variables clave de `CameraController`

- **`zoomAlpha`** (`0.0` = mÃ¡ximo zoom in, `1.0` = mÃ¡ximo zoom out): calculado cada frame como `(dist - minDist) / (maxDist - minDist)`. Todos los sistemas lo consumen para blending.
- **`calculatedMaxDistance`**: calculado a partir del FOV y el aspect del mapa para que en zoom mÃ¡ximo la cÃ¡mara justo cubra el mapa sin ver vacÃ­o.
- **Ãngulo polar**: se lockea dinÃ¡micamente. Zoom cerca â perspectiva isomÃ©trica (`PI/4.5`). Zoom lejos â top-down (`0.01`). TransiciÃ³n con `easeInOut`.

### RestricciÃ³n de Pan (`RaycasterBounds`)

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
| `base_color_map.jpg` | Color base RGB | â | â | â |
| `map_data_R_elevation_B_snow_particles.png` | **Heightmap** (eleva vÃ©rtices) | â | **MÃ¡scara de partÃ­culas de nieve** (spawn mask) | â |
| `masks_1_R_river_G_lake_B_snow.png` | **RÃ­os** | **Lagos** | **Nieve acumulada** (shader de suelo) | Libre |
| `water_noise_distortion.jpg` | Ruido de distorsiÃ³n | â | â | â |
| `river_flow_directions.png` | DirecciÃ³n de flujo X | DirecciÃ³n de flujo Y | â | â |

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

### Arquitectura de tres capas (Refactor Modular)

El manejo de marcadores se divide en tres clases para respetar el principio de responsabilidad Ãºnica (Single Responsibility Principle):

1. **`MarkerManager.js`**: Coordinador central. Mantiene el estado (`_items`), la lÃ³gica de raycasting, el nivel de detalle (LOD / Zoom), y expone la API pÃºblica (`update`, `renderAll`).
2. **`MarkerBuilder.js`**: FÃ¡brica visual. Se encarga de instanciar los hitboxes 3D (para regiones) y los Ã­conos/etiquetas CSS2D (para pueblos, lagos).
3. **`RegionTexturePainter.js`**: Motor de renderizado de texto 2D. Escribe los nombres gigantes de las regiones y mares directamente sobre la textura 4K del mapa usando un `<canvas>`.

#### JerarquÃ­a en el Grafo de Escena

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

O usar la extensiÃ³n **Live Server** de VS Code (clic derecho en `index.html` â "Open with Live Server").

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
Los materiales del ocÃ©ano, rÃ­os, lagos y la niebla de permafrost deben recibir los mismos `clippingPlanes` que el material principal del terreno. Si se agrega un nuevo material de capa, recordar inyectarle `clipLeft` y `clipRight` de `Map.js`.

### LODs y frustum culling
Los 64 chunks son instancias de `THREE.LOD`. `AppState.update()` llama a `lod.update(camera)` por cada chunk cada frame. El frustum culling lo hace Three.js automÃ¡ticamente. No agregar cÃ³digo de culling manual.

### `CSS2DRenderer` y el orden del DOM
El `domElement` del `CSS2DRenderer` se monta en `document.body` en el constructor de `SceneManager`. Si se agrega algÃºn overlay HTML que deba ir encima de los labels, ponerle un `z-index` explÃ­cito en CSS.
 
 # #   S e c u e n c i a   d e   I n i c i o   y   A n i m a c i ó n   ( D o l l y )  
 1 .   A l   c a r g a r   l a   p á g i n a ,   s e   m u e s t r a   e l   b o t ó n   ' C o m e n z a r '   ( \ # i d l e - p r o m p t \ )   s o b r e   e l   m a p a   e s t á t i c o .  
 2 .   A l   h a c e r   c l i c k   e n   e l   b o t ó n ,   c o m i e n z a   l a   a n i m a c i ó n   d e   e n t r a d a   ( D o l l y ) .  
 3 .   L a   c á m a r a   d e s c i e n d e   y   s e   p o s i c i o n a   e n   e l   m a p a .  
 4 .   S O L O   u n a   v e z   q u e   l a   a n i m a c i ó n   d e   D o l l y   f i n a l i z a   y   e l   u s u a r i o   t i e n e   c o n t r o l ,   s e   r e v e l a n   l o s   e l e m e n t o s   i n t e r a c t i v o s   d e   U I   ( e t i q u e t a s   C S S 2 D ,   t o o l t i p s   d e   h o v e r ,   m a r c a d o r e s ,   e t c . ) .  
 
### Flujo de InteracciÃ³n y Clicks (State Machine)

Para evitar comportamientos conflictivos al hacer click, el sistema respeta el nivel de zoom actual de la cÃ¡mara (zoomAlpha) y emite eventos diferenciados:

1. **Estado MAP_GENERAL (Zoom Lejos, zoomAlpha > 0.6)**
   - **Visibilidad:** Regiones, mares y ocÃ©anos. (Los marcadores menores estÃ¡n ocultos).
   - **Click en una regiÃ³n:** Emite marker:region-fly-request. La cÃ¡mara inicia un vuelo suave (flyTo) hacia la regiÃ³n.
   - **Importante:** Durante este vuelo, la regiÃ³n NO se marca como enfocada (focused) y NO se abre el panel lateral, para no confundir al usuario tapando la pantalla durante la navegaciÃ³n panorÃ¡mica.

2. **Estado MAP_DETALLE (Zoom Cerca, zoomAlpha <= 0.6)**
   - **Visibilidad:** Aparecen los marcadores menores (isla, lago, otro). Si hay una regiÃ³n enfocada, los marcadores otro ajenos a esa regiÃ³n se desvanecen.
   - **Click en una regiÃ³n:** Emite marker:region-open-panel. 
   - **Resultado:** La regiÃ³n ahora SÃ se marca como enfocada (cambia de color en el shader), la cÃ¡mara se re-centra ligeramente, y se abre la ventana lateral de informaciÃ³n (RegionSidePanelUI).
