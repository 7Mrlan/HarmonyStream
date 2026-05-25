/*
 * 曲名匹配工具。
 * LLM 和音乐源经常会返回大小写、空格或括号版本差异，这里统一轻量匹配语义。
 */

/* 判断两个曲名是否指向同一首候选曲。 */
export function isSameTitle(left: string, right: string): boolean {
  const normalizedLeft = normalizeTitle(left);
  const normalizedRight = normalizeTitle(right);
  if (!normalizedLeft || !normalizedRight) return false;

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
}

/* 归一化标题用于匹配。 */
function normalizeTitle(value: string): string {
  return value.trim().toLowerCase();
}
