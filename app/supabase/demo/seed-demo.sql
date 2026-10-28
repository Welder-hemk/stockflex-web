-- =====================================================================
-- DADOS DE DEMONSTRAÇÃO — só para o ambiente de TESTES (nunca em produção)
-- Antes de rodar: crie no painel do Supabase (Authentication > Users > Add user,
-- marcando "Auto Confirm User") estes 4 usuários, com a senha que quiser:
--   admin@stockflex.com.py · operador@stockflex.com.py · finanzas@stockflex.com.py · compras@techpar.com.py
-- Depois cole este arquivo inteiro no SQL Editor e execute.
-- =====================================================================
do $$ begin
  if (select count(*) from auth.users where email in ('admin@stockflex.com.py','operador@stockflex.com.py','finanzas@stockflex.com.py','compras@techpar.com.py')) < 4 then
    raise exception 'Crie primeiro os 4 usuários em Authentication > Users';
  end if;
  if exists (select 1 from clients where razao_social = 'TechPar Importaciones S.A.') then
    raise exception 'Os dados de demonstração já foram carregados';
  end if;
end $$;
create temp table demo_ids as select email, id from auth.users where email in ('admin@stockflex.com.py','operador@stockflex.com.py','finanzas@stockflex.com.py','compras@techpar.com.py');
insert into user_roles(user_id, role) select id, (case email when 'admin@stockflex.com.py' then 'admin' when 'operador@stockflex.com.py' then 'operador' when 'finanzas@stockflex.com.py' then 'financeiro' else 'cliente' end)::app_role from demo_ids
  on conflict do nothing;
update profiles p set nome = case d.email when 'admin@stockflex.com.py' then 'Ana Admin' when 'operador@stockflex.com.py' then 'Pedro Operador' when 'finanzas@stockflex.com.py' then 'Laura Finanzas' else 'Carlos Benítez' end
  from demo_ids d where p.id = d.id;
grant select on demo_ids to authenticated;

insert into clients(id,codigo,razao_social,nome_fantasia,ruc_cnpj,contato,email,telefone,endereco,categoria_mercadoria) values
 ('11111111-1111-1111-1111-111111111111','','TechPar Importaciones S.A.','TechPar','80045123-4','Carlos Benítez','compras@techpar.com.py','595981222333','Av. San Blas km 4, Ciudad del Este','Electrónicos'),
 ('22222222-2222-2222-2222-222222222222','','Agro Sur Paraguay S.R.L.','Agro Sur','80077888-1','María Duarte','admin@agrosur.com.py','595983444555','Ruta 7 km 12, Minga Guazú','Insumos agrícolas'),
 ('33333333-3333-3333-3333-333333333333','','Moda CDE E.A.S.','Moda CDE','80099111-0','Julio Rojas','julio@modacde.com.py','595975666777','Microcentro, Ciudad del Este','Textiles');
update profiles set cliente_id='11111111-1111-1111-1111-111111111111' where id=(select id from demo_ids where email='compras@techpar.com.py');

insert into contracts(id,cliente_id,numero,data_inicio,data_termino,status,posicoes_contratadas,preco_por_posicao,preco_mov_extra,percentual_seguro,dia_vencimento,recargo_por_posicao,recargo_descricao) values
 ('aaaaaaaa-1111-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','','2026-07-01','2027-06-30','ativo',12,8,4,0.03,10,0,''),
 ('aaaaaaaa-2222-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','','2026-08-15','2027-02-14','ativo',90,7.5,4,0.03,10,0.5,'Recargo por plazo 6–11 meses'),
 ('aaaaaaaa-3333-0000-0000-000000000003','33333333-3333-3333-3333-333333333333','','2026-09-10','2027-01-09','ativo',6,8,4,0.03,15,2,'Recargo por plazo 3–5 meses y menos de 10 posiciones');

