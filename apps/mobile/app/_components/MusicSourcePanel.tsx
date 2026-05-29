/*
 * MusicSourcePanel
 * ----------------
 * Phase M 的用户音源导入入口：验证并导入 LX-compatible 脚本，或回滚到默认双源池。
 * 面板只展示安全元信息，不展示已保存脚本文本。
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { ClaudioApiClient, MusicSourceStatusResponse } from '@claudio/api';

export interface MusicSourcePanelProps {
  /* 共享 API client。 */
  apiClient: ClaudioApiClient;
}

/* 小按钮样式统一，避免面板内按钮尺寸跳动。 */
function SourceButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={`border border-line px-3 py-2 ${disabled ? 'opacity-40' : 'active:bg-line'}`}
    >
      <Text className="font-pixel text-text tracking-pixel" style={{ fontSize: 11 }}>
        {label}
      </Text>
    </Pressable>
  );
}

/*
 * 用户音源导入面板。
 * 默认收起，避免占用主播放界面；打开后才拉取状态并允许导入。
 */
export function MusicSourcePanel({ apiClient }: MusicSourcePanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sourceName, setSourceName] = useState('My LX Source');
  const [script, setScript] = useState('');
  const [status, setStatus] = useState<MusicSourceStatusResponse | null>(null);
  const [message, setMessage] = useState('默认使用内置双源池。');

  /* 刷新服务端音源状态。 */
  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const next = await apiClient.getMusicSources();
      setStatus(next);
      setMessage(formatStatusMessage(next));
    } catch {
      setMessage('音源状态读取失败，请确认服务端在线。');
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    if (!open) return;
    void refreshStatus();
  }, [open, refreshStatus]);

  /* 验证并导入用户源。 */
  const importSource = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.importMusicSource({ name: sourceName, script });
      setStatus(response.status);
      if (response.ok) {
        setScript('');
        setMessage(`已启用 ${response.status.userSource?.name ?? '用户源'}。`);
      } else {
        setMessage(response.validation.reason ?? '音源验证失败。');
      }
    } catch {
      setMessage('音源导入失败；当前播放链路会继续使用现有源。');
    } finally {
      setLoading(false);
    }
  }, [apiClient, script, sourceName]);

  /* 切换用户源 / 默认源。 */
  const activateSource = useCallback(
    async (mode: 'default' | 'user') => {
      setLoading(true);
      try {
        const response = await apiClient.activateMusicSource(mode);
        setStatus(response.status);
        setMessage(response.reason ?? formatStatusMessage(response.status));
      } catch {
        setMessage('音源切换失败；当前播放链路保持不变。');
      } finally {
        setLoading(false);
      }
    },
    [apiClient],
  );

  const canImport = Boolean(sourceName.trim() && script.trim() && !loading);
  const hasUserSource = Boolean(status?.hasUserSource);

  return (
    <View className="px-4 pb-2">
      <Pressable
        onPress={() => setOpen((value) => !value)}
        className="border border-line px-3 py-2 active:bg-line"
      >
        <Text className="font-pixel text-text tracking-pixel" style={{ fontSize: 12 }}>
          {open ? 'SOURCE · CLOSE' : 'SOURCE'}
        </Text>
      </Pressable>

      {open ? (
        <View className="border border-line mt-2 px-3 py-3 bg-panel">
          <Text className="font-pixel text-muted tracking-pixel mb-2" style={{ fontSize: 11 }}>
            {loading ? 'CHECKING SOURCE...' : message}
          </Text>
          {status?.userSource ? (
            <Text className="font-pixel text-text tracking-pixel mb-2" style={{ fontSize: 11 }}>
              {status.userSource.active ? 'ACTIVE' : 'SAVED'} · {status.userSource.name} ·{' '}
              {status.userSource.sourceKeys.join(', ') || 'NO SOURCE KEY'}
            </Text>
          ) : null}
          <TextInput
            value={sourceName}
            onChangeText={setSourceName}
            placeholder="Source name"
            placeholderTextColor="#6b7280"
            className="border border-line text-text font-pixel px-2 py-2 mb-2"
            style={{ fontSize: 12 }}
          />
          <TextInput
            value={script}
            onChangeText={setScript}
            placeholder="Paste LX-compatible source script"
            placeholderTextColor="#6b7280"
            multiline
            textAlignVertical="top"
            className="border border-line text-text font-pixel px-2 py-2 mb-3"
            style={{ height: 118, fontSize: 11 }}
          />
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            <SourceButton label="IMPORT" disabled={!canImport} onPress={importSource} />
            <SourceButton
              label="ENABLE USER"
              disabled={!hasUserSource || loading}
              onPress={() => activateSource('user')}
            />
            <SourceButton
              label="USE DEFAULT"
              disabled={loading}
              onPress={() => activateSource('default')}
            />
            <SourceButton label="REFRESH" disabled={loading} onPress={refreshStatus} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/* 把状态压缩成 UI 文案。 */
function formatStatusMessage(status: MusicSourceStatusResponse): string {
  if (status.message) return status.message;
  if (status.activeMode === 'user') return '当前使用 App 导入的用户源。';
  if (status.activeMode === 'env') return '当前使用服务端环境变量源。';
  if (status.hasUserSource) return '当前使用默认双源池；用户源已保存，可重新启用。';
  return '当前使用默认双源池。';
}
