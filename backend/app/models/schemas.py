from pydantic import BaseModel, EmailStr, Field, UUID4
from datetime import datetime
from typing import Optional
from .enums import FuncaoUsuario, TipoPonto


# ========== Schemas de Usuário e Autenticação ==========

class PerfilUsuario(BaseModel):
    """Dados do perfil do usuário"""
    id: UUID4
    empresa_id: UUID4
    email: EmailStr
    nome_completo: str
    funcao: FuncaoUsuario
    codigo_funcionario: Optional[str] = None
    criado_em: datetime


class RequisicaoLogin(BaseModel):
    """Credenciais de login"""
    email: EmailStr
    senha: str


class RespostaLogin(BaseModel):
    """Resposta de login com token e dados do usuário"""
    access_token: str
    token_type: str = "bearer"
    usuario: PerfilUsuario


class RequisicaoRegistro(BaseModel):
    """Dados para registro de usuário"""
    email: EmailStr
    senha: str = Field(..., min_length=6)
    nome_completo: str
    empresa_id: UUID4
    funcao: FuncaoUsuario = FuncaoUsuario.FUNCIONARIO
    codigo_funcionario: Optional[str] = None


# ========== Schemas de Ponto ==========

class RequisicaoPonto(BaseModel):
    """Requisição de registro de ponto (entrada/saída/intervalo)"""
    tipo_ponto: TipoPonto
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    foto_base64: Optional[str] = None  # Foto codificada em Base64


class RegistroPonto(BaseModel):
    """Resposta de registro de ponto"""
    id: UUID4
    usuario_id: UUID4
    empresa_id: UUID4
    tipo_ponto: TipoPonto
    timestamp: datetime
    latitude: float
    longitude: float
    foto_url: Optional[str] = None
    sincronizado_em: Optional[datetime] = None
    criado_em: datetime


class RequisicaoSincronizacao(BaseModel):
    """Sincronização em lote de registros offline"""
    registros: list[RequisicaoPonto]
    timestamps_offline: list[str]  # Timestamps em formato ISO do armazenamento offline


class RespostaSincronizacao(BaseModel):
    """Resposta de sincronização com resultados"""
    quantidade_sincronizada: int
    quantidade_falhas: int
    erros: list[str] = []


class RespostaUltimoPonto(BaseModel):
    """Último registro de ponto para validação"""
    tipo_ponto: Optional[TipoPonto] = None
    timestamp: Optional[datetime] = None


# ========== Schemas de Empresa ==========

class Empresa(BaseModel):
    """Dados da empresa"""
    id: UUID4
    nome: str
    criado_em: datetime
    ativa: bool = True
    configuracoes: Optional[dict] = None


class RequisicaoCriarEmpresa(BaseModel):
    """Criar nova empresa"""
    nome: str
    configuracoes: Optional[dict] = None


# ========== Schemas de Relatórios ==========

class RegistroTempo(BaseModel):
    """Registro de tempo para relatórios"""
    data: str
    entrada: Optional[datetime] = None
    saida: Optional[datetime] = None
    duracao_intervalo: Optional[str] = None
    total_horas: Optional[str] = None
    horas_extras: Optional[str] = None
    foto_url: Optional[str] = None


class RelatorioFuncionario(BaseModel):
    """Relatório de folha de ponto do funcionário"""
    usuario_id: UUID4
    nome_usuario: str
    inicio_periodo: str
    fim_periodo: str
    registros: list[RegistroTempo]
    total_horas: str
    total_horas_extras: str


class DadosFolhaPagamento(BaseModel):
    """Dados calculados para folha de pagamento"""
    usuario_id: UUID4
    nome_usuario: str
    codigo_funcionario: Optional[str]
    inicio_periodo: str
    fim_periodo: str
    horas_regulares: float
    horas_extras: float
    total_horas: float
    faltas: int
    atrasos: int


# ========== Respostas Genéricas ==========

class RespostaMensagem(BaseModel):
    """Resposta genérica com mensagem"""
    mensagem: str
    sucesso: bool = True


class RespostaErro(BaseModel):
    """Resposta de erro"""
    detalhe: str
    codigo_erro: Optional[str] = None
