"""Exporta do object-sculpt-spec.json (img2threejs) a geometria usada em tempo de execução.

Saída: src/three/generated/g300-geometry.json, consumida por src/three/spec.ts.
Execute a partir desta pasta:  python3 export_geometry.py
"""
import json

spec = json.load(open("object-sculpt-spec.json"))
out = {
    "source": "img2threejs object-sculpt-spec.json (" + spec.get("schemaVersion", "") + ")",
    "reference": "csm_Header_G317_offen_e1c2837ffa.png",
    "units": "m",
    "frame": "+Z operator front, +X service side, +Y up, origin floor centre",
    "components": [
        {
            "id": c["id"],
            "name": c["name"],
            "parent": c["parent"],
            "primitive": c["primitive"],
            "size": [c["dimensions"]["width"], c["dimensions"]["height"], c["dimensions"]["depth"]],
            "position": c["transform"]["position"],
            "material": c["material"],
            "xray": c.get("xray"),
        }
        for c in spec["componentTree"]
    ],
    "materials": {
        m["id"]: {"color": m["baseColor"], "metalness": m["metalness"], "roughness": m["roughness"]["base"]}
        for m in spec["materials"]
    },
    "animationAnchors": spec["animationAnchors"],
}
json.dump(out, open("../../src/three/generated/g300-geometry.json", "w"), indent=1)
print("exported", len(out["components"]), "components")
