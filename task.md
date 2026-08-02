# Tareas: Dunas y Polvo Volumétrico

- `[ ]` **Paso 1: Corregir enmascaramiento del mar (pack_masks.py)**
  - Leer el mapa de altura (`map_data_R_elevation...`).
  - Restringir la máscara del desierto a la zona de tierra (por encima del nivel del mar).
  - Ejecutar script para actualizar `masks_2_...png`.
- `[ ]` **Paso 2: Shader de Dunas en LandChunk.js**
  - Remover rosa de debug.
  - Reemplazar completamente el color base por el color arena/dorado donde hay desierto.
  - Implementar onda procedural con matemática (senos y ruidos) para las dunas.
  - Aplicar sombras e iluminación local según las crestas.
- `[ ]` **Paso 3: Niebla de Polvo en DesertMistShader.js**
  - Implementar ruido de polvo rasante con dirección al Este (+u).
  - Aplicar máscara corregida y color cálido.
