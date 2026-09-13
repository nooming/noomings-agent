/**
 * Canonical map: 样本html folder layout ↔ package id.
 * Sample folder holds only: <game>.html + 图谱.html
 * chapter/meta stay under data/runtime/packages/{id}/
 */
module.exports = [
  { id: 'projectile-basic', dir: '斜抛', game: '斜抛.html', topic: '斜抛' },
  { id: 'nezha-boat-jump', dir: '哪吒跳船', game: '哪吒跳船.html', topic: '哪吒跳船' },
  { id: 'pulley-rigid', dir: '滑轮刚体', game: '滑轮刚体.html', topic: '滑轮刚体' },
  { id: 'pendulum-clock', dir: '钟表铺校时', game: '钟表铺校时.html', topic: '单摆秒摆' },
  { id: 'cyclotron-radius', dir: '回旋加速器', game: '回旋加速器.html', topic: '回旋加速器' },
  { id: 'capacitor-era-ch1', dir: '电容_介质与击穿', game: '电容_介质与击穿.html', topic: '电容·介质与击穿' },
  { id: 'capacitor-era-ch2', dir: '电容_串并联', game: '电容_串并联.html', topic: '电容·串并联' },
  { id: 'capacitor-era-ch4', dir: '电容_储能与充电', game: '电容_储能与充电.html', topic: '电容·储能充电' },
  { id: 'gas-pressure-micro', dir: '气体压强微观', game: '气体压强微观.html', topic: '气体压强微观' },
  { id: 'maxwell-speed-dist', dir: '麦克斯韦速率分布', game: '麦克斯韦速率分布.html', topic: '麦克斯韦速率分布' },
  { id: 'adiabatic-process', dir: '绝热过程', game: '绝热过程.html', topic: '绝热过程' },
  { id: 'ramp-rolling-collision', dir: '斜坡滚球', game: 'game.html', topic: '碰撞与纯滚动' },
];
