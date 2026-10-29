import { useState } from 'react';
import type { Snapshot } from '../../contracts/client';
import { UpdatePanel } from './UpdatePanel';
import { ConnectionForm } from '../../integrations/anelf/ui/ConnectionForm';
import { McpPanel } from './McpPanel';

export function SettingsPanel({
  snapshot,
  run,
}: {
  snapshot: Snapshot;
  run(task: () => Promise<unknown>): void;
}) {
  const [source, setSource] = useState<'anelf' | 'mcp'>('anelf');
  return (
    <div className="settings-view">
      <div className="segmented" aria-label="连接方式">
        <button className={source === 'anelf' ? 'selected' : ''} onClick={() => setSource('anelf')}>
          Anelf 频道
        </button>
        <button className={source === 'mcp' ? 'selected' : ''} onClick={() => setSource('mcp')}>
          MCP / 消息协议
        </button>
      </div>
      <div hidden={source !== 'anelf'}>
        <ConnectionForm snapshot={snapshot} run={run} />
      </div>
      <div hidden={source !== 'mcp'}>
        <McpPanel url={snapshot.apiUrl} token={snapshot.apiToken} run={run} />
      </div>
      <details className="disclosure">
        <summary>应用与更新</summary>
        <p className="hint">{snapshot.dataDirectory}</p>
        <button onClick={() => run(() => window.embodied.openLocation('data'))}>
          打开数据目录
        </button>
        <UpdatePanel state={snapshot.update} run={run} />
      </details>
    </div>
  );
}
