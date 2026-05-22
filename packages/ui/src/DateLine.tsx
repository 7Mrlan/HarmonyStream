/*
 * 组件：DateLine
 * 作用：时钟下方的"星期 + 日期"双行文字
 * 数据：默认实时取系统时间；可外部传入 date 用于测试或固定显示
 * 设计：星期居中放大，日期 muted 灰带字距，与效果图 Monday / 20-APR-2026 一致
 */

import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';

export interface DateLineProps {
  /* 可选外部日期，不传则每分钟自动更新一次 */
  date?: Date;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/* 工具函数：补两位 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/* 格式化日期为 "20-APR-2026" 形式 */
function formatDate(d: Date): string {
  return `${pad2(d.getDate())}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

export function DateLine({ date }: DateLineProps) {
  const [now, setNow] = useState(() => date ?? new Date());

  useEffect(() => {
    if (date) {
      setNow(date);
      return;
    }
    /* 每 30s 校准一次系统时间，足够覆盖跨日场景 */
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, [date]);

  return (
    <View className="items-center">
      <Text className="font-pixel text-text text-base tracking-pixel">
        {WEEKDAYS[now.getDay()]}
      </Text>
      <Text className="font-pixel text-muted text-xs tracking-pixel mt-1">{formatDate(now)}</Text>
    </View>
  );
}
