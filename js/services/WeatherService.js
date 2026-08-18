/**
 * WeatherService.js
 * Encargado de obtener el clima real de León, España usando OpenWeatherMap.
 * Implementa caché local y modo MOCK para desarrollo.
 */

export class WeatherService {
    constructor() {
        this.city = "Leon,ES";
        this.useMock = false; // <-- APAGAMOS EL MOCK, USAMOS API REAL
        
        this.currentWeather = {
            temperature: 20, 
            condition: "Clear", // 'Clear', 'Rain', 'Snow', 'Thunderstorm', 'Clouds', 'Fog'
            cloudCover: 0, 
            rainIntensity: 0, 
            windSpeed: 5, 
            windDirection: 0 
        };

        this.listeners = [];
        this.lastFetch = 0;
        this.fetchInterval = 10 * 60 * 1000; // 10 minutos
    }

    onChange(callback) {
        this.listeners.push(callback);
    }

    notifyListeners() {
        this.listeners.forEach(cb => cb(this.currentWeather));
    }

    // Permite forzar un clima artificialmente para probar los efectos visuales
    debugSetWeather(condition, cloudCover, rainIntensity, windSpeed, temperature) {
        this.currentWeather.condition = condition;
        this.currentWeather.cloudCover = cloudCover;
        this.currentWeather.rainIntensity = rainIntensity;
        this.currentWeather.windSpeed = windSpeed;
        if (temperature !== undefined) this.currentWeather.temperature = temperature;
        this.notifyListeners();
    }
    
    debugSetTemperature(temperature) {
        this.currentWeather.temperature = temperature;
        this.notifyListeners();
    }

    async update() {
        const now = Date.now();
        if (now - this.lastFetch < this.fetchInterval && this.lastFetch !== 0) {
            return;
        }
        
        this.lastFetch = now;

        if (this.useMock) {
            console.log("[WeatherService] MODO MOCK: Clima simulado");
            // No hacemos nada, permitimos que las teclas de debug controlen el clima
            return;
        }

        try {
            // Utilizamos la API de Open-Meteo, que es 100% gratuita, libre y NO requiere API Key.
            // Coordenadas de León, España: lat=42.5987, lon=-5.5671
            const url = `https://api.open-meteo.com/v1/forecast?latitude=42.5987&longitude=-5.5671&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,precipitation`;
            const response = await fetch(url);
            if (!response.ok) throw new Error("Error en la API de Open-Meteo");
            
            const data = await response.json();
            this.parseWeatherData(data);
            this.notifyListeners();
        } catch (error) {
            console.error("[WeatherService] Error obteniendo clima (sin conexión o fallo API). Generando clima aleatorio:", error);
            
            // Generar clima aleatorio
            const conditions = ['Clear', 'Clouds', 'Rain', 'Thunderstorm', 'Fog'];
            const randomCondition = conditions[Math.floor(Math.random() * conditions.length)];
            
            this.currentWeather.condition = randomCondition;
            this.currentWeather.temperature = Math.floor(Math.random() * 40) - 5; // Entre -5 y 35
            
            if (randomCondition === 'Clear') {
                this.currentWeather.cloudCover = Math.random() * 20;
                this.currentWeather.rainIntensity = 0.0;
            } else if (randomCondition === 'Clouds') {
                this.currentWeather.cloudCover = 50 + Math.random() * 50;
                this.currentWeather.rainIntensity = 0.0;
            } else if (randomCondition === 'Rain') {
                this.currentWeather.cloudCover = 80 + Math.random() * 20;
                this.currentWeather.rainIntensity = 0.3 + Math.random() * 0.7;
            } else if (randomCondition === 'Thunderstorm') {
                this.currentWeather.cloudCover = 100;
                this.currentWeather.rainIntensity = 1.0;
            } else if (randomCondition === 'Fog') {
                this.currentWeather.cloudCover = 100;
                this.currentWeather.rainIntensity = 0.0;
            }
            
            this.currentWeather.windSpeed = Math.random() * 30; // 0 a 30 km/h
            this.currentWeather.windDirection = Math.random() * 360;
            
            console.log(`[WeatherService] FALLBACK (Aleatorio): ${this.currentWeather.condition}, ${this.currentWeather.temperature}°C, Nubes: ${Math.floor(this.currentWeather.cloudCover)}%`);
            this.notifyListeners();
        }
    }

    parseWeatherData(data) {
        if (!data || !data.current) return;
        
        const current = data.current;
        this.currentWeather.temperature = current.temperature_2m;
        this.currentWeather.cloudCover = current.cloud_cover;
        this.currentWeather.windSpeed = current.wind_speed_10m;
        this.currentWeather.windDirection = current.wind_direction_10m;
        
        // Mapeo de códigos WMO (Organización Meteorológica Mundial)
        const code = current.weather_code;
        
        let condition = 'Clear';
        let rainIntensity = 0.0;
        
        if (code === 0) {
            condition = 'Clear';
        } else if (code >= 1 && code <= 3) {
            condition = 'Clouds';
        } else if (code === 45 || code === 48) {
            condition = 'Fog';
        } else if ((code >= 51 && code <= 57) || (code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
            condition = 'Rain';
            // Calcular intensidad según la precipitación (mm)
            rainIntensity = Math.min(current.precipitation / 10.0, 1.0);
            if (rainIntensity < 0.1) rainIntensity = 0.5; // Mínimo visual si está lloviendo
        } else if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
            condition = 'Snow';
        } else if (code >= 95 && code <= 99) {
            condition = 'Thunderstorm';
            rainIntensity = 1.0;
        }
        
        this.currentWeather.condition = condition;
        this.currentWeather.rainIntensity = rainIntensity;

        console.log(`[WeatherService] Clima en Vivo (León, ES): ${condition}, Nubes: ${current.cloud_cover}%, Viento: ${current.wind_speed_10m} km/h`, this.currentWeather);
    }
}
