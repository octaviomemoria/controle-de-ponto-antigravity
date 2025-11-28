// ============================================================================
// MÓDULO DE AUTENTICAÇÃO
// ============================================================================

class Auth {
    /**
     * Verificar se usuário está autenticado
     */
    static estaAutenticado() {
        return !!api.getToken();
    }

    /**
     * Inicializar formulário de login
     */
    static inicializarLogin() {
        const form = document.getElementById('formLogin');
        const erroDiv = document.getElementById('loginErro');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('email').value;
            const senha = document.getElementById('senha').value;

            // Limpar erro anterior
            erroDiv.classList.add('hidden');

            // Desabilitar botão
            const btnSubmit = form.querySelector('button[type="submit"]');
            const textoOriginal = btnSubmit.textContent;
            btnSubmit.disabled = true;
            btnSubmit.textContent = 'Entrando...';

            try {
                await api.login(email, senha);

                // Redirecionar para tela principal
                window.location.reload();

            } catch (error) {
                // Extrair mensagem de erro corretamente
                let mensagemErro = 'Erro ao fazer login';

                if (error.message) {
                    mensagemErro = error.message;
                } else if (typeof error === 'string') {
                    mensagemErro = error;
                } else if (error.detail) {
                    mensagemErro = error.detail;
                }

                erroDiv.textContent = mensagemErro;
                erroDiv.classList.remove('hidden');

                btnSubmit.disabled = false;
                btnSubmit.textContent = textoOriginal;
            }
        });
    }

    /**
     * Inicializar informações do usuário na tela principal
     */
    static inicializarUsuario() {
        const usuario = api.getUsuarioAtual();

        if (!usuario) {
            api.logout();
            return;
        }

        // Preencher dados do usuário
        const usuarioInicial = document.getElementById('usuarioInicial');
        const usuarioNome = document.getElementById('usuarioNome');
        const usuarioEmpresa = document.getElementById('usuarioEmpresa');

        if (usuarioInicial) {
            usuarioInicial.textContent = usuario.nome_completo.charAt(0).toUpperCase();
        }

        if (usuarioNome) {
            usuarioNome.textContent = usuario.nome_completo;
        }

        if (usuarioEmpresa) {
            // Buscar nome da empresa (seria ideal ter no objeto do usuário)
            usuarioEmpresa.textContent = 'Minha Empresa';
        }

        // Mostrar/ocultar menus baseado na função
        const menuAdmin = document.getElementById('menuAdmin');
        const menuSuperAdmin = document.getElementById('menuSuperAdmin');

        if (usuario.funcao === 'company_admin' || usuario.funcao === 'super_admin') {
            menuAdmin?.classList.remove('hidden');
        }

        if (usuario.funcao === 'super_admin') {
            menuSuperAdmin?.classList.remove('hidden');
        }
    }

    /**
     * Fazer logout
     */
    static logout() {
        if (confirm('Deseja realmente sair?')) {
            api.logout();
        }
    }
}

window.Auth = Auth;
