# Manual del Creador de Marcadores (Proyecto Vékiar)

¡Hola! Si estás leyendo esto, es porque vas a ser el encargado de ponerle nombres a los pueblos, regiones, lagos y mares en el mapa de Vékiar. 

No te preocupes, no hace falta saber programar. El sistema está diseñado para que todo se guarde en un archivo de texto simple llamado `vekiar_markers.json`. 

Aquí tienes las instrucciones paso a paso.

---

## 1. Usar el Editor Visual (Lo más fácil)

El mapa incluye un editor escondido que te permite crear cosas haciendo clics.

1. Abre el mapa en tu navegador (recuerda que debe ser a través de un servidor web, como Live Server).
2. Presiona la **tecla E** en tu teclado. Verás que aparece un panel verde en la esquina superior izquierda.
3. Haz **Shift + Clic** (mantén presionado Shift y haz clic izquierdo) en cualquier lugar del terreno donde quieras agregar algo.
4. Te saldrán unas ventanas pidiendo:
   - **ID**: Pon un nombre único en minúsculas y sin espacios (ej: `pueblo_rojizo`).
   - **Nombre**: El nombre real que se mostrará en pantalla (ej: `Pueblo Rojizo`).
   - **Región Padre**: (Opcional) Si este pueblo pertenece a una región más grande.
   - **Tipo**: Escribe `otro`, `lago`, `isla`, `region`, `mar` u `oceano`.
5. Una vez creado, haz clic normal sobre el marcador para abrir el **Inspector**. Ahí podrás ajustar la figura geométrica, el tamaño de la letra, la curva (si es una región) e incluso borrarlo.
6. **¡MUY IMPORTANTE!** Todo lo que hagas se guarda temporalmente en tu navegador. Para guardarlo de verdad, debes presionar el botón **"Guardar en Local (F5 seguro)"** y luego el botón **"Descargar JSON"** en el panel verde.
7. Eso descargará un archivo `vekiar_markers.json`. Cópialo y pégalo dentro de la carpeta `js/` del proyecto, reemplazando el viejo.

---

## 2. Los 6 Tipos de Marcadores

En el panel, cuando te pide el "Tipo", estas son tus opciones y lo que hacen:

| Tipo | ¿Cómo se ve? | ¿Para qué se usa? |
|---|---|---|
| **`otro`** | Etiqueta blanca, pequeña. | Ciudades, pueblos, ruinas, cuevas, lugares de interés. |
| **`lago`** | Etiqueta azul claro en cursiva. | Cuerpos de agua dulce cerrados. |
| **`isla`** | Etiqueta naranja en cursiva. | Porciones de tierra en el mar. |
| **`region`** | Texto **gigante y oscuro** pintado en el suelo. | Continentes, imperios, zonas inmensas del mapa. |
| **`mar`** | Texto gigante, semi-transparente celeste. | Mares internos y golfos. |
| **`oceano`** | Igual que el mar pero para las grandes aguas. | Océanos principales. |

---

## 3. ¿Cómo funciona la visibilidad (LOD)?

No todos los marcadores se ven al mismo tiempo, ¡sino el mapa sería un caos! 
El sistema oculta automáticamente las cosas dependiendo de qué tan cerca o lejos esté la cámara:

- **Regiones, Mares y Océanos:** Se ven **siempre**. Incluso desde el espacio exterior.
- **Islas y Lagos:** Aparecen cuando haces zoom a la mitad de distancia.
- **Otros (pueblos, cuevas):** Solo aparecen cuando haces bastante zoom (muy cerca del suelo).

Además, si haces clic en el nombre de una **Región gigante**, el mapa "enfocará" esa región. Todos los pueblos que no pertenezcan a esa región desaparecerán temporalmente para que puedas concentrarte en leer solo lo que hay allí. Para salir de este modo, simplemente haz clic en cualquier lugar vacío del mapa.

---

## 4. Editar el archivo a mano (Nivel Avanzado)

Si te sientes valiente, puedes abrir el archivo `js/vekiar_markers.json` con el Bloc de Notas (o VS Code) y editar los datos a mano. 

Se ve algo así:

```json
[
  {
    "id": "capital_norte",
    "name": "La Gran Capital",
    "region": "reino_helado",
    "type": "otro",
    "shape": "star",
    "position": { "x": 12.5, "y": -5.3, "z": 0 }
  }
]
```

**Atributos extra que puedes cambiar a mano:**
- `"shape": "star"` — Cambia la figura del ícono (opciones: `circle`, `square`, `triangle`, `diamond`, `star`).
- `"curveRadius": 40` — (Solo para `region`, `mar`). Dobla el texto como un arco. Valores positivos lo doblan como una sonrisa `U`, negativos como un paraguas `n`.
- `"fontSize": 120` — (Solo para `region`, `mar`). Hace el texto gigante.
- `"rotation": 45` — Rota el texto (en grados).

¡Y eso es todo! Diviértete llenando el mundo.
