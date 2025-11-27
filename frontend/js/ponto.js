// ============================================================================
// MÓDULO DE REGISTRO DE PONTO - Lógica Principal
// ============================================================================

class GerenciadorPonto {
    constructor() {
        this.camera = null;
        this.coordenadas = null;
        this.tipoAtual = null;
    }

    /**
     * Inicializar gerenciador de ponto
     */
    inicializar() {
        this.configurarBotoes();
        this.configurarModal();
        this.carregarDados();
    }

    /**
     * Configurar botões de registro
     */
    configurarBotoes() {
        const botoesPonto = document.querySelectorAll('.btn-ponto');

        botoesPonto.forEach(btn => {
            btn.addEventListener('click', async () => {
                if (btn.disabled) return;

                this.tipoAtual = btn.dataset.tipo;
                await this.iniciarProcessoRegistro();
            });
        });
    }

    /**
     * Configurar modal de câmera
     */
    configurarModal() {
        const modalCamera = document.getElementById('modalCamera');
        const btnFecharModal = document.getElementById('btnFecharModal');
        const btnCapturar = document.getElementById('btnCapturar');
        const btnConfirmar = document.getElementById('btnConfirmar');
        const btnRefazer = document.getElementById('btnRefazer');

        // Fechar modal
        btnFecharModal?.addEventListener('click', () => {
            this.cancelarRegistro();
        });

        // Capturar foto
        btnCapturar?.addEventListener('click', () => {
            this.capturarFoto();
        });

        // Refazer foto
        btnRefazer?.addEventListener('click', () => {
            this.refazerFoto();
        });

        // Confirmar registro
        btnConfirmar?.addEventListener('click', () => {
            this.confirmarRegistro();
        });
    }

    /**
     * Carregar dados iniciais
     */
    async carregarDados() {
        try {
            // Carregar último registro
            const ultimoRegistro = await api.obterUltimoRegistro();
            UI.atualizarUltimoRegistro(ultimoRegistro);
            UI.configurarBotoesPonto(ultimoRegistro);

            // Carregar histórico
            const registros = await api.obterMeusRegistros(7);
            UI.renderizarRegistros(registros);

        } catch (error) {
            console.error('Erro ao carregar dados:', error);
        }
    }

    /**
     * Iniciar processo de registro
     */
    async iniciarProcessoRegistro() {
        const modal = document.getElementById('modalCamera');
        const modalTitulo = document.getElementById('modalTitulo');
        const btnCapturar = document.getElementById('btnCapturar');
        const btnConfirmar = document.getElementById('btnConfirmar');
        const btnRefazer = document.getElementById('btnRefazer');
        const textoGeo = document.getElementById('textoGeo');

        // Resetar estado
        this.coordenadas = null;
        btnCapturar.classList.remove('hidden');
        btnConfirmar.classList.add('hidden');
        btnRefazer.classList.add('hidden');

        // Definir título
        const titulos = {
            'clock_in': 'Registrar Entrada',
            'clock_out': 'Registrar Saída',
            'break_start': 'Iniciar Intervalo',
            'break_end': 'Fim do Intervalo'
        };
        modalTitulo.textContent = titulos[this.tipoAtual] || 'Registrar Ponto';

        // Mostrar modal
        modal.classList.remove('hidden');

        // Iniciar câmera
        try {
            this.camera = new Camera();
            await this.camera.iniciar();
        } catch (error) {
            UI.mostrarToast(error.message, 'erro');
            this.cancelarRegistro();
            return;
        }

        // Obter geolocalização
        textoGeo.textContent = 'Obtendo localização...';
        try {
            this.coordenadas = await Geolocalizacao.obter();
            textoGeo.textContent = `📍 ${Geolocalizacao.formatar(this.coordenadas.latitude, this.coordenadas.longitude)}`;
        } catch (error) {
            console.error('Erro ao obter localização:', error);
            textoGeo.textContent = '📍 Localização indisponível';
            // Continuar sem localização (será null)
        }
    }

    /**
     * Capturar foto
     */
    capturarFoto() {
        try {
            this.fotoBase64 = this.camera.capturar();

            // Trocar botões
            const btnCapturar = document.getElementById('btnCapturar');
            const btnConfirmar = document.getElementById('btnConfirmar');
            const btnRefazer = document.getElementById('btnRefazer');

            btnCapturar.classList.add('hidden');
            btnConfirmar.classList.remove('hidden');
            btnRefazer.classList.remove('hidden');

        } catch (error) {
            UI.mostrarToast('Erro ao capturar foto', 'erro');
        }
    }

    /**
     * Refazer foto
     */
    refazerFoto() {
        this.camera.resetar();
        this.fotoBase64 = null;

        // Trocar botões
        const btnCapturar = document.getElementById('btnCapturar');
        const btnConfirmar = document.getElementById('btnConfirmar');
        const btnRefazer = document.getElementById('btnRefazer');

        btnCapturar.classList.remove('hidden');
        btnConfirmar.classList.add('hidden');
        btnRefazer.classList.add('hidden');
    }

    /**
     * Confirmar e enviar registro
     */
    async confirmarRegistro() {
        const btnConfirmar = document.getElementById('btnConfirmar');
        const textoOriginal = btnConfirmar.textContent;

        btnConfirmar.disabled = true;
        btnConfirmar.textContent = 'Enviando...';

        try {
            const dados = {
                clock_type: this.tipoAtual,
                latitude: this.coordenadas?.latitude || null,
                longitude: this.coordenadas?.longitude || null,
                photo_base64: this.fotoBase64 || null
            };

            // Verificar se está online
            if (conexaoMonitor.estaOnline()) {
                // Enviar para API
                await api.registrarPonto(dados);
                UI.mostrarToast('Ponto registrado com sucesso!', 'sucesso');
            } else {
                // Salvar offline
                await offlineManager.salvarRegistroOffline(dados);
                UI.mostrarToast('Ponto salvo offline. Será sincronizado quando houver conexão.', 'info');
            }

            // Fechar modal e recarregar dados
            this.cancelarRegistro();
            await this.carregarDados();

        } catch (error) {
            console.error('Erro ao registrar ponto:', error);
            UI.mostrarToast(error.message || 'Erro ao registrar ponto', 'erro');

            btnConfirmar.disabled = false;
            btnConfirmar.textContent = textoOriginal;
        }
    }

    /**
     * Cancelar registro e fechar modal
     */
    cancelarRegistro() {
        if (this.camera) {
            this.camera.parar();
            this.camera = null;
        }

        const modal = document.getElementById('modalCamera');
        modal.classList.add('hidden');

        this.tipoAtual = null;
        this.coordenadas = null;
        this.fotoBase64 = null;
    }
}

window.GerenciadorPonto = GerenciadorPonto;
