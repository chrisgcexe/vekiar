# Plan de Implementación: Limpieza y Reorganización de Nomenclaturas

Tenés muchísima razón. Si construimos sobre cimientos confusos, en el futuro no vamos a entender nada. Vamos a emprolijar los nombres de las texturas, los comentarios en el código y la documentación oficial antes de agregar una sola línea de lógica para el desierto.

## Proposed Changes

### 1. Renombramiento de Archivos (Assets)
Vamos a cambiar el nombre de las imágenes físicas para que describan **exactamente** lo que contienen hoy en día.

- `biomas_packed_R_river_G_lake_B_desert_A_snow.png` 
  ➔ **Pasa a llamarse:** `masks_1_R_river_G_lake_B_snow.png`
- `map_data_packed.png` 
  ➔ **Pasa a llamarse:** `map_data_R_elevation_B_snow_particles.png`

### 2. Actualización de Código (Javascript)
- **[MODIFY] `js/utils/AssetLoader.js`**: Actualizaremos las rutas de carga de las imágenes con los nuevos nombres y añadiremos comentarios clarísimos explicando qué tiene cada canal.
- **[MODIFY] `js/scene/TerrainMaterial.js`**: Mejoraremos los nombres de los uniforms si es necesario, o al menos agregaremos comentarios descriptivos.
- **[MODIFY] `js/systems/SnowSystem.js`**: Comentaremos explícitamente que lee el canal Azul de la textura de datos del mapa para generar partículas.

### 3. Actualización de Shaders (GLSL)
- **[MODIFY] `js/shaders/chunks/WaterChunk.js` y `LandChunk.js`**: Agregaremos un bloque de comentarios en la cabecera del archivo detallando qué canales se usan (Ej: `// tPackedMasks -> R: Ríos, G: Lagos, B: Nieve Piso`).

### 4. Actualización de Documentación
- **[MODIFY] `ARCHITECTURE.md`**: Reescribiremos la sección 3 ("Pipeline de Generación del Mapa") con la información 100% verídica de qué hace cada canal de cada imagen.

## Verification Plan
1. Verificaremos que el proyecto corra sin errores 404 (File not found).
2. Verificaremos que todo se renderice igual que antes.
3. Leeremos los archivos clave para asegurarnos de que los comentarios disipen cualquier duda.

## Open Questions
- ¿Estás de acuerdo con los nuevos nombres de archivo (`masks_1_R_river_G_lake_B_snow.png` y `map_data_R_elevation_B_snow_particles.png`) o preferís algo más corto/largo?
- Cuando implementemos el desierto, ¿lo metemos en el canal Alpha de `masks_1_...png` (así la renombramos a `..._A_desert.png`)?
