# StockFlex — site + sistema

Um único repositório e um único deploy, fora do Lovable:

| Endereço | Conteúdo | Pasta |
|---|---|---|
| `stockflex.com.py/` | Site institucional (ES/PT) | `site/` |
| `stockflex.com.py/app/` | Sistema: operação, finanças, portal do cliente | `app/` |

Os dois usam o **mesmo projeto Supabase** (banco, logins e arquivos). O formulário de contato do site grava os prospectos nesse banco, e eles aparecem em **Prospectos** no sistema.

## Publicar (Netlify)

1. Suba este repositório num GitHub privado da StockFlex.
2. Netlify → *Add new site → Import from Git* → escolha o repositório. Build e pasta já vêm do `netlify.toml` (`npm run build` → `dist`).
3. *Site configuration → Environment variables*: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (e opcional `VITE_GA_MEASUREMENT_ID`). Modelo em `.env.example`.
4. *Domain management*: adicione `stockflex.com.py` e `www.stockflex.com.py` e ajuste o DNS conforme o Netlify indicar.
5. Supabase → *Authentication → URL Configuration*: Site URL `https://stockflex.com.py/app/` e, em Redirect URLs, `https://stockflex.com.py/app/**` (e o endereço de teste, se houver).

Ambiente de teste: um segundo site no Netlify, do mesmo repositório (ramo `teste`), com as variáveis do projeto Supabase de teste e o domínio `teste.stockflex.com.py`.

## Banco

- Estrutura: `app/supabase/migrations` (em ordem) ou tudo de uma vez em `app/supabase/demo/schema-completo.sql`.
- Dados de demonstração: `app/supabase/demo/seed-demo.sql`.
- Função de gestão de usuários: `app/supabase/functions/manage-users`.
- Guia passo a passo: `docs/AMBIENTE-DE-TESTES.md`.

## Desenvolvimento local

```
npm run install:all
npm run dev:site     # http://localhost:8080/
npm run dev:app      # http://localhost:8080/app/
npm run build && npm run preview   # testa o pacote final, como no Netlify
```
