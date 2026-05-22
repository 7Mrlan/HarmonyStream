# 字体资源放置说明

本目录需放入以下三个字体文件，CI / 构建期不会自动下载，必须手动准备：

| 文件名 | 来源 | 许可 | 用途 |
|---|---|---|---|
| `PixelOperator.ttf` | https://www.dafont.com/pixel-operator.font | CC0 | 时钟、英文标题、按钮 |
| `VT323-Regular.ttf` | Google Fonts: https://fonts.google.com/specimen/VT323 | OFL | 英文正文、对话气泡 |
| `Cubic_11.ttf` | https://github.com/ACh-K/Cubic-11/releases | OFL | 中文全场景 |

## 下载与放置

```powershell
# 在 apps/mobile/assets/fonts/ 下放入：
PixelOperator.ttf
VT323-Regular.ttf
Cubic_11.ttf
```

## 验证

字体就绪后 `npx expo start --web` 应能看到时钟以像素风格渲染；
若三个文件任一缺失，App 会在启动时抛出资源加载错误，便于及时发现。
