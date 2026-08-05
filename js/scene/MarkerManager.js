import * as THREE from 'three';

export class MarkerManager {
    constructor(mapPlaneGroup) {
        this.mapPlaneGroup = mapPlaneGroup;
    }

    // Dibuja un marcador individual con su respectiva forma y etiqueta de texto
    spawnVisualMarker(data) {
        let geometry;
        const shape = data.shape || 'circle';
        
        if (shape === 'square') {
            geometry = new THREE.BoxGeometry(1.2, 1.2, 0.3);
        } else if (shape === 'triangle') {
            const triShape = new THREE.Shape();
            triShape.moveTo(0, 0.8);
            triShape.lineTo(-0.8, -0.6);
            triShape.lineTo(0.8, -0.6);
            triShape.closePath();
            geometry = new THREE.ExtrudeGeometry(triShape, { depth: 0.3, bevelEnabled: false });
            geometry.center();
        } else if (shape === 'diamond') {
            const diamShape = new THREE.Shape();
            diamShape.moveTo(0, 0.9);
            diamShape.lineTo(-0.7, 0);
            diamShape.lineTo(0, -0.9);
            diamShape.lineTo(0.7, 0);
            diamShape.closePath();
            geometry = new THREE.ExtrudeGeometry(diamShape, { depth: 0.3, bevelEnabled: false });
            geometry.center();
        } else {
            geometry = new THREE.SphereGeometry(0.8, 16, 16);
        }

        const material = new THREE.MeshBasicMaterial({ color: 0xff5252 });
        const mesh = new THREE.Mesh(geometry, material);
        
        const posX = data.position ? data.position.x : data.x;
        const posY = data.position ? data.position.y : data.y;
        const posZ = data.position ? data.position.z : data.z;

        mesh.position.set(posX, posY, posZ + 0.2);
        mesh.userData = { id: data.id, name: data.name, region: data.region };
        
        this.mapPlaneGroup.add(mesh);

        if (data.name) {
            const textSprite = this.createTextSprite(data.name);
            textSprite.position.set(posX, posY - 1.2, posZ + 0.4);
            this.mapPlaneGroup.add(textSprite);
        }
    }

createTextSprite(message) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        context.font = 'Bold 28px sans-serif';
        const metrics = context.measureText(message);
        const textWidth = metrics.width;

        // Ajustamos el tamaño del canvas al ancho exacto del texto
        canvas.width = textWidth + 10;
        canvas.height = 40;

        // Redefinimos la fuente tras redimensionar el canvas
        context.font = 'Bold 28px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';


        context.strokeText(message, canvas.width / 2, canvas.height / 2);

        // Texto principal en negro puro
        context.fillStyle = '#000000';
        context.fillText(message, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;

        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(4, 2, 1);

        return sprite;
    }

    // Limpia todos los elementos visuales de los marcadores en la escena
    clearSceneMarkers() {
        const toRemove = [];
        this.mapPlaneGroup.traverse((child) => {
            if (child.userData && child.userData.id) {
                toRemove.push(child);
            }
        });
        toRemove.forEach(mesh => {
            this.mapPlaneGroup.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
            if (mesh.material && mesh.material.map) mesh.material.map.dispose();
        });
    }

    // Renderiza una lista completa de marcadores
    renderAll(markersList) {
        this.clearSceneMarkers();
        markersList.forEach(data => this.spawnVisualMarker(data));
    }
}