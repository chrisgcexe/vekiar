# Plan de Implementación: Nomenclatura Descriptiva y Limpieza de Source Assets

Vamos a dejar el directorio de imágenes impecable. Las imágenes activas tendrán nombres que expliquen exactamente qué función cumplen en el código.

## Proposed Changes

### 1. Renombramiento de Assets Activos (Game Assets)
Estas texturas SÍ se usan en el código actual, pero sus nombres son vagos. Las renombraremos:
- `noise.jpg` ➔ **`water_noise_distortion.jpg`** (Se usa para animar las olas y el agua en el shader).
- `flowmap_small.png` ➔ **`river_flow_directions.png`** (Le dice al agua de los ríos hacia dónde debe fluir).
- `vekiar_sin_letras.jpg` ➔ **`base_color_map.jpg`** (Es la textura de color principal que recubre todo el mapa).

### 2. Mover Assets Inactivos (Source Assets)
Estas imágenes NO son llamadas por el código. Son tus editables o pruebas viejas. Las moveremos a `assets/images/source_assets/` para que no estorben:
- `heightmap_custom.png` (Tu mapa de altura original crudo).
- `vekiar_biomas_mask.jpg` (Tu máscara colorida cruda).
- Todas las versiones de elevación viejas: `vekiar_sin_letras_h.jpg`, `h2.jpg`, `h3.jpg`, `h4.jpg`, `h5.jpg`, `h6.jpg`.

### 3. Actualización de Código y Docs
- **[MODIFY] `js/utils/AssetLoader.js`**: Actualizar con las 3 nuevas rutas (`water_noise_distortion.jpg`, `river_flow_directions.png`, `base_color_map.jpg`).
- **[MODIFY] `ARCHITECTURE.md`**: Explicar el propósito de cada una de estas texturas (Ruido del agua, Direcciones del flujo, Color base).

## Verification Plan
1. Crear el directorio `source_assets/`.
2. Mover los archivos inactivos usando comandos de consola.
3. Renombrar los 3 archivos activos.
4. Actualizar el código y confirmar que el mapa siga cargando perfectamente.

## Open Questions
- ¿Te parecen bien esos nombres (`water_noise_distortion`, `river_flow_directions`, `base_color_map`) o preferís que sean en español?
