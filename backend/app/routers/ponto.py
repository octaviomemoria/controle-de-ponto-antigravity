from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client
from app.supabase_client import obter_supabase
from app.models.schemas import (
    RequisicaoPonto,
    RegistroPonto,
    RequisicaoSincronizacao,
    RespostaSincronizacao,
    RespostaUltimoPonto,
    PerfilUsuario
)
from app.models.enums import TipoPonto
from app.dependencies import obter_usuario_atual
from app.services.clock_service import ServicoPonto
from datetime import datetime, timedelta
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ponto", tags=["Registro de Ponto"])


@router.post("/registrar", response_model=RegistroPonto, status_code=status.HTTP_201_CREATED)
async def registrar_ponto(
    dados: RequisicaoPonto,
    usuario: PerfilUsuario = Depends(obter_usuario_atual),
    supabase: Client = Depends(obter_supabase)
):
    """
    Registrar entrada, saída ou intervalo
    
    Valida sequência de batidas e registra com timestamp do servidor
    """
    try:
        registro = await ServicoPonto.registrar_ponto(supabase, usuario, dados)
        return registro
        
    except ValueError as e:
        # Erros de validação (sequência inválida, etc.)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Erro ao registrar ponto: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao registrar ponto: {str(e)}"
        )


@router.get("/ultimo", response_model=RespostaUltimoPonto)
async def obter_ultimo_registro(
    usuario: PerfilUsuario = Depends(obter_usuario_atual),
    supabase: Client = Depends(obter_supabase)
):
    """
    Obter o último registro de ponto do usuário
    
    Útil para validação no frontend e prevenir batidas duplicadas
    """
    try:
        ultimo = await ServicoPonto.obter_ultimo_ponto(supabase, usuario.id)
        
        if ultimo:
            return RespostaUltimoPonto(
                tipo_ponto=ultimo.tipo_ponto,
                timestamp=ultimo.timestamp
            )
        else:
            return RespostaUltimoPonto(
                tipo_ponto=None,
                timestamp=None
            )
        
    except Exception as e:
        logger.error(f"Erro ao obter último registro: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/meus-registros", response_model=List[RegistroPonto])
async def obter_meus_registros(
    dias: int = 7,
    usuario: PerfilUsuario = Depends(obter_usuario_atual),
    supabase: Client = Depends(obter_supabase)
):
    """
    Obter registros de ponto do próprio usuário
    
    Args:
        dias: Número de dias para buscar (padrão: 7)
    """
    try:
        data_inicio = datetime.utcnow() - timedelta(days=dias)
        data_fim = datetime.utcnow()
        
        registros = await ServicoPonto.obter_registros_usuario(
            supabase,
            usuario.id,
            data_inicio,
            data_fim
        )
        
        return registros
        
    except Exception as e:
        logger.error(f"Erro ao buscar registros: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/sincronizar", response_model=RespostaSincronizacao)
async def sincronizar_registros_offline(
    dados: RequisicaoSincronizacao,
    usuario: PerfilUsuario = Depends(obter_usuario_atual),
    supabase: Client = Depends(obter_supabase)
):
    """
    Sincronizar registros salvos offline
    
    Processa múltiplos registros de uma vez, retornando sucesso e falhas
    """
    try:
        resultado = await ServicoPonto.sincronizar_registros_offline(
            supabase,
            usuario,
            dados.registros
        )
        
        return RespostaSincronizacao(**resultado)
        
    except Exception as e:
        logger.error(f"Erro na sincronização: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao sincronizar registros: {str(e)}"
        )


@router.get("/registros-usuario/{usuario_id}", response_model=List[RegistroPonto])
async def obter_registros_usuario(
    usuario_id: str,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
    usuario_atual: PerfilUsuario = Depends(obter_usuario_atual),
    supabase: Client = Depends(obter_supabase)
):
    """
    Obter registros de um usuário específico (admin apenas)
    
    Funcionários podem ver apenas seus próprios registros
    Admins da empresa podem ver registros de sua empresa
    Super admins podem ver tudo
    """
    # Verificar permissões
    from app.models.enums import FuncaoUsuario
    
    if str(usuario_atual.id) != usuario_id:
        # Usuário está tentando ver registros de outra pessoa
        if usuario_atual.funcao == FuncaoUsuario.FUNCIONARIO:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Você só pode ver seus próprios registros"
            )
        
        # Verificar se o usuário pertence à mesma empresa (para admin_empresa)
        if usuario_atual.funcao == FuncaoUsuario.ADMIN_EMPRESA:
            perfil_response = supabase.table("perfis")\
                .select("empresa_id")\
                .eq("id", usuario_id)\
                .single()\
                .execute()
            
            if not perfil_response.data or perfil_response.data["empresa_id"] != str(usuario_atual.empresa_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Você só pode ver registros da sua empresa"
                )
    
    # Converter datas
    inicio = datetime.fromisoformat(data_inicio) if data_inicio else datetime.utcnow() - timedelta(days=30)
    fim = datetime.fromisoformat(data_fim) if data_fim else datetime.utcnow()
    
    try:
        registros = await ServicoPonto.obter_registros_usuario(
            supabase,
            usuario_id,
            inicio,
            fim
        )
        
        return registros
        
    except Exception as e:
        logger.error(f"Erro ao buscar registros: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
