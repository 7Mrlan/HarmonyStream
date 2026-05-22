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
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    let blinkTimer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const wait = 3000 + Math.random() * 3000;
      timer = setTimeout(() => {
        setBlinking(true);
        blinkTimer = setTimeout(() => {
          setBlinking(false);
          schedule();
        }, 180);
      }, wait);
    };
    schedule();
    return () => {
      if (timer) clearTimeout(timer);
      if (blinkTimer) clearTimeout(blinkTimer);
    };
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
  const translateY = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(translateY);

    if (!active) {
      translateY.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.quad) });
      return undefined;
    }

    translateY.value = withRepeat(
      withSequence(
        withTiming(-3, {
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(3, {
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(translateY);
    };
  }, [active, translateY]);

  /* 宠物漂浮是持续视觉动画，迁到 Reanimated 防止旧 Animated Web onUpdate。 */
  return translateY;
}

/* Hook：摇摆 ±2° / 3.6s（比漂浮慢，错开节奏，让动作"动而不乱"） */
function useWobble(active: boolean) {
  const rotate = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(rotate);

    if (!active) {
      rotate.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.quad) });
      return undefined;
    }

    rotate.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(-1, {
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(rotate);
    };
  }, [active, rotate]);

  /* 头部轻微摇摆只改 transform，迁移后不会走 RN Web Animated onUpdate。 */
  return rotate;
}

function usePetActionMotion(action: PetAction | null | undefined, actionNonce = 0) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const spin = useSharedValue(0);
  const lastAcceptedAtRef = useRef(0);

  useEffect(() => {
    if (!action || actionNonce === 0) return;
    const now = Date.now();
    if (now - lastAcceptedAtRef.current < 30000) return;
    lastAcceptedAtRef.current = now;

    cancelAnimation(tx);
    cancelAnimation(ty);
    cancelAnimation(scale);
    cancelAnimation(spin);
    tx.value = 0;
    ty.value = 0;
    scale.value = 1;
    spin.value = 0;

    const horizontal = action === 'prev' ? -18 : action === 'next' ? 18 : 0;
    const lift = action === 'playPause' ? -18 : action === 'like' || action === 'fav' ? -10 : action === 'stop' ? 8 : 0;
    const peakScale = action === 'playPause' ? 1.34 : action === 'stop' ? 0.78 : 1.18;
    const spinTo = action === 'prev' ? -1 : action === 'next' ? 1 : action === 'volume' ? 0.5 : 0;

    tx.value = withSequence(
      withTiming(horizontal, { duration: 260, easing: Easing.out(Easing.cubic) }),
      withSpring(0, { damping: 9, stiffness: 120 }),
    );
    ty.value = withSequence(
      withTiming(lift, { duration: 260, easing: Easing.out(Easing.cubic) }),
      withSpring(0, { damping: 9, stiffness: 130 }),
    );
    scale.value = withSequence(
      withTiming(peakScale, { duration: 220, easing: Easing.out(Easing.cubic) }),
      withSpring(1, { damping: 8, stiffness: 145 }),
    );
    spin.value = withSequence(
      withTiming(spinTo, { duration: 420, easing: Easing.out(Easing.cubic) }),
      withSpring(0, { damping: 10, stiffness: 120 }),
    );

    return () => {
      cancelAnimation(tx);
      cancelAnimation(ty);
      cancelAnimation(scale);
      cancelAnimation(spin);
    };
  }, [action, actionNonce, scale, spin, tx, ty]);

  /* 播放控制触发的宠物反馈统一放到 Reanimated，避免 RN Web SpringAnimation 热点。 */
  return { tx, ty, scale, spin };
}

/*
 * 子组件：铠甲战士头冠光闪
 *   idleB 帧时左右双角顶端各闪一下，像金属反光
 */
function HornGlint({ visible }: { visible: boolean }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(progress);

    if (!visible) {
      progress.value = 0;
      return undefined;
    }

    progress.value = 0;
    progress.value = withTiming(1, {
      duration: 500,
      easing: Easing.out(Easing.quad),
    });

    return () => {
      cancelAnimation(progress);
    };
  }, [progress, visible]);

  const glintStyle = useAnimatedStyle(() => {
    const opacity = progress.value < 0.24 ? progress.value / 0.24 : progress.value < 0.6 ? 1 : Math.max(0, 1 - (progress.value - 0.6) / 0.4);
    return {
      opacity,
      transform: [{ scale: 0.5 + progress.value * 0.9 }],
    };
  });

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
          style={[
            {
              position: 'absolute',
              left: p.left,
              top: p.top,
              width: 4,
              height: 4,
              backgroundColor: '#fde68a',
            },
            glintStyle,
          ]}
        />
      ))}
    </>
  );
}

/*
 * 子组件：点击时迸发的火花粒子
 *   4 颗粒子从中心向四个角飞散 + 淡出
 */
