# Validação da integração do Twin e dos filtros

Revisão final: 22/10/2026. Código atualizado diretamente neste projeto.

| Verificação | Resultado |
| --- | --- |
| TypeScript estrito + Vite build | Aprovado |
| Vitest / Testing Library | 44 testes aprovados em 9 arquivos |
| Playwright / Chromium / SwiftShader | 8 cenários aprovados no build de produção |
| Geometria recebida | JSON idêntico ao original fornecido |
| Fórmulas e presets recebidos | Resultados idênticos nos 10 presets |
| Ciclo de usinagem recebido | 3.000 passos comparados, sem alteração dos resultados |
| Filtros nas cinco telas analíticas | Máquina, ativo e período alteram dados e curvas; seleção reinicia ao navegar |
| Perfis de equipamento | Duas G300 saudáveis, falhas distintas e uma G300 crítica |
| Atualização de um segundo | Relógio e curvas atualizam sem recarga |
| Twin | Presets, seleção, câmeras, labels, raio-X e PT/EN verificados |
| Twin móvel 390 × 844 e 844 × 390 | Sem rolagem; último parâmetro visível; rótulos não cobrem o painel de cenários |
| Dashboards em desktop e celular | Fonte ampliada; rolagem vertical permitida; sem transbordamento horizontal da página |
| Menu em desktop 1440 × 900 e 1440 × 600 | Permanece visível |
| Inspeção, referências e histórico | Fluxos preservados, incluindo importação XLSX e revisão |
| Docker Compose | Não executado: Docker indisponível no host |

`src/Inspection.tsx` permanece idêntico ao arquivo anterior. SHA-256:
`9767863ca72dcc123236da1df5cd9867e13c8a094c5cb35cc321a575a2e311ee`.
Cabeçalho e tipografia compartilhados seguem as melhorias de legibilidade.

A comparação com o código fornecido pode ser repetida com
`node scripts/verify-twin-import.mjs`. O pacote original está em
`vendor/digital-twin-g300`; a integração ativa está em `src/imported-twin`.

Capturas atuais revisadas: `overview.png`, `live-0.png` a `live-4.png`,
`live-mobile.png`, `twin.png`, `twin-xray.png`, `twin-mobile-controls.png`,
`twin-landscape-controls.png`, `inspection.png`, `mobile.png`, `reference.png`.
Outras capturas e o relatório v1.1 em `docs/model` são históricos.

O zoom real do navegador não pode ser redefinido pelo site. O layout foi
verificado em escala 100%, com viewport de escala inicial 1. Não foi usado CSS
zoom para imitar essa configuração.

Os processos de teste tiveram inicializações lentas neste host Windows. A
configuração usa um worker `vmThreads`; o cenário completo de GPU dispõe de
180 segundos para renderização e descarte de recursos no WebGL por software.
As execuções finais passaram sem erros de página.
