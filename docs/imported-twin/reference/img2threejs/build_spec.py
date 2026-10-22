"""Authors object-sculpt-spec.json for the GROB G300 from the starter spec produced by
img2threejs `forge/stage2_spec/new_sculpt_spec.py`.

The component table below is the result of the image analysis in image-analysis.md
(units: meters, +Z = operator front, +X = service side, origin = floor centre).
Run from this folder:  python3 build_spec.py
"""
import copy
import json

SPEC = "object-sculpt-spec.json"
spec = json.load(open(SPEC))
template = copy.deepcopy(spec["componentTree"][0])

def rgba(hex_, a=1.0):
    h = hex_.lstrip("#")
    return f"rgba({int(h[0:2],16)}, {int(h[2:4],16)}, {int(h[4:6],16)}, {a})"

MATERIALS = {
    # id: (name, hex, secondary, metalness, roughness, class)
    "shell-white": ("Painted sheet metal, white satin", "#E7E9EA", "#D5D8DB", 0.1, 0.55, "metal"),
    "shell-grey": ("Inner panels and plinth, grey satin", "#C3C8CD", "#A9AFB5", 0.15, 0.6, "metal"),
    "grob-blue": ("Roof band, vivid blue mid value", "#1F4FA0", "#173F82", 0.2, 0.45, "metal"),
    "steel": ("Machined steel, spindle and table", "#A9AEB4", "#8C9298", 0.85, 0.3, "metal"),
    "cast-white": ("Trunnion casting, white", "#ECEDEC", "#DADCDC", 0.05, 0.5, "metal"),
    "accumulator-red": ("Bladder accumulator, red gloss", "#C42A2A", "#9E2020", 0.2, 0.35, "metal"),
    "glass": ("Window glass", "#8FA3B3", "#6F8291", 0.0, 0.05, "glass"),
    "motor-grey": ("Motor housings", "#B7BCC2", "#9AA0A6", 0.4, 0.45, "metal"),
    "hmi": ("HMI screen, emissive", "#5AA7E0", "#2D6C9C", 0.0, 0.2, "glass"),
    "rubber-black": ("Seals, handles, keypad", "#1E2226", "#33383D", 0.0, 0.7, "rubber"),
}

