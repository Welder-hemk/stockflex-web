# Comissões de agentes (CAC) e contrato do cliente — 17/10/2026

## Comissão de agentes
- Regra: 1 mês de aluguel das posições contratadas em contrato de 12 meses; contratos menores pagam proporcional (posições × preço/posição × meses/12). Contratos com mais de 12 meses também pagam no máximo 12/12.
- Somente o primeiro contrato do cliente gera comissão; renovações não geram.
- Base: preço por posição do contrato, sem recargos (premissa — confirmar).
- Status: "Esperando 1.º pagamento" → "Lista para pagar" quando a primeira fatura daquele contrato é paga → "Paga". Pode pagar antes com "Pagar igualmente" + motivo. "Anular" exige motivo.
- Ao pagar, cria automaticamente um gasto categoria "Comisión de captación (CAC)" no mês do pagamento → entra nos gastos recorrentes e no resultado.
- Sem estorno se o cliente sair antes (premissa — confirmar).
- Agente é vinculado no cadastro do cliente (campo visível só para admin/finanças) ou pela página "Agentes y comisiones" › "Cliente indicado".
- Página /comisiones: KPIs (para pagar, previstas, CAC pago no ano, CAC médio por cliente novo), abas Comissões, Agentes, CAC por mês.

## Contrato do cliente
- Modelo editável em "Modelo de contrato" (só admin): texto com campos automáticos {{...}} + dados da empresa (razão social, RUC, representante, jurisdição, juros de mora). Cada gravação cria uma versão nova.
- Por contrato (Clientes › Contratos › ícone de documento): condições particulares editáveis, pré-visualização, imprimir rascunho, "Emitir para firma" (congela o texto), "Validar firma" (exige cópia assinada anexada), anexos com exclusão só pela gestão.
- Estados: Borrador → Para firma → Aceptado (aceite eletrônico no portal com nome + C.I., data e usuário) → Firmado (gestão validou a cópia assinada).
- Portal do cliente, aba "Contrato": ver/imprimir, aceitar, anexar contrato assinado ou anexo. O cliente vê os arquivos mas não edita nem apaga (bloqueado no banco, testado via API).
- Contrato já firmado não é reemitido: mudanças via adenda (anexo tipo "Adenda").

## Teste local (E2E) — OK
- Emissão, aceite com validação de nome/C.I., upload pelo cliente, tentativa de DELETE/PATCH via API pelo cliente (0 linhas), validação da firma pela gestão, comissões 96 (TechPar 12×8) e 16 (Moda 6×8×4/12).

## Migrações novas
- 20261017140000_comisiones_contratos.sql, 20261017150000_mapa_pasillos.sql (campo "Pasillos" do depósito para desenhar corredores na planta).

## Pendente de decisão
- Texto definitivo do contrato (revisão jurídica).
- Comissão incide sobre recargos? Estorno se o cliente sair cedo?
