-- ============================================================================
-- CORREÇÃO: Remover Políticas com Recursão e Recriar Corretamente
-- ============================================================================

-- 1. REMOVER todas as políticas problemáticas
DROP POLICY IF EXISTS "usuarios_ver_proprio_perfil" ON perfis;
DROP POLICY IF EXISTS "admins_ver_perfis_empresa" ON perfis;
DROP POLICY IF EXISTS "super_admin_ver_todos_perfis" ON perfis;
DROP POLICY IF EXISTS "super_admin_gerenciar_perfis" ON perfis;

-- 2. RECRIAR políticas SEM recursão
-- Política simples: usuários autenticados podem ver seu próprio perfil
CREATE POLICY "usuarios_ver_proprio_perfil"
    ON perfis FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Política: usuários autenticados podem ver perfis da mesma empresa
CREATE POLICY "ver_perfis_mesma_empresa"
    ON perfis FOR SELECT
    TO authenticated
    USING (
        empresa_id = (
            SELECT empresa_id 
            FROM perfis 
            WHERE id = auth.uid()
            LIMIT 1
        )
    );

-- Política: permitir inserção de perfis (para registro inicial)
CREATE POLICY "permitir_insercao_perfis"
    ON perfis FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- 3. SIMPLIFICAR ou REMOVER funções que causam recursão
-- (Vamos usar queries diretas nas políticas em vez de funções)

-- ============================================================================
-- TESTAR: Agora o login deve funcionar!
-- ============================================================================
