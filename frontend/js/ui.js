// ============================================================================
// MÓDULO DE INTERFACE DO USUÁRIO - Componentes e Interações
// ============================================================================

class UI {
    /**
     * Mostrar toast de notificação
     */
    static mostrarToast(mensagem, tipo = 'info', duracao = 3000) {
        const toast = document.getElementById('toast');
        const toastMensagem = document.getElementById('toastMensagem');

        if (!toast || !toastMensagem) return;

        toastMensagem.textContent = mensagem;
        toast.classList.remove('hidden');

        // Remover após duração
        setTimeout(() => {
            toast.classList.add('hidden');
        }, duracao);
    }

    /**
     * Alternar visibilidade de elementos
     */
    static alternarVisibilidade(elementoId, forcarVisivel = null) {
        const elemento = document.getElementById(elementoId);
        if (!elemento) return;

        if (forcarVisivel === null) {
            elemento.classList.toggle('hidden');
        } else if (forcarVisivel) {
            elemento.classList.remove('hidden');
        } else {
            elemento.classList.add('hidden');
        }
    }

    /**
     * Mostrar loader
     */
    static mostrarLoader() {
        const loader = document.getElementById('loader');
        if (loader) loader.classList.remove('hidden');
    }

    /**
     * Esconder loader
     */
    static esconderLoader() {
        const loader = document.getElementById('loader');
        if (loader) loader.classList.add('hidden');
    }

    /**
     * Alternar telas
     */
    static alternarTela(telaId) {
        // Esconder todas as telas
        document.querySelectorAll('.tela').forEach(tela => {
            tela.classList.add('hidden');
        });

        // Mostrar tela solicitada
        const tela = document.getElementById(telaId);
        if (tela) {
            tela.classList.remove('hidden');
        }
    }

    /**
     * Formatar data e hora
     */
    static formatarDataHora(dataString) {
        const data = new Date(dataString);
        return {
            data: data.toLocaleDateString('pt-BR'),
            hora: data.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit'
            }),
            dataHora: data.toLocaleString('pt-BR')
        };
    }

    /**
     * Atualizar relógio em tempo real
     */
    static iniciarRelogio() {
        const horaAtual = document.getElementById('horaAtual');
        const dataAtual = document.getElementById('dataAtual');

        const atualizar = () => {
            const agora = new Date();

            if (horaAtual) {
                horaAtual.textContent = agora.toLocaleTimeString('pt-BR');
            }

            if (dataAtual) {
                dataAtual.textContent = agora.toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }
        };

        // Atualizar imediatamente e depois a cada segundo
        atualizar();
        setInterval(atualizar, 1000);
    }

    /**
     * Renderizar lista de registros
     */
    static renderizarRegistros(registros) {
        const lista = document.getElementById('listaRegistros');
        if (!lista) return;

        if (!registros || registros.length === 0) {
            lista.innerHTML = '<p style="text-align: center; color: var(--cor-texto-secundario); padding: 2rem;">Nenhum registro encontrado</p>';
            return;
        }

        const tiposLabel = {
            'clock_in': 'Entrada',
            'clock_out': 'Saída',
            'break_start': 'Início Intervalo',
            'break_end': 'Fim Intervalo'
        };

        const tiposIcone = {
            'clock_in': '➡️',
            'clock_out': '⬅️',
            'break_start': '☕',
            'break_end': '▶️'
        };

        const tiposClasse = {
            'clock_in': 'entrada',
            'clock_out': 'saida',
            'break_start': 'intervalo-inicio',
            'break_end': 'intervalo-fim'
        };

        lista.innerHTML = registros.slice(0, 10).map(registro => {
            const { data, hora } = UI.formatarDataHora(registro.timestamp);
            const tipo = registro.clock_type;

            return `
                <div class="registro-item">
                    <div class="registro-icone ${tiposClasse[tipo] || ''}">
                        ${tiposIcone[tipo] || '📍'}
                    </div>
                    <div class="registro-info">
                        <div class="registro-tipo">${tiposLabel[tipo] || tipo}</div>
                        <div class="registro-detalhes">
                            <span>📅 ${data}</span>
                            <span>🕐 ${hora}</span>
                        </div>
                    </div>
                    ${registro.photo_url ? `<img src="${registro.photo_url}" class="registro-foto" alt="Foto do registro">` : ''}
                </div>
            `;
        }).join('');
    }

    /**
     * Atualizar último registro
     */
    static atualizarUltimoRegistro(ultimoRegistro) {
        const container = document.getElementById('ultimoRegistro');
        const tipo = document.getElementById('ultimoRegistroTipo');
        const hora = document.getElementById('ultimoRegistroHora');

        if (!container || !tipo || !hora) return;

        if (!ultimoRegistro || !ultimoRegistro.last_record) {
            container.classList.add('hidden');
            return;
        }

        const registro = ultimoRegistro.last_record;

        const tiposLabel = {
            'clock_in': 'Entrada',
            'clock_out': 'Saída',
            'break_start': 'Início Intervalo',
            'break_end': 'Fim Intervalo'
        };

        const { hora: horaFormatada } = UI.formatarDataHora(registro.timestamp);

        tipo.textContent = tiposLabel[registro.clock_type] || registro.clock_type;
        hora.textContent = horaFormatada;
        container.classList.remove('hidden');
    }

    /**
     * Configurar botões de ação baseado no último registro
     */
    static configurarBotoesPonto(ultimoRegistro) {
        const btnEntrada = document.getElementById('btnEntrada');
        const btnSaida = document.getElementById('btnSaida');
        const btnInicioIntervalo = document.getElementById('btnInicioIntervalo');
        const btnFimIntervalo = document.getElementById('btnFimIntervalo');

        // Desabilitar todos primeiro
        [btnEntrada, btnSaida, btnInicioIntervalo, btnFimIntervalo].forEach(btn => {
            if (btn) btn.disabled = true;
        });

        if (!ultimoRegistro) return;

        // Habilitar baseado nas permissões
        if (btnEntrada && ultimoRegistro.can_clock_in) btnEntrada.disabled = false;
        if (btnSaida && ultimoRegistro.can_clock_out) btnSaida.disabled = false;
        if (btnInicioIntervalo && ultimoRegistro.can_break_start) btnInicioIntervalo.disabled = false;
        if (btnFimIntervalo && ultimoRegistro.can_break_end) btnFimIntervalo.disabled = false;
    }
}

window.UI = UI;
