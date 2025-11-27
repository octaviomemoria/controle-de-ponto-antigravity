// ============================================================================
// MÓDULO DE SUPORTE OFFLINE - IndexedDB e Sincronização
// ============================================================================

class OfflineManager {
    constructor() {
        this.dbName = 'PontoOfflineDB';
        this.dbVersion = 1;
        this.db = null;
    }

    /**
     * Inicializar IndexedDB
     */
    async inicializar() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Criar object store para registros offline
                if (!db.objectStoreNames.contains('registros')) {
                    const objectStore = db.createObjectStore('registros', {
                        keyPath: 'id',
                        autoIncrement: true
                    });

                    objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                    objectStore.createIndex('sincronizado', 'sincronizado', { unique: false });
                }
            };
        });
    }

    /**
     * Salvar registro offline
     */
    async salvarRegistroOffline(registro) {
        if (!this.db) {
            await this.inicializar();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['registros'], 'readwrite');
            const objectStore = transaction.objectStore('registros');

            const registroComTimestamp = {
                ...registro,
                timestamp: new Date().toISOString(),
                sincronizado: false
            };

            const request = objectStore.add(registroComTimestamp);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Obter registros não sincronizados
     */
    async obterRegistrosNaoSincronizados() {
        if (!this.db) {
            await this.inicializar();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['registros'], 'readonly');
            const objectStore = transaction.objectStore('registros');
            const index = objectStore.index('sincronizado');
            const request = index.getAll(false);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Marcar registro como sincronizado
     */
    async marcarComoSincronizado(id) {
        if (!this.db) {
            await this.inicializar();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['registros'], 'readwrite');
            const objectStore = transaction.objectStore('registros');
            const request = objectStore.get(id);

            request.onsuccess = () => {
                const registro = request.result;
                if (registro) {
                    registro.sincronizado = true;
                    const updateRequest = objectStore.put(registro);
                    updateRequest.onsuccess = () => resolve();
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else {
                    resolve();
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Limpar registros sincronizados
     */
    async limparRegistrosSincronizados() {
        if (!this.db) {
            await this.inicializar();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['registros'], 'readwrite');
            const objectStore = transaction.objectStore('registros');
            const index = objectStore.index('sincronizado');
            const request = index.openCursor(true);

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Sincronizar registros offline com o servidor
     */
    async sincronizar() {
        try {
            const registros = await this.obterRegistrosNaoSincronizados();

            if (registros.length === 0) {
                return { sucesso: true, quantidade: 0, mensagem: 'Nenhum registro para sincronizar' };
            }

            // Formatr registros para o formato esperado pela API
            const registrosParaEnviar = registros.map(r => ({
                clock_type: r.clock_type,
                latitude: r.latitude,
                longitude: r.longitude,
                photo_base64: r.photo_base64
            }));

            // Enviar para API
            const resultado = await api.sincronizarRegistros(registrosParaEnviar);

            // Marcar registros sincronizados
            for (const registro of registros) {
                await this.marcarComoSincronizado(registro.id);
            }

            // Limpar registros sincronizados
            await this.limparRegistrosSincronizados();

            return {
                sucesso: true,
                quantidade: resultado.synced_count,
                falhas: resultado.failed_count,
                mensagem: `${resultado.synced_count} registro(s) sincronizado(s)`
            };

        } catch (error) {
            console.error('Erro na sincronização:', error);
            return {
                sucesso: false,
                quantidade: 0,
                mensagem: error.message
            };
        }
    }
}

// ============================================================================
// DETECTOR DE CONEXÃO
// ============================================================================

class ConexaoMonitor {
    constructor() {
        this.online = navigator.onLine;
        this.callbacks = [];

        // Ouvir mudanças de conexão
        window.addEventListener('online', () => this.atualizarStatus(true));
        window.addEventListener('offline', () => this.atualizarStatus(false));
    }

    /**
     * Atualizar status de conexão
     */
    atualizarStatus(online) {
        this.online = online;
        this.notificarCallbacks(online);
        this.atualizarUI(online);

        // Se voltou online, tentar sincronizar
        if (online) {
            this.tentarSincronizar();
        }
    }

    /**
     * Registrar callback para mudança de status
     */
    aoMudarStatus(callback) {
        this.callbacks.push(callback);
    }

    /**
     * Notificar todos os callbacks
     */
    notificarCallbacks(online) {
        this.callbacks.forEach(callback => callback(online));
    }

    /**
     * Atualizar UI com status de conexão
     */
    atualizarUI(online) {
        const statusConexao = document.getElementById('statusConexao');
        const statusTexto = document.getElementById('statusTexto');

        if (statusConexao && statusTexto) {
            if (online) {
                statusConexao.classList.add('hidden');
            } else {
                statusConexao.classList.remove('hidden');
                statusTexto.textContent = 'Você está offline. Registros serão salvos localmente.';
            }
        }
    }

    /**
     * Tentar sincronizar quando voltar online
     */
    async tentarSincronizar() {
        const offlineManager = new OfflineManager();
        const resultado = await offlineManager.sincronizar();

        if (resultado.sucesso && resultado.quantidade > 0) {
            UI.mostrarToast(resultado.mensagem, 'sucesso');
        }
    }

    /**
     * Verificar se está online
     */
    estaOnline() {
        return this.online;
    }
}

// Criar instâncias globais
const offlineManager = new OfflineManager();
const conexaoMonitor = new ConexaoMonitor();

window.offlineManager = offlineManager;
window.conexaoMonitor = conexaoMonitor;
