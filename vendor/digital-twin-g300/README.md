# Digital Twin GROB G300 (recorte do projeto IPMAN Analytics)

Este pacote contém somente o código do Digital Twin. Ele roda dentro do projeto completo
(`ipman-g300.zip`); aqui os arquivos estão nos mesmos caminhos para facilitar a cópia.

## Conteúdo

| Caminho | O que é |
|---|---|
| `src/screens/DigitalTwin.tsx` | Tela: cards do topo, viewport 3D, painel de cenários what-if, ciclo de usinagem |
| `src/twin/whatif.ts` | Modelo what-if (funções puras): vibração RMS, curtose, crest e elétrica trifásica |
| `src/twin/cycle.ts` | Máquina de estados do ciclo de usinagem na mesa giratória |
| `src/twin/store.ts` | Estado do gêmeo (zustand): parâmetros, leituras a cada 1 s, histórico de 60 s, Raio-X, câmera |
| `src/three/G300Scene.tsx` | Canvas React Three Fiber, luzes, câmeras, carregamento e falha do 3D |
| `src/three/parts/Housing.tsx` | Carcaça do G300 (transparente no Raio-X) |
| `src/three/parts/Machining.tsx` | Spindle com motor, berço e mesa giratória, peça, cavacos, refrigerante, magazine |
| `src/three/parts/Pumps.tsx` | Bombas 1, 2 e 3 (motor + bomba), tanques, acumulador, medidor trifásico, mangueiras |
| `src/three/parts/Monitored.tsx` | Cores por condição, vibração visual, anel de alerta e seleção por clique |
| `src/three/labels.ts`, `LabelsOverlay.tsx` | Rótulos ao vivo com linha-guia, sem sobreposição e com oclusão pela carcaça |
| `src/three/materials.ts`, `textures.ts`, `spec.ts` | Materiais, Raio-X, texturas (GROB, G300, IHM) e leitura da geometria gerada |
| `src/three/generated/g300-geometry.json` | Geometria exportada da conversão img2threejs |
| `src/digital-twin.css` | Estilos da tela (trecho de `styles.css`) |
| `src/i18n/*.digital-twin.json` | Textos PT e EN usados pela tela (trecho dos arquivos de tradução) |
| `src/test/twin.test.tsx`, `whatif.test.ts` | Testes da tela e dos cálculos |
| `public/img/abs-*.jpg` | Fotos da peça (slide p.16) usadas como textura |
| `reference/img2threejs/` | Artefatos e documentação da conversão da imagem |

## Dependências do restante do projeto

A tela também usa estes arquivos compartilhados, incluídos aqui:
`src/components/ui.tsx`, `src/components/ErrorBoundary.tsx`, `src/components/charts/LineChart.tsx`.

E estes, que ficam só no projeto completo:
- `src/data/store.ts` (`useApp`): relógio de 1 s que dispara a amostragem do gêmeo
- `src/i18n/index.ts` (`useFormat`) e os arquivos de tradução completos
- `src/mocks/index.ts` (`twinNoise`): ruído de medição aplicado às leituras

## Pacotes

`react`, `three`, `@react-three/fiber`, `@react-three/drei`, `zustand`, `i18next`, `react-i18next`.
