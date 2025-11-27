from enum import Enum


class FuncaoUsuario(str, Enum):
    """Tipos de função de usuário para autorização"""
    FUNCIONARIO = "employee"
    ADMIN_EMPRESA = "company_admin"
    SUPER_ADMIN = "super_admin"


class TipoPonto(str, Enum):
    """Tipos de eventos de ponto"""
    ENTRADA = "clock_in"
    SAIDA = "clock_out"
    INICIO_INTERVALO = "break_start"
    FIM_INTERVALO = "break_end"
