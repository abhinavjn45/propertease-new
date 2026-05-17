/**
 * Propert-Ease Frontend Environment Configuration
 * Centralized configuration to manage API base URLs dynamically across all environments.
 */
window.APP_CONFIG = {
    // Dynamically detect environment based on hostname
    // 'localhost' or '127.0.0.1' triggers development mode; live domains trigger production mode.
    MODE: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'development' : 'production',

    // Production Cloud API Base URL (Render Web Service)
    PRODUCTION_API_BASE: 'https://propertease-api-do2f.onrender.com',

    // Local Development API Base URL
    DEVELOPMENT_API_BASE: 'http://127.0.0.1:5000',

    // Get current active API Base URL
    getApiBase: function() {
        return this.MODE === 'production' ? this.PRODUCTION_API_BASE : this.DEVELOPMENT_API_BASE;
    }
};
