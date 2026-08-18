/**
 * DynamicWeatherManager.js
 * 
 * Controlador central que recibe los datos de WeatherService 
 * y dirige a los subsistemas visuales (lluvia, nubes, viento, etc.)
 */
import { WeatherService } from '../../services/WeatherService.js';
import { RainSystem } from './RainSystem.js';
import { StormSystem } from './StormSystem.js';
import { FogSystem } from './FogSystem.js';

export class DynamicWeatherManager {
    constructor(scene, camera, renderer, assets, mapMaterial, aspect, clouds, dayNightCycle) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.assets = assets;
        this.mapMaterial = mapMaterial;
        this.clouds = clouds;
        this.dayNightCycle = dayNightCycle;
        
        this.weatherService = new WeatherService();
        
        this.systems = {
            rain: new RainSystem(scene, aspect, mapMaterial.userData.uZoomAlpha, camera),
            storm: new StormSystem(scene),
            fog: new FogSystem(scene),
            wind: null
        };
        this.targetRainIntensity = 0.0;
        this.currentRainIntensity = 0.0;
        
        this.targetCloudCover = 0.0;
        this.currentCloudCover = 0.0;
        
        this.targetTemperature = 20.0;
        this.currentTemperature = 20.0;
        
        // Suscribirse a cambios del clima
        this.weatherService.onChange(this.onWeatherChanged.bind(this));
    }
    
    // Llamado una vez para arrancar
    init() {
        this.weatherService.update(); // Hace el primer fetch
    }
    
    // Llamado cuando el WeatherService reporta un nuevo estado (ej: cada 10 mins o por debug UI)
    onWeatherChanged(weatherData) {
        console.log("[DynamicWeatherManager] Transicionando al clima:", weatherData.condition);
        
        // En lugar de aplicarlo de golpe, guardamos el "target" para que la transición sea súper lenta y cinemática
        this.targetRainIntensity = weatherData.rainIntensity;
        this.targetCloudCover = weatherData.cloudCover / 100.0;
        if (weatherData.temperature !== undefined) {
            this.targetTemperature = weatherData.temperature;
        }
        
        if (this.systems.storm) {
            this.systems.storm.setActive(weatherData.condition === 'Thunderstorm');
        }
        
        if (this.systems.fog) {
            this.systems.fog.setWeather(weatherData.condition, weatherData.rainIntensity);
        }
        
        if (this.systems.wind) {
            this.systems.wind.setVector(weatherData.windSpeed, weatherData.windDirection);
        }
        
        if (this.clouds) {
            // Pasamos la cobertura nubosa y el vector de viento convertido
            // Convertimos velocidad bruta (0-20) a algo sutil para el shader (-0.1 a 0.1)
            let rad = weatherData.windDirection * (Math.PI / 180);
            let wx = Math.cos(rad) * (weatherData.windSpeed / 100);
            let wy = Math.sin(rad) * (weatherData.windSpeed / 100);
            this.clouds.setWeather(weatherData.cloudCover, wx, wy);
            
            // Aplicar el mismo viento a la lluvia (rotamos 90 grados para que coincida con el eje 3D)
            if (this.systems.rain) {
                // El viento en la lluvia espera (intensidad X, intensidad Y)
                let rainWx = Math.cos(rad) * (weatherData.windSpeed / 15.0);
                let rainWz = Math.sin(rad) * (weatherData.windSpeed / 15.0);
                this.systems.rain.setWind(rainWx, rainWz);
            }
        }
    }
    
    // Llamado en el loop principal de requestAnimationFrame
    update(delta, time) {
        // Interpolar lentamente la intensidad de la tormenta (tarda unos segundos en armarse)
        this.currentRainIntensity += (this.targetRainIntensity - this.currentRainIntensity) * 0.1 * delta;
        this.currentCloudCover += (this.targetCloudCover - this.currentCloudCover) * 0.1 * delta;
        this.currentTemperature += (this.targetTemperature - this.currentTemperature) * 0.1 * delta;
        
        // El dimmer de iluminación global usa la densidad de las nubes O la intensidad de lluvia (la que sea mayor)
        if (this.dayNightCycle) {
            this.dayNightCycle.weatherDimmer = Math.max(this.currentCloudCover, this.currentRainIntensity);
            this.dayNightCycle.weatherTemperature = this.currentTemperature;
        }
        
        // Asignamos la transición suave tanto a las partículas como al shader de suelo mojado
        if (this.systems.rain) {
            this.systems.rain.setIntensity(this.currentRainIntensity);
            this.systems.rain.update(delta, time);
        }
        
        if (this.mapMaterial) {
            if (this.mapMaterial.userData.uRainIntensity) {
                this.mapMaterial.userData.uRainIntensity.value = this.currentRainIntensity;
            }
            if (this.mapMaterial.userData.uCloudShadowDensity && this.clouds && this.clouds.material) {
                this.mapMaterial.userData.uCloudShadowDensity.value = this.currentCloudCover;
                this.mapMaterial.userData.uCloudShadowOffset.value.copy(this.clouds.material.uniforms.uCloudOffset.value);
            }
        }

        if (this.systems.storm) this.systems.storm.update(delta, time);
        if (this.systems.fog) this.systems.fog.update(delta, time);
        if (this.systems.wind) this.systems.wind.update(delta, time);
        
        // Mantener la caché al día por si pasaron 10 minutos
        this.weatherService.update();
    }
}