-- Segundo depósito (planta distinta: 2 calles drive-in de 3 niveles)
set role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from demo_ids where email='admin@stockflex.com.py'),false);
insert into warehouses(code,name,city,address) values ('LUQ1','Depósito Luque','Luque','Ruta 3, km 18');
select generate_positions((select id from warehouses where code='LUQ1'),'A',8,3,1,'drive-in',1500,1,'free');
select generate_positions((select id from warehouses where code='LUQ1'),'B',6,3,1,'drive-in',1500,1,'free');

-- Ingresos (via la función real), luego se fechan hacia atrás para tener historia
create temp table plan(cli uuid, ct uuid, n int, descr text, peso numeric, valor numeric, d date, wh text);
insert into plan values
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-1111-0000-0000-000000000001',10,'Notebooks y monitores',380,18000,'2026-07-03','CDE1'),
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-1111-0000-0000-000000000001',4,'Celulares (cajas máster)',220,25000,'2026-09-22','CDE1'),
 ('22222222-2222-2222-2222-222222222222','aaaaaaaa-2222-0000-0000-000000000002',70,'Fertilizante NPK 25 kg',820,1400,'2026-08-16','CDE1'),
 ('22222222-2222-2222-2222-222222222222','aaaaaaaa-2222-0000-0000-000000000002',12,'Semillas de soja',900,2600,'2026-09-05','LUQ1'),
 ('33333333-3333-3333-3333-333333333333','aaaaaaaa-3333-0000-0000-000000000003',7,'Ropa de temporada',260,3500,'2026-09-12','CDE1');
do $$
declare r record; i int; pos text; res jsonb; k int := 0;
begin
  for r in select * from plan loop
    for i in 1..r.n loop
      select p.id into pos from warehouse_positions p join warehouses w on w.id=p.warehouse_id
        where w.code=r.wh and p.status='free' and p.capacidade_kg >= r.peso + 40 order by p.rua, p.bloco, p.nivel, p.posicao limit 1;
      res := register_pallet_entry(r.cli, r.ct, '', r.descr, 'L' || to_char(r.d,'MMDD'), 40, r.peso + (i % 5) * 7, r.valor, p_seguro => true, p_position_id => pos, p_operador => 'Pedro Operador', p_operador_id => (select id::text from demo_ids where email='operador@stockflex.com.py'), p_largo => 120, p_ancho => 100, p_alto => 150);
      update pallets set data_entrada = r.d where id = (res->>'pallet_id')::uuid;
      update movements set data_hora = (r.d + time '09:00' + (i || ' minutes')::interval) at time zone 'America/Asuncion' where id = (res->>'movement_id')::uuid;
    end loop;
  end loop;
end $$;

-- Movimientos de septiembre: transferencias y salidas
do $$
declare p record; res jsonb;
begin
  -- 3 transferencias de un pallet TechPar (2 extra en septiembre)
  select * into p from pallets where cliente_id='11111111-1111-1111-1111-111111111111' order by sku limit 1;
  for i in 1..2 loop
    res := transfer_pallet(p.id, (select id from warehouse_positions where status='free' and warehouse_id=(select id from warehouses where code='CDE1') order by id limit 1), null, 'Reubicación', 'Pedro Operador', (select id::text from demo_ids where email='operador@stockflex.com.py'));
    update movements set data_hora = timestamptz '2026-09-10 15:00-03' + (i || ' days')::interval where id = (res->>'movement_id')::uuid;
  end loop;
  -- 8 salidas de Agro Sur en septiembre
  for p in select * from pallets where cliente_id='22222222-2222-2222-2222-222222222222' and status='armazenado' order by sku limit 8 loop
    res := execute_pallet_exit(p.id, 'Retiro del cliente', null, 'Pedro Operador', (select id::text from demo_ids where email='operador@stockflex.com.py'), p.peso, 'Exterior');
    update movements set data_hora = timestamptz '2026-09-25 10:00-03' where id = (res->>'movement_id')::uuid;
  end loop;
  -- 3 salidas de Agro Sur en octubre
  for p in select * from pallets where cliente_id='22222222-2222-2222-2222-222222222222' and status='armazenado' order by sku limit 3 loop
    res := execute_pallet_exit(p.id, 'Retiro del cliente', null, 'Pedro Operador', (select id::text from demo_ids where email='operador@stockflex.com.py'), p.peso, 'Exterior');
    update movements set data_hora = timestamptz '2026-10-08 10:00-03' where id = (res->>'movement_id')::uuid;
  end loop;
