from supabase import Client
from app.models.enums import TipoPonto
from app.models.schemas import RequisicaoPonto, RegistroPonto, PerfilUsuario
from app.services.photo_service import ServicoFoto
from datetime import datetime
from typing import Optional, Dict
import logging
from uuid import UUID

logger = logging.getLogger(__name__)


class ServicoPonto:
    """Serviço para operações de registro de ponto"""
    
    @staticmethod
    async def registrar_ponto(
        supabase: Client,
        usuario: PerfilUsuario,
        requisicao: RequisicaoPonto
    ) -> RegistroPonto:
        """
        Registrar um evento de ponto (entrada/saída/intervalo)
        
        Args:
            supabase: Cliente Supabase
            usuario: Perfil do usuário atual
            requisicao: Dados da requisição de ponto
        
        Returns:
            Registro de ponto criado
        
        Raises:
            ValueError: Se a sequência de ponto for inválida
        """
        # Validar sequência de ponto
        await ServicoPonto._validar_sequencia_ponto(supabase, usuario.id, requisicao.tipo_ponto)
        
        # Fazer upload da foto se fornecida
        url_foto = None
        if requisicao.foto_base64:
            url_foto = await ServicoFoto.fazer_upload_foto(
                supabase=supabase,
                usuario_id=str(usuario.id),
                empresa_id=str(usuario.empresa_id),
                foto_base64=requisicao.foto_base64,
                tipo_ponto=requisicao.tipo_ponto.value
            )
        
        # Criar registro de ponto com timestamp do servidor
        dados_registro = {
            "usuario_id": str(usuario.id),
            "empresa_id": str(usuario.empresa_id),
            "tipo_registro": requisicao.tipo_ponto.value,
            "timestamp": datetime.utcnow().isoformat(),
            "latitude": requisicao.latitude,
            "longitude": requisicao.longitude,
            "foto_url": url_foto,
            "criado_em": datetime.utcnow().isoformat()
        }
        
        # Inserir no banco de dados
        resposta = supabase.table("registros_ponto").insert(dados_registro).execute()
        
        if not resposta.data or len(resposta.data) == 0:
            raise Exception("Falha ao criar registro de ponto")
        
        logger.info(f"Registro de ponto criado: usuario={usuario.id}, tipo={requisicao.tipo_ponto.value}")
        
        return RegistroPonto(**resposta.data[0])
    
    @staticmethod
    async def _validar_sequencia_ponto(
        supabase: Client,
        usuario_id: UUID,
        novo_tipo_ponto: TipoPonto
    ) -> None:
        """
        Validar que a sequência de ponto é válida (prevenir entradas duplicadas, etc.)
        
        Args:
            supabase: Cliente Supabase
            usuario_id: ID do usuário
            novo_tipo_ponto: Tipo do novo evento de ponto
        
        Raises:
            ValueError: Se a sequência for inválida
        """
        # Obter último registro de ponto para este usuário
        ultimo_registro = await ServicoPonto.obter_ultimo_ponto(supabase, usuario_id)
        
        if not ultimo_registro:
            # Sem registros anteriores - apenas permitir entrada
            if novo_tipo_ponto != TipoPonto.ENTRADA:
                raise ValueError("Primeiro ponto deve ser ENTRADA")
            return
        
        ultimo_tipo = ultimo_registro.tipo_ponto
        
        # Regras de validação
        if novo_tipo_ponto == TipoPonto.ENTRADA:
            if ultimo_tipo == TipoPonto.ENTRADA:
                raise ValueError("Não pode bater entrada duas vezes. Por favor, bata saída primeiro.")
            elif ultimo_tipo in [TipoPonto.INICIO_INTERVALO, TipoPonto.FIM_INTERVALO]:
                raise ValueError("Não pode bater entrada durante intervalo. Por favor, finalize o intervalo primeiro.")
        
        elif novo_tipo_ponto == TipoPonto.SAIDA:
            if ultimo_tipo == TipoPonto.SAIDA:
                raise ValueError("Não pode bater saída duas vezes. Por favor, bata entrada primeiro.")
            elif ultimo_tipo == TipoPonto.INICIO_INTERVALO:
                raise ValueError("Não pode bater saída durante intervalo. Por favor, finalize o intervalo primeiro.")
            elif ultimo_tipo != TipoPonto.ENTRADA and ultimo_tipo != TipoPonto.FIM_INTERVALO:
                raise ValueError("Sequência de ponto inválida")
        
        elif novo_tipo_ponto == TipoPonto.INICIO_INTERVALO:
            if ultimo_tipo != TipoPonto.ENTRADA and ultimo_tipo != TipoPonto.FIM_INTERVALO:
                raise ValueError("Só pode iniciar intervalo após bater entrada")
        
        elif novo_tipo_ponto == TipoPonto.FIM_INTERVALO:
            if ultimo_tipo != TipoPonto.INICIO_INTERVALO:
                raise ValueError("Só pode finalizar intervalo após iniciá-lo")
    
    @staticmethod
    async def obter_ultimo_ponto(
        supabase: Client,
        usuario_id: UUID
    ) -> Optional[RegistroPonto]:
        """
        Obter o último registro de ponto de um usuário
        
        Args:
            supabase: Cliente Supabase
            usuario_id: ID do usuário
        
        Returns:
            Último registro de ponto ou None
        """
        resposta = supabase.table("registros_ponto")\
            .select("*")\
            .eq("usuario_id", str(usuario_id))\
            .order("timestamp", desc=True)\
            .limit(1)\
            .execute()
        
        if resposta.data and len(resposta.data) > 0:
            return RegistroPonto(**resposta.data[0])
        
        return None
    
    @staticmethod
    async def obter_registros_usuario(
        supabase: Client,
        usuario_id: UUID,
        data_inicio: Optional[datetime] = None,
        data_fim: Optional[datetime] = None
    ) -> list[RegistroPonto]:
        """
        Obter registros de ponto de um usuário dentro de um intervalo de datas
        
        Args:
            supabase: Cliente Supabase
            usuario_id: ID do usuário
            data_inicio: Data de início (opcional)
            data_fim: Data de fim (opcional)
        
        Returns:
            Lista de registros de ponto
        """
        consulta = supabase.table("registros_ponto")\
            .select("*")\
            .eq("usuario_id", str(usuario_id))
        
        if data_inicio:
            consulta = consulta.gte("timestamp", data_inicio.isoformat())
        if data_fim:
            consulta = consulta.lte("timestamp", data_fim.isoformat())
        
        consulta = consulta.order("timestamp", desc=True)
        
        resposta = consulta.execute()
        
        return [RegistroPonto(**registro) for registro in resposta.data]
    
    @staticmethod
    async def sincronizar_registros_offline(
        supabase: Client,
        usuario: PerfilUsuario,
        registros_offline: list[RequisicaoPonto]
    ) -> Dict:
        """
        Sincronizar registros offline com o banco de dados
        
        Args:
            supabase: Cliente Supabase
            usuario: Perfil do usuário
            registros_offline: Lista de requisições de ponto offline
        
        Returns:
            Dicionário com resultados da sincronização
        """
        sincronizados = 0
        falhas = 0
        erros = []
        
        for registro in registros_offline:
            try:
                await ServicoPonto.registrar_ponto(supabase, usuario, registro)
                sincronizados += 1
            except Exception as e:
                falhas += 1
                erros.append(f"{registro.tipo_ponto.value}: {str(e)}")
                logger.error(f"Falha ao sincronizar registro: {str(e)}")
        
        return {
            "quantidade_sincronizada": sincronizados,
            "quantidade_falhas": falhas,
            "erros": erros
        }
