from fastapi import APIRouter, Depends, HTTPException, status, Query
from supabase import Client
from app.supabase_client import obter_supabase
from app.models.schemas import (
    RelatorioFuncionario,
    DadosFolhaPagamento,
    PerfilUsuario
)
from app.models.enums import FuncaoUsuario
from app.dependencies import obter_usuario_atual, obter_admin_empresa
from app.services.relatorio_service import ServicoRelatorio
from app.services.folha_service import ServicoFolha
from datetime import datetime, timedelta
from typing import List
import logging
import csv
import io
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/relatorios", tags=["Relatórios"])


@router.get("/espelho-ponto", response_model=RelatorioFuncionario)
async def obter_espelho_ponto(
    usuario_id: str = Query(..., description="ID do usuário"),
    data_inicio: str = Query(..., description="Data inicial (formato ISO)"),
    data_fim: str = Query(..., description="Data final (formato ISO)"),
    usuario_atual: PerfilUsuario = Depends(obter_usuario_atual),
    supabase: Client = Depends(obter_supabase)
):
    """
    Gerar espelho de ponto para um funcionário
    
    Funcionários podem ver apenas o próprio espelho
    Admins podem ver espelhos de sua empresa
    """
    # Verificar permissões
    if str(usuario_atual.id) != usuario_id:
        if usuario_atual.funcao == FuncaoUsuario.FUNCIONARIO:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Você só pode ver seu próprio espelho de ponto"
            )
        
        if usuario_atual.funcao == FuncaoUsuario.ADMIN_EMPRESA:
            # Verificar se usuário pertence à empresa
            perfil_response = supabase.table("perfis")\
                .select("empresa_id")\
                .eq("id", usuario_id)\
                .single()\
                .execute()
            
            if not perfil_response.data or perfil_response.data["empresa_id"] != str(usuario_atual.empresa_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Você só pode ver espelhos da sua empresa"
                )
    
    try:
        inicio = datetime.fromisoformat(data_inicio)
        fim = datetime.fromisoformat(data_fim)
        
        espelho = await ServicoRelatorio.gerar_espelho_ponto(
            supabase,
            usuario_id,
            inicio,
            fim
        )
        
        return espelho
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Erro ao gerar espelho de ponto: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/folha-pagamento", response_model=DadosFolhaPagamento)
async def obter_dados_folha(
    usuario_id: str = Query(..., description="ID do usuário"),
    data_inicio: str = Query(..., description="Data inicial (formato ISO)"),
    data_fim: str = Query(..., description="Data final (formato ISO)"),
    usuario_atual: PerfilUsuario = Depends(obter_admin_empresa),
    supabase: Client = Depends(obter_supabase)
):
    """
    Obter dados para folha de pagamento de um funcionário
    
    Apenas admins da empresa ou super admins
    """
    # Verificar se usuário pertence à empresa (para admin_empresa)
    if usuario_atual.funcao == FuncaoUsuario.ADMIN_EMPRESA:
        perfil_response = supabase.table("perfis")\
            .select("empresa_id")\
            .eq("id", usuario_id)\
            .single()\
            .execute()
        
        if not perfil_response.data or perfil_response.data["empresa_id"] != str(usuario_atual.empresa_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Você só pode acessar dados da sua empresa"
            )
    
    try:
        inicio = datetime.fromisoformat(data_inicio)
        fim = datetime.fromisoformat(data_fim)
        
        dados_folha = await ServicoFolha.calcular_dados_folha(
            supabase,
            usuario_id,
            inicio,
            fim
        )
        
        return dados_folha
        
    except Exception as e:
        logger.error(f"Erro ao calcular folha: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/empresa/registros")
async def obter_registros_empresa(
    data_inicio: str = Query(..., description="Data inicial (formato ISO)"),
    data_fim: str = Query(..., description="Data final (formato ISO)"),
    usuario_atual: PerfilUsuario = Depends(obter_admin_empresa),
    supabase: Client = Depends(obter_supabase)
):
    """
    Obter todos os registros da empresa no período
    
    Apenas admins da empresa ou super admins
    """
    try:
        inicio = datetime.fromisoformat(data_inicio)
        fim = datetime.fromisoformat(data_fim)
        
        # Para super admin, permitir filtro por empresa
        # Para admin_empresa, usar empresa do usuário
        empresa_id = str(usuario_atual.empresa_id)
        
        registros = await ServicoRelatorio.obter_registros_empresa(
            supabase,
            empresa_id,
            inicio,
            fim
        )
        
        return {"registros": registros, "total": len(registros)}
        
    except Exception as e:
        logger.error(f"Erro ao buscar registros da empresa: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/empresa/folha/exportar")
async def exportar_folha_empresa(
    data_inicio: str = Query(..., description="Data inicial (formato ISO)"),
    data_fim: str = Query(..., description="Data final (formato ISO)"),
    formato: str = Query("csv", description="Formato: csv ou json"),
    usuario_atual: PerfilUsuario = Depends(obter_admin_empresa),
    supabase: Client = Depends(obter_supabase)
):
    """
    Exportar dados de folha de toda a empresa
    
    Formatos disponíveis: CSV ou JSON
    """
    try:
        inicio = datetime.fromisoformat(data_inicio)
        fim = datetime.fromisoformat(data_fim)
        
        empresa_id = str(usuario_atual.empresa_id)
        
        dados = await ServicoFolha.exportar_folha_empresa(
            supabase,
            empresa_id,
            inicio,
            fim
        )
        
        if formato.lower() == "csv":
            # Gerar CSV
            saida = io.StringIO()
            escritor = csv.writer(saida)
            
            # Cabeçalho
            escritor.writerow([
                "Nome",
                "Email",
                "Código Funcionário",
                "Período Início",
                "Período Fim",
                "Horas Regulares",
                "Horas Extras",
                "Total Horas",
                "Faltas",
                "Atrasos"
            ])
            
            # Dados
            for item in dados:
                escritor.writerow([
                    item.nome_usuario,
                    "",  # Email não está no schema
                    item.codigo_funcionario or "",
                    item.inicio_periodo,
                    item.fim_periodo,
                    f"{item.horas_regulares:.2f}",
                    f"{item.horas_extras:.2f}",
                    f"{item.total_horas:.2f}",
                    item.faltas,
                    item.atrasos
                ])
            
            saida.seek(0)
            
            return StreamingResponse(
                iter([saida.getvalue()]),
                media_type="text/csv",
                headers={
                    "Content-Disposition": f"attachment; filename=folha_{empresa_id}_{inicio.strftime('%Y%m%d')}_{fim.strftime('%Y%m%d')}.csv"
                }
            )
        else:
            # Retornar JSON
            return {"dados": [item.dict() for item in dados]}
        
    except Exception as e:
        logger.error(f"Erro ao exportar folha: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
