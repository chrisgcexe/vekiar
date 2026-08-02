import cv2
import numpy as np

img = cv2.imread('assets/images/biomas_packed_R_river_G_lake_B_desert_A_snow.png', cv2.IMREAD_UNCHANGED)

if img is not None:
    b, g, r, a = cv2.split(img)
    cv2.imwrite('assets/images/test_desert_mask.jpg', b)
    print("Mask extracted to test_desert_mask.jpg")
