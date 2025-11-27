from supabase import Client
from app.models.schemas import PerfilUsuario, RelatorioFuncionario, RegistroTempo, RegistroPonto
from datetime import datetime, timedelta
from typing import List, Dict
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)


class ServicoRelatorio:
    """Serviço para geração de relatórios de ponto"""
    
    @staticmethod
    async def gerar_espelho_ponto(
        supabase: Client,
        usuario_id: str,
        data_inicio: datetime,
        data_fim: datetime
    ) -> RelatorioFuncionario:
        """
        Gera espelho de ponto para um funcionário
        
        Args:
            supabase: Cliente Supabase
            usuario_id: ID do usuário
            data_inicio: Data inicial do período
            data_fim: Data final do período
        
        Returns:
            Espelho de ponto completo
        """
        # Buscar perfil do usuário
        perfil_response = supabase.table("perfis")\
            .select("*")\
            .eq("id", usuario_id)\
            .single()\
            .execute()
        
        if not perfil_response.data:
            raise ValueError(f"Usuário {usuario_id} não encontrado")
        
        usuario = PerfilUsuario(**perfil_response.data)
        
        # Buscar registros de ponto do período
        registros_response = supabase.table("registros_ponto")\
            .select("*")\
            .eq("usuario_id", usuario_id)\
            .gte("timestamp", data_inicio.isoformat())\
            .lte("timestamp", data_fim.isoformat())\
            .order("timestamp")\
            .execute()
        
        registros = [RegistroPonto(**r) for r in registros_response.data]
        
        # Agrupar registros por dia
        registros_por_dia = defaultdict(list)
        for registro in registros:
            data = registro.timestamp.date().isoformat()
            registros_por_dia[data].append(registro)
        
        # Processar cada dia
        entradas = []
        total_horas = 0.0
        total_horas_extras = 0.0
        
        for data, registros_dia in sorted(registros_por_dia.items()):
            entrada_dia = ServicoRelatorio._processar_dia(registros_dia)
            entradas.append(entrada_dia)
            if entrada_dia.total_horas:
                horas = float(entrada_dia.total_horas.replace("h", "").replace(",", "."))
                total_horas += horas
            if entrada_dia.horas_extras:
                horas_extras = float(entrada_dia.horas_extras.replace("h", "").replace(",", "."))
                total_horas_extras += horas_extras
        
        return RelatorioFuncionario(
            usuario_id=usuario.id,
            nome_usuario=usuario.nome_completo,
            inicio_periodo=data_inicio.isoformat(),
            fim_periodo=data_fim.isoformat(),
            registros=entradas,
            total_horas=f"{total_horas:.2f}h",
            total_horas_extras=f"{total_horas_extras:.2f}h"
        )
    
    @staticmethod
    def _processar_dia(registros: List[RegistroPonto]) -> RegistroTempo:
        """
        Processa registros de um único dia
        
        Args:
            registros: Lista de registros do dia
        
        Returns:
            Entrada do espelho de ponto para o dia
        """
        if not registros:
            return RegistroTempo(data="", entrada=None, saida=None)
        
        data = registros[0].timestamp.date().isoformat()
        entrada = None
        saida = None
        duracao_intervalo = 0
        
        # Identificar entrada e saída
        for registro in registros:
            if registro.tipo_ponto.value == "clock_in" and not entrada:
                entrada = registro.timestamp
            elif registro.tipo_ponto.value == "clock_out":
                saida = registro.timestamp
        
        # Calcular duração dos intervalos
        em_intervalo = None
        for registro in registros:
            if registro.tipo_ponto.value == "break_start":
                em_intervalo = registro.timestamp
            elif registro.tipo_ponto.value == "break_end" and em_intervalo:
                duracao_intervalo += (registro.timestamp - em_intervalo).total_seconds() / 60
                em_intervalo = None
        
        # Calcular total de horas
        total_horas = None
        horas_extras = None
        if entrada and saida:
            total_minutos = (saida - entrada).total_seconds() / 60
            total_minutos -= duracao_intervalo
            total_horas_num = total_minutos / 60
            total_horas = f"{total_horas_num:.2f}h"
            
            # Calcular horas extras (acima de 8h)
            if total_horas_num > 8:
                horas_extras_num = total_horas_num - 8
                horas_extras = f"{horas_extras_num:.2f}h"
        
        foto_url = None
        if registros and registros[0].foto_url:
            foto_url = registros[0].foto_url
        
        return RegistroTempo(
            data=data,
            entrada=entrada,
            saida=saida,
            duracao_intervalo=f"{int(duracao_intervalo)} min" if duracao_intervalo > 0 else None,
            total_horas=total_horas,
            horas_extras=horas_extras,
            foto_url=foto_url
        )
    
    @staticmethod
    async def obter_registros_empresa(
        supabase: Client,
        empresa_id: str,
        data_inicio: datetime,
        data_fim: datetime
    ) -> List[Dict]:
        """
        Obtém todos os registros de uma empresa no período
        
        Args:
            supabase: Cliente Supabase
            empresa_id: ID da empresa
            data_inicio: Data inicial
            data_fim: Data final
        
        Returns:
            Lista de registros com informações do usuário
        """
        # Buscar registros com join manual (Supabase não suporta joins complexos)
        registros_response = supabase.table("registros_ponto")\
            .select("*")\
            .eq("empresa_id", empresa_id)\
            .gte("timestamp", data_inicio.isoformat())\
            .lte("timestamp", data_fim.isoformat())\
            .order("timestamp", desc=True)\
            .execute()
        
        # Buscar informações dos usuários
        usuarios_ids = list(set([r["usuario_id"] for r in registros_response.data]))
        usuarios_map = {}
        
        if usuarios_ids:
            usuarios_response = supabase.table("perfis")\
                .select("id, nome_completo, email")\
                .in_("id", usuarios_ids)\
                .execute()
            
            usuarios_map = {u["id"]: u for u in usuarios_response.data}
        
        # Combinar dados
        resultado = []
        for registro in registros_response.data:
            usuario = usuarios_map.get(registro["usuario_id"], {})
            resultado.append({
                **registro,
                "nome_usuario": usuario.get("nome_completo", "Desconhecido"),
                "email_usuario": usuario.get("email", "")
            })
        
        return resultado
