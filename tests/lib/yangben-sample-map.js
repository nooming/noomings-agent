/**
 * Canonical map: 样本html folder layout ↔ package id.
 * Sample folder holds only: <game>.html + 图谱.html
 * chapter/meta stay under data/runtime/packages/{id}/
 */
module.exports = [
  { id: 'projectile-basic', dir: '斜抛', game: '斜抛.html', topic: '斜抛' },
  { id: 'projectile-cannon', dir: '抛体大炮', game: '抛体大炮.html', topic: '抛体大炮' },
  { id: 'friction-incline', dir: '斜面摩擦', game: '斜面摩擦.html', topic: '斜面摩擦' },
  { id: 'multi-kp', dir: '机械能', game: '机械能.html', topic: '机械能' },
  { id: 'circular-motion', dir: '圆周运动', game: '圆周运动.html', topic: '圆周运动' },
  { id: 'momentum-collision', dir: '动量碰撞', game: '动量碰撞.html', topic: '动量' },
  { id: 'pendulum-clock', dir: '钟表铺校时', game: '钟表铺校时.html', topic: '单摆秒摆' },
  { id: 'pendulum-target', dir: '单摆投靶', game: '单摆投靶.html', topic: '单摆投靶' },
  { id: 'efield-charge', dir: '电场', game: '电场.html', topic: '电场' },
  { id: 'cyclotron-radius', dir: '回旋加速器', game: '回旋加速器.html', topic: '回旋加速器' },
  { id: 'capacitor-confound-ui', dir: '电容混淆', game: '电容混淆.html', topic: '电容' },
  { id: 'series-parallel', dir: '串并联电路', game: '串并联电路.html', topic: '电路' },
  { id: 'rc-circuit', dir: 'RC电路', game: 'RC电路.html', topic: 'RC电路' },
  { id: 'magnetic-force', dir: '安培力', game: '安培力.html', topic: '安培力' },
  { id: 'transformer-turns', dir: '变压器', game: '变压器.html', topic: '变压器' },
  { id: 'capacitor-era-ch1', dir: '电容_介质与击穿', game: '电容_介质与击穿.html', topic: '电容·介质与击穿' },
  { id: 'capacitor-era-ch2', dir: '电容_串并联', game: '电容_串并联.html', topic: '电容·串并联' },
  { id: 'capacitor-era-ch4', dir: '电容_储能与充电', game: '电容_储能与充电.html', topic: '电容·储能充电' },
  { id: 'heat-conduction', dir: '热传导', game: '热传导.html', topic: '热传导' },
  { id: 'gas-ideal', dir: '理想气体', game: '理想气体.html', topic: '理想气体' },
  { id: 'thin-lens-implicit', dir: '透镜', game: '透镜.html', topic: '透镜' },
  { id: 'refraction-snell', dir: '折射', game: '折射.html', topic: '折射' },
  { id: 'photoelectric', dir: '光电效应', game: '光电效应.html', topic: '光电效应' },
  { id: 'ramp-rolling-collision', dir: '斜坡滚球', game: 'game.html', topic: '碰撞与纯滚动' },
];
