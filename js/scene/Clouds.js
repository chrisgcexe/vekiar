import * as THREE from 'three';
import { cloudVertexShader, cloudFragmentShader } from '../shaders/CloudShader.js';

export class Clouds {
    constructor(scene) {
        this.scene = scene;
        this.material = null;

        this._initClouds();
    }

    _initClouds() {
        const cloudGeometry = new THREE.PlaneGeometry(150, 150, 1, 1);

        this.material = new THREE.ShaderMaterial({
            vertexShader: cloudVertexShader,
            fragmentShader: cloudFragmentShader,
            uniforms: {
                uTime: { value: 0.0 },
                uColor: { value: new THREE.Color(0xffffff) },
                uTargetUv: { value: new THREE.Vector2(0.5, 0.5) },
                uOpacity: { value: 0.0 },
                uCloudOffset: { value: new THREE.Vector2(0.0, 0.0) },
                uCloudDensity: { value: 0.0 }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.NormalBlending
        });

        // Valores físicos de clima (por defecto un día normal y viento estándar)
        this.windSpeedX = 0.08;
        this.windSpeedY = -0.04;
        this.targetCloudDensity = 0.0;

        const mesh = new THREE.Mesh(cloudGeometry, this.material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 8;
        
        this.scene.add(mesh);
    }

    setWeather(cloudCover, windSpeedX, windSpeedY) {
        // cloudCover viene de 0 a 100. Lo pasamos a 0.0 - 1.0
        this.targetCloudDensity = Math.min(Math.max(cloudCover / 100.0, 0.0), 1.0);
        
        // Viento
        if (windSpeedX !== undefined) this.windSpeedX = windSpeedX;
        if (windSpeedY !== undefined) this.windSpeedY = windSpeedY;
    }

    update(target, time, delta) {
        if (this.material) {
            this.material.uniforms.uTime.value = time;
            
            // Densidad progresiva
            this.material.uniforms.uCloudDensity.value += (this.targetCloudDensity - this.material.uniforms.uCloudDensity.value) * 0.1 * delta;
            
            // Movimiento constante por viento
            this.material.uniforms.uCloudOffset.value.x += this.windSpeedX * delta;
            this.material.uniforms.uCloudOffset.value.y += this.windSpeedY * delta;
            
            if (target) {
                // El plano de nubes mide 150x150, centrado en (0,0)
                let targetU = target.x / 150.0 + 0.5;
                // Z en coordenadas de mundo va hacia abajo de la pantalla, en UV V va hacia arriba
                let targetV = -target.z / 150.0 + 0.5;
                
                // Interpolamos suavemente la posición del hueco (lerp) para un movimiento orgánico
                this.material.uniforms.uTargetUv.value.x += (targetU - this.material.uniforms.uTargetUv.value.x) * 5.0 * delta;
                this.material.uniforms.uTargetUv.value.y += (targetV - this.material.uniforms.uTargetUv.value.y) * 5.0 * delta;
            }
        }
    }
}
