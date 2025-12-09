// ============================================================================
// CLIENTE DA API - COMUNICAÇÃO COM O BACKEND
// ============================================================================

class ApiClient {
    constructor() {
        this.baseURL = CONFIG.API_URL;
    }

    /**
     * Obter token de autenticação do localStorage
     */
    getToken() {
        return localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
    }

    /**
     * Fazer requisição HTTP
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const token = this.getToken();

        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (token && !options.skipAuth) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            headers
        };

        try {
            const response = await fetch(url, config);

            // Se não autorizado, limpar sessão
            if (response.status === 401) {
                this.logout();
                throw new Error('Sessão expirada. Faça login novamente');
            }

            const data = await response.json();

            if (!response.ok) {
                // Extrair mensagem de erro do backend
                let errorMessage = 'Erro na requisição';

                if (data.detail) {
                    errorMessage = typeof data.detail === 'string'
                        ? data.detail
                        : JSON.stringify(data.detail);
                } else if (data.message) {
                    errorMessage = data.message;
                }

                throw new Error(errorMessage);
            }

            return data;
        } catch (error) {
            console.error(`Erro na API ${endpoint}:`, error);
            throw error;
        }
    }

    /**
     * Fazer login
     */
    async login(email, senha) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, senha }),
            skipAuth: true
        });

        // Salvar token e usuário
        localStorage.setItem(CONFIG.STORAGE_KEYS.TOKEN, data.access_token);
        localStorage.setItem(CONFIG.STORAGE_KEYS.USUARIO, JSON.stringify(data.usuario));

        return data;
    }

    /**
     * Fazer logout
     */
    logout() {
        localStorage.removeItem(CONFIG.STORAGE_KEYS.TOKEN);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.USUARIO);
        window.location.reload();
    }

    /**
     * Obter usuário atual
     */
    getUsuarioAtual() {
        const usuario = localStorage.getItem(CONFIG.STORAGE_KEYS.USUARIO);

        // Validar se o valor é válido antes de fazer parse
        if (!usuario || usuario === 'undefined' || usuario === 'null') {
            return null;
        }

        try {
            return JSON.parse(usuario);
        } catch (error) {
            console.error('Erro ao fazer parse do usuário do localStorage:', error);
            // Limpar localStorage corrompido
            localStorage.removeItem(CONFIG.STORAGE_KEYS.USUARIO);
            return null;
        }
    }

    /**
     * Registrar ponto
     */
    async registrarPonto(dados) {
        return await this.request('/ponto/registrar', {
            method: 'POST',
            body: JSON.stringify(dados)
        });
    }

    /**
     * Obter último registro
     */
    async obterUltimoRegistro() {
        return await this.request('/ponto/ultimo', {
            method: 'GET'
        });
    }

    /**
     * Obter meus registros
     */
    async obterMeusRegistros(dias = 7) {
        return await this.request(`/ponto/meus-registros?dias=${dias}`, {
            method: 'GET'
        });
    }

    /**
     * Sincronizar registros offline
     */
    async sincronizarRegistros(registros) {
        return await this.request('/ponto/sincronizar', {
            method: 'POST',
            body: JSON.stringify({ records: registros })
        });
    }

    /**
     * Obter espelho de ponto
     */
    async obterEspelhoPonto(usuarioId, dataInicio, dataFim) {
        const params = new URLSearchParams({
            usuario_id: usuarioId,
            data_inicio: dataInicio,
            data_fim: dataFim
        });

        return await this.request(`/relatorios/espelho-ponto?${params}`, {
            method: 'GET'
        });
    }
}

// Criar instância global
const api = new ApiClient();
window.api = api;
