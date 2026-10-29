# Integração do Digital Twin fornecido

Origem: `digital-twin-g300.zip`, enviado pelo usuário. O pacote original fica em
`vendor/digital-twin-g300` para comparação. Nenhum script do pacote foi executado.

O código ativo está em `src/imported-twin`. A geometria, os componentes da máquina,
materiais da máquina, projeção/oclusão dos rótulos, fórmulas e presets what-if
foram mantidos. A peça, o ciclo de furação e a câmera da área de usinagem
foram atualizados conforme as fotos de `imgBloco` em 29/10/2026. As texturas locais estão em `public/img` e os
artefatos de conversão recebidos estão em `docs/imported-twin/reference`.

Adaptações de integração:

- `i18n.ts`: adapta as traduções e interpolação ao seletor PT/EN existente.
- `data/store.ts`: usa o relógio único de um segundo da aplicação.
- `mocks.ts`: fornece o ruído limitado que não veio no recorte enviado.
- `components/ui.tsx`: cards, cabeçalho e contexto adotam o estilo da aplicação,
  sem duplicar relógio e seletor de idioma.
- `screens/DigitalTwin.tsx`: abas de apresentação em celular, sem alterar cenários.
- Callbacks de refs compatíveis com React 19.
- Enquadramento adaptativo da câmera geral em telas estreitas, preservando os ângulos recebidos.
- `operational.css`: tokens visuais e disposição responsiva, sem rolagem no Twin.

O material de conversão documenta o processo declarado pelo pacote recebido;
esta integração não refez a conversão nem certifica dimensões de engenharia.

O modelo é uma representação visual e o modelo matemático é demonstrativo.
As classificações não constituem diagnóstico ou limites certificados do fabricante.

O script `node scripts/verify-twin-import.mjs` compara geometria gerada e presets
what-if com o pacote original. O ciclo novo é verificado separadamente em
`src/imported-twin/cycle.test.ts`, incluindo alinhamento, sequência de furos,
recuo antes de indexação e reinício com bloco sem furos.
