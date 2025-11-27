from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client
from app.supabase_client import obter_supabase
from app.models.schemas import (
    RequisicaoLogin,
    RespostaLogin,
    RequisicaoRegistro,
    PerfilUsuario,
    RespostaErro
)
from app.models.enums import FuncaoUsuario
from app.dependencies import obter_usuario_atual, obter_super_admin
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Autenticação"])


@router.post("/login", response_model=RespostaLogin)
async def fazer_login(
    dados: RequisicaoLogin,
    supabase: Client = Depends(obter_supabase)
):
    """
    Realizar login no sistema
    
    Retorna token JWT e dados do usuário
    """
    try:
        # Autenticar com Supabase
        resposta_auth = supabase.auth.sign_in_with_password({
            "email": dados.email,
            "password": dados.senha
        })
        
        if not resposta_auth.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Email ou senha inválidos"
            )
        
        # Buscar perfil do usuário
        resposta_perfil = supabase.table("perfis")\
            .select("*")\
            .eq("id", resposta_auth.user.id)\
            .single()\
            .execute()
        
        if not resposta_perfil.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perfil de usuário não encontrado"
            )
        
        usuario = PerfilUsuario(**resposta_perfil.data)
        
        return RespostaLogin(
            access_token=resposta_auth.session.access_token,
            token_type="bearer",
            usuario=usuario
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro no login: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao realizar login: {str(e)}"
        )


@router.post("/register", response_model=PerfilUsuario, status_code=status.HTTP_201_CREATED)
async def registrar_usuario(
    dados: RequisicaoRegistro,
    usuario_atual: PerfilUsuario = Depends(obter_super_admin),
    supabase: Client = Depends(lambda: obter_supabase(usar_service_key=True))
):
    """
    Registrar novo usuário (apenas super admin)
    
    Cria conta no Supabase Auth e perfil no banco de dados
    """
    try:
        # Criar usuário no Supabase Auth
        resposta_auth = supabase.auth.admin.create_user({
            "email": dados.email,
            "password": dados.senha,
            "email_confirm": True
        })
        
        if not resposta_auth.user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Falha ao criar usuário"
            )
        
        # Criar perfil
        dados_perfil = {
            "id": resposta_auth.user.id,
            "empresa_id": str(dados.empresa_id),
            "email": dados.email,
            "nome_completo": dados.nome_completo,
            "funcao": dados.funcao.value,
            "codigo_funcionario": dados.codigo_funcionario
        }
        
        resposta_perfil = supabase.table("perfis")\
            .insert(dados_perfil)\
            .execute()
        
        if not resposta_perfil.data:
            # Rollback: deletar usuário do Auth
            supabase.auth.admin.delete_user(resposta_auth.user.id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Falha ao criar perfil do usuário"
            )
        
        logger.info(f"Novo usuário criado: {dados.email}")
        
        return PerfilUsuario(**resposta_perfil.data[0])
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao registrar usuário: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao registrar usuário: {str(e)}"
        )


@router.get("/me", response_model=PerfilUsuario)
async def obter_meu_perfil(
    usuario: PerfilUsuario = Depends(obter_usuario_atual)
):
    """
    Obter dados do usuário autenticado atual
    """
    return usuario


@router.post("/logout")
async def fazer_logout(
    supabase: Client = Depends(obter_supabase)
):
    """
    Fazer logout (invalidar token)
    """
    try:
        supabase.auth.sign_out()
        return {"mensagem": "Logout realizado com sucesso"}
    except Exception as e:
        logger.error(f"Erro no logout: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao fazer logout"
        )
