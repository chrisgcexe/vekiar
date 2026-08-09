import cv2
import numpy as np
import collections
import os

def limpiar_y_extraer_colores(input_path, output_path):
    print(f"Cargando mapa de regiones planas: {input_path}")
    img = cv2.imread(input_path)
    if img is None:
        print("Error: No se pudo cargar la imagen.")
        return

    # Convertimos la imagen a un array de colores planos 1D
    # Reformateamos de (H, W, 3) a (H*W, 3)
    pixels = img.reshape(-1, 3)
    
    # Contamos cuántas veces aparece cada color exacto
    # Convertimos los colores a tuplas para poder usarlos en el contador
    print("Contando colores únicos...")
    pixels_tuples = [tuple(p) for p in pixels]
    counter = collections.Counter(pixels_tuples)
    
    # Ignoramos los colores "basura" o antialiasing (colores con muy pocos píxeles)
    # y nos quedamos solo con los colores principales de los continentes
    MIN_PIXELS = 1000 # Un continente debería tener más de 1000 píxeles
    
    colores_principales = []
    print("\n=== COLORES ENCONTRADOS ===")
    
    for color, count in counter.most_common():
        if count >= MIN_PIXELS:
            colores_principales.append(color)
            hex_color = "#{:02x}{:02x}{:02x}".format(color[2], color[1], color[0]).upper()
            
            # Vamos a adivinar si es el océano/fondo asumiendo que es el que más píxeles tiene o si es muy claro
            is_ocean = " (Probablemente Océano/Fondo)" if len(colores_principales) == 1 else ""
            print(f"Color: {hex_color} | Píxeles: {count}{is_ocean}")

    # Ahora vamos a "Aplanar" (Optimizar) la imagen:
    # Si la imagen tiene antialiasing o bordes sucios, obligamos a que TODO píxel
    # se convierta obligatoriamente a uno de nuestros `colores_principales`.
    print("\nAplanando y optimizando la imagen (eliminando anti-aliasing)...")
    
    # Convertimos la lista a un array numpy de flotantes para cálculo de distancia
    palette = np.array(colores_principales, dtype=np.float32)
    
    # Esta operación puede tardar unos segundos...
    # Reshape para calcular distancias en bloque
    # pixels: (N, 3), palette: (K, 3)
    # Calculamos la distancia euclidiana de cada píxel a cada color de la paleta
    # Para ahorrar memoria, lo hacemos por bloques
    
    chunk_size = 100000
    cleaned_pixels = np.zeros_like(pixels)
    
    for i in range(0, len(pixels), chunk_size):
        chunk = pixels[i:i+chunk_size].astype(np.float32)
        # Broadcasting para calcular diferencias: chunk[:, np.newaxis, :] - palette[np.newaxis, :, :]
        diffs = chunk[:, np.newaxis, :] - palette[np.newaxis, :, :]
        # Distancia euclidiana al cuadrado (suficiente para encontrar el mínimo)
        dists = np.sum(diffs**2, axis=2)
        # Índice del color más cercano
        nearest_idx = np.argmin(dists, axis=1)
        # Asignamos el color puro
        cleaned_pixels[i:i+chunk_size] = palette[nearest_idx]
        
    # Volvemos a armar la imagen 2D
    cleaned_img = cleaned_pixels.reshape(img.shape).astype(np.uint8)
    
    # Guardamos la imagen optimizada
    cv2.imwrite(output_path, cleaned_img)
    print(f"\n¡Imagen optimizada guardada como: {output_path}!")
    print("Ya puedes usar esta imagen en Unity, Three.js o tu motor de juego como 'ID Mask' perfecta.")

if __name__ == "__main__":
    # Ajusta los nombres según cómo se llamen tus imágenes
    procesar = True
    
    if os.path.exists("flat_map.png"):
        limpiar_y_extraer_colores("flat_map.png", "region_ids_optimizada.png")
    else:
        print("No se encontró 'flat_map.png'. Asegúrate de poner el nombre correcto.")
