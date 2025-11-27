from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import Client
from app.supabase_client import obter_supabase
from app.models.schemas import PerfilUsuario
from app.models.enums import FuncaoUsuario
from typing import Optional
import logging

logger = logging.getLogger(__name__)

security = HTTPBearer()


async def obter_usuario_atual(
    credenciais: HTTPAuthorizationCredentials = Depends(security),
    supabase: Client = Depends(obter_supabase)
) -> PerfilUsuario:
    """
    Dependência para obter usuário autenticado atual a partir do token JWT
    
    Valida o token com Supabase e retorna perfil do usuário
    """
    token = credenciais.credentials
    
    try:
        # Obter usuário do Supabase usando o token
        resposta_usuario = supabase.auth.get_user(token)
        
        if not resposta_usuario or not resposta_usuario.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Credenciais de autenticação inválidas",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        usuario_id = resposta_usuario.user.id
        
        # Obter perfil do usuário da tabela perfis
        resposta_perfil = supabase.table("perfis").select("*").eq("id", usuario_id).single().execute()
        
        if not resposta_perfil.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perfil de usuário não encontrado"
            )
        
        return PerfilUsuario(**resposta_perfil.data)
        
    except Exception as e:
        logger.error(f"Erro de autenticação: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Não foi possível validar as credenciais",
            headers={"WWW-Authenticate": "Bearer"},
        )


def exigir_funcao(funcao_requerida: FuncaoUsuario):
    """
    Factory de dependência para exigir função específica do usuário
    
    Uso:
        @app.get("/admin/endpoint")
        async def endpoint_admin(usuario: PerfilUsuario = Depends(exigir_funcao(FuncaoUsuario.ADMIN_EMPRESA))):
            ...
    """
    async def verificador_funcao(usuario_atual: PerfilUsuario = Depends(obter_usuario_atual)) -> PerfilUsuario:
        # Super admin pode acessar tudo
        if usuario_atual.funcao == FuncaoUsuario.SUPER_ADMIN:
            return usuario_atual
        
        # Verificar se usuário tem a função requerida
        if usuario_atual.funcao != funcao_requerida:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permissões insuficientes. Função requerida: {funcao_requerida.value}"
            )
        
        return usuario_atual
    
    return verificador_funcao


def exigir_qualquer_funcao(*funcoes: FuncaoUsuario):
    """
    Factory de dependência para exigir qualquer uma das funções especificadas
    
    Uso:
        @app.get("/admin/endpoint")
        async def endpoint_admin(
            usuario: PerfilUsuario = Depends(exigir_qualquer_funcao(FuncaoUsuario.ADMIN_EMPRESA, FuncaoUsuario.SUPER_ADMIN))
        ):
            ...
    """
    async def verificador_funcao(usuario_atual: PerfilUsuario = Depends(obter_usuario_atual)) -> PerfilUsuario:
        # Super admin sempre pode acessar
        if usuario_atual.funcao == FuncaoUsuario.SUPER_ADMIN:
            return usuario_atual
        
        # Verificar se usuário tem alguma das funções requeridas
        if usuario_atual.funcao not in funcoes:
            funcoes_str = ", ".join([f.value for f in funcoes])
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permissões insuficientes. Função requerida: {funcoes_str}"
            )
        
        return usuario_atual
    
    return verificador_funcao


async def obter_admin_empresa(usuario_atual: PerfilUsuario = Depends(obter_usuario_atual)) -> PerfilUsuario:
    """Dependência para admin da empresa ou super admin"""
    if usuario_atual.funcao not in [FuncaoUsuario.ADMIN_EMPRESA, FuncaoUsuario.SUPER_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso de admin da empresa requerido"
        )
    return usuario_atual


async def obter_super_admin(usuario_atual: PerfilUsuario = Depends(obter_usuario_atual)) -> PerfilUsuario:
    """Dependência apenas para super admin"""
    if usuario_atual.funcao != FuncaoUsuario.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso de super admin requerido"
        )
    return usuario_atual
