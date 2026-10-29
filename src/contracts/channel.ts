export interface ChatLine {
  id: string;
  role: string;
  text: string;
}
export interface ConnectionState {
  status: 'offline' | 'connecting' | 'syncing' | 'online' | 'reconnecting' | 'error';
  detail: string;
  messages: ChatLine[];
  draft: string;
  session: string;
  busy: boolean;
}
