from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client
from app.supabase_client import obter_supabase
from app.models.schemas import (
    Empresa,
    RequisicaoCriarEmpresa,
    PerfilUsuario,
    RequisicaoRegistro
)
from app.dependencies import obter_super_admin, obter_admin_empresa
from app.models.enums import FuncaoUsuario
from typing import List
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Administração"])


# ============================================================================
# Gerenciamento de Empresas
# ============================================================================

@router.get("/empresas", response_model=List[Empresa])
async def listar_empresas(
    usuario_atual: PerfilUsuario = Depends(obter_super_admin),
    supabase: Client = Depends(lambda: obter_supabase(usar_service_key=True))
):
    """
    Listar todas as empresas (super admin apenas)
    """
    try:
        resposta = supabase.table("empresas")\
            .select("*")\
            .order("nome")\
            .execute()
        
        return [Empresa(**empresa) for empresa in resposta.data]
        
    except Exception as e:
        logger.error(f"Erro ao listar empresas: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/empresas", response_model=Empresa, status_code=status.HTTP_201_CREATED)
async def criar_empresa(
    dados: RequisicaoCriarEmpresa,
    usuario_atual: PerfilUsuario = Depends(obter_super_admin),
    supabase: Client = Depends(lambda: obter_supabase(usar_service_key=True))
):
    """
    Criar nova empresa (super admin apenas)
    """
    try:
        dados_empresa = {
            "nome": dados.nome,
            "configuracoes": dados.configuracoes or {},
            "ativa": True
        }
        
        resposta = supabase.table("empresas")\
            .insert(dados_empresa)\
            .execute()
        
        if not resposta.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Falha ao criar empresa"
            )
        
        logger.info(f"Nova empresa criada: {dados.nome}")
        
        return Empresa(**resposta.data[0])
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao criar empresa: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/empresas/{empresa_id}", response_model=Empresa)
async def obter_empresa(
    empresa_id: str,
    usuario_atual: PerfilUsuario = Depends(obter_admin_empresa),
    supabase: Client = Depends(obter_supabase)
):
    """
    Obter detalhes de uma empresa
    
    Admin da empresa pode ver apenas sua empresa
    Super admin pode ver qualquer empresa
    """
    # Verificar permissão
    if usuario_atual.funcao == FuncaoUsuario.ADMIN_EMPRESA:
        if str(usuario_atual.empresa_id) != empresa_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Você só pode acessar sua própria empresa"
            )
    
    try:
        resposta = supabase.table("empresas")\
            .select("*")\
            .eq("id", empresa_id)\
            .single()\
            .execute()
        
        if not resposta.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Empresa não encontrada"
            )
        
        return Empresa(**resposta.data)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao obter empresa: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# ============================================================================
# Gerenciamento de Usuários
# ============================================================================

@router.get("/usuarios", response_model=List[PerfilUsuario])
async def listar_usuarios(
    usuario_atual: PerfilUsuario = Depends(obter_admin_empresa),
    supabase: Client = Depends(obter_supabase)
):
    """
    Listar usuários da empresa
    
    Admin da empresa vê apenas usuários de sua empresa
    Super admin vê todos
    """
    try:
        consulta = supabase.table("perfis").select("*")
        
        # Filtrar por empresa se não for super admin
        if usuario_atual.funcao != FuncaoUsuario.SUPER_ADMIN:
            consulta = consulta.eq("empresa_id", str(usuario_atual.empresa_id))
        
        resposta = consulta.order("nome_completo").execute()
        
        return [PerfilUsuario(**usuario) for usuario in resposta.data]
        
    except Exception as e:
        logger.error(f"Erro ao listar usuários: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/usuarios/{usuario_id}", response_model=PerfilUsuario)
async def obter_usuario(
    usuario_id: str,
    usuario_atual: PerfilUsuario = Depends(obter_admin_empresa),
    supabase: Client = Depends(obter_supabase)
):
    """
    Obter detalhes de um usuário
    """
    try:
        resposta = supabase.table("perfis")\
            .select("*")\
            .eq("id", usuario_id)\
            .single()\
            .execute()
        
        if not resposta.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuário não encontrado"
            )
        
        usuario = PerfilUsuario(**resposta.data)
        
        # Verificar permissão
        if usuario_atual.funcao == FuncaoUsuario.ADMIN_EMPRESA:
            if usuario.empresa_id != usuario_atual.empresa_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Você só pode acessar usuários da sua empresa"
                )
        
        return usuario
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao obter usuário: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete("/usuarios/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deletar_usuario(
    usuario_id: str,
    usuario_atual: PerfilUsuario = Depends(obter_super_admin),
    supabase: Client = Depends(lambda: obter_supabase(usar_service_key=True))
):
    """
    Deletar um usuário (super admin apenas)
    """
    try:
        # Verificar se usuário existe
        resposta_perfil = supabase.table("perfis")\
            .select("*")\
            .eq("id", usuario_id)\
            .single()\
            .execute()
        
        if not resposta_perfil.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuário não encontrado"
            )
        
        # Deletar perfil
        supabase.table("perfis").delete().eq("id", usuario_id).execute()
        
        # Deletar usuário do Auth
        try:
            supabase.auth.admin.delete_user(usuario_id)
        except Exception as e:
            logger.warning(f"Falha ao deletar usuário do Auth: {str(e)}")
        
        logger.info(f"Usuário deletado: {usuario_id}")
        
        return None
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao deletar usuário: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# ============================================================================
# Estatísticas
# ============================================================================

@router.get("/estatisticas")
async def obter_estatisticas(
    usuario_atual: PerfilUsuario = Depends(obter_admin_empresa),
    supabase: Client = Depends(obter_supabase)
):
    """
    Obter estatísticas gerais da empresa
    """
    try:
        empresa_id = str(usuario_atual.empresa_id)
        
        # Contar usuários
        resposta_usuarios = supabase.table("perfis")\
            .select("id", count="exact")\
            .eq("empresa_id", empresa_id)\
            .execute()
        
        total_usuarios = resposta_usuarios.count or 0
        
        # Contar registros do mês atual
        from datetime import datetime
        inicio_mes = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0)
        
        resposta_registros = supabase.table("registros_ponto")\
            .select("id", count="exact")\
            .eq("empresa_id", empresa_id)\
            .gte("timestamp", inicio_mes.isoformat())\
            .execute()
        
        total_registros_mes = resposta_registros.count or 0
        
        # Contar registros hoje
        inicio_hoje = datetime.utcnow().replace(hour=0, minute=0, second=0)
        
        resposta_registros_hoje = supabase.table("registros_ponto")\
            .select("id", count="exact")\
            .eq("empresa_id", empresa_id)\
            .gte("timestamp", inicio_hoje.isoformat())\
            .execute()
        
        total_registros_hoje = resposta_registros_hoje.count or 0
        
        return {
            "total_usuarios": total_usuarios,
            "total_registros_mes": total_registros_mes,
            "total_registros_hoje": total_registros_hoje,
            "empresa_id": empresa_id
        }
        
    except Exception as e:
        logger.error(f"Erro ao obter estatísticas: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
