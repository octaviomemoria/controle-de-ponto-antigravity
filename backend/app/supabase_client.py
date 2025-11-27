from supabase import create_client, Client
from app.config import settings
from typing import Optional


class ClienteSupabase:
    """Cliente Supabase singleton"""
    
    _instancia: Optional[Client] = None
    _instancia_servico: Optional[Client] = None
    
    @classmethod
    def obter_cliente(cls, usar_service_key: bool = False) -> Client:
        """
        Obter instância do cliente Supabase
        
        Args:
            usar_service_key: Se True, usa service role key (ignora RLS)
                           Use apenas para operações admin que precisam ignorar RLS
        """
        if usar_service_key:
            if cls._instancia_servico is None:
                cls._instancia_servico = create_client(
                    settings.supabase_url,
                    settings.supabase_service_key
                )
            return cls._instancia_servico
        else:
            if cls._instancia is None:
                cls._instancia = create_client(
                    settings.supabase_url,
                    settings.supabase_anon_key
                )
            return cls._instancia
    
    @classmethod
    def resetar(cls):
        """Resetar instâncias do cliente (útil para testes)"""
        cls._instancia = None
        cls._instancia_servico = None


def obter_supabase(usar_service_key: bool = False) -> Client:
    """Função de dependência para obter cliente Supabase"""
    return ClienteSupabase.obter_cliente(usar_service_key=usar_service_key)
