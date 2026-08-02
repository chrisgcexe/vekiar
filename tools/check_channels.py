import cv2
import numpy as np

img = cv2.imread('assets/images/map_data_packed.png', cv2.IMREAD_UNCHANGED)

if img is None:
    print("Error loading image")
else:
    print(f"Shape: {img.shape}")
    if img.shape[2] == 4:
        b, g, r, a = cv2.split(img)
        print(f"R channel max: {np.max(r)}, min: {np.min(r)}")
        print(f"G channel max: {np.max(g)}, min: {np.min(g)}")
        print(f"B channel max: {np.max(b)}, min: {np.min(b)}")
        print(f"A channel max: {np.max(a)}, min: {np.min(a)}")
    else:
        print("Image doesn't have 4 channels.")
