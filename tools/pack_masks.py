import cv2
import numpy as np
import os

print("Iniciando empaquetado de máscaras...")

# Rutas
base_img_path = '../assets/images/masks_1_R_river_G_lake_B_snow.png'
desert_mask_path = '../assets/images/no_borrar_para_empaquetar/vekiar_desert_mask.jpg'
output_path = '../assets/images/masks_2_R_river_G_lake_B_snow_A_desert.png'

# Cargar imagen base (tiene RGB)
base_img = cv2.imread(base_img_path, cv2.IMREAD_UNCHANGED)
if base_img is None:
    print(f"Error: No se pudo cargar {base_img_path}")
    exit(1)

# OpenCV carga en formato BGR. 
# cv2.split devuelve (b, g, r)
if len(base_img.shape) == 3 and base_img.shape[2] == 3:
    b, g, r = cv2.split(base_img)
elif len(base_img.shape) == 3 and base_img.shape[2] == 4:
    b, g, r, a_old = cv2.split(base_img)
else:
    print("Formato de imagen base desconocido.")
    exit(1)

# Cargar máscara del desierto (en escala de grises)
desert_img = cv2.imread(desert_mask_path, cv2.IMREAD_GRAYSCALE)
if desert_img is None:
    print(f"Error: No se pudo cargar {desert_mask_path}")
    exit(1)

# Asegurar que tienen el mismo tamaño
if base_img.shape[:2] != desert_img.shape[:2]:
    print(f"Redimensionando máscara del desierto de {desert_img.shape[:2]} a {base_img.shape[:2]}...")
    desert_img = cv2.resize(desert_img, (base_img.shape[1], base_img.shape[0]), interpolation=cv2.INTER_AREA)

# El canal Alpha será el desierto
a = desert_img

# Fusionar en orden B, G, R, A para que OpenCV guarde un PNG RGBA correcto
# Recuerda: b, g, r vienen del split de BGR
merged = cv2.merge([b, g, r, a])

# Guardar
cv2.imwrite(output_path, merged)
print(f"¡Éxito! Textura final guardada en {output_path}")
