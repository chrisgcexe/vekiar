import * as THREE from 'three';
import { AssetLoader } from '../utils/AssetLoader.js'; 

export class SceneManager {
    constructor() {
        // ... (Tu constructor original queda igual)[cite: 16]
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x171310);
        this.scene.fog = new THREE.Fog(0x171310, 50, 95);
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 60, 0); 
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", alpha: false });
        
        this.renderer.localClippingEnabled = true;
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
        this.renderer.setClearColor(0x3a5682); 
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);
        this._setupLights();
    }

    _setupLights() {
        // ... (Tus luces originales quedan igual)[cite: 16]
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
        this.scene.add(ambientLight);
        this.sunLight = new THREE.DirectionalLight(0xffe4b5, 1.5);
        this.sunLight.position.set(-40, 45, -40); 
        this.sunLight.castShadow = true;
        this.sunLight.shadow.camera.left = -60;
        this.sunLight.shadow.camera.right = 60;
        this.sunLight.shadow.camera.top = 60;
        this.sunLight.shadow.camera.bottom = -60;
        this.sunLight.shadow.camera.near = 0.1;
        this.sunLight.shadow.camera.far = 200;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.bias = -0.001;
        this.scene.add(this.sunLight);
    }

    // AÑADIMOS cameraController A LOS ARGUMENTOS
    async initializeVekiar(appState, mapInstance, cameraController) {
        
        const updateUI = (progress) => {
            const barNode = document.querySelector('.loader-progress');
            const textNode = document.querySelector('.loader-text');
            if (barNode) barNode.style.width = `${progress}%`;
            if (textNode) textNode.innerText = `Cargando... ${Math.floor(progress)}%`;
        };

        try {
            const assets = await AssetLoader.loadVekiarAssets(this.renderer, updateUI);
            await mapInstance.build(assets, updateUI);

            const loader = document.getElementById('loader');
            const loaderContent = document.querySelector('.loader-content');

            if (loader && loaderContent) {
                loaderContent.style.transition = 'opacity 0.3s ease';
                loaderContent.style.opacity = '0';

                setTimeout(() => {
                    loader.classList.add('fade-out');
                    
                    // COREOGRAFÍA: Disparamos intro y desbloqueamos terreno al unísono
                    if (cameraController) cameraController.playIntro();
                    appState.setTerrainReady();

                    loader.addEventListener('transitionend', (event) => {
                        if (event.propertyName === 'opacity') {
                            loader.style.display = 'none';
                        }
                    });
                }, 1000); 
            } else {
                // Fallback por si no encuentra el HTML
                appState.setTerrainReady();
            }

            return assets; // <-- AGREGAR ESTO ACÁ ANTES DEL CATCH
        
        } catch (error) {
            console.error("Hubo un error cargando los assets de Vékiar:", error);
        }
    }

    update(appState) {
        // ... (Tu update original queda igual)[cite: 16]
        if (this.sunLight) {
            this.sunLight.intensity = 0.8 + appState.currentIn3DAlpha * 0.7;
        }
        const vignetteElement = document.getElementById('vignette');
        if (vignetteElement) {
            vignetteElement.style.opacity = appState.currentIn3DAlpha;
        }
    }

    handleResize(aspect, width, height) {
        // ... (Tu handleResize original queda igual)[cite: 16]
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