end $$;

insert into authorized_contacts(cliente_id,nome,cargo,documento,tipo_documento,telefone,email,ativo) values
 ('11111111-1111-1111-1111-111111111111','Ramón Giménez','Chofer','4123456','CI','595981000111','',true),
 ('22222222-2222-2222-2222-222222222222','Lucía Ortiz','Encargada de logística','3987654','CI','595983000222','lucia@agrosur.com.py',true);
insert into authorized_contacts(cliente_id,nome,cargo,documento,tipo_documento,telefone,ativo,solicitado_por_cliente,observacoes) values
 ('11111111-1111-1111-1111-111111111111','Diego Fernández','Repartidor','5011223','CI','595984111222',false,true,'Solicitado por el cliente desde el portal');

insert into extra_costs(cliente_id,contrato_id,competencia,categoria,descricao,quantidade,valor_unitario,valor_total,status_aprovacao,origem) values
 ('22222222-2222-2222-2222-222222222222','aaaaaaaa-2222-0000-0000-000000000002','2026-09','mao_de_obra','Repaletizado de 6 pallets',6,5,30,'aprovado','admin'),
 ('33333333-3333-3333-3333-333333333333','aaaaaaaa-3333-0000-0000-000000000003','2026-10','embalagem','Film stretch adicional',1,0,0,'pendente','operador');

-- Solicitudes de clientes
select set_config('request.jwt.claim.sub',(select id::text from demo_ids where email='compras@techpar.com.py'),false);
insert into client_requests(cliente_id,tipo,pallet_ids,horario_estimado,data_estimada,margem_tempo,quantidade,status,observacoes)
 values ('11111111-1111-1111-1111-111111111111','coleta', array(select id from pallets where cliente_id='11111111-1111-1111-1111-111111111111' and status='armazenado' order by sku desc limit 2), '10:30', '2026-10-19', 60, 2, 'pendente', 'Retira Ramón en camioneta');
reset role;
insert into client_requests(cliente_id,tipo,pallet_ids,horario_estimado,data_estimada,margem_tempo,quantidade,status)
 values ('22222222-2222-2222-2222-222222222222','ingreso', '{}', '08:00', '2026-10-20', 120, 15, 'pendente');

-- Facturación: septiembre emitida y pagada en parte; octubre emitida; Moda con atraso
set role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from demo_ids where email='finanzas@stockflex.com.py'),false);
select billing_generate_drafts('2026-08');
select billing_issue(array(select id from billing_invoices where periodo='2026-08'));
select billing_generate_drafts('2026-09');
select billing_issue(array(select id from billing_invoices where periodo='2026-09'));
select billing_generate_drafts('2026-10');
select billing_issue(array(select i.id from billing_invoices i join contracts c on c.id=i.contrato_id where periodo='2026-10' and c.cliente_id <> '33333333-3333-3333-3333-333333333333'));
reset role;
-- fechas reales de emisión/vencimiento
select set_config('sf.billing_rpc','on',false);
update billing_invoices set fecha_emision = to_date(periodo||'-01','YYYY-MM-DD') + 1,
  fecha_vencimiento = to_date(periodo||'-01','YYYY-MM-DD') + (select dia_vencimento - 1 from contracts where id = contrato_id)
  where status='emitida' and kind='factura';
