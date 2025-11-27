// ============================================================================
// CONFIGURAÇÃO GLOBAL DO APLICATIVO
// ============================================================================

const CONFIG = {
    // URL da API (ajustar conforme ambiente)
    API_URL: window.location.hostname === 'localhost'
        ? 'http://localhost:8000'
        : 'https://sua-api.exemplo.com',

    // Chaves do LocalStorage
    STORAGE_KEYS: {
        TOKEN: 'ponto_token',
        USUARIO: 'ponto_usuario',
        REGISTROS_OFFLINE: 'ponto_registros_offline'
    },

    // Configurações de cache
    CACHE_VERSION: 'v1',
    CACHE_NAME: 'controle-ponto-v1',

    // Configurações do aplicativo
    APP: {
        NOME: 'Controle de Ponto Antigravity',
        VERSAO: '1.0.0'
    }
};

// Disponibilizar globalmente
window.CONFIG = CONFIG;
