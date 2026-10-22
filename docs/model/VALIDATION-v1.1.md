# Validação da entrega v1.1

Verificações realizadas em 21/10/2026 no Windows, Node 24.16.0, usando o build de produção.

| Verificação | Resultado |
| --- | --- |
| TypeScript estrito + Vite build | Aprovado |
| Vitest / Testing Library | 24 testes aprovados em 6 arquivos |
| Playwright / Chromium | 8 cenários aprovados |
| Ajuste final dos gráficos com ResizeObserver | 3 cenários afetados repetidos e aprovados |
| Timer de 1 segundo e relógio America/Sao_Paulo | Atualização e cleanup verificados |
| Domínios de inspeção e referências | Preservados pelo gerador de snapshots |
| Modelo G300 | Seis unidades volumétricas e pivôs independentes |
| Raio-X | Somente materiais da carenagem transparentes; unidades internas opacas |
| What-if | Desbalanceamento, restrição hidráulica, limites numéricos e propagação de vibração verificados |
| Labels, reset da câmera e saída da tela 3D | Seis labels visíveis; sem erros de página |
| Dashboards em 1440 × 900 e 390 × 844 | Sem rolagem horizontal/vertical da página operacional |
| Twin em 390 × 844 e 844 × 390 | Painéis e botão de pausa acessíveis dentro da janela |
| Docker Compose | Não executado: Docker indisponível no host |

As três telas de Inspeção Visual mantêm seu código original. SHA-256 de `src/Inspection.tsx` antes e depois: `9767863ca72dcc123236da1df5cd9867e13c8a094c5cb35cc321a575a2e311ee`. Seu layout e sua rolagem de conteúdo foram preservados, assim como os dados/evidências e os fluxos de importação e revisão. As mudanças no cabeçalho e na navegação são compartilhadas pela aplicação.

Capturas revisadas: `live-0.png` a `live-4.png`, `live-mobile.png`, `twin.png`, `twin-xray.png`, `twin-mobile.png`, `twin-mobile-controls.png`, `twin-landscape-controls.png`, `inspection.png`, `mobile.png`, `reference.png`.

No cenário de falha do motor, o motor fica vermelho e a condição do spindle muda para âmbar por acoplamento. As bombas e a mesa conservam suas leituras independentes. O reset da câmera não remonta o canvas. A câmera enquadra o conjunto em proporções diferentes; em janelas baixas o console permite alternar o parâmetro editado.

Continuam válidos os limites da reconstrução procedural e da simulação sem calibração física, descritos em `docs/model/CONVERSION.md` e `docs/model/REFINEMENT-v1.1.md`. Não se atribuiu aprovação completa aos gates fotométricos do img2threejs.
