import base64
import hashlib
from datetime import datetime
from typing import Optional
from supabase import Client
import logging

logger = logging.getLogger(__name__)


class ServicoFoto:
    """Serviço para manipular upload de fotos para o Supabase Storage"""
    
    NOME_BUCKET = "fotos-ponto"
    
    @staticmethod
    async def fazer_upload_foto(
        supabase: Client,
        usuario_id: str,
        empresa_id: str,
        foto_base64: str,
        tipo_ponto: str
    ) -> Optional[str]:
        """
        Fazer upload de foto para o Supabase Storage e retornar URL pública
        
        Args:
            supabase: Cliente Supabase
            usuario_id: ID do usuário
            empresa_id: ID da empresa (para organizar arquivos)
            foto_base64: Dados da foto codificados em Base64 (com ou sem prefixo data URI)
            tipo_ponto: Tipo do evento de ponto
        
        Returns:
            URL pública da foto enviada ou None se o upload falhar
        """
        try:
            # Remover prefixo data URI se presente
            if "," in foto_base64:
                foto_base64 = foto_base64.split(",")[1]
            
            # Decodificar base64 para bytes
            bytes_foto = base64.b64decode(foto_base64)
            
            # Gerar nome de arquivo único
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            # Criar hash da foto para unicidade
            hash_foto = hashlib.md5(bytes_foto).hexdigest()[:8]
            nome_arquivo = f"{empresa_id}/{usuario_id}/{timestamp}_{tipo_ponto}_{hash_foto}.jpg"
            
            # Upload para o Supabase Storage
            resposta = supabase.storage.from_(ServicoFoto.NOME_BUCKET).upload(
                path=nome_arquivo,
                file=bytes_foto,
                file_options={"content-type": "image/jpeg"}
            )
            
            # Obter URL pública
            url_publica = supabase.storage.from_(ServicoFoto.NOME_BUCKET).get_public_url(nome_arquivo)
            
            logger.info(f"Foto enviada com sucesso: {nome_arquivo}")
            return url_publica
            
        except Exception as e:
            logger.error(f"Erro ao fazer upload da foto: {str(e)}")
            return None
    
    @staticmethod
    async def deletar_foto(supabase: Client, url_foto: str) -> bool:
        """
        Deletar foto do Supabase Storage
        
        Args:
            supabase: Cliente Supabase
            url_foto: URL pública completa da foto
        
        Returns:
            True se deletada com sucesso, False caso contrário
        """
        try:
            # Extrair nome do arquivo da URL
            # Formato URL: https://{project}.supabase.co/storage/v1/object/public/fotos-ponto/{path}
            partes = url_foto.split(f"/public/{ServicoFoto.NOME_BUCKET}/")
            if len(partes) != 2:
                logger.error(f"Formato de URL de foto inválido: {url_foto}")
                return False
            
            nome_arquivo = partes[1]
            
            # Deletar do storage
            supabase.storage.from_(ServicoFoto.NOME_BUCKET).remove([nome_arquivo])
            
            logger.info(f"Foto deletada com sucesso: {nome_arquivo}")
            return True
            
        except Exception as e:
            logger.error(f"Erro ao deletar foto: {str(e)}")
            return False
