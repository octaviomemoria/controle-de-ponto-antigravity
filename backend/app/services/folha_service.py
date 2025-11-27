from supabase import Client
from app.models.schemas import DadosFolhaPagamento, PerfilUsuario
from datetime import datetime, timedelta
from typing import Dict, List
import logging

logger = logging.getLogger(__name__)


class ServicoFolha:
    """Serviço para cálculos de folha de pagamento"""
    
    # Configurações padrão (podem vir das configurações da empresa)
    JORNADA_DI ARIA_HORAS = 8.0
    JORNADA_SEMANAL_HORAS = 44.0
    TOLERANCIA_MINUTOS = 10
    
    @staticmethod
    async def calcular_dados_folha(
        supabase: Client,
        usuario_id: str,
        data_inicio: datetime,
        data_fim: datetime
    ) -> DadosFolhaPagamento:
        """
        Calcula dados para folha de pagamento
        
        Args:
            supabase: Cliente Supabase
            usuario_id: ID do usuário
            data_inicio: Data inicial do período
            data_fim: Data final do período
        
        Returns:
            Dados calculados para folha
        """
        # Buscar perfil do usuário
        perfil_response = supabase.table("perfis")\
            .select("*")\
            .eq("id", usuario_id)\
            .single()\
            .execute()
        
        usuario = PerfilUsuario(**perfil_response.data)
        
        # Buscar configurações da empresa (se existirem)
        empresa_response = supabase.table("empresas")\
            .select("configuracoes")\
            .eq("id", str(usuario.empresa_id))\
            .single()\
            .execute()
        
        config = empresa_response.data.get("configuracoes", {}) if empresa_response.data else {}
        jornada_diaria = config.get("jornada_diaria_horas", ServicoFolha.JORNADA_DIARIA_HORAS)
        tolerancia = config.get("tolerancia_atraso_minutos", ServicoFolha.TOLERANCIA_MINUTOS)
        
        # Buscar todos os registros do período
        registros_response = supabase.table("registros_ponto")\
            .select("*")\
            .eq("usuario_id", usuario_id)\
            .gte("timestamp", data_inicio.isoformat())\
            .lte("timestamp", data_fim.isoformat())\
            .order("timestamp")\
            .execute()
        
        # Processar registros
        resultado = ServicoFolha._processar_registros_folha(
            registros_response.data,
            jornada_diaria,
            tolerancia,
            data_inicio,
            data_fim
        )
        
        return DadosFolhaPagamento(
            usuario_id=usuario.id,
            nome_usuario=usuario.nome_completo,
            codigo_funcionario=usuario.codigo_funcionario,
            inicio_periodo=data_inicio.isoformat(),
            fim_periodo=data_fim.isoformat(),
            horas_regulares=resultado["horas_normais"],
            horas_extras=resultado["horas_extras"],
            total_horas=resultado["total_horas"],
            faltas=resultado["faltas"],
            atrasos=resultado["atrasos"]
        )
    
    @staticmethod
    def _processar_registros_folha(
        registros: List[Dict],
        jornada_diaria: float,
        tolerancia: int,
        data_inicio: datetime,
        data_fim: datetime
    ) -> Dict:
        """
        Processa registros para cálculo da folha
        
        Args:
            registros: Lista de registros brutos
            jornada_diaria: Jornada diária em horas
            tolerancia: Tolerância para atrasos em minutos
            data_inicio: Data início do período
            data_fim: Data fim do período
        
        Returns:
            Dicionário com totalizadores
        """
        from collections import defaultdict
        
        # Agrupar por dia
        registros_por_dia = defaultdict(list)
        for registro in registros:
            timestamp = datetime.fromisoformat(registro["timestamp"].replace("Z", "+00:00"))
            data = timestamp.date()
            registros_por_dia[data].append(registro)
        
        # Calcular totais
        horas_normais = 0.0
        horas_extras = 0.0
        dias_trabalhados = 0
        atrasos = 0
        
        # Calcular dias úteis no período (simplificado - não considera feriados)
        dias_totais = (data_fim.date() - data_inicio.date()).days + 1
        
        for data, regs_dia in registros_por_dia.items():
            # Encontrar entrada e saída
            entrada = None
            saida = None
            duracao_intervalo = 0
            inicio_intervalo = None
            
            for reg in sorted(regs_dia, key=lambda x: x["timestamp"]):
                timestamp = datetime.fromisoformat(reg["timestamp"].replace("Z", "+00:00"))
                tipo = reg["tipo_registro"]
                
                if tipo == "clock_in" and not entrada:
                    entrada = timestamp
                elif tipo == "clock_out":
                    saida = timestamp
                elif tipo == "break_start":
                    inicio_intervalo = timestamp
                elif tipo == "break_end" and inicio_intervalo:
                    duracao_intervalo += (timestamp - inicio_intervalo).total_seconds() / 3600
                    inicio_intervalo = None
            
            if entrada and saida:
                dias_trabalhados += 1
                
                # Calcular horas trabalhadas
                total_horas_dia = (saida - entrada).total_seconds() / 3600
                total_horas_dia -= duracao_intervalo
                
                # Separar horas normais e extras
                if total_horas_dia <= jornada_diaria:
                    horas_normais += total_horas_dia
                else:
                    horas_normais += jornada_diaria
                    horas_extras += (total_horas_dia - jornada_diaria)
                
                # Verificar atrasos (simplificado - assume entrada às 8h)
                # Em produção, isso viria das configurações da empresa
                hora_entrada_esperada = entrada.replace(hour=8, minute=0, second=0, microsecond=0)
                atraso_minutos = (entrada - hora_entrada_esperada).total_seconds() / 60
                if atraso_minutos > tolerancia:
                    atrasos += 1
        
        # Calcular faltas (dias úteis - dias trabalhados)
        # Simplificado: assume todos os dias como úteis
        faltas = max(0, dias_totais - dias_trabalhados)
        
        return {
            "horas_normais": round(horas_normais, 2),
            "horas_extras": round(horas_extras, 2),
            "total_horas": round(horas_normais + horas_extras, 2),
            "dias_trabalhados": dias_trabalhados,
            "faltas": faltas,
            "atrasos": atrasos
        }
    
    @staticmethod
    async def exportar_folha_empresa(
        supabase: Client,
        empresa_id: str,
        data_inicio: datetime,
        data_fim: datetime
    ) -> List[DadosFolhaPagamento]:
        """
        Exporta dados de folha para todos os funcionários da empresa
        
        Args:
            supabase: Cliente Supabase
            empresa_id: ID da empresa
            data_inicio: Data inicial
            data_fim: Data final
        
        Returns:
            Lista com dados de folha de todos os funcionários
        """
        # Buscar todos os funcionários da empresa
        usuarios_response = supabase.table("perfis")\
            .select("id")\
            .eq("empresa_id", empresa_id)\
            .execute()
        
        resultados = []
        for usuario in usuarios_response.data:
            try:
                dados_folha = await ServicoFolha.calcular_dados_folha(
                    supabase,
                    usuario["id"],
                    data_inicio,
                    data_fim
                )
                resultados.append(dados_folha)
            except Exception as e:
                logger.error(f"Erro ao calcular folha para usuário {usuario['id']}: {str(e)}")
        
        return resultados
