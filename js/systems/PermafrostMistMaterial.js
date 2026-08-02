import * as THREE from 'three';
import {
    permafrostMistVertex,
    permafrostMistFragment
} from '../shaders/PermafrostMistShader.js';

export class PermafrostMistMaterial {
    static create(assets, mapMaterial) {
        return new THREE.ShaderMaterial({
            uniforms: {
                tPackedMasks: { value: assets.packedMasksTexture },
                tMapDataPacked: { value: assets.mapDataPackedTexture },
                tNoise: { value: assets.noiseTexture },
                uTime: mapMaterial.userData.uTime,
                uZoomAlpha: mapMaterial.userData.uZoomAlpha
            },
            vertexShader: permafrostMistVertex,
            fragmentShader: permafrostMistFragment,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
    }
}
