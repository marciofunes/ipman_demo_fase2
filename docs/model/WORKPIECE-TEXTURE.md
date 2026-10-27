# Textura do bloco metálico — 27/10/2026

Destino: `public/img/abs-face-metal.png`, utilizado apenas pelo Digital Twin em `Workpiece`, no arquivo `src/imported-twin/three/parts/Machining.tsx`.

Origem: `public/img/abs-face.jpg`, do Digital Twin recebido. A fotografia original e as imagens de evidência da Inspeção Visual não foram alteradas.

Método: edição com a ferramenta nativa **image_gen**, após inspeção da imagem. Remoção dos seis furos e suas bordas circulares, preenchidos com metal escovado. Inscrições conferidas visualmente: VL, VR, 908, 2BP, HR, HL, 200 614 517 BD, 269 966, 260508/1/1658, VW AG, HZ1 e HZ2. O resultado é uma textura ilustrativa do bloco sólido, não uma evidência de inspeção.

Prompt final:

> Use case: precise-object-edit. Edit target: the supplied wide photo texture of engraved silver metal. This will be used as a UV texture on a solid rectangular metal workpiece in a Three.js industrial simulation. Remove ONLY all six circular drilled holes (four large holes along the top row and the two smaller dark holes at left and right middle). Inpaint each hole and its circular metallic rim seamlessly with the surrounding flat brushed silver metal. The result must be a flat solid metal face with NO circular holes, NO dark circles, NO bumps, NO extra shapes. Preserve the original wide framing, silver/blue metal surface and all original laser-engraved text at its existing position, scale and appearance: VL, VR, 908, 2BP, HR, HL, 200 614 517 BD, 269 966, 260508/1/1658, VW AG, HZ1, HZ2. Keep inscriptions legible and unchanged; do not translate, add or remove text. Keep the same approximate 1024:365 aspect ratio, edge-to-edge texture, no margins, no new object or perspective, no watermark.

Além da textura, a geometria da peça foi reduzida ao bloco de 0,28 × 0,10 × 0,17 m. O dispositivo de fixação e a mesa giratória continuam presentes. O spindle percorre as faces do bloco, incluindo o topo quando o berço se inclina.
