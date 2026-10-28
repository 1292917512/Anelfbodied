export interface UpdateState {
  phase:
    | 'idle'
    | 'checking'
    | 'current'
    | 'available'
    | 'downloading'
    | 'ready'
    | 'installing'
    | 'error';
  currentVersion: string;
  nextVersion?: string;
  received: number;
  total: number;
  detail: string;
  supported: boolean;
}
