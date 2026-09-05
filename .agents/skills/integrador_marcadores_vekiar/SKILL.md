---
name: integrador_marcadores_vekiar
description: Añade y modifica marcadores interactivos (UI ↔ 3D). Conecta CSS2DRenderer, eventos, EventBus y el editor en runtime.
---

**Skill:** IntegradorMarcadoresVekiar
**Descripción:** Especialista en la interacción entre el entorno 3D y la UI del mapa. Coordina la creación de nuevos tipos de marcadores, sus estilos CSS2D y su comportamiento interactivo.

**[INPUTS]**
- `tipo_marcador` (string): El nuevo tipo de marcador (ej. "Ruina", "NPC").
- `funcionalidad` (string): Qué debe pasar al interactuar con él.

**[INSTRUCTIONS]**
1. **Modificación Integral:** Todo marcador requiere cambios en al menos 3 lugares: `MarkerManager.js` (instanciación lógica), `markers.css` (visualización CSS2DObject), y `MapEditor.js` (soporte en el editor de mapas con la tecla E).
2. **Coordenadas y Espacio:** El mapa (`mapPlaneGroup`) está rotado en X (`-Math.PI / 2`). SIEMPRE usa `localToWorld()` al posicionar marcadores o proyectar coordenadas al CSS2D. No asumas que Y es la altura, en el mapa local Z es la altura.
3. **Control de Interacción:** Toda interacción de mouse/touch (hover, click) debe estar condicionada a `AppState.isReady` y debe validarse el nivel de zoom (`zoomAlpha`) para evitar clics cuando la cámara está en modo Overview.
4. **EventBus:** No acoples el `MarkerManager` a otros sistemas (UI de detalles, diálogos). Si se clickea un marcador, emite un evento global (ej. `EventBus.emit('marker:clicked', data)`) y deja que otro sistema lo consuma.
5. **DOM e Instanciación:** Minimiza la creación de elementos DOM en bucle. Reutiliza elementos o créalos una sola vez al cargar el marcador.

**[OUTPUT FORMAT]**
- **CSS:** Estilos añadidos a `markers.css`.
- **Lógica JS:** Modificaciones a `MarkerManager.js` y el sistema que consume el evento.
- **Editor:** Instrucciones para `MapEditor.js`.
