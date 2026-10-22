## Atualização: Twin importado e filtros por equipamento

O Digital Twin ativo usa o pacote digital-twin-g300.zip fornecido, com sua geometria,
ciclo de usinagem, câmeras, rótulos, raio-X e cenários preservados. Veja
[detalhes da integração](docs/imported-twin/INTEGRATION.md).

As cinco telas analíticas consultam src/analytics.ts e os perfis centralizados em
src/data.ts. G300 01 e 02 são saudáveis; G300 03 apresenta cavitação e
Desalinhamento; G300 04 é crítica; as rebarbadoras apresentam falhas distintas de
coleta, congelamento, saturação e sobrecarga. A visão consolidada mostra o pior
RMS por tipo de ativo e a disponibilidade média dos sensores desse tipo, com
identificação da máquina responsável. Eventos são somados na janela selecionada.
Os filtros reiniciam a cada navegação; trocar a máquina redefine o ativo.
Todos os sinais operacionais recebem atualização a cada segundo. As evidências
de inspeção permanecem estáveis e versionadas.

Os textos e controles foram ampliados. Telas analíticas permitem rolagem vertical.
O Twin usa a altura disponível e abas no celular para manter a interação sem
rolagem. A página usa viewport com escala inicial 1; o zoom do navegador é uma
preferência do usuário que o aplicativo não pode redefinir. Validação em zoom 100%.

Execução: docker compose up --build, aplicação em **http://localhost:8080**.

---

# IPMAN Analytics — Fase 2

Frontend industrial demonstrativo em React, TypeScript, Vite e Three.js com React Three Fiber. Nove telas integradas, dados simulados, inspeção visual com evidências e Digital Twin interativo. Sem backend, banco, coleta externa ou chamadas a APIs reais. Os únicos requests da aplicação são para seus próprios arquivos estáticos.

## Executar

Pré-requisito: Docker Engine/Desktop com Compose v2, em execução.

```sh
docker compose up
```

Abra **http://localhost:8080**. O primeiro comando instala e compila tudo na imagem; não é necessário Node no host. `docker compose down` encerra. Após alterações de código, use `docker compose up --build`. A porta pode ser alterada em `docker-compose.yml`. O Nginx serve o build estático, com healthcheck e fallback de navegação.

Alternativa para desenvolvimento (Node 22.12+ ou 24):

```sh
npm ci
npm run dev
```

Abra http://localhost:5173. Build de produção: `npm run build`; prévia: `npm run preview`.

## Telas e fidelidade

As páginas 10–14 do PDF fornecido definem exatamente a sequência **Visão geral → Qualidade dos dados → Referências → Condição dos ativos → Investigações**. A página 9 usa nomes resumidos; adotamos os rótulos completos dos próprios menus dos cinco wireframes.

Em seguida vêm a seção **Inspeção Visual**, com **Inspeção atual**, **Referência de inspeção**, **Histórico de Inspeção**, e, como última opção, **Digital Twin**, conforme o pedido. Layout claro, menu azul escuro, destaque azul, cartões, séries, mapas de condição e estados verde/âmbar/vermelho seguem os wireframes. Layout responsivo e controles por teclado.

| Tela                   | Funcionalidades                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Visão geral            | Indicadores, mapa de seis ativos, fila e tendência; drill-down para condição/investigação                         |
| Qualidade dos dados    | Disponibilidade, matriz de completude/sincronismo/clipping/congelamento e sinal                                   |
| Referências            | Série com envelope, distribuição e heatmap de features                                                            |
| Condição dos ativos    | Condição por ativo, evidências e priorização                                                                      |
| Investigações          | Linha do tempo e registro de hipótese/observação na sessão                                                        |
| Inspeção atual         | Imagem original, overlays clicáveis, esperado × detectado, qualidade física e sinalização; nova inspeção simulada |
| Referência de inspeção | Consulta por PN, validação de importação, ativação e rollback de versões                                          |
| Histórico de Inspeção  | Pesquisa por identificador/PN, filtro por resultado, evidência individual e revisão humana                        |
| Digital Twin           | Órbita, zoom, seleção de componentes, quatro câmeras, raio-X da carcaça, labels ao vivo, ciclo de cinco faces e presets por componente                 |

