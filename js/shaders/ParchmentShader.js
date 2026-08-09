export function applyParchmentShader(material) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0.0 };
        shader.uniforms.uZoom = { value: 1.0 };
        material.userData.shaderUniforms = shader.uniforms;

        shader.vertexShader = `
            uniform float uTime;
            varying vec3 vWorldPositionRoll;
            varying vec2 vUvRoll;
            
            float hashRoll(vec2 p) {
                p = fract(p * vec2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return fract(p.x * p.y);
            }
            
            float snoiseRoll(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(hashRoll(i + vec2(0.0, 0.0)), hashRoll(i + vec2(1.0, 0.0)), f.x),
                           mix(hashRoll(i + vec2(0.0, 1.0)), hashRoll(i + vec2(1.0, 1.0)), f.x), f.y);
            }
        ` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            vUvRoll = uv;
            
            // Calculamos la posición para usarla en el fragment shader sin distorsiones UV
            vWorldPositionRoll = position;
            
            // Ruido sutil para romper la perfección del tubo geométrico
            float noiseWave = snoiseRoll(vec2(position.y * 0.15, uTime * 0.1)) * 0.05;
            transformed.x += transformed.x * noiseWave;
            transformed.z += transformed.z * noiseWave;
            `
        );

        shader.fragmentShader = `
            uniform float uZoom;
            varying vec3 vWorldPositionRoll;
            varying vec2 vUvRoll;
            
            float hashF(vec2 p) {
                p = fract(p * vec2(234.34, 321.21));
                p += dot(p, p + 34.32);
                return fract(p.x * p.y);
            }
            
            float perlinF(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(hashF(i + vec2(0.0, 0.0)), hashF(i + vec2(1.0, 0.0)), f.x),
                           mix(hashF(i + vec2(0.0, 1.0)), hashF(i + vec2(1.0, 1.0)), f.x), f.y);
            }
        ` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `
            #include <color_fragment>
            
            // Mapeo cilíndrico continuo basado en la posición 3D local del cilindro
            float angle = atan(vWorldPositionRoll.x, vWorldPositionRoll.z);
            vec2 cylindricalUv = vec2(angle * 2.0, vWorldPositionRoll.y * 0.1);
            
            // Capas de ruido combinadas para vetas naturales y grano de papel
            float noiseLarge = perlinF(cylindricalUv * vec2(1.5, 4.0));
            float noiseDetail = perlinF(cylindricalUv * vec2(8.0, 25.0));
            float pNoise = noiseLarge * 0.7 + noiseDetail * 0.3;
            
            // Base de la textura del papel (más oscura y envejecida)
            vec3 vetaClara = vec3(0.72, 0.65, 0.52); 
            vec3 vetaOscura = vec3(0.52, 0.42, 0.32);  
            vec3 texturaPapel = mix(vetaOscura, vetaClara, pNoise);

            // --- SISTEMA DE COLOR DINÁMICO POR ZOOM ---
            vec3 color2D = vec3(0.72, 0.62, 0.48); // Tono pergamino envejecido oscuro para vista lejana
            vec3 color3D = vec3(0.04, 0.035, 0.03); // Tono marrón quemado ceniza súper oscuro para integrarse al fondo
            
            // Suavizamos la transición para que no sea abrupta
            float zoomFactor = smoothstep(0.2, 0.8, uZoom);
            vec3 colorBasePorZoom = mix(color2D, color3D, zoomFactor);
            // Multiplicamos las vetas por la tintura actual de la cámara
            vec3 parchmentColor = texturaPapel * colorBasePorZoom;

            // Fusionamos con el color base de la textura
            diffuseColor.rgb *= parchmentColor;
            `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `
            #include <dithering_fragment>
            
            // Viñeta difusa en los extremos del rollo: se mezcla suavemente hacia el color
            // de fondo (0x171310) en las puntas superior e inferior en el último paso del shader.
            // Esto anula cualquier iluminación especular que exponga la cara recortada del cilindro.
            float edgeFactor = smoothstep(0.0, 0.16, vUvRoll.y) * smoothstep(1.0, 0.84, vUvRoll.y);
            edgeFactor = pow(edgeFactor, 1.5);
            
            vec3 fogColor = vec3(0.09, 0.075, 0.063); // Equivalente a 0x171310
            gl_FragColor.rgb = mix(fogColor, gl_FragColor.rgb, edgeFactor);
            `
        );
    };
}
