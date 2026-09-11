# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(r"c:\Users\20844\Desktop\myweb-re\agent\data\runtime\packages\magnetic-force\game.html")
t = p.read_text(encoding="utf-8")
repls = [
    ("scaleBody.position.set(5.2, 3.35, 0);", "scaleBody.position.set(4.35, 3.55, 1.0);"),
    ("dial.position.set(5.2, 3.85, 0.28);", "dial.position.set(4.35, 4.05, 1.28);"),
    ("springMesh.position.set(5.2, 2.35, 0);", "springMesh.position.set(4.35, 2.55, 1.0);"),
    ("hook.position.set(5.2, 1.72, 0);", "hook.position.set(4.35, 1.92, 1.0);"),
    ("linkMesh.position.set(4.55, 2.15, 0);", "linkMesh.position.set(3.75, 2.25, 0.5);"),
    ("scaleReadSprite.position.set(5.2, 4.55, 0.4);", "scaleReadSprite.position.set(4.35, 4.75, 1.25);"),
    ("scaleName.position.set(5.2, 1.25, 0.35);", "scaleName.position.set(4.35, 1.45, 1.2);"),
    ("linkMesh.position.set(4.55, midY, 0);", "linkMesh.position.set(3.75, midY, 0.5);"),
    ("const hookY = 1.72;", "const hookY = 1.92;"),
]
for a, b in repls:
    if a not in t:
        print("MISSING", a)
    else:
        t = t.replace(a, b, 1)
        print("OK", a[:48])
p.write_text(t, encoding="utf-8")
print("done")