Filtros analíticos reiniciam ao navegar. Máquina, ativo e período consultam os perfis centralizados, alterando séries, qualidade, distribuição, heatmaps e evidências; a lista de ativos depende da máquina. Não representam medições reais. A imagem da peça foi extraída do próprio PDF (página 16); os overlays são vetores da aplicação inspirados na página 17, e não resultados reais de OCR. O cenário inicial mantém PN 265258072, v12, 8/11 conformes, duas divergências incluindo qualidade física e um campo ausente. PNs e marcações observáveis podem diferir na fotografia ilustrativa, como já ocorre no wireframe.

## Dados, estado e integração futura

`src/data.ts` é a fonte única de dados mock, organizada em `plant`, `inspection`, `references` e `simulation`. Inclui tipos e `demoRepository.inspect()`, que simula latência. Os componentes não acessam rede. Uma futura integração pode substituir o adaptador do repositório e fornecer os mesmos contratos, sem reescrever a apresentação. Séries derivadas e resultados what-if são cálculos, não novos datasets espalhados pelos componentes.

Ativação/rollback, revisão e resultados são mantidos em memória na sessão React e se perdem ao recarregar. O idioma é a única preferência salva em localStorage. O cabeçalho exibe Online e a hora atual com segundos no fuso America/Sao_Paulo. As evidências e os contadores de Inspeção Visual continuam como fotografias versionadas do slide. Os demais sinais são renovados a cada segundo. A retenção de 90 dias é apenas conceitual: não existe armazenamento de imagens nem processo de descarte.

### Importação de referências

Na tela de referências, **Enviar nova versão** aceita JSON e XLSX, até 1 MiB. O parser valida antes de ativar; versões anteriores permanecem disponíveis para rollback. PN deve ter nove dígitos; cliente e família devem ser strings, e campos devem ter identificadores únicos e valores em texto. Usos aceitos: `Identificação`, `Part Number`, `Gravação`.

JSON de exemplo em `public/reference/reference-example.json`:

```json
{
  "pns": {
    "265258072": {
      "client": "VW",
      "family": "ESP9-6",
      "fields": [
        { "id": "Field 0", "value": "ESP", "use": "Identificação" },
        { "id": "Field 1", "value": "265258072", "use": "Part Number" }
      ]
    }
  }
}
```

Para XLSX, a primeira planilha deve ter as colunas exatas `pn`, `client`, `family`, `field`, `value`, `use`, uma linha por campo. PNs numéricos são convertidos em texto, mas prefira formatá-los como texto no Excel para conservar zeros iniciais. Não executamos macros. Arquivos inválidos exibem erro e preservam a versão ativa.

## Digital Twin e img2threejs

