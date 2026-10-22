# Conversão da imagem do G300 com img2threejs

Ferramenta: [img2threejs](https://github.com/img2threejs/img2threejs) 2.0.0 (perfil `generic`).
Referência principal: `csm_Header_G317_offen_e1c2837ffa.png`. Vista auxiliar para as faces que a
foto principal não mostra: `g300-iso-reference.jpg`.

O img2threejs não faz fotogrametria: ele conduz a reconstrução **por código**, em etapas com
portões de qualidade (análise da imagem → avaliação → spec validada → fábrica Three.js → revisão
visual com a referência). Os comandos abaixo foram executados a partir desta pasta com o
repositório clonado em `/tmp/img2threejs`.

## Passo a passo executado

| Etapa | Comando / arquivo | Resultado |
|---|---|---|
| Estado local | `forge/state.py init --reference csm_Header_G317_offen_e1c2837ffa.png --profile generic` | `.img2threejs/state.json` (checklist e evidências) |
| 1. Análise da imagem | protocolo `grimoire/intake/image_analysis.md` | `image-analysis.md` |
| 1b. Sondagem | `forge/stage1_intake/probe_image.py` | aprovado (707×600 px) |
| 2. Avaliação pré-spec | `forge/stage2_spec/new_pre_spec_assessment.py --complexity complex` | `assessment.json` |
| 3. Spec inicial | `forge/stage2_spec/new_sculpt_spec.py` | `object-sculpt-spec.starter.json` |
| 3b. Spec do G300 | `python3 build_spec.py` (29 componentes, 10 materiais, 4 sistemas de repetição, âncoras de animação, inventário de 12 detalhes) | `object-sculpt-spec.json` |
| 5. Validação estrita | `forge/stage2_spec/validate_sculpt_spec.py --strict-quality` | **PASS** |
| 6. Fábrica Three.js | `forge/stage3_build/generate_threejs_factory.py` | `generated/createGrobG300Model.ts` (passe de blockout) |
| 7–10. Revisão | captura no navegador, `make_comparison_sheet.py`, `append_review.py` com notas por camada e por feature | `renders/`, `reviewHistory` na spec (fidelidade 0,80, ação `continue`) |
| Exportação | `python3 export_geometry.py` | `../../src/three/generated/g300-geometry.json` |

## Como a geometria chega à aplicação

1. `object-sculpt-spec.json` descreve cada componente do G300 em metros (+Z frente do operador,
   +X lado de serviço, origem no centro do piso): tamanho, posição, material, se é carcaça
   (`xray: transparent-shell`) ou componente interno (`opaque-internal`), e as âncoras de
   movimento (rotação do spindle, avanço Z, eixo A do berço, eixo B da mesa, eixos das bombas).
2. `export_geometry.py` reduz a spec ao que o runtime usa e grava
   `src/three/generated/g300-geometry.json`.
3. `src/three/spec.ts` lê esse JSON; `src/three/parts/Housing.tsx` monta a carcaça diretamente
   dessas caixas (`<SpecBox id="..." />`) e `src/three/materials.ts` usa as cores/metalness/
   rugosidade dos materiais da spec.
4. O refinamento de forma e as partes móveis (berço e mesa, spindle com motor, bombas com
   motor, acoplamento e ventoinha, magazine, mangueiras) são o passe `refine-code` feito à mão em
   `src/three/parts/*.tsx`, seguindo as dimensões e âncoras da spec.

## Limitações declaradas

- Uma única foto não mostra a traseira nem o lado esquerdo: essas faces são chapas lisas.
- O interior do motor do spindle, o motor torque do berço e o interior das bombas não aparecem
  em nenhuma foto; são formas de engenharia genéricas, visíveis no modo Raio-X.
- Somente o passe de blockout passou pelo ciclo completo de portões do img2threejs; os passes de
  forma, material e interação foram feitos como refinamento de código e verificados por captura
  (ver `renders/turntable-sheet.png`).

## Arquivos

```
image-analysis.md              análise em camadas da referência
assessment.json                avaliação pré-spec (complexidade, contrato de qualidade)
object-sculpt-spec.starter.json spec inicial gerada pela ferramenta
build_spec.py                  autoria da spec do G300 a partir da análise
object-sculpt-spec.json        spec final validada (--strict-quality) com histórico de revisão
review-blockout.json           notas de revisão por feature
export_geometry.py             exportação para o runtime
generated/createGrobG300Model.ts  fábrica Three.js gerada pela ferramenta (referência, fora do bundle)
renders/                       capturas de revisão e folha de comparação
.img2threejs/state.json        checklist local do pipeline
```
