# Bloco de alumínio e furação

As sete fotografias fornecidas em `imgBloco/` orientam a forma e a distribuição
dos furos. A reconstrução é visual: não há desenho cotado nem tolerâncias de
fabricação. As dimensões ilustrativas são 240 × 300 × 80 mm.

- `src/imported-twin/twin/workpiece.ts`: cinco faces, 42 operações, posições,
  diâmetros e profundidades. Face principal: 18 furos; lateral direita: 4;
  verso: 10; lateral esquerda: 6; topo: 4. As coordenadas são compartilhadas
  pela geometria e pelo percurso da ferramenta, evitando trajetórias divergentes.
- `three/parts/Workpiece.tsx`: faces com aberturas circulares, paredes escalonadas
  e fundo móvel. Discos coplanares fecham os furos ainda não realizados.
  Durante o corte, as paredes e o fundo recuam até a profundidade definida.
  Alumínio metálico sem inscrições ou imagem aplicada.
- `twin/cycle.ts`: bloco novo → indexação → aproximação → furação → recuo.
  A ferramenta só muda X/Y e a mesa só gira A/B com a broca recuada.
  Após 42 furos, a peça retorna à apresentação frontal, permanece concluída
  por três segundos e é substituída por um bloco sem furos.
- `three/parts/Machining.tsx`: carro e braço seguem X/Y; o eixo telescópico
  segue Z; a broca gira em Z e seu diâmetro acompanha a operação.
  A troca de diâmetro é ilustrativa, sem simular um trocador de ferramentas.
  Cavacos e refrigerante acompanham a ponta durante o corte.

O avanço do spindle controla a duração da furação e a velocidade da mesa
controla a indexação entre faces. As fórmulas e os cenários what-if anteriores
permanecem preservados. O modelo representa furos cegos escalonados e não
reconstrói passagens hidráulicas internas não visíveis nas fotografias.

Validação: `src/imported-twin/cycle.test.ts` testa as 42 operações, normais das
faces, profundidades, recuo seguro, influência dos parâmetros e reinício.
`e2e/measurements.spec.ts` verifica progressão no WebGL, ausência da textura
antiga e enquadramento sem rolagem.