# id, name, level, parent, primitive, (w,h,d), (x,y,z), material, shell?, features
P = [
    ("root", "GROB G300 machining centre", "macro", None, "group", (2.4, 3.0, 3.6), (0, 0, 0), "shell-white", True, []),
    ("plinth", "Base plinth", "macro", "root", "box", (2.4, 0.12, 3.6), (0, 0.06, 0), "shell-grey", True, ["leveling-feet"]),
    ("front-column", "Front-left column with G300 lettering", "macro", "root", "box", (0.65, 2.08, 0.1), (-0.875, 1.16, 1.75), "shell-white", True, ["g300-vertical-lettering", "door-handle"]),
    ("front-lower-wall", "Work-area front sill", "meso", "root", "box", (1.35, 0.5, 0.1), (0.125, 0.37, 1.8), "shell-white", True, ["chip-chute-notch"]),
    ("front-right-pillar", "Front-right frame pillar", "meso", "root", "box", (0.4, 2.08, 0.1), (1.0, 1.16, 1.75), "shell-white", True, []),
    ("workarea-back", "Work-area rear wall", "meso", "root", "box", (1.35, 1.58, 0.06), (0.125, 1.41, 0.2), "shell-grey", True, ["spindle-port"]),
    ("workarea-left", "Work-area left wall with telescopic covers", "meso", "root", "box", (0.04, 1.58, 1.55), (-0.55, 1.41, 0.97), "shell-grey", True, []),
    ("workarea-right", "Work-area right wall", "meso", "root", "box", (0.04, 1.58, 1.55), (0.8, 1.41, 0.97), "shell-grey", True, []),
    ("workarea-ceiling", "Work-area ceiling", "meso", "root", "box", (1.35, 0.04, 1.55), (0.125, 2.2, 0.97), "shell-grey", True, []),
    ("side-wall-front", "Service side wall with windows", "macro", "root", "box", (0.06, 2.08, 2.0), (1.2, 1.16, 0.7), "shell-white", True, ["window-panes", "seam-screws"]),
    ("left-wall", "Left closed wall", "macro", "root", "box", (0.06, 2.08, 3.5), (-1.2, 1.16, -0.05), "shell-white", True, []),
    ("rear-wall", "Rear closed wall", "macro", "root", "box", (2.4, 2.08, 0.06), (0, 1.16, -1.8), "shell-white", True, []),
    ("service-bay", "Open rear service bay", "macro", "root", "box", (0.65, 2.08, 1.5), (0.88, 1.16, -1.05), "shell-grey", True, ["bay-shelf", "cable-ducts"]),
    ("roof-band", "Blue roof band with GROB badges", "macro", "root", "box", (2.4, 0.35, 3.6), (0, 2.375, 0), "grob-blue", True, ["grob-badge-front", "grob-badge-side"]),
    ("roof-cover", "Raised roof cover with louvres", "meso", "root", "box", (1.2, 0.6, 1.6), (0, 2.55, 0.2), "shell-white", True, ["vent-louvres"]),
    ("hmi-panel", "Control panel on arm", "meso", "side-wall-front", "box", (0.1, 0.6, 0.45), (1.29, 1.45, 1.22), "shell-grey", True, ["hmi-screen", "keypad-rows", "e-stop"]),
    ("coolant-pipe", "Coolant return pipe", "meso", "root", "cylinder", (0.08, 0.6, 0.08), (0.9, 0.3, 1.9), "shell-grey", True, []),
    ("spindle", "Horizontal motor spindle", "meso", "workarea-back", "cylinder", (0.22, 0.22, 0.6), (0.15, 1.3, 0.55), "steel", False, ["hsk-tool-holder", "end-mill"]),
    ("spindle-motor", "Spindle motor stator (internal)", "meso", "spindle", "cylinder", (0.32, 0.32, 0.36), (0.15, 1.3, 0.05), "motor-grey", False, ["stator-windings"]),
    ("trunnion", "Trunnion cradle (A axis)", "meso", "root", "box", (0.9, 0.42, 0.62), (0.0, 0.92, 1.2), "cast-white", False, ["bearing-blocks"]),
    ("rotary-table", "Rotary table (B axis)", "meso", "trunnion", "cylinder", (0.56, 0.06, 0.56), (0.0, 1.02, 1.2), "steel", False, ["t-slots"]),
    ("workpiece", "ABS valve block on fixture", "micro", "rotary-table", "box", (0.24, 0.3, 0.16), (0.0, 1.2, 1.2), "steel", False, ["laser-engraving"]),
    ("tool-magazine", "Tool magazine rows", "meso", "service-bay", "box", (0.12, 0.5, 1.2), (0.62, 1.75, -1.05), "steel", False, []),
    ("pump-hydraulic", "Hydraulic unit, motor + pump (Bomba 2)", "meso", "service-bay", "cylinder", (0.2, 0.62, 0.2), (0.92, 0.75, -1.4), "motor-grey", False, ["motor-fins", "fan-cover"]),
    ("pump-coolant", "Coolant pump, motor + pump (Bomba 1)", "meso", "service-bay", "cylinder", (0.18, 0.5, 0.18), (0.95, 0.55, -0.6), "motor-grey", False, ["motor-fins-coolant"]),
    ("pump-hp", "High-pressure pump, horizontal (Bomba 3)", "meso", "service-bay", "cylinder", (0.16, 0.16, 0.5), (0.92, 1.28, -1.25), "motor-grey", False, ["motor-fins-hp"]),
    ("accumulator", "Red bladder accumulator", "micro", "service-bay", "cylinder", (0.18, 0.55, 0.18), (1.0, 1.55, -0.6), "accumulator-red", False, []),
    ("hydraulic-tank", "Hydraulic oil tank", "meso", "service-bay", "box", (0.5, 0.38, 0.5), (0.9, 0.31, -1.4), "shell-grey", False, []),
    ("electrical-cabinet", "Electrical cabinet with 3-phase meter", "meso", "service-bay", "box", (0.08, 0.6, 0.5), (0.58, 0.85, -0.85), "shell-grey", False, ["breaker-row"]),
]

