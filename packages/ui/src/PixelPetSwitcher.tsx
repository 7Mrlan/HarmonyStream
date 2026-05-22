/*
 * 组件：PixelPetSwitcher
 * 作用：右下角像素小宠物，点击切换 LLM 模型；当前模型对应一只独立宠物
 * 形象：16×16 像素绘制，每只 4 帧（idleA / idleB / blink / happy）
 * 互动：
 *   - 漂浮：sine 上下浮动 ±3px / 2.4s
 *   - 摇摆：±2° 缓慢摇头（rotate），节奏比漂浮慢
 *   - idle 帧切换：每 600ms 切一次（A↔B），形成"摆尾 / 摆头 / 吐泡"
 *   - 眨眼：随机 3-6s 一次，180ms
 *   - 点击：pop 动画 + 切换 happy 帧 600ms + 4 颗火花粒子向上扩散
 *   - 长按：弹出招呼气泡（性格化文案）
 *
 * 调色板：b=主色 / h=高光 / s=阴影 / k=黑（眼/描边） / w=白（眼神光/嘴/反光） / _=透明
 */

import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View, Animated, Easing } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

export type PetAction = 'prev' | 'playPause' | 'next' | 'stop' | 'like' | 'hide' | 'fav' | 'volume';

/* 单只宠物的元信息 */
export interface PetMeta {
  id: string;
  displayName: string;
  /* 主色 */
  color: string;
  /* 高光色（眼神 / 反光），未传则自动调淡 */
  highlight?: string;
  /* 阴影色（腹部 / 暗面） */
  shadow?: string;
  /* 长按时显示的"招呼语"，体现宠物性格 */
  greeting: string;
}

/* 默认 3 只宠物配置（v1 锁定，Kimi 月兔 v2 加入） */
export const DEFAULT_PETS: PetMeta[] = [
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    /* 钢蓝主色，铠甲感 */
    color: '#2563eb',
    /* 金色护甲高光 */
    highlight: '#fbbf24',
    /* 深蓝阴影 */
    shadow: '#1e3a8a',
    greeting: '深海铠甲，已就绪。',
  },
  {
    id: 'qwen',
    displayName: '通义千问',
    color: '#f5f5f5',
    /* 粉色腮红替代纯白高光 */
    highlight: '#fca5a5',
    shadow: '#9ca3af',
    greeting: '欸今天放点啥？',
  },
  {
    id: 'glm',
    displayName: '智谱',
    color: '#f97316',
    highlight: '#fed7aa',
    shadow: '#9a3412',
    greeting: '让我闻闻你的口味~',
  },
];

export interface PixelPetSwitcherProps {
  pets?: PetMeta[];
  currentId?: string;
  action?: PetAction | null;
  actionNonce?: number;
  onSwitch?: (id: string) => void;
  onLongPress?: (id: string) => void;
}

/* 像素图：16×16 字符矩阵 */
type PixelMap = string[];

/* ======================================================================
 * 铠甲战士 16×16（DeepSeek）— 原创"萌系铠甲"形象，灵感来自机甲设计美学
 *   头冠双角 + 金色护额 + 发光护目镜 + 胸口红宝石 + 肩甲
 *   调色板新增 r=#ef4444 红宝石色（通过 PetSprite 注入）
 * ======================================================================*/
