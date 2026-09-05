import * as THREE from 'three';

const rainVertexShader = `
uniform float uTime;
uniform float uSpeed;
uniform vec2 uWind;
uniform vec3 uCameraPos;
attribute float aRandom;
varying float vAlpha;

void main() {
    vec3 pos = position;
    
    // 1. ROLLING BOX OPTIMIZATION (Frustum Culling Infinito)
    // En lugar de llover en todo el mapa, la lluvia "sigue" a la cámara,
    // pero repite sus coordenadas espacialmente para que parezca anclada al mundo.
    float boxSize = 60.0;
    float halfBox = boxSize / 2.0;
    
    // Calculamos la posición relativa a la cámara y aplicamos un módulo continuo
    pos.x = mod(pos.x - uCameraPos.x + halfBox, boxSize) - halfBox + uCameraPos.x;
    pos.z = mod(pos.z - uCameraPos.z + halfBox, boxSize) - halfBox + uCameraPos.z;
    
    // Caída acelerada hacia abajo
    pos.y -= uTime * uSpeed * (1.0 + aRandom);
    
    // Loop de las partículas en el eje Y (altura máxima 20, reset al caer debajo de 0)
    pos.y = mod(pos.y, 20.0);
    
    // Inclinación por el Viento
    float fallDepth = (20.0 - pos.y);
    pos.x += uWind.x * fallDepth * 0.05;
    pos.z += uWind.y * fallDepth * 0.05;
    
    // Transparencia dinámica basada en la altura
    vAlpha = smoothstep(0.0, 3.0, pos.y) * 0.5;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = (60.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const rainFragmentShader = `
precision mediump float;
uniform vec3 uColor;
uniform float uOpacityMultiplier;
uniform float uZoomAlpha;
varying float vAlpha;

void main() {
    vec2 uv = gl_PointCoord.xy - vec2(0.5);
    uv.x *= 8.0; 
    float dist = length(uv);
    float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
    
    if (alpha < 0.01) discard;
    
    gl_FragColor = vec4(uColor, alpha * vAlpha * uOpacityMultiplier * smoothstep(0.0, 0.5, uZoomAlpha));
}
`;

export class RainSystem {
    constructor(scene, aspect, uZoomAlphaUniform, camera) {
        this.scene = scene;
        this.aspect = aspect;
        this.uZoomAlpha = uZoomAlphaUniform; 
        this.camera = camera;
        
        this.intensity = 0.0; 
        this.targetIntensity = 0.0;
        
        // ¡Magia de optimización! Bajamos de 60,000 a 15,000 partículas.
        // Como ahora solo llueve cerca de la cámara, se verá MÁS denso y costará un 75% menos.
        this.particleCount = 20000; 
        
        this._initParticles();
    }
    
    _initParticles() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.particleCount * 3);
        const randoms = new Float32Array(this.particleCount);
        
        // Esparcimos las partículas iniciales en una caja local de 60x60
        const boxSize = 60.0;
        for (let i = 0; i < this.particleCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * boxSize;
            positions[i * 3 + 1] = Math.random() * 20.0;
            positions[i * 3 + 2] = (Math.random() - 0.5) * boxSize;
            randoms[i] = Math.random();
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
        
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uSpeed: { value: 30.0 }, 
                uWind: { value: new THREE.Vector2(0, 0) }, 
                uColor: { value: new THREE.Color(0xaaccff) },
                uOpacityMultiplier: { value: 0.0 },
                uZoomAlpha: this.uZoomAlpha,
                uCameraPos: { value: new THREE.Vector3() } // <--- NUEVO
            },
            vertexShader: rainVertexShader,
            fragmentShader: rainFragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        this.mesh = new THREE.Points(geometry, this.material);
        this.mesh.visible = false;
        
        // Importante desactivar el frustum culling de Three.js para esta caja,
        // ya que el shader se encarga de teletransportar los vértices matemáticamente.
        this.mesh.frustumCulled = false; 
        
        this.scene.add(this.mesh);
    }
    
    setIntensity(value) {
        this.targetIntensity = Math.min(Math.max(value, 0.0), 1.0);
    }
    
    setWind(vx, vy) {
        this.material.uniforms.uWind.value.set(vx, vy);
    }
    
    update(delta, time) {
        this.intensity += (this.targetIntensity - this.intensity) * 0.2 * delta;
        
        if (this.intensity > 0.005) {
            this.mesh.visible = true;
            this.material.uniforms.uTime.value = time;
            this.material.uniforms.uOpacityMultiplier.value = this.intensity;
            
            // Le pasamos la posición de la cámara al shader
            if(this.camera) {
                this.material.uniforms.uCameraPos.value.copy(this.camera.position);
            }
        } else {
            this.mesh.visible = false;
        }
    }
}
