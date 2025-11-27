-- ============================================================================
-- SISTEMA DE CONTROLE DE PONTO ANTIGRAVITY - SCHEMA DO SUPABASE
-- ============================================================================
-- Este arquivo contém todo o schema SQL necessário para configurar o banco
-- de dados no Supabase, incluindo tabelas, políticas RLS e storage buckets.
-- ============================================================================

-- ============================================================================
-- TABELAS
-- ============================================================================

-- Tabela de Empresas
CREATE TABLE IF NOT EXISTS empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    configuracoes JSONB DEFAULT '{}'::jsonb,
    ativa BOOLEAN DEFAULT true,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_empresas_ativa ON empresas(ativa);

COMMENT ON TABLE empresas IS 'Empresas cadastradas no sistema (multi-tenant)';
COMMENT ON COLUMN empresas.configuracoes IS 'Configurações da empresa: jornada_diaria_horas, tolerancia_atraso_minutos, etc.';


-- Tabela de Perfis (estende auth.users do Supabase)
CREATE TABLE IF NOT EXISTS perfis (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    email TEXT NOT NULL UNIQUE,
    nome_completo TEXT NOT NULL,
    funcao TEXT NOT NULL CHECK (funcao IN ('employee', 'company_admin', 'super_admin')),
    codigo_funcionario TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_perfis_empresa ON perfis(empresa_id);
CREATE INDEX idx_perfis_funcao ON perfis(funcao);
CREATE INDEX idx_perfis_email ON perfis(email);

COMMENT ON TABLE perfis IS 'Perfis de usuários do sistema';
COMMENT ON COLUMN perfis.funcao IS 'Função: employee (funcionário), company_admin (admin da empresa) ou super_admin (super administrador)';
COMMENT ON COLUMN perfis.codigo_funcionario IS 'Código/matrícula do funcionário';


-- Tabela de Registros de Ponto
CREATE TABLE IF NOT EXISTS registros_ponto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    tipo_registro TEXT NOT NULL CHECK (tipo_registro IN ('clock_in', 'clock_out', 'break_start', 'break_end')),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    foto_url TEXT,
    sincronizado_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_registros_usuario ON registros_ponto(usuario_id);
CREATE INDEX idx_registros_empresa ON registros_ponto(empresa_id);
CREATE INDEX idx_registros_timestamp ON registros_ponto(timestamp DESC);
CREATE INDEX idx_registros_tipo ON registros_ponto(tipo_registro);

COMMENT ON TABLE registros_ponto IS 'Registros de entrada, saída e intervalos';
COMMENT ON COLUMN registros_ponto.tipo_registro IS 'Tipo: clock_in (entrada), clock_out (saída), break_start (início intervalo), break_end (fim intervalo)';
COMMENT ON COLUMN registros_ponto.timestamp IS 'Timestamp do servidor (não do cliente)';
COMMENT ON COLUMN registros_ponto.sincronizado_em IS 'Quando registro offline foi sincronizado';


-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_ponto ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- POLÍTICAS RLS - EMPRESAS
-- ============================================================================

-- Super admin vê todas as empresas
CREATE POLICY "super_admin_ver_todas_empresas"
    ON empresas FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM perfis
            WHERE perfis.id = auth.uid()
            AND perfis.funcao = 'super_admin'
        )
    );

-- Admin da empresa vê apenas sua empresa
CREATE POLICY "admin_empresa_ver_sua_empresa"
    ON empresas FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM perfis
            WHERE perfis.id = auth.uid()
            AND perfis.empresa_id = empresas.id
            AND perfis.funcao IN ('company_admin', 'super_admin')
        )
    );

-- Super admin pode criar empresas
CREATE POLICY "super_admin_criar_empresas"
    ON empresas FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM perfis
            WHERE perfis.id = auth.uid()
            AND perfis.funcao = 'super_admin'
        )
    );

-- Super admin pode atualizar empresas
CREATE POLICY "super_admin_atualizar_empresas"
    ON empresas FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM perfis
            WHERE perfis.id = auth.uid()
            AND perfis.funcao = 'super_admin'
        )
    );


-- ============================================================================
-- POLÍTICAS RLS - PERFIS
-- ============================================================================

-- Usuário vê seu próprio perfil
CREATE POLICY "usuario_ver_proprio_perfil"
    ON perfis FOR SELECT
    USING (auth.uid() = id);

-- Admin da empresa vê perfis de sua empresa
CREATE POLICY "admin_empresa_ver_perfis_empresa"
    ON perfis FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM perfis AS p
            WHERE p.id = auth.uid()
            AND p.empresa_id = perfis.empresa_id
            AND p.funcao IN ('company_admin', 'super_admin')
        )
    );

-- Super admin vê todos os perfis
CREATE POLICY "super_admin_ver_todos_perfis"
    ON perfis FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM perfis AS p
            WHERE p.id = auth.uid()
            AND p.funcao = 'super_admin'
        )
    );