/* idleA：站姿、护目镜常态、双脚平行 */
const ARMOR_A: PixelMap = [
  '______h__h______',
  '_____khkkhk_____',
  '___kkkkkkkkk____',
  '__khhhhhhhhhhk__',
  '__khkkkkkkkkhk__',
  '__khkwwwwwwkhk__',
  '__khkkkkkkkkhk__',
  '___khhhhhhhhk___',
  '_hhkkkkkkkkkkhh_',
  'hhhbbbbbbbbbbhhh',
  '_hbbbrrrrrrbbbh_',
  '__bbbrwwwwrbbb__',
  '__bbbbrrrrbbbb__',
  '___sbbbbbbbbs___',
  '___kkbb__bbkk___',
  '___kk______kk___',
];
/* idleB：肩甲金属"呼吸"扩张 + 双脚交错（重心微移），horn 角张开一格 */
const ARMOR_B: PixelMap = [
  '_____h____h_____',
  '____khkkkkhk____',
  '___kkkkkkkkk____',
  '__khhhhhhhhhhk__',
  '__khkkkkkkkkhk__',
  '__khkwwwwwwkhk__',
  '__khkkkkkkkkhk__',
  '___khhhhhhhhk___',
  'hhhkkkkkkkkkkhhh',
  'hhhbbbbbbbbbbhhh',
  '_hbbbrrrrrrbbbh_',
  '__bbbrwwwwrbbb__',
  '__bbbbrrrrbbbb__',
  '___sbbbbbbbbs___',
  '____kkbbbbkk____',
  '____kk____kk____',
];
/* blink：护目镜熄灭一拍（整条变暗 = k） */
const ARMOR_BLINK: PixelMap = [
  '______h__h______',
  '_____khkkhk_____',
  '___kkkkkkkkk____',
  '__khhhhhhhhhhk__',
  '__khkkkkkkkkhk__',
  '__khkkkkkkkkhk__',
  '__khkkkkkkkkhk__',
  '___khhhhhhhhk___',
  '_hhkkkkkkkkkkhh_',
  'hhhbbbbbbbbbbhhh',
  '_hbbbrrrrrrbbbh_',
  '__bbbrwwwwrbbb__',
  '__bbbbrrrrbbbb__',
  '___sbbbbbbbbs___',
  '___kkbb__bbkk___',
  '___kk______kk___',
];
/* happy：护目镜全亮 + 胸口宝石爆闪 + 肩甲张开 */
const ARMOR_HAPPY: PixelMap = [
  '______h__h______',
  '_____hkhhkh_____',
  '___kkkkkkkkk____',
  '__khhhhhhhhhhk__',
  '__kwwwwwwwwwwk__',
  '__kwwwwwwwwwwk__',
  '__khkkkkkkkkhk__',
  '___khwwwwwwhk___',
  'hhhkkkkkkkkkkhhh',
  'hhhbbbrrrrrrbhhh',
  '_hbbrrwwwwwwrrbh',
  '__bbrwwwwwwwwrb_',
  '__bbbbrrrrbbbb__',
  '___sbbbbbbbbs___',
  '___kkbb__bbkk___',
  '___kk______kk___',
];

/* ======================================================================
 * 兔子 16×16（通义千问）— 高高竖起的兔耳 + 粉色内耳 + 腮红 + 大笑
 *   主色 b=白 #f5f5f5；高光 h=粉色 #fca5a5（同时用作内耳和腮红）
 *   设计：4 帧耳朵固定在第 0-4 行，绝不消失
 * ======================================================================*/
/* idleA：眼神光居左，腮红嘟嘴笑 */
const PANDA_A: PixelMap = [
  '_bbb________bbb_',
  '_bbb________bbb_',
  '_bhb________bhb_',
  '_bhb________bhb_',
  '_bbb________bbb_',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbkkkbbbbbbkkkbb',
  'bkwkkbbbbbbkwkkb',
  'bkkkkbbbbbbkkkkb',
  'bbbbhhbbbbhhbbbb',
  'bbbbbbwwwwbbbbbb',
  '_bbbbbbbbbbbbbb_',
  '__bbbbbbbbbbbb__',
  '___sbbbbbbbbs___',
  '_____ss__ss_____',
];
/* idleB：眼神光居右（兔子瞄了一眼旁边），耳朵纹丝不动 */
const PANDA_B: PixelMap = [
  '_bbb________bbb_',
  '_bbb________bbb_',
  '_bhb________bhb_',
  '_bhb________bhb_',
  '_bbb________bbb_',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbkkkbbbbbbkkkbb',
  'bkkwkbbbbbbkkwkb',
  'bkkkkbbbbbbkkkkb',
  'bbbbhhbbbbhhbbbb',
  'bbbbbbwwwwbbbbbb',
  '_bbbbbbbbbbbbbb_',
  '__bbbbbbbbbbbb__',
  '___sbbbbbbbbs___',
  '_____ss__ss_____',
];
/* blink：眼睛闭成线，耳朵不变 */
const PANDA_BLINK: PixelMap = [
  '_bbb________bbb_',
  '_bbb________bbb_',
  '_bhb________bhb_',
  '_bhb________bhb_',
  '_bbb________bbb_',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbkkkkbbbbkkkkbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbhhbbbbhhbbbb',
  'bbbbbbwwwwbbbbbb',
  '_bbbbbbbbbbbbbb_',
  '__bbbbbbbbbbbb__',
  '___sbbbbbbbbs___',
  '_____ss__ss_____',
];
/* happy：弯弯笑眼 ^^ + 大开口笑 + 双腮红加深，耳朵不变 */
const PANDA_HAPPY: PixelMap = [
  '_bbb________bbb_',
  '_bbb________bbb_',
  '_bhb________bhb_',
  '_bhb________bhb_',
  '_bbb________bbb_',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbkkbbbbbbkkbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbhhhbbbbhhhbbb',
  'bbbbbwwwwwwbbbbb',
  '_bbbbbwwwwbbbbb_',
  '__bbbbbbbbbbbb__',
  '___sbbbbbbbbs___',
  '_____ss__ss_____',
  '________________',
];

