# -*- coding: utf-8 -*-
from pathlib import Path

c = Path(r"样本html/抛体大炮.html").read_text(encoding="utf-8")
f = Path(r"样本html/斜面摩擦.html").read_text(encoding="utf-8")
print("CANNON")
for s in [
    "this.playMode",
    "applyPlayMode",
    "refreshGoalUI",
    "目标已刷新",
    "maybeExploreWin",
    "rangePosts",
    "BATCH1",
]:
    print(" ", s, s in c)
i = c.find("this.state = 'READY'")
print("state snippet:", repr(c[i : i + 260]))
i2 = c.find("generateLevel()")
print("gen snippet:", repr(c[i2 : i2 + 220]))
print("FRICTION")
for s in ["respawnChallengeOrder", "__frictionApplyMode", "goalMission", "sideGoal", "let won"]:
    print(" ", s, s in f)
i = f.find("let won")
print("won snippet:", repr(f[i : i + 160]))
# show unique nearby lines around control-grid
idx = f.find("control-grid")
print("control area:", repr(f[idx - 120 : idx + 80]))
