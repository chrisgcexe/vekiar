import cv2
import numpy as np

# Cargamos la imagen original
img = cv2.imread('base_color_map_2.jpg')

# 1. Subimos el umbral de corte a 75 para que agarre también los grises oscuros del borde difuminado
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
_, mask = cv2.threshold(gray, 75, 255, cv2.THRESH_BINARY_INV)

# 2. Aumentamos la dilatación (kernel más grande o más iteraciones) para cubrir toda la huella del trazo
kernel = np.ones((5, 5), np.uint8)
mask = cv2.dilate(mask, kernel, iterations=2)

# 3. Aplicamos inpainting con un radio mayor para que estire bien la textura de la costa sobre la línea
cleaned_img = cv2.inpaint(img, mask, inpaintRadius=5, flags=cv2.INPAINT_TELEA)

# Guardamos el resultado limpio definitivo
cv2.imwrite('base_color_map_cleaned.jpg', cleaned_img)
print("¡Listo! Máscara más agresiva aplicada con éxito.")