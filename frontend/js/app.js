// ============================================================================
// APLICATIVO PRINCIPAL - Inicialização e Navegação
// ============================================================================

class App {
    constructor() {
        this.gerenciadorPonto = null;
    }

    /**
     * Inicializar aplicativo
     */
    async inicializar() {
        try {
            // Verificar autenticação
            if (Auth.estaAutenticado()) {
                await this.inicializarTelaPrincipal();
            } else {
                this.inicializarTelaLogin();
            }

            // Esconder loader
            setTimeout(() => UI.esconderLoader(), 500);

        } catch (error) {
            console.error('Erro ao inicializar app:', error);
            UI.esconderLoader();
        }
    }

    /**
     * Inicializar tela de login
     */
    inicializarTelaLogin() {
        UI.alternarTela('telaLogin');
        Auth.inicializarLogin();
    }

    /**
     * Inicializar tela principal
     */
    async inicializarTelaPrincipal() {
        UI.alternarTela('telaPrincipal');

        // Inicializar usuário
        Auth.inicializarUsuario();

        // Inicializar relógio
        UI.iniciarRelogio();

        // Inicializar gerenciador de ponto
        this.gerenciadorPonto = new GerenciadorPonto();
        this.gerenciadorPonto.inicializar();

        // Inicializar suporte offline
        await offlineManager.inicializar();

        // Configurar menu
        this.configurarMenu();

        // Configurar ações do menu lateral
        this.configurarAcoesMenu();
    }

    /**
     * Configurar menu lateral
     */
    configurarMenu() {
        const btnMenu = document.getElementById('btnMenu');
        const btnFecharMenu = document.getElementById('btnFecharMenu');
        const menuLateral = document.getElementById('menuLateral');
        const overlay = document.getElementById('overlay');

        // Abrir menu
        btnMenu?.addEventListener('click', () => {
            menuLateral?.classList.remove('hidden');
            overlay?.classList.remove('hidden');
        });

        // Fechar menu
        const fecharMenu = () => {
            menuLateral?.classList.add('hidden');
            overlay?.classList.add('hidden');
        };

        btnFecharMenu?.addEventListener('click', fecharMenu);
        overlay?.addEventListener('click', fecharMenu);
    }

    /**
     * Configurar ações do menu
     */
    configurarAcoesMenu() {
        const menuLinks = document.querySelectorAll('.menu-lista a');

        menuLinks.forEach(link => {
            link.addEventListener('click', async (e) => {
                e.preventDefault();

                const acao = link.dataset.acao;
                await this.executarAcaoMenu(acao);

                // Fechar menu
                document.getElementById('menuLateral')?.classList.add('hidden');
                document.getElementById('overlay')?.classList.add('hidden');
            });
        });
    }

    /**
     * Executar ação do menu
     */
    async executarAcaoMenu(acao) {
        switch (acao) {
            case 'meus-registros':
                await this.mostrarMeusRegistros();
                break;

            case 'espelho-ponto':
                await this.mostrarEspelhoPonto();
                break;

            case 'relatorios':
                UI.mostrarToast('Funcionalidade em desenvolvimento', 'info');
                break;

            case 'admin':
                UI.mostrarToast('Funcionalidade em desenvolvimento', 'info');
                break;

            case 'sincronizar':
                await this.sincronizarManual();
                break;

            case 'sair':
                Auth.logout();
                break;
        }
    }

    /**
     * Mostrar meus registros (completo)
     */
    async mostrarMeusRegistros() {
        try {
            UI.mostrarToast('Carregando registros...', 'info');
            const registros = await api.obterMeusRegistros(30);
            UI.renderizarRegistros(registros);

            // Scroll para lista de registros
            document.querySelector('.historico-section')?.scrollIntoView({
                behavior: 'smooth'
            });

        } catch (error) {
            UI.mostrarToast('Erro ao carregar registros', 'erro');
        }
    }

    /**
     * Mostrar espelho de ponto
     */
    async mostrarEspelhoPonto() {
        UI.mostrarToast('Funcionalidade de espelho de ponto em desenvolvimento', 'info');
        // Aqui seria implementada uma nova tela com o espelho completo
    }

    /**
     * Sincronizar registros offline manualmente
     */
    async sincronizarManual() {
        if (!conexaoMonitor.estaOnline()) {
            UI.mostrarToast('Você está offline. Conecte-se à internet para sincronizar.', 'aviso');
            return;
        }

        try {
            UI.mostrarToast('Sincronizando...', 'info');
            const resultado = await offlineManager.sincronizar();

            if (resultado.sucesso) {
                UI.mostrarToast(resultado.mensagem || 'Sincronização concluída', 'sucesso');

                // Recarregar dados se houver registros sincronizados
                if (resultado.quantidade > 0 && this.gerenciadorPonto) {
                    await this.gerenciadorPonto.carregarDados();
                }
            } else {
                UI.mostrarToast(resultado.mensagem || 'Erro na sincronização', 'erro');
            }

        } catch (error) {
            UI.mostrarToast('Erro ao sincronizar', 'erro');
        }
    }
}

// ============================================================================
// INICIALIZAÇÃO DO APP
// ============================================================================

// Aguardar carregamento do DOM
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.inicializar();
});

// Disponibilizar globalmente para debug
window.app = new App();