/* ======================================================================
 * 狐狸/小柴 16×16（智谱）— 三角耳 + 圆脸 + 大尾巴 + 白尾尖
 * ======================================================================*/
/* idleA：尾巴左、坐姿 */
const FOX_A: PixelMap = [
  '_b____________b_',
  'bbb__________bbb',
  'bhhb________bhhb',
  '_bbbbbbbbbbbbbb_',
  '__bbbbbbbbbbbb__',
  '_bbbbbbbbbbbbbb_',
  'bbbkkbbbbbbkkbbb',
  'bbkwkkbbbbkwkkbb',
  'bbbkkbbbbbbkkbbb',
  'bbbhhbbwwbbhhbbb',
  '_bbbbbbwwbbbbbb_',
  '_bwwwwwwwwwwwwb_',
  'bbwwwwwwwwwwwwbb',
  'wbwwwwwwwwwwwwbb',
  'wbb__bb__bb__bb_',
  'wb______________',
];
/* idleB：尾巴右、坐姿 */
const FOX_B: PixelMap = [
  '_b____________b_',
  'bbb__________bbb',
  'bhhb________bhhb',
  '_bbbbbbbbbbbbbb_',
  '__bbbbbbbbbbbb__',
  '_bbbbbbbbbbbbbb_',
  'bbbkkbbbbbbkkbbb',
  'bbkwkkbbbbkwkkbb',
  'bbbkkbbbbbbkkbbb',
  'bbbhhbbwwbbhhbbb',
  '_bbbbbbwwbbbbbb_',
  '_bwwwwwwwwwwwwb_',
  'bbwwwwwwwwwwwwbb',
  'bbwwwwwwwwwwwwbw',
  '_bb__bb__bb__bbw',
  '______________bw',
];
/* blink */
const FOX_BLINK: PixelMap = [
  '_b____________b_',
  'bbb__________bbb',
  'bhhb________bhhb',
  '_bbbbbbbbbbbbbb_',
  '__bbbbbbbbbbbb__',
  '_bbbbbbbbbbbbbb_',
  'bbbbbbbbbbbbbbbb',
  'bbkkkkbbbbkkkkbb',
  'bbbbbbbbbbbbbbbb',
  'bbbhhbbwwbbhhbbb',
  '_bbbbbbwwbbbbbb_',
  '_bwwwwwwwwwwwwb_',
  'bbwwwwwwwwwwwwbb',
  'wbwwwwwwwwwwwwbb',
  'wbb__bb__bb__bb_',
  'wb______________',
];
/* happy：眯眯眼 + 张嘴笑 + 尾巴竖 */
const FOX_HAPPY: PixelMap = [
  '_b____________b_',
  'bbb__________bbb',
  'bhhb________bhhb',
  '_bbbbbbbbbbbbbb_',
  '__bbbbbbbbbbbb__',
  '_bbbbbbbbbbbbbb_',
  'bbbkbbbbbbbbkbbb',
  'bbkwkbbbbbbkwkbb',
  'bbbbbbwwwwbbbbbb',
  'bbbhhwwwwwwhhbbb',
  '_bbbbwwwwwwbbbb_',
  '_bwwwwwwwwwwwwbw',
  'bbwwwwwwwwwwwwbw',
  'bbwwwwwwwwwwwwb_',
  '_bb__bb__bb__b__',
  '________________',
];

