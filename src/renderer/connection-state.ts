import type { ConnectionState } from '../contracts/channel';

export const connectionLabels: Record<ConnectionState['status'], string> = {
  offline: '未连接',
  connecting: '连接中',
  syncing: '同步历史',
  online: '已连接',
  reconnecting: '重连中',
  error: '连接失败',
};

export const connectionDescriptions: Record<ConnectionState['status'], string> = {
  offline: '保存并连接后，才能与频道中的 Agent 对话。',
  connecting: '正在连接服务并校验频道，最长等待 15 秒。',
  syncing: '实时连接已建立，正在同步历史消息。',
  online: '频道连接正常，可以开始对话。',
  reconnecting: '正在恢复已中断的连接，已执行的动作不会重播。',
  error: '请检查频道地址和服务状态，然后重试连接。',
};
