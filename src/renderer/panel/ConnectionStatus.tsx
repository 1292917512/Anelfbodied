import type { ConnectionState } from '../../integrations/anelf/schema';
import { connectionDescriptions, connectionLabels } from '../connection-state';

export function ConnectionStatus({ connection }: { connection: ConnectionState }) {
  const { status, detail } = connection;
  return (
    <section className={`channel-status ${status}`} aria-label="频道状态" role="status">
      <div>
        <strong>Anelf 频道</strong>
        <span>{connectionLabels[status]}</span>
      </div>
      <p>{detail || connectionDescriptions[status]}</p>
    </section>
  );
}
