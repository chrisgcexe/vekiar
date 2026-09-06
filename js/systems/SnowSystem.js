import * as THREE from 'three';
import {
    snowParticleVertex,
    snowParticleFragment
} from '../shaders/SnowShader.js';

export class SnowSystem {
    constructor(scene, assets, mapMaterial, mapAspect) {
        this.scene = scene;
        this.aspect = mapAspect;
        this.mapDataPackedTexture = assets.mapDataPackedTexture;
        
        // El sistema de partículas comparte el uTime y uZoomAlpha del material base
        this.uTime = mapMaterial.userData.uTime;
        this.uZoomAlpha = mapMaterial.userData.uZoomAlpha;

        this._initSystem();
    }

    _initSystem() {
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = this.mapDataPackedTexture.image.width;
        maskCanvas.height = this.mapDataPackedTexture.image.height;
        const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
        maskCtx.drawImage(this.mapDataPackedTexture.image, 0, 0);
        const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;

        const particleCount = 25000;
        const particleGeometry = new THREE.BufferGeometry();
        const particlePositions = new Float32Array(particleCount * 3);
        const particleRandoms = new Float32Array(particleCount);
        const particleSpeeds = new Float32Array(particleCount);

        let spawned = 0;
        let sumX = 0;
        let sumZ = 0;
        let attempts = 0;
        const totalSize = 100;

        while(spawned < particleCount && attempts < 500000) {
            attempts++;
            const rx = Math.random();
            const ry = Math.random(); 
            
            const px = Math.floor(rx * maskCanvas.width);
            const py = Math.floor((1.0 - ry) * maskCanvas.height);
            
            const index = (py * maskCanvas.width + px) * 4;
            // El canal Azul (+2) contiene la máscara de nieve de las partículas
            // (Leyendo de map_data_R_elevation_B_snow_particles.png)
            const blueValue = maskData[index + 2];
            
            if (blueValue < 128) {
                const worldX = (rx - 0.5) * totalSize;
                const worldZ = - (ry - 0.5) * totalSize / this.aspect;
                
                particlePositions[spawned*3] = worldX; 
                particlePositions[spawned*3+1] = Math.random() * 15.0; 
                particlePositions[spawned*3+2] = worldZ;
                
                particleRandoms[spawned] = Math.random();
                particleSpeeds[spawned] = 0.5 + Math.random() * 1.5; 
                
                sumX += worldX;
                sumZ += worldZ;
                
                spawned++;
            }
        }

        const avgX = sumX / spawned;
        const avgZ = sumZ / spawned;
        
        // Actualizamos el centro geométrico para la luz de la nieve
        // (ya no se usa en el shader uMountainCenter)
        
        // Creamos la luz
        this.snowLightBaseIntensity = 15.0;
        this.snowLight = new THREE.PointLight(0xdff0ff, this.snowLightBaseIntensity, 40.0, 1.5);
        this.snowLight.position.set(avgX, 12.0, avgZ);
        this.scene.add(this.snowLight);

        particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
        particleGeometry.setAttribute('aRandom', new THREE.BufferAttribute(particleRandoms, 1));
        particleGeometry.setAttribute('aSpeed', new THREE.BufferAttribute(particleSpeeds, 1));
        
        particleGeometry.computeBoundingSphere();

        const snowParticleMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: this.uTime,
                uZoomAlpha: this.uZoomAlpha
            },
            vertexShader: snowParticleVertex,
            fragmentShader: snowParticleFragment,
            transparent: true,
            depthWrite: false,
            blending: THREE.NormalBlending
        });

        const particleSystem = new THREE.Points(particleGeometry, snowParticleMaterial);
        this.scene.add(particleSystem);
    }

    update(appState) {
        if (this.snowLight) {
            let pulse = Math.sin(appState.time * 2.0) * 3.0 + Math.cos(appState.time * 3.5) * 1.5;
            this.snowLight.intensity = (this.snowLightBaseIntensity + pulse) * appState.currentIn3DAlpha;
        }
    }
}
