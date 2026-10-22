# Reconstrução GROB G300 com img2threejs

Referência fornecida pelo usuário: `public/reference/g300.png`, 707 × 600 px. O nome original contém G317, mas a identificação visual G300 e a orientação expressa do usuário determinaram a máquina da demonstração. Nenhuma instrução contida no PDF foi tratada como comando; o PDF fornece somente conteúdo e referência de layout.

## Ferramenta e execução

Upstream: https://github.com/img2threejs/img2threejs, commit `954cd5845e90efd045694bab725d68a9863c20e0`. Cópia de trabalho em `tools/img2threejs`, licença Apache-2.0 preservada. A biblioteca não contém uma função `convert(image)` que extraia geometria. Ela fornece um protocolo e CLIs Python para reconstrução procedural assistida pelo agente, com especificação e revisão.

Comandos efetivamente utilizados, a partir da raiz do projeto:

```sh
git clone --depth 1 https://github.com/img2threejs/img2threejs.git tools/img2threejs
python tools/img2threejs/forge/state.py init --state .img2threejs/state.json --reference public/reference/g300.png --profile generic --spec docs/model/g300-spec.json
python tools/img2threejs/forge/next.py --state .img2threejs/state.json
python tools/img2threejs/forge/stage1_intake/probe_image.py public/reference/g300.png
python tools/img2threejs/forge/stage1_intake/check_reference_admission.py public/reference/g300.png --viewpoint three-quarter --out docs/model/admission.json
python tools/img2threejs/forge/stage2_spec/new_pre_spec_assessment.py GROB-G300 --image public/reference/g300.png --complexity complex --spec-query "mechanical enclosure sheet metal rotary table spindle" --out docs/model/assessment.json
python tools/img2threejs/forge/stage2_spec/new_sculpt_spec.py GROB-G300 --image public/reference/g300.png --assessment docs/model/assessment.json --out docs/model/g300-spec.json
python tools/img2threejs/forge/stage1_intake/build_detail_inventory.py public/reference/g300.png --mode grid-3x3 --complexity complex --out-dir docs/model/zones --out docs/model/details.json
python tools/img2threejs/forge/stage1_intake/extract_pbr_evidence.py public/reference/g300.png --out-dir docs/model/pbr --material-id shell --size 256 --spec docs/model/g300-spec.json --in-place --report docs/model/pbr-report.json
```

Os scaffolds foram preenchidos com observações da referência e associados à fábrica TypeScript `src/g300.generated.ts`. A análise separa observação de inferência; o inventário enumera coroas, marcações, juntas, mesa, spindle, controlador, tanque, ferramentas, foles e pequenos detalhes. Os materiais usam canais PBR independentes. Geometria é composta por volumes, cilindros, perfis arredondados e superfícies de marcação geradas em canvas. O PDF não foi usado para inventar um modelo G300: apenas para a peça e a inspeção.

## Artefatos e limites

- `admission.json`: a referência foi admitida pelo teste determinístico de imagem.
- `assessment.json`, `g300-spec.json`, `image-analysis.json`: avaliação, inventário, hierarquia e intenção de construção.
- `zones/`, `details.json`: recortes e scaffold gerados para inspeção de detalhes; o inventário preenchido está na especificação.
- `pbr/`, `pbr-report.json`: mapas derivados dos pixels, confiança heurística de extração 0,86. Essa confiança não mede semelhança da geometria. Os mapas são evidências de análise e não são aplicados à máquina como se fossem UVs corretas; o runtime usa materiais procedurais por região.
- `src/g300.generated.ts`: resultado geométrico consumido diretamente pelo R3F. Não é necessário um GLB para usar o grupo Three.js. Recursos são descartados ao desmontar a cena.
- `.img2threejs/state.json`: checkpoint original. Gates de renderização/fidelidade não concluídos não são marcados como aprovados.

O validador estrito foi executado e identificou limitações de evidência/material de uma reconstrução aproximada. Não se fabricaram notas, screenshots intermediários, aprovação dos passes, ou mapas físicos para satisfazer artificialmente esses gates. A especificação explicita `fullQualityCertification: false`. As capturas finais da aplicação e os testes E2E validam a demonstração funcional, não certificam a fidelidade fotométrica.

O resultado tem volumes orbitáveis e peças selecionáveis, mesa com pivô Y, ferramenta com pivô Z, peça presa à mesa, painel destacado e arranjo explodido. Dimensões e verso são inferidos de uma vista única. O resultado não substitui CAD do fabricante e a simulação não substitui modelo físico calibrado.