-- Perfis podem ser criados via backend (service key)
-- Não há política de INSERT para usuários normais


-- ============================================================================
-- POLÍTICAS RLS - REGISTROS DE PONTO
-- ============================================================================

-- Funcionário vê apenas seus próprios registros
CREATE POLICY "funcionario_ver_proprios_registros"
    ON registros_ponto FOR SELECT
    USING (auth.uid() = usuario_id);

-- Admin da empresa vê registros de sua empresa
CREATE POLICY "admin_empresa_ver_registros_empresa"
    ON registros_ponto FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM perfis
            WHERE perfis.id = auth.uid()
            AND perfis.empresa_id = registros_ponto.empresa_id
            AND perfis.funcao IN ('company_admin', 'super_admin')
        )
    );

-- Super admin vê todos os registros
CREATE POLICY "super_admin_ver_todos_registros"
    ON registros_ponto FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM perfis
            WHERE perfis.id = auth.uid()
            AND perfis.funcao = 'super_admin'
        )
    );

-- Usuário pode inserir seus próprios registros
CREATE POLICY "usuario_criar_proprios_registros"
    ON registros_ponto FOR INSERT
    WITH CHECK (auth.uid() = usuario_id);

-- Prevenir atualizações e exclusões (registros são imutáveis)
CREATE POLICY "ninguem_atualizar_registros"
    ON registros_ponto FOR UPDATE
    USING (false);

CREATE POLICY "ninguem_deletar_registros"
    ON registros_ponto FOR DELETE
    USING (false);


-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================

-- Criar bucket para fotos de ponto
INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos-ponto', 'fotos-ponto', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de upload de fotos
CREATE POLICY "usuarios_fazer_upload_fotos"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'fotos-ponto'
        AND auth.uid()::text = (storage.foldername(name))[2] -- usuário pode fazer upload apenas em sua pasta
    );

-- Políticas de leitura de fotos
CREATE POLICY "funcionario_ver_proprias_fotos"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'fotos-ponto'
        AND auth.uid()::text = (storage.foldername(name))[2]
    );

CREATE POLICY "admin_empresa_ver_fotos_empresa"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'fotos-ponto'
        AND EXISTS (
            SELECT 1 FROM perfis
            WHERE perfis.id = auth.uid()
            AND perfis.funcao IN ('company_admin', 'super_admin')
            AND perfis.empresa_id::text = (storage.foldername(name))[1]
        )
    );


-- ============================================================================
-- FUNÇÕES AUXILIARES
-- ============================================================================

-- Função para obter empresa do usuário atual
CREATE OR REPLACE FUNCTION obter_empresa_usuario_atual()
RETURNS UUID AS $$
    SELECT empresa_id FROM perfis WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

-- Função para verificar se usuário é admin
CREATE OR REPLACE FUNCTION eh_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM perfis
        WHERE id = auth.uid()
        AND funcao IN ('company_admin', 'super_admin')
    );
$$ LANGUAGE SQL SECURITY DEFINER;


-- ============================================================================
-- DADOS INICIAIS (OPCIONAL)
-- ============================================================================

-- Inserir empresa de demonstração
INSERT INTO empresas (id, nome, configuracoes) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Empresa Demonstração', 
     '{"jornada_diaria_horas": 8, "tolerancia_atraso_minutos": 10}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- NOTA: Usuários devem ser criados via API usando Supabase Auth
-- O primeiro super admin deve ser criado manualmente ou via script


-- ============================================================================
-- VIEWS ÚTEIS
-- ============================================================================

-- View de jornadas completas por dia
CREATE OR REPLACE VIEW jornadas_diarias AS
SELECT 
    perfis.empresa_id,
    registros_ponto.usuario_id,
    perfis.nome_completo,
    DATE(registros_ponto.timestamp) AS data,
    MIN(CASE WHEN tipo_registro = 'clock_in' THEN timestamp END) AS entrada,
    MAX(CASE WHEN tipo_registro = 'clock_out' THEN timestamp END) AS saida,
    COUNT(CASE WHEN tipo_registro = 'break_start' THEN 1 END) AS intervalos
FROM registros_ponto
JOIN perfis ON perfis.id = registros_ponto.usuario_id
GROUP BY perfis.empresa_id, registros_ponto.usuario_id, perfis.nome_completo, DATE(registros_ponto.timestamp);

COMMENT ON VIEW jornadas_diarias IS 'Resumo de jornadas por dia com entrada, saída e intervalos';


-- ============================================================================
-- ÍNDICES ADICIONAIS PARA PERFORMANCE
-- ============================================================================

-- Índice composto para queries comuns
CREATE INDEX IF NOT EXISTS idx_registros_usuario_timestamp 
    ON registros_ponto(usuario_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_registros_empresa_timestamp 
    ON registros_ponto(empresa_id, timestamp DESC);


-- ============================================================================
-- FIM DO SCHEMA
-- ============================================================================
