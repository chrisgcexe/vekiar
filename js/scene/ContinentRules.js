export const ContinentRules = {
    // Reglas específicas por continente para mantener la arquitectura limpia
    IREVIE: {
        allowedTypesInPanel: ['region', 'otro', 'isla'],
        lodOverrides: { 'otro': 'region', 'isla': 'region' }
    },
    APYIT: {
        allowedTypesInPanel: ['region', 'otro', 'isla'],
        lodOverrides: { 'otro': 'region', 'isla': 'region' }
    },
    
    // Regla por defecto para los demás continentes (ITRAMA, etc)
    DEFAULT: {
        allowedTypesInPanel: ['region'],
        lodOverrides: {}
    },

    getRulesFor(continentName) {
        return this[continentName] || this.DEFAULT;
    }
};

