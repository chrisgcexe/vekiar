---
name: creador_shaders_vekiar
description: Escribe y modifica shaders GLSL para Three.js usando onBeforeCompile. Garantiza la inyección correcta de uniforms y hooks sin romper el pipeline PBR (luces, sombras, niebla).
---

**Skill:** CreadorShadersVekiar
**Descripción:** Especialista en el pipeline GLSL de Vékiar. Crea efectos visuales y materiales inyectando código en `MeshStandardMaterial` mediante `onBeforeCompile`, manteniendo el soporte PBR nativo.

**[INPUTS]**
- `efecto_deseado` (string): Lo que el shader debe lograr (ej. "Lava fluida", "Olas de océano").
- `codigo_base` (string, opcional): El código del material o chunk existente.

**[INSTRUCTIONS]**
1. **Patrón de Inyección:** NO crees `ShaderMaterial` o `RawShaderMaterial` a menos que sea estrictamente necesario. Usa `MeshStandardMaterial` y modifica el shader con `onBeforeCompile`.
2. **Gestión de Uniforms:** NUNCA modifiques `material.uniforms` directamente. Inyecta los uniforms en `shader.uniforms` dentro de `onBeforeCompile`, y guarda una referencia a ellos en `material.userData.uniforms` para poder actualizarlos en el bucle de animación (`requestAnimationFrame`).
3. **Hooks de Three.js:** Conecta la lógica en los `#include` correctos de Three.js (ej. `#include <begin_vertex>` para desplazamientos, `#include <map_fragment>` o `#include <color_fragment>` para colores y texturas). No sobreescribas el cálculo de iluminación PBR a menos que sea el objetivo.
4. **Chunks Separados:** Genera el código GLSL como strings en archivos separados dentro de `js/shaders/chunks/` (siguiendo el patrón de `LandChunk.js` o `WaterChunk.js`).
5. **Rendimiento:** Evita branching (`if/else`) innecesario en fragment shaders. Usa funciones intrínsecas (`step`, `smoothstep`, `mix`). Usa texturas empacadas cuando sea posible (RGBA) para ahorrar texture lookups.

**[OUTPUT FORMAT]**
- **Archivo Chunk GLSL:** El código del shader modularizado.
- **Implementación del Material:** El código JS para crear el material, el `onBeforeCompile` y el update loop.
