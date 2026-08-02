import * as THREE from 'three';
import { cloudVertexShader, cloudFragmentShader } from '../shaders/CloudShader.js';

export class Clouds {
    constructor(scene) {
        this.scene = scene;
        this.material = null;
        this.clock = new THREE.Clock();

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
                uTargetUv: { value: new THREE.Vector2(0.5, 0.5) }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.NormalBlending
        });

        const mesh = new THREE.Mesh(cloudGeometry, this.material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 8;
        
        this.scene.add(mesh);
    }

    update(target) {
        if (this.material) {
            this.material.uniforms.uTime.value = this.clock.getElapsedTime();
            if (target) {
                // El plano de nubes mide 150x150, centrado en (0,0)
                let targetU = target.x / 150.0 + 0.5;
                // Z en coordenadas de mundo va hacia abajo de la pantalla, en UV V va hacia arriba
                let targetV = -target.z / 150.0 + 0.5;
                
                // Interpolamos suavemente la posición del hueco (lerp) para un movimiento orgánico
                this.material.uniforms.uTargetUv.value.x += (targetU - this.material.uniforms.uTargetUv.value.x) * 0.05;
                this.material.uniforms.uTargetUv.value.y += (targetV - this.material.uniforms.uTargetUv.value.y) * 0.05;
            }
        }
    }
}
