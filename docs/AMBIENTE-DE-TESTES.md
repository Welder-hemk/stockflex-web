# Ambiente de testes do app StockFlex (fora do Lovable)

O objetivo é ter uma cópia do app funcionando, com dados de demonstração, sem tocar no Lovable nem nos dados atuais. Custo zero. O mesmo caminho vira depois o ambiente de produção (outro projeto, com os dados reais).

```
Navegador (PC, celular, leitor de código)
        │
        ▼
Site estático do app  ──────►  Supabase "stockflex-testes"
(Netlify, grátis)               banco + login + arquivos + função de usuários
```

## 1. Criar o banco (Supabase)

1. Entre em https://supabase.com e crie uma conta (pode usar o Google).
2. **New project** → nome `stockflex-testes`, região **South America (São Paulo)**, anote a senha do banco.
3. Quando o projeto terminar de criar, abra **SQL Editor → New query**, cole todo o arquivo `supabase/demo/schema-completo.sql` e clique em **Run**. Isso cria tabelas, regras de acesso, funções de faturamento e os depósitos.
4. **Authentication → Sign In / Providers → Email**: desligue *Allow new users to sign up* (só o administrador cria usuários).
5. **Authentication → URL Configuration → Site URL**: coloque o endereço do app (passo 3), quando o tiver.

## 2. Usuários e dados de demonstração

1. **Authentication → Users → Add user → Create new user**, marcando *Auto Confirm User*, para estes 4 e-mails (senha à escolha):
   - `admin@stockflex.com.py` (administrador)
   - `operador@stockflex.com.py` (operador)
   - `finanzas@stockflex.com.py` (financeiro)
   - `compras@techpar.com.py` (cliente TechPar)
2. **SQL Editor → New query** → cole `supabase/demo/seed-demo.sql` → **Run**.
   Cria 3 clientes, contratos, 2 depósitos (Ciudad del Este e Luque), ~100 pallets com histórico desde julho, faturas de agosto a outubro, pagamentos, solicitações pendentes, um autorizado esperando validação, 2 agentes (TechPar e Moda CDE indicados por Roberto Giménez) e dados fictícios da empresa para o contrato.

## 3. Função de gestão de usuários

A tela **Usuarios** do app cria e edita logins por meio da função `manage-users`.

- Painel: **Edge Functions → Deploy a new function → Via Editor**, nome `manage-users`, cole o conteúdo de `supabase/functions/manage-users/index.ts` e publique.
- Ou pelo terminal: `npx supabase login`, `npx supabase link --project-ref <id>`, `npx supabase functions deploy manage-users`.

## 4. Publicar o app

Em **Project Settings → API** copie a **Project URL** e a **anon / publishable key** (são públicas, podem ser compartilhadas).

**Opção rápida (sem GitHub):** envie esses dois valores ao Claude; ele gera a pasta `dist` já configurada. Depois arraste a pasta em https://app.netlify.com/drop — sai um endereço tipo `https://stockflex-testes.netlify.app`.

**Opção contínua (com GitHub):** suba este código num repositório privado novo (ex.: `stockflex-app-v2`), conecte em Netlify ou Vercel com:
- Build: `npm run build` · Pasta: `dist`
- Variáveis: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`
Cada alteração publicada no GitHub atualiza o ambiente sozinha.

## 5. Roteiro de teste (sugestão)

Faça na ordem: a primeira linha de contrato (admin) precisa vir antes da do cliente.

| Perfil | O que testar |
|---|---|
| Operador | Dashboard → *Preparar retiro* da TechPar → Operación › Pendientes → confirmar saída (imprime comprovante). Ingreso com leitor: cliente, peso "1.250,5" (deve avisar capacidade), depois peso normal. Saída escaneando pallets de clientes diferentes. Transferência para posição ocupada. Mapa: trocar para o depósito Luque. |
| Financeiro | Finanzas › Cierre del mes (outubro): abrir o rascunho da Moda CDE, ajuste com motivo, emitir. Registrar pagamento sem fatura (aplica nas mais antigas). Nota de crédito. Cobranzas: estado de conta e lembrete por WhatsApp. Contratos: criar um com "Aplicar tabla vigente". |
| Cliente | Portal: Mi cuenta (saldo, próxima fatura, PDF). Mi mercadería: pedir retiro fora do horário (deve recusar) e dentro. Autorizados: cadastrar pessoa. Testar também no celular. |
| Admin | Autorizados: validar o pedido do cliente. Clientes: editar, tentar desativar cliente com contrato ativo. Depósitos: criar uma rua nova e imprimir etiquetas de posição. |
| Admin – mapa | Mapa del Depósito: tocar um vão na planta, ver a frente da calle, selecionar posição e usar Salida/Transferir/Ajuste; *Bloquear varias*; *Modo TV*. Depósitos: preencher "Pasillos" (ex.: A,C,E) e ver os corredores na planta. |
| Admin/Financeiro – comissões | Agentes y comisiones: TechPar deve aparecer *Lista para pagar* (US$ 96) e Moda CDE *Esperando 1.er pago* (US$ 16). Pagar a da TechPar → conferir em Gastos o lançamento "Comisión de captación (CAC)". Cadastrar um agente novo e vinculá-lo a um cliente (Clientes › editar). Criar um 2.º contrato para a TechPar: **não** deve gerar outra comissão. |
| Admin – contrato | Modelo de contrato: completar dados da empresa, editar uma cláusula, Guardar (vira versão nova). Clientes › Contratos › ícone de documento da TechPar: escrever condições particulares, Imprimir borrador, *Emitir para firma*. |
| Cliente – contrato | Portal › Contrato: ler, Imprimir, *Aceptar contrato* (nome e C.I.), adjuntar a cópia firmada (PDF qualquer). Conferir que **não** há opção de apagar. |
| Admin – contrato | Voltar ao documento do contrato: aba Archivos mostra o PDF do cliente → *Validar firma* → estado *Firmado*. Testar apagar um anexo (só a gestão consegue). |

Anote o que estranhar (tela, passo, o que esperava) e envie: as correções entram no mesmo código antes da migração.

## Cuidados

- **Não** use dados reais de clientes neste ambiente.
- Projeto gratuito do Supabase pausa após 7 dias sem uso: basta entrar no painel e clicar em *Restore*.
- Para recomeçar do zero: *Project Settings → General → Delete project* e repetir os passos (ou criar outro projeto).
