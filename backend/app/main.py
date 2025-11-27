from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import settings
from app.routers import auth, ponto, relatorios, admin
import logging
import time

# Configurar logging
logging.basicConfig(
    level=logging.INFO if settings.debug else logging.WARNING,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)

# Criar aplicação FastAPI
app = FastAPI(
    title="Sistema de Controle de Ponto Antigravity",
    description="API para controle de ponto eletrônico multi-empresa",
    version="1.0.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None
)

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Middleware para logging de requisições
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Middleware para logar todas as requisições"""
    inicio = time.time()
    
    # Processar requisição
    response = await call_next(request)
    
    # Calcular tempo de processamento
    duracao = time.time() - inicio
    
    # Logar
    logger.info(
        f"{request.method} {request.url.path} - "
        f"Status: {response.status_code} - "
        f"Duração: {duracao:.3f}s"
    )
    
    return response


# Handler de exceções global
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handler global para exceções não tratadas"""
    logger.error(f"Erro não tratado: {str(exc)}", exc_info=True)
    
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Erro interno do servidor",
            "error": str(exc) if settings.debug else "Erro inesperado"
        }
    )


# Incluir routers
app.include_router(auth.router)
app.include_router(ponto.router)
app.include_router(relatorios.router)
app.include_router(admin.router)


# Rota raiz
@app.get("/")
async def root():
    """Rota raiz - informações da API"""
    return {
        "nome": "API de Controle de Ponto",
        "versao": "1.0.0",
        "status": "online",
        "documentacao": "/docs" if settings.debug else "Desabilitada em produção"
    }


# Rota de health check
@app.get("/health")
async def health_check():
    """Health check para monitoramento"""
    return {
        "status": "healthy",
        "timestamp": time.time()
    }


# Inicialização
@app.on_event("startup")
async def startup_event():
    """Executado ao iniciar a aplicação"""
    logger.info("=== Sistema de Controle de Ponto Iniciado ===")
    logger.info(f"Ambiente: {'Desenvolvimento' if settings.debug else 'Produção'}")
    logger.info(f"CORS Origins: {settings.cors_origins}")


@app.on_event("shutdown")
async def shutdown_event():
    """Executado ao desligar a aplicação"""
    logger.info("=== Sistema de Controle de Ponto Desligado ===")


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug,
        log_level="info" if settings.debug else "warning"
    )
