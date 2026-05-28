/*
 * 听歌反馈识别
 * ------------
 * 只识别用户明确在评价“这首 / 这类 / 之后怎么放歌”的句子。
 * 普通情绪聊天不写入长期记忆，避免 Claudio 把陪伴对话误当音乐偏好。
 */

/*
 * 判断一段聊天是否应该记录为 feedback listening event。
 * 这里保持保守：必须出现明确播放偏好、推荐禁忌或歌曲评价信号。
 */
export function shouldRecordMusicFeedback(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;

  return normalized.split(/[。！？!?；;，,\n]/u).some(isMusicFeedbackClause);
}

/*
 * 单个语义片段内同时出现音乐主体和偏好动作才记录。
 * 这样“我不喜欢今天这样，放点音乐吧”不会因为跨片段拼词而污染记忆。
 */
function isMusicFeedbackClause(clause: string): boolean {
  const trimmed = clause.trim();
  if (!trimmed) return false;

  const hasMusicSubject = /(?:这首|这歌|这类|这种|这支|歌曲|歌单|音乐|曲子|苦情歌)/u.test(
    trimmed,
  );
  const hasPreferenceSignal =
    /(?:喜欢|不喜欢|适合|收藏|多放|常放|以后.{0,20}(?:听|放|推)|别再.{0,12}(?:推|放)|不要再.{0,12}(?:推|放))/u.test(
      trimmed,
    );

  return hasMusicSubject && hasPreferenceSignal;
}
