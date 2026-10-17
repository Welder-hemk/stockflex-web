# Saída do Lovable — plano e estado (17/10/2026)

Decisão: nada mais no Lovable (nem site, nem app, nem Lovable Cloud). Tudo em contas da StockFlex.

## Estrutura final
- GitHub privado da StockFlex: repositório `stockflex-web` (site em `site/`, sistema em `app/`).
- Netlify: um deploy só — `stockflex.com.py/` (site) e `stockflex.com.py/app/` (sistema). Teste em `teste.stockflex.com.py`.
- Supabase na conta da StockFlex: projeto de teste + projeto de produção (plano pago na produção: backup diário, sem pausa).
- Netlify Database não substitui o Supabase: é só Postgres; o sistema usa também login, permissões por usuário, arquivos e a função de usuários do Supabase.

## Passos
1. [feito] Site + app num pacote único, sem dependências do Lovable, testado localmente (rotas, recarregar páginas, logos, sessão).
2. [pendente] Criar contas: GitHub, Netlify, Supabase (teste e produção).
3. [pendente] Extrair dados do Lovable Cloud — atenção: hoje são DOIS bancos: o do app (cpzdpansvqsbbcqneyse) e o do site, onde estão os contatos/prospectos capturados (bhpgomhckrnvvawxwefw). No novo Supabase ficam num só.
4. [pendente] Ensaio da migração no ambiente de teste e conferência.
5. [pendente] Piloto em teste.stockflex.com.py.
6. [pendente] Virada do DNS de stockflex.com.py para o Netlify e desligamento do Lovable.

## Na virada
- Supabase › Authentication › URL Configuration: Site URL `https://stockflex.com.py/app/`, Redirect URLs `https://stockflex.com.py/app/**`.
- Os usuários terão de redefinir a senha se os logins não puderem ser migrados com hash (verificar no passo 3).