/* 每只宠物的 4 帧 */
const PIXEL_MAP: Record<
  string,
  { idleA: PixelMap; idleB: PixelMap; blink: PixelMap; happy: PixelMap }
> = {
  deepseek: { idleA: ARMOR_A, idleB: ARMOR_B, blink: ARMOR_BLINK, happy: ARMOR_HAPPY },
  qwen: { idleA: PANDA_A, idleB: PANDA_B, blink: PANDA_BLINK, happy: PANDA_HAPPY },
  glm: { idleA: FOX_A, idleB: FOX_B, blink: FOX_BLINK, happy: FOX_HAPPY },
};

/*
 * 把 16×16 字符矩阵渲染为 SVG（每像素 cell px）
 * 调色板：b=主色 / h=高光 / s=阴影 / k=黑 / w=白
 */
function PetSprite({
  map,
  color,
  highlight,
  shadow,
  size = 48,
}: {
  map: PixelMap;
  color: string;
  highlight: string;
  shadow: string;
  size?: number;
}) {
  const cell = size / 16;
  const palette: Record<string, string> = {
    b: color,
    h: highlight,
    s: shadow,
    k: '#000000',
    w: '#ffffff',
    /* r 红宝石色，专为铠甲胸口宝石与受激发光留位 */
    r: '#ef4444',
  };

  const rects: React.ReactNode[] = [];
  for (let y = 0; y < map.length; y += 1) {
    const row = map[y] ?? '';
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x] ?? '_';
      const fill = palette[ch];
      if (!fill) continue;
      rects.push(
        <Rect
          key={`${x}-${y}`}
          x={x * cell}
          y={y * cell}
          width={cell}
          height={cell}
          fill={fill}
        />,
      );
    }
  }
  return (
    <Svg width={size} height={size}>
      {rects}
    </Svg>
  );
}

/* Hook：随机间隔眨眼 */
function useBlink(active: boolean) {
  const [blinking, setBlinking] = useState(false);
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const wait = 3000 + Math.random() * 3000;
      timer = setTimeout(() => {
        setBlinking(true);
        setTimeout(() => {
          setBlinking(false);
          schedule();
        }, 180);
      }, wait);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [active]);
  return blinking;
}

/* Hook：idle 帧切换（每 600ms） */
function useIdleFrame(active: boolean) {
  const [frame, setFrame] = useState<'a' | 'b'>('a');
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setFrame((f) => (f === 'a' ? 'b' : 'a')), 600);
    return () => clearInterval(id);
  }, [active]);
  return frame;
}

/* Hook：上下漂浮 ±3px / 2.4s */
function useFloat(active: boolean) {
  const translateY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      translateY.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: -3,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 3,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, translateY]);
  return translateY;
}

/* Hook：摇摆 ±2° / 3.6s（比漂浮慢，错开节奏，让动作"动而不乱"） */
function useWobble(active: boolean) {
  const rotate = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      rotate.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(rotate, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: -1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, rotate]);
  return rotate;
}