select set_config('sf.billing_rpc','off',false);
set role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from demo_ids where email='finanzas@stockflex.com.py'),false);
select billing_set_fiscal(id, '001-001-00001' || lpad(row_number() over (order by numero)::text, 2, '0'), '') from billing_invoices where periodo in ('2026-08','2026-09') and status='emitida';
select billing_register_payment('11111111-1111-1111-1111-111111111111', '2026-09-08', 96, 'transferencia', 'ITAU-77812');
select billing_register_payment('11111111-1111-1111-1111-111111111111', '2026-10-09', 96, 'transferencia', 'ITAU-80233');
select billing_register_payment('22222222-2222-2222-2222-222222222222', '2026-09-09', 400, 'transferencia', 'CONT-5541');
select billing_register_payment('22222222-2222-2222-2222-222222222222', '2026-10-10', 300, 'deposito', 'CONT-6012');
reset role;
-- Agentes, comisiones y datos de la empresa para el contrato (reemplace por los datos reales)
insert into agents(id,nombre,documento,telefono,email,cuenta_pago) values
 ('cccccccc-0000-0000-0000-000000000001','Roberto Giménez','4.567.890','595981555111','roberto@correo.com','Banco Itaú · cta 123456'),
 ('cccccccc-0000-0000-0000-000000000002','Logística Este (corredor)','80012345-6','595973222444','info@logeste.com.py','Ueno · alias LOGESTE');
update clients set agente_id='cccccccc-0000-0000-0000-000000000001' where id in ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333');
insert into app_settings(key,value) values
 ('empresa_razon_social','StockFlex S.A. (demo)'),('empresa_ruc','80000000-0'),('empresa_domicilio','Ciudad del Este'),
 ('empresa_representante','Representante Demo'),('empresa_representante_ci','1.000.000'),('empresa_email','contacto@stockflex.com.py'),
 ('contrato_ciudad','Ciudad del Este'),('contrato_jurisdiccion','los Juzgados y Tribunales de Ciudad del Este, Alto Paraná'),('contrato_mora_pct','1')
on conflict (key) do update set value=excluded.value;
-- Gastos de demostración (jul–oct 2026) e inversiones iniciales
insert into expenses(competencia,categoria,descricao,valor,moeda,valor_usd,cambio_dia,data_vencimento,status)
select per, cat::expense_category, descr, val, moeda, usd, cambio, (per || '-10')::date, 'pago'
from (values ('alquiler','Alquiler del barracón',2000::numeric,'USD',2000::numeric,null::numeric),
             ('salarios','Operador de depósito',400,'USD',400,null),
             ('servicios','Monitoreo de cámaras',150000,'PYG',20.55,7300),
             ('servicios','Energía e internet',120,'USD',120,null),
             ('combustible','Gas de la apiladora',35,'USD',35,null)) g(cat,descr,val,moeda,usd,cambio)
cross join (values ('2026-07'),('2026-08'),('2026-09'),('2026-10')) m(per);
insert into expenses(competencia,categoria,descricao,valor,moeda,valor_usd,cambio_dia,data_vencimento,status) values
 ('2026-07','inversion','Apiladora eléctrica',14000,'USD',14000,null,'2026-07-05','pago'),
 ('2026-07','inversion','Sistema de seguridad (cámaras y alarma)',5000000,'PYG',684.93,7300,'2026-07-05','pago');
-- Escenario base del simulador
insert into projection_scenarios(nombre,inicio,es_base,notas,params) values
 ('Plan 2026 – 1 barracón','2026-07',true,'Escenario de partida (demo)',
  '{"nBarr":1,"interv":12,"posEst":780,"posPiso":76,"preco":7,"extra":0,"iva":10,"occIni":20,"occAlvo":85,"rampa":12,"custoPos":25,"estCaixa":false,"apil":14000,"segInv":5000000,"outroInv":0,"giro":2,"aluguel":2000,"salario":400,"pessoas":1,"monit":150000,"outros":150,"varPos":0,"cambio":7300,"ire":10,"depEst":15,"depApil":5,"depEq":5,"tma":12,"horiz":60}');
select 'seed ok', (select count(*) from pallets), (select count(*) from billing_invoices), (select count(*) from billing_payments);
