/*
 * @claudio/ui 命名导出聚合
 * ------------------------
 * 所有跨端 UI 组件由此导出，apps/mobile 与未来 apps/desktop 共用。
 * 添加组件时按字母序补充一行 export。
 */

export { ChatInput } from './ChatInput';
export type { ChatInputProps } from './ChatInput';

export { ConnectionStatus } from './ConnectionStatus';
export type { ConnectionStatusProps } from './ConnectionStatus';

export { DateLine } from './DateLine';
export type { DateLineProps } from './DateLine';

export { DJBubble } from './DJBubble';
export type { DJBubbleProps } from './DJBubble';

export { DotMatrixBackground } from './DotMatrixBackground';
export type { DotMatrixBackgroundProps } from './DotMatrixBackground';

export { MusicSpectrum } from './MusicSpectrum';
export type { MusicSpectrumProps } from './MusicSpectrum';

export { NowPlayingBar } from './NowPlayingBar';
export type { NowPlayingBarProps } from './NowPlayingBar';

export { OnAirIndicator } from './OnAirIndicator';
export type { OnAirIndicatorProps } from './OnAirIndicator';

export { PixelClock } from './PixelClock';
export type { PixelClockProps } from './PixelClock';

export { PixelPetSwitcher, DEFAULT_PETS } from './PixelPetSwitcher';
export type { PetAction, PixelPetSwitcherProps, PetMeta } from './PixelPetSwitcher';

export { PlayerControls } from './PlayerControls';
export type { PlayerControlAction, PlayerControlsProps } from './PlayerControls';

export { ScanlineOverlay } from './ScanlineOverlay';
export type { ScanlineOverlayProps } from './ScanlineOverlay';

export { TopBar } from './TopBar';
export type { TopBarProps } from './TopBar';

export { UserBubble } from './UserBubble';
export type { UserBubbleProps } from './UserBubble';