Foi utilizado o [img2threejs](https://github.com/img2threejs/img2threejs), revisão `954cd5845e90efd045694bab725d68a9863c20e0`: ferramentas de intake, admissão da referência, busca de especificações, scaffold de avaliação/especificação, inventário por regiões e extração de evidências PBR. O img2threejs é um fluxo assistido de **reconstrução procedural em código**, não um conversor automático de pixels para malha nem fotogrametria.

O Digital Twin ativo foi substituído pelo pacote fornecido pelo usuário. A geometria
utilizável está em `src/imported-twin/three/generated/g300-geometry.json` e os
componentes R3F em `src/imported-twin/three/parts`. Os artefatos de conversão
recebidos estão em `docs/imported-twin/reference/img2threejs`, incluindo a
especificação, fábrica gerada, imagens de revisão e scripts de exportação.
O pacote original está em `vendor/digital-twin-g300` para comparação.

Mantivemos carcaça, spindle com motor, mesa e berço, magazine, bombas e agregados,
tanques, mangueiras, medição trifásica e texturas da peça. As câmeras Máquina,
Área de usinagem, Bombas e agregados e Interno complementam órbita e zoom.
No raio-X somente a carcaça fica transparente. A seleção funciona por clique nos
componentes, nos rótulos e no painel de cenários. Há mensagem de falha WebGL e
recurso de recuperação. Os assets são locais, sem APIs nem HDRIs externos.

É uma reconstrução visual aproximada, sem dimensões certificadas, não um CAD
oficial. A documentação recebida descreve a conversão anterior; não refizemos
essa conversão nesta integração. Os arquivos antigos em `docs/model` e as fábricas
`g300.*` documentam a implementação anterior, que não é mais carregada pela aplicação.

### What-if

O modelo ativo está em `src/imported-twin/twin/whatif.ts`. Oferece spindle,
mesa e três bombas com parâmetros próprios: velocidade, avanço, profundidade,
desbalanceamento, desgaste, massa, excentricidade, frequência, pressão,
desalinhamento e nível do tanque, conforme o componente.

Os presets recebidos incluem operação atual, tudo saudável, desbalanceamento,
chatter, rolamento do spindle, fixação excêntrica, cavitação, rolamento crítico,
sobrepressão e desalinhamento. As fórmulas e os presets foram mantidos. RMS,
kurtosis, crest, grandezas elétricas e condição aparecem nos cards; cores,
vibração e rótulos refletem as leituras, com histórico de 60 segundos e contribuição
dos mecanismos. O ciclo recebido de cinco faces anima indexação, aproximação,
fresamento, retorno e inclinação do berço, contando peças concluídas.

Os limiares e efeitos são demonstrativos e não devem ser usados como diagnóstico
certificado do fabricante. A integração está documentada em
[INTEGRATION.md](docs/imported-twin/INTEGRATION.md).

### Atualização a cada segundo e viewport

`src/live.tsx` centraliza um único timer de 1.000 ms, relógio e snapshots imutáveis derivados dos dados de `src/data.ts`. Disponibilidade, RMS, grandezas elétricas, séries temporais, distribuição, heatmaps, cobertura e duração operacional evoluem sem recarregar. O Twin consome o mesmo relógio por um adaptador; animações 3D usam requestAnimationFrame. O timer é descartado ao desmontar a aplicação. O cabeçalho usa a hora real; as leituras continuam sendo geradas localmente, sem conexão com equipamento físico.

Os avisos de demonstração foram retirados da interface operacional. **Inspeção Visual foi preservada**: seu arquivo, evidências, resultados, referências e interações não foram alterados pelo timer. Não se devem atualizar evidências históricas como se fossem sinais correntes.

Dashboards permitem rolagem vertical para priorizar leitura e exibir todos os painéis.
O menu lateral permanece visível em desktop a 100%, com modo compacto em janelas
baixas; em celular ele vira um menu recolhível. O Twin ocupa a altura útil sem
rolagem, com abas Máquina/Cenários what-if no celular. O zoom do navegador é
controlado pelo usuário, não pode ser redefinido por uma página web comum.

## Idiomas

Português é o padrão. O seletor **Português / English** no cabeçalho troca o idioma sem recarregar, inclusive menus, status, mensagens e conteúdo descritivo mock. Catálogos em `src/locales/pt.json` e `src/locales/en.json`, contexto em `src/i18n.tsx`. Números e datas usam `Intl` com `pt-BR`/`en-US`. Identificadores de PN, marcações reais da peça, nomes comerciais, unidades e texto livre digitado pelo usuário são mantidos como dados.

## Estrutura

```text
src/
  App.tsx                 shell, navegação e estado compartilhado
  Dashboards.tsx          cinco telas analíticas
  Inspection.tsx          inspeção, referências e histórico
  imported-twin/          Twin fornecido: geometria, ciclo, cenários e adaptadores
  analytics.ts            consulta e agregação dos filtros máquina/ativo/período
  live.tsx                clock e snapshots sincronizados a cada segundo
  operational.css         tipografia, dashboards legíveis e Twin sem rolagem
  data.ts                 contratos e dados mock por domínio
  simulation.ts           cálculos puros da simulação
  referenceImport.ts      parsing JSON/XLSX e validação
  i18n.tsx, locales/      idioma e catálogos PT/EN
  ui.tsx, styles.css      componentes, erros, gráficos e layout
e2e/                      testes de navegador
docs/reference/           páginas renderizadas do PDF fornecido
docs/model/               proveniência e artefatos img2threejs
docs/qa/                  capturas dos testes visuais
tools/img2threejs/         ferramenta upstream usada (Apache-2.0)
```

## Testes e verificação

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Vitest/Testing Library cobrem navegação, contexto de filtros, idiomas, as três telas de inspeção, filtros e revisão do histórico, consulta/rollback/validação de referência, falha de imagem e cálculos what-if (baseline, monotonicidade e limites). Playwright cobre navegação real, inspeção, inglês, evidências, 3D WebGL com Chromium/SwiftShader, controles what-if e layout móvel. O build de produção e a prévia Vite (porta 4173) são iniciados automaticamente se não estiverem ativos. Capturas em `docs/qa/`. Compilação TypeScript estrita antes do build. `npm audit` verifica dependências.

Limite do ambiente de entrega: Docker não estava instalado; o comando Compose não pôde ser executado aqui. O build estático e os testes são executados no host; não confunda essa validação com um teste do contêiner. Não é necessário serviço externo ou chave de API para executar a demonstração.
