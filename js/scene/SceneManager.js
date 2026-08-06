import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
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

        // Renderer CSS2D: capa DOM encima del canvas WebGL
        this.css2dRenderer = new CSS2DRenderer();
        this.css2dRenderer.setSize(window.innerWidth, window.innerHeight);
        this.css2dRenderer.domElement.style.position = 'absolute';
        this.css2dRenderer.domElement.style.top = '0';
        this.css2dRenderer.domElement.style.left = '0';
        this.css2dRenderer.domElement.style.pointerEvents = 'none'; // No bloquea clicks al mapa
        document.body.appendChild(this.css2dRenderer.domElement);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);
        this._setupLights();
        // Cache del elemento vignette (evita getElementById cada frame)
        this._vignetteEl = null;
        this._lastVignetteAlpha = -1;
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
        const alpha = appState.currentIn3DAlpha;
        // Solo actualizar cuando alpha cambió en más del 0.2%:
        // evita escritura DOM (style.opacity) y cambio de intensidad cada frame.
        if (Math.abs(alpha - this._lastVignetteAlpha) > 0.002) {
            this._lastVignetteAlpha = alpha;
            if (this.sunLight) {
                this.sunLight.intensity = 0.8 + alpha * 0.7;
            }
            if (!this._vignetteEl) this._vignetteEl = document.getElementById('vignette');
            if (this._vignetteEl) {
                this._vignetteEl.style.opacity = alpha;
            }
        }
    }

    handleResize(aspect, width, height) {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.css2dRenderer.setSize(width, height);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
        this.css2dRenderer.render(this.scene, this.camera);
    }

    getDomElement() {
        return this.renderer.domElement;
    }
}