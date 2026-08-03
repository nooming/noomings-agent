# CV 观感抽检报告

生成时间：2026-08-03  
规范：`docs/advisor/sample-spec.md` §4.1（中性标签、CV 不进 win、揭示后置）

| 包名 | CV | 结论 | 一句话 |
|------|-----|------|--------|
| refraction-snell | s-water-temp 水温 | ok | 已按水色/气泡观感，界面不抬、不造第二液面；勿回退 |
| circular-motion | s-base-tilt 底座倾角 | fixed | 原仅改读数无舞台反馈；现底座倾斜+φ 标注，不进 v/F |
| efield-charge | s-plate-gap 极板间距 | fixed | 原微移极板像改场区；现极板固定，垫块厚度随 gap 变 |
| cyclotron-radius | s-chamber-p 腔室气压 | fixed | 原仅侧栏数字；现舱内雾气/气泡随气压 |
| magnetic-force | s-wire-temp 导线温度 | fixed | 原仅侧栏数字；现导线色温/光晕随 T |
| series-parallel | s-meter-r 仪表内阻 | fixed | 原仅数字；现表内分流条宽度随 rg，不进 I |
| transformer-turns | s-winding-temp 绕组温度 | fixed | 原仅数字；现绕组暖色晕+标注 |
| momentum-collision | s-rail-temp 导轨温度 | fixed | 原仅数字；现导轨色温雾气 |
| thin-lens-implicit | s-aperture 透镜口径 | ok | 透镜高度随 D 变化，不进成像公式 |
| projectile-basic | s-mass 质量 | ok | 弹丸外观可辨，不进落点 |
| pendulum-clock | s-mass 质量 | ok | 摆锤质量外观，周期公式不含 m |
| pendulum-target | s-mass 质量 | ok | 同单摆质量 CV |
| friction-incline | s-mass 质量 | ok | 质量外观；摩擦/角为 AV |
| multi-kp | s-mass 质量 | ok | 小车质量外观 |
| capacitor-confound-ui | s-plate-mass 极板质量 | ok | 质量观感已有；不进 C |
| capacitor-era-ch1 | s-thickness 厚度 / audio-volume | defer | 厚度主要改侧栏读数；舞台厚度映射成本高，试点外 |
| capacitor-era-ch2/ch4 | audio-volume | ok | 音量类旁路，非假几何 |
| photoelectric | （按钮类 I1） | ok | 无几何滑条 CV |
| gas-ideal / heat-conduction / rc-circuit | 无独立几何 CV 或 U 仅幅度 | ok/defer | rc 的 U 改曲线幅度属合理观感；无假液面类问题 |
| projectile-cannon | in-mass / in-material | defer | 弹种材质混淆已有爆炸色；未深改 |
| capacitor-confound 等 HTML 注释含「混淆」字样 | — | defer | 多为 teach_only HTML 注释，学生侧栏无剧透标签 |

## 同步

已同步到 `样本html/`：圆周运动、电场、回旋加速器、安培力、串并联电路、透镜、斜抛、钟表铺校时、RC电路、变压器、动量碰撞。
