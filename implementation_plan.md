# Plan de Implementación: Dunas del Desierto y Polvo Volumétrico

Para lograr el aspecto espectacular de las referencias que compartiste (dunas esculpidas por el viento) y el polvo moviéndose, vamos a trabajar en dos frentes:

## Proposed Changes

### 1. Limpieza de la Máscara (`pack_masks.py`)
- **[MODIFY] `tools/pack_masks.py`**: 
  - Actualmente, la máscara rosa sangra hacia el océano a la derecha. 
  - Vamos a actualizar el script para que cruce la máscara del desierto con la máscara de tierra (usando el canal Rojo de `map_data_...` que tiene la elevación). Así, el desierto se cortará perfectamente en la costa.

### 2. Shader de Dunas (`LandChunk.js`)
- **[MODIFY] `js/shaders/chunks/LandChunk.js`**:
  - En la zona del desierto (canal Alpha), inyectaremos un shader procedural de dunas.
  - Usaremos una función matemática basada en ondas senoidales distorsionadas por ruido (`sin(uv + noise)`) para generar las crestas características de las dunas de arena.
  - Aplicaremos un color cálido base (dorado/arena) y le daremos sombra en los valles de las dunas para simular el relieve 3D sin modificar los vértices.

### 3. Ajuste de la Niebla de Polvo (`DesertMistShader.js`)
- **[MODIFY] `js/shaders/DesertMistShader.js`**:
  - Reemplazaremos el código de debug rosa por el sistema de partículas que habíamos empezado a armar.
  - Ajustaremos la velocidad y dirección del "viento" hacia el Este, y el color a un tono arena claro para que parezca polvo levantado por el viento barriendo las dunas.

## Verification Plan
1. Ejecutar el nuevo script de empaquetado y verificar que la máscara rosa ya no toque el agua.
2. Inyectar el shader de dunas y verificar las sombras y formas.
3. Restaurar y ajustar la niebla volumétrica.

## Open Questions
- Las dunas procedurales se dibujan en 2D sobre la textura original. ¿Te gustaría que los colores cálidos de las dunas reemplacen por completo la textura del piso en esa zona, o que se mezclen con el color verde/marrón que tiene el mapa de base ahí? (Generalmente, para dunas reales, lo mejor es reemplazar el color por completo).
