import * as THREE from 'three';

export class SceneManager {
    constructor() {
        // 1. Escena
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x3a5682);
        // Niebla lineal agresiva al final para borrar completamente los bordes físicos (líneas rectas) del plano 3D
        this.scene.fog = new THREE.Fog(0x3a5682, 40, 85);

        // 2. Cámara (Inicia en vista 2D desde arriba)
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 60, 0); 

        // 3. Renderizador
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            powerPreference: "high-performance",
            alpha: false
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
        this.renderer.setClearColor(0x3a5682); 
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);

        // 4. Luces
        this._setupLights();
    }

    _setupLights() {
        // Bajamos la luz ambiental para que las sombras sean más oscuras y marquen el relieve
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
        this.scene.add(ambientLight);

        // Aumentamos la fuerza del sol para compensar (bajamos un poco la intensidad a 1.5 a pedido)
        this.sunLight = new THREE.DirectionalLight(0xffe4b5, 1.5);
        
        // Subimos un poco el sol en Y (de 30 a 45) y lo acercamos en X (de -60 a -40)
        // para que la luz sea menos rasante y agresiva.
        this.sunLight.position.set(-40, 45, -40); 
        this.sunLight.castShadow = true;
        
        // Configurar la cámara de sombras para cubrir todo el mapa (100x100)
        this.sunLight.shadow.camera.left = -60;
        this.sunLight.shadow.camera.right = 60;
        this.sunLight.shadow.camera.top = 60;
        this.sunLight.shadow.camera.bottom = -60;
        this.sunLight.shadow.camera.near = 0.1;
        this.sunLight.shadow.camera.far = 200;
        
        // Resolución de la sombra
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.bias = -0.001;

        this.scene.add(this.sunLight);
    }

    handleResize(aspect, width, height) {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    getDomElement() {
        return this.renderer.domElement;
    }
}