function usePetActionMotion(action: PetAction | null | undefined, actionNonce = 0) {
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const lastAcceptedAtRef = useRef(0);

  useEffect(() => {
    if (!action || actionNonce === 0) return;
    const now = Date.now();
    if (now - lastAcceptedAtRef.current < 30000) return;
    lastAcceptedAtRef.current = now;

    tx.stopAnimation();
    ty.stopAnimation();
    scale.stopAnimation();
    spin.stopAnimation();
    tx.setValue(0);
    ty.setValue(0);
    scale.setValue(1);
    spin.setValue(0);

    const horizontal = action === 'prev' ? -18 : action === 'next' ? 18 : 0;
    const lift = action === 'playPause' ? -18 : action === 'like' || action === 'fav' ? -10 : action === 'stop' ? 8 : 0;
    const peakScale = action === 'playPause' ? 1.34 : action === 'stop' ? 0.78 : 1.18;
    const spinTo = action === 'prev' ? -1 : action === 'next' ? 1 : action === 'volume' ? 0.5 : 0;

    Animated.parallel([
      Animated.sequence([
        Animated.timing(tx, {
          toValue: horizontal,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(tx, { toValue: 0, damping: 9, stiffness: 120, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(ty, {
          toValue: lift,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(ty, { toValue: 0, damping: 9, stiffness: 130, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(scale, {
          toValue: peakScale,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scale, { toValue: 1, damping: 8, stiffness: 145, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(spin, {
          toValue: spinTo,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(spin, { toValue: 0, damping: 10, stiffness: 120, useNativeDriver: true }),
      ]),
    ]).start();
  }, [action, actionNonce, scale, spin, tx, ty]);

  const rotate = spin.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-18deg', '18deg'],
  });

  return { tx, ty, scale, rotate };
}

/*
 * 子组件：铠甲战士头冠光闪
 *   idleB 帧时左右双角顶端各闪一下，像金属反光
 */
function HornGlint({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      scale.setValue(0.5);
      return;
    }
    Animated.parallel([
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.delay(180),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
      Animated.timing(scale, {
        toValue: 1.4,
        duration: 500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, opacity, scale]);

  /* 两道光闪，分别贴在左右双角的位置（容器 56×56，sprite 居中 48×48）
   * 双角在 sprite 顶部约第 0-1 行，x ≈ 6 与 9（16 列网格） */
  const positions = [
    { left: 22, top: 4 },
    { left: 30, top: 4 },
  ];
  return (
    <>
      {positions.map((p, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: p.left,
            top: p.top,
            width: 4,
            height: 4,
            backgroundColor: '#fde68a',
            opacity,
            transform: [{ scale }],
          }}
        />
      ))}
    </>
  );
}

/*
 * 子组件：点击时迸发的火花粒子
 *   4 颗粒子从中心向四个角飞散 + 淡出
 */
function Sparkles({ trigger, color }: { trigger: number; color: string }) {
  /* 4 颗粒子，向四个对角方向飞 */
  const directions: Array<[number, number]> = [
    [-18, -18],
    [18, -18],
    [-18, 18],
    [18, 18],
  ];

  const animsRef = useRef(
    directions.map(() => ({
      tx: new Animated.Value(0),
      ty: new Animated.Value(0),
      op: new Animated.Value(0),
    })),
  );

  useEffect(() => {
    if (trigger === 0) return;
    animsRef.current.forEach((a, i) => {
      const dir = directions[i];
      if (!dir) return;
      const [dx, dy] = dir;
      a.tx.setValue(0);
      a.ty.setValue(0);
      a.op.setValue(1);
      Animated.parallel([
        Animated.timing(a.tx, {
          toValue: dx,
          duration: 500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(a.ty, {
          toValue: dy,
          duration: 500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(a.op, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    });
    /* 仅依赖 trigger 计数变化；directions 与 animsRef 为稳定引用 */
  }, [trigger]);

  return (
    <>
      {animsRef.current.map((a, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            marginTop: -2,
            marginLeft: -2,
            width: 4,
            height: 4,
            backgroundColor: color,
            opacity: a.op,
            transform: [{ translateX: a.tx }, { translateY: a.ty }],
          }}
        />
      ))}
    </>
  );
}

export function PixelPetSwitcher({
  pets = DEFAULT_PETS,
  currentId,
  action,
  actionNonce = 0,
  onSwitch,
  onLongPress,
}: PixelPetSwitcherProps) {
  const [internalId, setInternalId] = useState(pets[0]?.id ?? 'deepseek');
  const activeId = currentId ?? internalId;
  const active = pets.find((p) => p.id === activeId) ?? pets[0];

  /* 缩放（点击 pop） */
  const scale = useRef(new Animated.Value(1)).current;
  /* 漂浮 */
  const translateY = useFloat(true);
  /* 摇摆 */
  const rotate = useWobble(true);
  const actionMotion = usePetActionMotion(action, actionNonce);
  /* 眨眼 */
  const blinking = useBlink(true);
  /* idle 帧 */
  const idleFrame = useIdleFrame(true);
  /* 招呼气泡显隐 */
  const [showBubble, setShowBubble] = useState(false);
  const bubbleOpacity = useRef(new Animated.Value(0)).current;
  /* 点击触发的"开心"状态：true 时显示 happy 帧 */
  const [happy, setHappy] = useState(false);
  /* 火花粒子 trigger 计数（每点一次 +1） */
  const [sparkTrigger, setSparkTrigger] = useState(0);

  function handlePress() {
    if (!pets.length) return;
    const idx = pets.findIndex((p) => p.id === activeId);
    const nextIdx = (idx + 1) % pets.length;
    const nextPet = pets[nextIdx];
    if (!nextPet) return;

    /* pop 动画：缩 → 弹 → 复 */
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.7, duration: 70, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1.3, duration: 130, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 130, useNativeDriver: true }),
    ]).start();

    /* happy 帧持续 600ms 后回 idle */
    setHappy(true);
    setTimeout(() => setHappy(false), 600);

    /* 触发火花粒子 */
    setSparkTrigger((c) => c + 1);

    setInternalId(nextPet.id);
    onSwitch?.(nextPet.id);
  }

  function handleLongPress() {
    if (!active) return;
    setShowBubble(true);
    Animated.sequence([
      Animated.timing(bubbleOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1400),
      Animated.timing(bubbleOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setShowBubble(false));
    onLongPress?.(active.id);
  }

  if (!active) return null;
  const sprite = PIXEL_MAP[active.id] ?? PIXEL_MAP.deepseek;
  /* 帧优先级：happy（点击反应） > blink（眨眼） > idle 切换 */
  const map = happy
    ? sprite!.happy
    : blinking
      ? sprite!.blink
      : idleFrame === 'a'
        ? sprite!.idleA
        : sprite!.idleB;
  const highlight = active.highlight ?? '#ffffff';
  const shadow = active.shadow ?? '#000000';

  /* 把 [-1,1] 映射成 ±2° 旋转字符串 */
  const rotateStr = rotate.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-2deg', '2deg'],
  });

  return (
    <View className="items-end">
      {/* 招呼气泡（长按触发） */}
      {showBubble ? (
        <Animated.View
          className="border border-line bg-panel px-2 py-1 mb-1"
          style={{ opacity: bubbleOpacity }}
        >
          <Text className="font-mono text-text text-xs">{active.greeting}</Text>
        </Animated.View>
      ) : null}

      {/* 模型名徽章已上移至 TopBar，避免与 UserBubble / ChatInput 在右下角互相遮挡 */}

      <Pressable onPress={handlePress} onLongPress={handleLongPress} hitSlop={8} delayLongPress={400}>
        <Animated.View
          className="border border-line"
          style={{
            width: 56,
            height: 56,
            backgroundColor: '#0a0a0a',
            transform: [
              { scale },
              { scale: actionMotion.scale },
              { translateX: actionMotion.tx },
              { translateY },
              { translateY: actionMotion.ty },
              { rotate: rotateStr },
              { rotate: actionMotion.rotate },
            ],
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'visible',
          }}
        >
          {/* 铠甲战士头冠光闪：DeepSeek 在 idleB 帧时双角金属反光 */}
          {active.id === 'deepseek' && !happy ? (
            <HornGlint
              visible={idleFrame === 'b'}
              key={`glint-${idleFrame}-${sparkTrigger}`}
            />
          ) : null}
          <PetSprite map={map} color={active.color} highlight={highlight} shadow={shadow} size={48} />
          {/* 点击火花：用宠物高光色，呼应主题 */}
          <Sparkles trigger={sparkTrigger} color={highlight} />
        </Animated.View>
      </Pressable>
    </View>
  );
}