comps = []
for pid, name, level, parent, prim, dims, pos, mat, shell, feats in P:
    c = copy.deepcopy(template)
    sec = MATERIALS[mat][2]
    c.update({
        "id": pid, "name": name, "level": level, "parent": parent,
        "primitive": "box" if prim == "group" else prim,
        "role": "shell" if shell else "monitored-or-moving",
        "importance": 1.0 if level == "macro" else 0.7,
        "confidence": 0.75 if shell else 0.55,
        "topologyClass": "assembled-solid" if prim in ("box", "group") else "assembled-solid",
        "topologyRationale": "Sheet-metal cuboid with chamfered edges" if prim in ("box", "group") else "Rotationally symmetric machined/turned part",
        "dimensions": {"width": dims[0], "height": dims[1], "depth": dims[2], "units": "m", "confidence": 0.6},
        "transform": {"position": list(pos), "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "material": mat, "materialLayers": [mat],
        "localFeatures": [{"id": f, "description": f.replace('-', ' ')} for f in feats],
        "evidenceRefs": ["full-object"],
        "fidelityTier": "form",
        "xray": "transparent-shell" if shell else "opaque-internal",
        "colorMaterialRecipe": {
            "dominantAlbedo": rgba(MATERIALS[mat][1]),
            "secondaryAlbedo": rgba(sec),
            "materialClass": MATERIALS[mat][5],
            "materialClassConfidence": 0.8,
        },
    })
    if parent:
        c["attachment"] = {"parentSocket": parent, "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}
    comps.append(c)
spec["componentTree"] = comps

# movement pivots used by the runtime (animationAnchors)
spec["animationAnchors"] = [
    {"id": "spindle-rotation", "component": "spindle", "axis": [0, 0, 1], "kind": "rotate", "notes": "rpm from what-if parameter"},
    {"id": "spindle-z-feed", "component": "spindle", "axis": [0, 0, 1], "kind": "translate", "range": [0, 0.22]},
    {"id": "trunnion-a", "component": "trunnion", "axis": [1, 0, 0], "kind": "rotate", "range": [-1.57, 0.5]},
    {"id": "table-b", "component": "rotary-table", "axis": [0, 1, 0], "kind": "rotate", "notes": "continuous / indexing"},
    {"id": "pump-shafts", "component": "pump-hydraulic", "axis": [0, 1, 0], "kind": "rotate"},
    {"id": "magazine-chain", "component": "tool-magazine", "axis": [0, 0, 1], "kind": "translate"},
]

base = spec["materials"][0]
mats = []
for mid, (name, hx, sec, metal, rough, cls) in MATERIALS.items():
    m = {
        "id": mid, "name": name, "type": "standard",
        "shaderModel": "MeshStandardMaterial",
        "baseColor": hx, "color": hx,
        "albedo": {"dominant": hx, "secondary": [sec], "samplingNotes": "Sampled from flat-lit regions of the reference render."},
        "metalness": metal,
        "roughness": {"base": rough, "variation": 0.08},
        "localOverrides": [{"id": f"{mid}-edge-ao", "kind": "ambient-occlusion", "notes": "darken seams and bay cavities"}],
        "dirt": {"amount": 0.05, "cavityBias": 0.3},
        "textureless": {
            "declared": True,
            "evidence": [
                "Reference is a studio CG render: 3x3 zone crops of this material show uniform albedo with only lighting gradients, no grain, print or pores at 707x600.",
            ],
        },
    }
    mats.append(m)
spec["materials"] = mats

spec["repetitionSystems"] = [
    {"id": "tool-pockets", "component": "tool-magazine", "instances": 24, "pattern": "2 rows x 12, pitch 0.095 m", "buildsGeometry": True, "geometry": "cone+cylinder tool holder"},
    {"id": "way-cover-slats", "component": "workarea-left", "instances": 9, "pattern": "horizontal telescopic slats, pitch 0.15 m", "buildsGeometry": True, "geometry": "thin box"},
    {"id": "roof-louvres", "component": "roof-cover", "instances": 10, "pattern": "horizontal louvres", "buildsGeometry": True, "geometry": "thin box"},
    {"id": "motor-fins", "component": "pump-hydraulic", "instances": 16, "pattern": "radial fins", "buildsGeometry": True, "geometry": "thin box"},
]

spec["lightingFromPhoto"] = [
    {"id": "key", "type": "directional", "direction": [-0.4, -1, -0.5], "intensity": 2.2, "notes": "soft studio key from upper front-right"},
    {"id": "fill", "type": "hemisphere", "sky": "#ffffff", "ground": "#d8dde2", "intensity": 0.6},
    {"id": "rim", "type": "directional", "direction": [0.6, -0.4, 0.8], "intensity": 0.6},
    {"id": "environment", "type": "lightformer-environment", "notes": "ACES filmic tone mapping, exposure 1.0; contact shadow on the floor plane; ambient occlusion in bays"},
]

oc = spec["preSpecAssessment"]["objectClass"]
oc.update({
    "primaryType": "industrial machine tool",
    "primaryDomain": "object",
    "formLanguage": ["geometric", "chamfered cuboids", "turned cylinders"],
    "structureKind": ["enclosed cabinet", "open work area", "open service bay"],
    "motionPotential": ["spindle rotation", "linear Z feed", "trunnion tilt", "table rotation", "pump motor rotation", "tool magazine chain"],
    "materialFamilies": ["painted sheet metal", "machined steel", "cast iron", "glass", "rubber"],
})
details = [
    ("d-badge", "linework", "roof-band/grob-badge-front", "GROB badge, white letters in blue frame on front band"),
    ("d-badge-side", "linework", "roof-band/grob-badge-side", "second GROB badge on side band"),
    ("d-g300", "linework", "front-column/g300-vertical-lettering", "vertical debossed G300 lettering"),
    ("d-handle", "fastener", "front-column/door-handle", "black door handle on column"),
    ("d-louvres", "contour", "roof-cover/vent-louvres", "louvre slots on raised cover"),
    ("d-hmi", "gloss", "hmi-panel/hmi-screen", "glossy HMI screen"),
    ("d-keypad", "fastener", "hmi-panel/keypad-rows", "keypad button rows"),
    ("d-estop", "fastener", "hmi-panel/e-stop", "red emergency stop"),
    ("d-windows", "gloss", "side-wall-front/window-panes", "window glass panes on side wall"),
    ("d-screws", "fastener", "side-wall-front/seam-screws", "screw rows along sheet seams"),
    ("d-tslots", "linework", "rotary-table/t-slots", "radial T-slots on rotary table"),
    ("d-engrave", "linework", "workpiece/laser-engraving", "laser engraved fields on valve block"),
]
spec["preSpecAssessment"]["detailInventory"]["details"] = [
    {"id": i, "kind": k, "mapsTo": {"ref": r}, "description": d} for i, k, r, d in details
]

spec["featureReviewTargets"] = [
    {"id": "blue-band-badges", "name": "Blue roof band with GROB badges", "tier": "critical", "passIds": ["blockout", "material-pass"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["roof-band"], "evidenceRefs": ["full-object"]},
    {"id": "g300-column", "name": "Front column with vertical G300 lettering", "tier": "critical", "passIds": ["form-refinement"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["front-column"], "evidenceRefs": ["full-object"]},
    {"id": "open-work-area", "name": "Open work area with trunnion table and horizontal spindle", "tier": "critical", "passIds": ["structural-pass", "form-refinement"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["trunnion", "rotary-table", "spindle"], "evidenceRefs": ["full-object"]},
    {"id": "hmi-arm", "name": "HMI panel on arm at the service side", "tier": "important", "passIds": ["form-refinement"], "minimumScore": 0.7, "mustPass": False, "componentRefs": ["hmi-panel"], "evidenceRefs": ["full-object"]},
    {"id": "service-bay", "name": "Open service bay with red accumulator and pump motors", "tier": "important", "passIds": ["structural-pass"], "minimumScore": 0.7, "mustPass": False, "componentRefs": ["service-bay", "accumulator", "pump-hydraulic"], "evidenceRefs": ["full-object"]},
]
for p in spec["buildPasses"]:
    p["componentRefs"] = [c["id"] for c in comps]

json.dump(spec, open(SPEC, "w"), indent=1, ensure_ascii=False)
print("components", len(comps), "materials", len(mats))
