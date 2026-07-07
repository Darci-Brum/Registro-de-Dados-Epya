window.ferroviaDefaultData = {
  equipes: [
    {
      id: 'EQ-01',
      nome: 'Via Permanente Norte',
      frente: 'Manutenção de trilhos',
      local: 'Trecho Curitiba–Paranaguá',
      supervisor: 'Marcos Almeida',
      membros: 12,
      status: 'Em operação',
      progresso: 82
    },
    {
      id: 'EQ-02',
      nome: 'Infraestrutura Civil',
      frente: 'Drenagem e contenção',
      local: 'Serra do Mar',
      supervisor: 'Renata Siqueira',
      membros: 18,
      status: 'Alerta técnico',
      progresso: 64
    },
    {
      id: 'EQ-03',
      nome: 'Inspeção Geométrica',
      frente: 'Inspeção de via',
      local: 'Pátio Operacional Sul',
      supervisor: 'Eduardo Lima',
      membros: 7,
      status: 'Finalizado',
      progresso: 100
    },
    {
      id: 'EQ-04',
      nome: 'Máquinas Pesadas',
      frente: 'Correção mecanizada',
      local: 'Corredor Leste',
      supervisor: 'Aline Duarte',
      membros: 15,
      status: 'Em operação',
      progresso: 73
    },
    {
      id: 'EQ-05',
      nome: 'Obras de Arte Especiais',
      frente: 'Viadutos e passagens',
      local: 'Ramal Industrial',
      supervisor: 'Carlos Menezes',
      membros: 22,
      status: 'Planejado',
      progresso: 38
    }
  ],
  abastecimentos: [
    { data: '2026-07-01', veiculo: 'Caminhão Munck Volvo FMX', placa: 'FRT-2A31', equipe: 'EQ-01', litros: 176, valorLitro: 6.12, odometro: 82410 },
    { data: '2026-07-02', veiculo: 'Retroescavadeira CAT 416', placa: 'MAQ-018', equipe: 'EQ-02', litros: 212, valorLitro: 6.08, odometro: 5312 },
    { data: '2026-07-04', veiculo: 'Hilux Operacional', placa: 'SEG-7F90', equipe: 'EQ-03', litros: 78, valorLitro: 6.18, odometro: 114203 },
    { data: '2026-07-06', veiculo: 'Socadora de Lastro', placa: 'TRK-442', equipe: 'EQ-04', litros: 340, valorLitro: 5.96, odometro: 1890 },
    { data: '2026-07-08', veiculo: 'Caminhão Comboio', placa: 'CMB-4D11', equipe: 'EQ-04', litros: 255, valorLitro: 6.03, odometro: 67220 },
    { data: '2026-07-10', veiculo: 'Guindaste Rodoviário', placa: 'OAE-9B42', equipe: 'EQ-05', litros: 290, valorLitro: 6.10, odometro: 21470 },
    { data: '2026-06-03', veiculo: 'Caminhão Munck Volvo FMX', placa: 'FRT-2A31', equipe: 'EQ-01', litros: 158, valorLitro: 6.05, odometro: 81780 },
    { data: '2026-06-11', veiculo: 'Retroescavadeira CAT 416', placa: 'MAQ-018', equipe: 'EQ-02', litros: 198, valorLitro: 6.02, odometro: 5210 },
    { data: '2026-06-16', veiculo: 'Socadora de Lastro', placa: 'TRK-442', equipe: 'EQ-04', litros: 315, valorLitro: 5.98, odometro: 1812 },
    { data: '2026-05-07', veiculo: 'Caminhão Comboio', placa: 'CMB-4D11', equipe: 'EQ-04', litros: 238, valorLitro: 5.94, odometro: 66420 },
    { data: '2026-05-18', veiculo: 'Hilux Operacional', placa: 'SEG-7F90', equipe: 'EQ-03', litros: 82, valorLitro: 6.01, odometro: 112900 }
  ],
  gastos: [
    { mes: '2026-07', categoria: 'Combustível', valor: 8095.20, observacao: 'Frota de campo e máquinas' },
    { mes: '2026-07', categoria: 'Manutenção de frota', valor: 12600, observacao: 'Preventiva e peças' },
    { mes: '2026-07', categoria: 'Materiais ferroviários', valor: 28400, observacao: 'Fixações, grampos e dormentes' },
    { mes: '2026-07', categoria: 'EPIs e segurança', valor: 7350, observacao: 'Reposição para equipes' },
    { mes: '2026-07', categoria: 'Diárias e hospedagem', valor: 16320, observacao: 'Frentes em trecho remoto' },
    { mes: '2026-07', categoria: 'Máquinas e equipamentos', valor: 22180, observacao: 'Locação operacional' },
    { mes: '2026-06', categoria: 'Combustível', valor: 4930.16, observacao: 'Frota de campo e máquinas' },
    { mes: '2026-06', categoria: 'Manutenção de frota', valor: 9800, observacao: 'Correções mecânicas' },
    { mes: '2026-06', categoria: 'Materiais ferroviários', valor: 21800, observacao: 'Material de via permanente' },
    { mes: '2026-06', categoria: 'EPIs e segurança', valor: 5400, observacao: 'Treinamento e reposição' },
    { mes: '2026-06', categoria: 'Diárias e hospedagem', valor: 13240, observacao: 'Equipe Serra do Mar' },
    { mes: '2026-06', categoria: 'Máquinas e equipamentos', valor: 18750, observacao: 'Mobilização de máquinas' },
    { mes: '2026-05', categoria: 'Combustível', valor: 1907.00, observacao: 'Frota leve e comboio' },
    { mes: '2026-05', categoria: 'Manutenção de frota', valor: 7200, observacao: 'Manutenção de rotina' },
    { mes: '2026-05', categoria: 'Materiais ferroviários', valor: 19500, observacao: 'Apoio à revitalização' },
    { mes: '2026-05', categoria: 'EPIs e segurança', valor: 4300, observacao: 'Kit de campo' },
    { mes: '2026-05', categoria: 'Diárias e hospedagem', valor: 11200, observacao: 'Equipe de inspeção' },
    { mes: '2026-05', categoria: 'Máquinas e equipamentos', valor: 16600, observacao: 'Equipamentos auxiliares' }
  ]
};
