import * as THREE from 'three';
import {
    desertMistVertex,
    desertMistFragment
} from '../shaders/DesertMistShader.js';

export class DesertMistMaterial {
    static create(assets, mapMaterial) {
        return new THREE.ShaderMaterial({
            uniforms: {
                tPackedMasks: { value: assets.packedMasksTexture },
                tNoise: { value: assets.noiseTexture },
                uTime: mapMaterial.userData.uTime,
                uZoomAlpha: mapMaterial.userData.uZoomAlpha
            },
            vertexShader: desertMistVertex,
            fragmentShader: desertMistFragment,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
    }
}
