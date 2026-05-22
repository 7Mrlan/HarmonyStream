---
name: expo-deployment
description: 打 Android APK / 发布、CI 配置、版本管理时触发。
keywords: [eas, build, deploy, apk, release, ota]
---

# Expo 打包与发布（Claudio 项目）

## 三种构建路径

| 场景 | 命令 | 产物 |
|---|---|---|
| **本地开发预览** | `npx expo start` | Metro 服务 + 浏览器/扫码 |
| **Dev Client（带原生模块）** | `npx expo run:android` | 带 TrackPlayer 的本地 debug APK |
| **正式 Android APK** | `eas build -p android --profile preview` | 可分发 APK |
| **正式 Play Store** | `eas build -p android --profile production` | AAB 包 |

## 必须 prebuild 的情况
本项目用 `react-native-track-player`（原生模块），**Expo Go 跑不动**，必须：
```
npx expo prebuild --platform android
```
prebuild 会生成 `android/` 目录，从此开始用 dev-client 而非 Expo Go。

## eas.json 模板
```json
{
  "cli": { "version": ">= 7.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "gradleCommand": ":app:assembleDebug" }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "android": { "buildType": "app-bundle" },
      "autoIncrement": true
    }
  }
}
```

## app.json 关键字段
```json
{
  "expo": {
    "name": "Claudio",
    "slug": "claudio",
    "version": "0.1.0",
    "orientation": "portrait",
    "userInterfaceStyle": "dark",
    "android": {
      "package": "fm.claudio.app",
      "versionCode": 1,
      "permissions": [
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_MEDIA_PLAYBACK",
        "WAKE_LOCK",
        "INTERNET"
      ]
    },
    "plugins": [
      "expo-router",
      "expo-font",
      ["react-native-track-player", { "androidNotificationIconPath": "./assets/notification-icon.png" }]
    ]
  }
}
```

## 后台播放权限（Android 14+ 必须）
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` 都要
- AndroidManifest 由 plugin 自动处理，不用手改

## 本地调试 Android（无 Mac 也能跑）
1. 安装 Android Studio + AVD（Pixel 7 / API 34）
2. `npx expo run:android` 自动起模拟器
3. 改原生代码后必须 `npx expo prebuild --clean` 再 run

## OTA 更新（不打新包改 JS/资源）
```
eas update --branch preview --message "fix: 修复进度条不更新"
```
仅 JS/JSON/图片改动可走 OTA；新增原生模块必须重新打 APK。

## 版本号策略
- `version`：用户可见（`0.1.0` 起步，遵循语义化）
- `versionCode`（Android）：自增整数，由 `autoIncrement` 自动管
- 每次 `eas build production` 自动 +1

## 签名（Android）
- 首次 EAS build 自动生成 keystore，存于 EAS 服务器
- 想自管：`eas credentials` 上传自己的 keystore
- 务必备份 keystore.jks，丢了 = 永远无法更新已上架版本

## CI 集成（GitHub Actions 示例）
```yaml
- uses: expo/expo-github-action@v8
  with: { eas-version: latest, token: ${{ secrets.EXPO_TOKEN }} }
- run: eas build --platform android --profile preview --non-interactive --no-wait
```

## 禁止事项
- 禁止把 EXPO_TOKEN / 签名密码硬编码进代码
- 禁止跳过 `prebuild --clean`，会导致原生改动不生效
- 禁止在 production profile 用 `developmentClient: true`
- 禁止删除 `android/` 后忘记 `eas build --clear-cache`
