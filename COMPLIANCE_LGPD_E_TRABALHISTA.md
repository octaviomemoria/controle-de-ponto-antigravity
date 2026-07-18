# Validação LGPD e trabalhista

Data da análise: 17/07/2026.

## Resultado

O aplicativo pode ser homologado tecnicamente, mas **ainda não deve ser
comercializado como REP-P ou sistema oficial de registro eletrônico de ponto**.
Esta análise técnica não substitui parecer jurídico.

## Portaria MTP nº 671/2021

Para enquadramento como REP-P ainda faltam, entre outros itens:

- NSR sequencial e independente por estabelecimento;
- geração do AFD no leiaute oficial;
- Programa de Tratamento com geração do AEJ;
- assinatura CAdES/arquivo P7S do AEJ com certificado ICP-Brasil;
- comprovante de marcação PDF assinado pela empresa desenvolvedora;
- Atestado Técnico e Termo de Responsabilidade;
- registro do programa de computador no INPI;
- trilha imutável que impeça exclusão ou alteração das marcações originais;
- testes formais dos leiautes e assinaturas exigidos pelo MTE.

Uma senha comum não substitui certificado digital
ICP-Brasil nem certificado Authenticode.

## LGPD

Antes do go-live:

1. Definir formalmente controlador, operadores, suboperadores e canal do titular.
2. Publicar aviso de privacidade com finalidades, bases legais, retenção e compartilhamentos.
3. Manter registro das operações de tratamento e avaliação de risco/RIPD.
4. Documentar retenção e descarte de fotos, localização, documentos médicos e logs.
5. Restringir fotos/geolocalização ao mínimo necessário e às políticas da empresa.
6. Formalizar contratos/DPA com Supabase, Vercel, e-mail e monitoramento.
7. Criar procedimento de incidentes, restauração e comunicação à ANPD/titulares.
8. Testar exportação, correção, bloqueio e exclusão conforme a hipótese legal aplicável.
9. Habilitar MFA para administradores e revisar acessos periodicamente.
10. Registrar evidências de backup, restauração e testes de continuidade.

## Fontes oficiais consultadas

- Lei nº 13.709/2018 (LGPD).
- ANPD: Segurança da Informação para Agentes de Tratamento de Pequeno Porte.
- ANPD: Comunicação de Incidente de Segurança.
- ANPD: Relatório de Impacto à Proteção de Dados Pessoais.
- MTE: Portaria MTP nº 671/2021 compilada.
- MTE: Perguntas e Respostas sobre REP, atualizadas em 28/04/2025.
- INPI: registro de programa de computador.