function SparkleParticle({
  trigger,
  color,
  dx,
  dy,
}: {
  trigger: number;
  color: string;
  dx: number;
  dy: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(progress);

    if (trigger === 0) {
      progress.value = 0;
      return undefined;
    }

    progress.value = 0;
    progress.value = withTiming(1, {
      duration: 500,
      easing: Easing.out(Easing.quad),
    });

    return () => {
      cancelAnimation(progress);
    };
  }, [dx, dy, progress, trigger]);

  /* 点击火花属于短促视觉反馈，改为单一 progress，避免 4 组旧动画并行动画残留。 */
  const sparkleStyle = useAnimatedStyle(() => ({
    opacity: trigger === 0 ? 0 : Math.max(0, 1 - progress.value),
    transform: [
      { translateX: dx * progress.value },
      { translateY: dy * progress.value },
      { scale: 1 - progress.value * 0.15 },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: '50%',
          left: '50%',
          marginTop: -2,
          marginLeft: -2,
          width: 4,
          height: 4,
          backgroundColor: color,
        },
        sparkleStyle,
      ]}
    />
  );
}

function Sparkles({ trigger, color }: { trigger: number; color: string }) {
  /* 4 颗粒子，向四个对角方向飞 */
  const directions: Array<[number, number]> = [
    [-18, -18],
    [18, -18],
    [-18, 18],
    [18, 18],
  ];

  return (
    <>
      {directions.map(([dx, dy], i) => (
        <SparkleParticle key={i} trigger={trigger} color={color} dx={dx} dy={dy} />
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
  const pressScale = useSharedValue(1);
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
  const bubbleOpacity = useSharedValue(0);
  /* 点击触发的"开心"状态：true 时显示 happy 帧 */
  const [happy, setHappy] = useState(false);
  const happyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* 火花粒子 trigger 计数（每点一次 +1） */
  const [sparkTrigger, setSparkTrigger] = useState(0);

  /* 宠物的所有 transform 合并到一条 Reanimated 管线，避免多个 transform style 互相覆盖。 */
  const petMotionStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: pressScale.value * actionMotion.scale.value },
      { translateX: actionMotion.tx.value },
      { translateY: translateY.value + actionMotion.ty.value },
      { rotate: `${rotate.value * 2 + actionMotion.spin.value * 18}deg` },
    ],
  }));

  /* 长按气泡只做 opacity 变化，结束后用 runOnJS 回到 React 状态。 */
  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: bubbleOpacity.value,
  }));

  useEffect(() => {
    return () => {
      if (happyTimerRef.current) clearTimeout(happyTimerRef.current);
      cancelAnimation(pressScale);
      cancelAnimation(bubbleOpacity);
    };
  }, [bubbleOpacity, pressScale]);

  function handlePress() {
    if (!pets.length) return;
    const idx = pets.findIndex((p) => p.id === activeId);
    const nextIdx = (idx + 1) % pets.length;
    const nextPet = pets[nextIdx];
    if (!nextPet) return;

    /* pop 动画：缩 → 弹 → 复 */
    cancelAnimation(pressScale);
    pressScale.value = 1;
    pressScale.value = withSequence(
      withTiming(0.7, { duration: 70, easing: Easing.out(Easing.quad) }),
      withTiming(1.3, { duration: 130, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) }),
    );

    /* happy 帧持续 600ms 后回 idle */
    setHappy(true);
    if (happyTimerRef.current) clearTimeout(happyTimerRef.current);
    happyTimerRef.current = setTimeout(() => {
      setHappy(false);
      happyTimerRef.current = null;
    }, 600);

    /* 触发火花粒子 */
    setSparkTrigger((c) => c + 1);

    setInternalId(nextPet.id);
    onSwitch?.(nextPet.id);
  }

  function handleLongPress() {
    if (!active) return;
    setShowBubble(true);
    cancelAnimation(bubbleOpacity);
    bubbleOpacity.value = 0;
    bubbleOpacity.value = withSequence(
      withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }),
      withDelay(
        1400,
        withTiming(0, { duration: 200, easing: Easing.out(Easing.quad) }, (finished) => {
          if (finished) runOnJS(setShowBubble)(false);
        }),
      ),
    );
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

  return (
    <View className="items-end">
      {/* 招呼气泡（长按触发） */}
      {showBubble ? (
        <Animated.View
          className="border border-line bg-panel px-2 py-1 mb-1"
          style={bubbleStyle}
        >
          <Text className="font-mono text-text text-xs">{active.greeting}</Text>
        </Animated.View>
      ) : null}

      {/* 模型名徽章已上移至 TopBar，避免与 UserBubble / ChatInput 在右下角互相遮挡 */}

      <Pressable onPress={handlePress} onLongPress={handleLongPress} hitSlop={8} delayLongPress={400}>
        <Animated.View
          className="border border-line"
          style={[
            {
              width: 56,
              height: 56,
              backgroundColor: '#0a0a0a',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'visible',
            },
            petMotionStyle,
          ]}
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
