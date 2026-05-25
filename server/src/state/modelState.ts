/*
 * AI 模型状态
 * ------------
 * 只负责模型列表和当前模型选择，不读写播放队列或电台 session。
 */

import type { ModelInfo, ModelsResponse, SwitchModelResponse } from '@claudio/api';

const DEFAULT_MODEL_ID = 'deepseek';

const MODELS: ModelInfo[] = [
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    petSprite: 'deepseek',
  },
  {
    id: 'qwen',
    displayName: '通义千问',
    petSprite: 'qwen',
  },
  {
    id: 'glm',
    displayName: '智谱 GLM',
    petSprite: 'glm',
  },
];

let currentModel = DEFAULT_MODEL_ID;

/*
 * 获取模型列表。
 * 返回浅拷贝，避免路由层误改全局模型配置。
 */
export function getModels(): ModelsResponse {
  return {
    current: currentModel,
    available: MODELS.map((model) => ({ ...model })),
  };
}

/*
 * 切换当前 AI 模型。
 * 只切换内存状态，不触发真实 LLM provider 初始化。
 */
export function switchModel(id: string): SwitchModelResponse {
  const model = MODELS.find((item) => item.id === id);

  if (!model) {
    return {
      ok: false,
      current: currentModel,
    };
  }

  currentModel = model.id;

  return {
    ok: true,
    current: currentModel,
  };
}

/*
 * 获取当前模型信息。
 * 找不到时回退默认模型，避免坏状态击穿 LLM adapter。
 */
export function getCurrentModel(): ModelInfo {
  return (
    MODELS.find((item) => item.id === currentModel) ??
    MODELS.find((item) => item.id === DEFAULT_MODEL_ID) ?? {
      id: DEFAULT_MODEL_ID,
      displayName: 'DeepSeek',
      petSprite: 'deepseek',
    }
  );
}
