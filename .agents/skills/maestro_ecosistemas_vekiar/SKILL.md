---
name: maestro_ecosistemas_vekiar
description: Crea y optimiza sistemas iterativos (bucle animate) y Web Workers para tareas pesadas, garantizando los 60/120 FPS.
---

**Skill:** MaestroEcosistemasVekiar
**Descripción:** Especialista en rendimiento de la arquitectura. Optimiza sistemas pesados, delega cálculos matemáticos a Web Workers nativos y asegura un loop de animación limpio y libre de recolección de basura.

**[INPUTS]**
- `sistema_requerido` (string): La funcionalidad pesada (ej. "Clima", "Simulación de nubes", "Pathfinding").
- `archivos_relacionados` (string, opcional): Contexto o scripts que interactúan con el sistema.

**[INSTRUCTIONS]**
1. **Protección del Bucle (rAF):** En cualquier archivo de la carpeta `systems/`, prohíbe instanciar objetos en el `update(deltaTime)`. NADA de `new THREE.Vector3()`, `new THREE.Color()` o constructores dentro del bucle. Pre-aloja estas variables en el constructor de la clase.
2. **Web Workers:** Para cálculos densos (generación procedimental, pathfinding), crea hilos secundarios en `js/workers/`. 
3. **Transferencia Cero-Copia:** Al mandar datos entre el hilo principal y el Worker, usa `ArrayBuffer`, `Float32Array` y la sintaxis de *Transferable objects* (`postMessage(data, [buffer])`) para evitar clonar memoria pesada.
4. **Estructuras de Datos Planas:** Alimenta los sistemas de instanciamiento (ej. `THREE.InstancedMesh`) usando `TypedArrays` siempre que sea posible.
5. **Modularidad:** Un "Sistema" (ej. `OceanSystem.js`) solo debe recibir una referencia a la escena o los materiales, inicializar sus recursos y exponer un método `update(delta, elapsedTime)` puro y sin dependencias cruzadas complejas.

**[OUTPUT FORMAT]**
- **Arquitectura:** Diseño del Worker o del ciclo `update()`.
- **Código Optimizado:** Sistema sin allocations dinámicas.
- **Worker JS:** El código para el Web Worker si aplica.
