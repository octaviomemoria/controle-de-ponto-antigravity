-- ============================================================================
-- COMPLEMENTO DO SCHEMA - Executar após tabelas criadas
-- ============================================================================
-- Este arquivo adiciona índices, RLS policies e funções que faltam
-- ============================================================================

-- ============================================================================
-- ÍNDICES (Performance)
-- ============================================================================

-- Índices da tabela empresas
CREATE INDEX IF NOT EXISTS idx_empresas_ativa ON empresas(ativa);

-- Índices da tabela perfis
CREATE INDEX IF NOT EXISTS idx_perfis_empresa ON perfis(empresa_id);
CREATE INDEX IF NOT EXISTS idx_perfis_funcao ON perfis(funcao);
CREATE INDEX IF NOT EXISTS idx_perfis_email ON perfis(email);

-- Índices da tabela registros_ponto
CREATE INDEX IF NOT EXISTS idx_registros_usuario ON registros_ponto(usuario_id);
CREATE INDEX IF NOT EXISTS idx_registros_empresa ON registros_ponto(empresa_id);
CREATE INDEX IF NOT EXISTS idx_registros_timestamp ON registros_ponto(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_registros_tipo ON registros_ponto(tipo_registro);
CREATE INDEX IF NOT EXISTS idx_registros_sincronizado ON registros_ponto(sincronizado_em);

-- ============================================================================
-- FUNÇÕES AUXILIARES
-- ============================================================================

-- Função para obter o ID da empresa do usuário atual
CREATE OR REPLACE FUNCTION obter_empresa_usuario_atual()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT empresa_id 
        FROM perfis 
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para verificar se usuário é admin
CREATE OR REPLACE FUNCTION eh_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        SELECT funcao IN ('company_admin', 'super_admin')
        FROM perfis 
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para verificar se usuário é super admin
CREATE OR REPLACE FUNCTION eh_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        SELECT funcao = 'super_admin'
        FROM perfis 
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- HABILITAR ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_ponto ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLÍTICAS RLS - Empresas
-- ============================================================================

-- Super admin pode ver todas as empresas
CREATE POLICY "super_admin_ver_todas_empresas"
    ON empresas FOR SELECT
    USING (eh_super_admin());

-- Company admin pode ver apenas sua empresa
CREATE POLICY "admin_empresa_ver_propria_empresa"
    ON empresas FOR SELECT
    USING (id = obter_empresa_usuario_atual());

-- Super admin pode gerenciar empresas
CREATE POLICY "super_admin_gerenciar_empresas"
    ON empresas FOR ALL
    USING (eh_super_admin());

-- ============================================================================
-- POLÍTICAS RLS - Perfis
-- ============================================================================

-- Usuários podem ver seu próprio perfil
CREATE POLICY "usuarios_ver_proprio_perfil"
    ON perfis FOR SELECT
    USING (auth.uid() = id);

-- Admins podem ver perfis de sua empresa
CREATE POLICY "admins_ver_perfis_empresa"
    ON perfis FOR SELECT
    USING (
        eh_admin() AND 
        empresa_id = obter_empresa_usuario_atual()
    );

-- Super admin pode ver todos os perfis
CREATE POLICY "super_admin_ver_todos_perfis"
    ON perfis FOR SELECT
    USING (eh_super_admin());

-- Super admin pode criar/editar perfis
CREATE POLICY "super_admin_gerenciar_perfis"
    ON perfis FOR ALL
    USING (eh_super_admin());

-- ============================================================================
-- POLÍTICAS RLS - Registros de Ponto
-- ============================================================================

-- Usuários podem ver seus próprios registros
CREATE POLICY "usuarios_ver_proprios_registros"
    ON registros_ponto FOR SELECT
    USING (auth.uid() = usuario_id);

-- Usuários podem criar seus próprios registros
CREATE POLICY "usuarios_criar_proprios_registros"
    ON registros_ponto FOR INSERT
    WITH CHECK (auth.uid() = usuario_id);

-- Admins podem ver registros de sua empresa
CREATE POLICY "admins_ver_registros_empresa"
    ON registros_ponto FOR SELECT
    USING (
        eh_admin() AND 
        empresa_id = obter_empresa_usuario_atual()
    );

-- Super admin pode ver todos os registros
CREATE POLICY "super_admin_ver_todos_registros"
    ON registros_ponto FOR SELECT
    USING (eh_super_admin());

-- Super admin pode gerenciar todos os registros
CREATE POLICY "super_admin_gerenciar_registros"
    ON registros_ponto FOR ALL
    USING (eh_super_admin());

-- ============================================================================
-- STORAGE BUCKET (Se ainda não existir)
-- ============================================================================

-- Nota: Execute manualmente no Storage interface:
-- 1. Criar bucket "fotos-ponto"
-- 2. Marcar como "Public"
-- 3. Políticas de storage são configuradas automaticamente

-- ============================================================================
-- COMENTÁRIOS (Documentação)
-- ============================================================================

COMMENT ON TABLE empresas IS 'Empresas cadastradas no sistema (multi-tenant)';
COMMENT ON TABLE perfis IS 'Perfis de usuários do sistema';
COMMENT ON TABLE registros_ponto IS 'Registros de ponto dos funcionários';

COMMENT ON COLUMN empresas.configuracoes IS 'Configurações da empresa: jornada_diaria_horas, tolerancia_atraso_minutos, etc.';
COMMENT ON COLUMN perfis.funcao IS 'Função: employee (funcionário), company_admin (admin da empresa) ou super_admin (super administrador)';
COMMENT ON COLUMN perfis.codigo_funcionario IS 'Código/matrícula do funcionário';
COMMENT ON COLUMN registros_ponto.tipo_registro IS 'Tipo: clock_in, clock_out, break_start ou break_end';

-- ============================================================================
-- FINALIZADO
-- ============================================================================
-- Execute este SQL e depois crie o bucket "fotos-ponto" no Storage!
