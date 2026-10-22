# img2threejs | Image analysis: GROB G300 (csm_Header_G317_offen_e1c2837ffa.png)

Protocol: `grimoire/intake/image_analysis.md` (img2threejs 2.0.0). Secondary view used for hidden
faces: `g300-iso-reference.jpg` (same machine, higher isometric view, roof and long side visible).
Units below are meters in object space. +Z = operator front (G300 lettering face), +X = long
service side (control panel face), +Y = up.

## Layer 1. Identification
- Work type: 5-axis horizontal machining centre (universal machining centre, swivel/rotary table).
- Broad class: industrial machine tool, enclosed cabinet with exposed service bays.
- primaryDomain: object. Confidence 0.92 (lettering "G300" and "GROB" readable).

## Layer 2. Overall form and silhouette
- Bounding volume: cuboid ~2.4 (X) × 2.65 (Y) × 3.6 (Z) plus a raised roof block (spindle drive and
  chiller cover) to Y≈3.0 and a control panel cantilevered +0.25 out of the +X face.
- Symmetry: asymmetric. Shape language: geometric, chamfered cuboids, few cylinders.

## Layer 3. Macro → meso → micro
- Macro: base plinth; front-left G300 column panel; work-area enclosure (open); right frame pillar;
  long side wall with door + windows; rear service bay (open); blue roof band; raised roof cover;
  control panel on swivel arm; coolant return pipe.
- Meso (work area): horizontal motor spindle out of the rear wall of the work area (axis ∥ Z);
  trunnion cradle (A axis, white cast housing) carrying a round rotary table (B axis, grey T-slot
  plate); telescopic way covers (horizontal slats) on the inner left wall; chip chute.
- Meso (service bay): hydraulic power unit (tank + vertical flanged motor + gear pump), red
  bladder accumulator (vertical cylinder), coolant / high-pressure pumps with vertical motors,
  valve manifold, cable ducts, tool magazine rows (stacked tool-holder pockets).
- Micro: GROB badge (white letters in blue frame), vertical "G300" debossed lettering, door
  handles, screw rows on sheet-metal seams, vent louvres on roof cover, panel window glass,
  emergency stop button, keypad rows on the HMI.

## Layer 4. Spatial relationships
- <spindle, emerges-from, work-area rear wall> butt; <rotary table, embedded-in, trunnion cradle>;
  <trunnion cradle, attached-to, work-area floor> via side bearing blocks.
- <control panel, attached-to, +X face> via L-shaped arm, hangs at Y 1.15–1.75.
- <blue band, flush-with, top edge of every wall>, overlap on corners.
- <hydraulic motor, above, pump, above, tank> stacked; <accumulator, beside, valve manifold>.

## Layer 5. Materials (PBR)
| id | surface | albedo | metalness | roughness |
|---|---|---|---|---|
| shell-white | painted sheet metal | #E7E9EA | 0.1 | 0.55 |
| shell-grey | inner panels, plinth | #C9CDD1 | 0.15 | 0.6 |
| grob-blue | roof band | #1F4FA0 | 0.2 | 0.45 |
| steel | spindle nose, table plate | #A9AEB4 | 0.85 | 0.3 |
| cast-white | trunnion cradle | #ECEDEC | 0.05 | 0.5 |
| accumulator-red | bladder accumulator | #C42A2A | 0.2 | 0.35 |
| glass | windows | #8FA3B3 | 0 | 0.05, transmission 0.6 |
| hmi | screen | emissive #5AA7E0 | 0 | 0.2 |
| motor-grey | pump motors | #B7BCC2 | 0.4 | 0.45 |

## Layer 6. Colour and finish
White/grey satin dominant (value high, saturation ~0), single saturated accent (blue, mid value),
one red accent (accumulator). No gradients beyond ambient occlusion in the bays.

## Identity-defining features (must be correct to pass review)
1. Blue roof band with GROB badge on front and side.
2. Vertical "G300" lettering on the front-left column.
3. Open work area showing the white trunnion cradle with round table and the horizontal spindle.
4. HMI panel on an arm on the long side.
5. Open rear service bay with red accumulator, pump motors and tool magazine.

## Hidden by the single view (stated, not faked)
Rear (−Z) and left (−X) faces are not visible; built as closed sheet-metal walls. Internal motor
spindle stator, pump impellers and table drive are not visible in any photo; they are modelled as
generic engineering forms for the X-ray view and labelled as such in the spec.
