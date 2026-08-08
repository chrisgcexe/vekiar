import cv2
import numpy as np
import random
import os

def generar_mascara(input_path, output_path):
    print(f"Cargando imagen de fronteras: {input_path}")
    if not os.path.exists(input_path):
        print(f"Error: No se encontró la imagen '{input_path}'.")
        print("Asegúrate de tener una imagen de fondo blanco con líneas negras dibujando los contornos.")
        return

    # 1. Leer imagen en escala de grises
    img = cv2.imread(input_path, cv2.IMREAD_GRAYSCALE)
    
    # 2. Binarizar: blanco = regiones (fondo), negro = fronteras
    # Todo lo que sea oscuro se vuelve negro puro, lo claro se vuelve blanco puro
    _, thresh = cv2.threshold(img, 200, 255, cv2.THRESH_BINARY)

    # 3. Encontrar componentes conectados (todas las áreas encerradas por líneas negras)
    print("Calculando regiones cerradas...")
    num_labels, labels = cv2.connectedComponents(thresh)

    # 4. Asignar el pixel más cercano a las fronteras negras para taparlas
    # (Así no quedan huecos negros en la máscara final y las regiones se tocan entre sí)
    print("Tapando las líneas de frontera (expandiendo colores)...")
    kernel = np.ones((3,3), np.uint8)
    while True:
        # Encontrar dónde están los píxeles negros (0)
        zeros = (labels == 0)
        if not zeros.any():
            break # Ya no hay fronteras
            
        # Dilatar las etiquetas para que invadan el espacio negro
        labels_dilated = cv2.dilate(labels.astype(np.float32), kernel).astype(np.int32)
        
        # Solo actualizamos los píxeles que eran negros
        labels = np.where(zeros, labels_dilated, labels)

    # 5. Generar colores puros RGB para cada región
    print(f"\nSe encontraron {num_labels - 1} regiones. Asignando colores...")
    colors = np.zeros((num_labels, 3), dtype=np.uint8)
    region_colors = {}
    
    # Semilla para que los colores sean siempre iguales en varias corridas
    random.seed(42) 
    
    for i in range(1, num_labels):
        # Generar un color al azar, evitando colores muy oscuros
        color = [random.randint(50, 255), random.randint(50, 255), random.randint(50, 255)]
        colors[i] = color
        
        # Guardar en formato HEX (OpenCV maneja internamente el color como BGR, así que lo invertimos a RGB para el Hex)
        hex_color = "#{:02x}{:02x}{:02x}".format(color[2], color[1], color[0]).upper()
        region_colors[f"Region_{i}"] = hex_color

    # 6. Colorear todos los píxeles según la etiqueta
    color_mask = colors[labels]

    # 7. Guardar resultado
    cv2.imwrite(output_path, color_mask)
    print(f"\n¡Éxito! Tu Mapa de IDs está listo y guardado en: {output_path}")
    
    # 8. Imprimir resultados para que el usuario los copie
    print("\n" + "=" * 50)
    print("  COPIA ESTOS COLORES EN TU ARCHIVO JSON O EDITOR")
    print("=" * 50)
    for name, hex_val in region_colors.items():
        print(f"  {name}: {hex_val}")
    print("=" * 50 + "\n")

if __name__ == "__main__":
    # Archivos por defecto
    INPUT_FILE = "fronteras.png"
    OUTPUT_FILE = "region_ids.png"
    
    print("=== Generador Automático de Máscara de Regiones ===")
    print("Asegúrate de haber instalado los requisitos ejecutando:")
    print("pip install opencv-python numpy")
    print("-" * 50)
    generar_mascara(INPUT_FILE, OUTPUT_FILE)
