
import { User, Message, PrivateRoom, ChatRequest } from '../types';

/**
 * Enhanced SocketService using BroadcastChannel for multi-tab communication.
 * This ensures the "anonymous chat" works immediately in the browser demo
 * environment where a persistent Node.js backend might not be reachable.
 */

type SocketEvent = 
  | { type: 'HEARTBEAT'; user: User; communityTimerEnd?: number; siteTimerEnd?: number }
  | { type: 'MESSAGE'; message: Message }
  | { type: 'CHAT_REQUEST'; request: ChatRequest }
  | { type: 'CHAT_ACCEPT'; requestId: string; room: PrivateRoom }
  | { type: 'CHAT_REJOIN'; reconnectCode: string }
  | { type: 'CHAT_EXIT'; roomId: string }
  | { type: 'CHAT_EXTEND'; roomId: string }
  | { type: 'INIT_STATE'; communityMessages: Message[]; communityTimerEnd: number; siteTimerEnd: number }
  | { type: 'RESET_COMMUNITY'; nextReset: number }
  | { type: 'RESET_SITE'; nextReset: number }
  | { type: 'ERROR'; message: string };

class SocketService {
  private channel: BroadcastChannel;
  private localListeners: Map<string, Set<(data: any) => void>> = new Map();

  constructor(user: User) {
    this.channel = new BroadcastChannel('ghost_talk_v3');
    
    // Broadcast self-presence on connection
    setTimeout(() => this.sendHeartbeat(user), 500);

    this.channel.onmessage = (event: MessageEvent<any>) => {
      const data = event.data;
      const eventType = data.type;
      
      if (this.localListeners.has(eventType)) {
        this.localListeners.get(eventType)?.forEach(cb => cb(data));
      }
    };
  }

  on<T>(event: string, callback: (data: T) => void) {
    if (!this.localListeners.has(event)) {
      this.localListeners.set(event, new Set());
    }
    this.localListeners.get(event)?.add(callback);

    // Return cleanup function
    return () => {
      this.localListeners.get(event)?.delete(callback);
    };
  }

  emit(data: any) {
    const payload = data.type ? data : { ...data, type: 'MESSAGE' };
    
    // Relay to other tabs
    this.channel.postMessage(payload);
    
    // Also trigger for the current tab (simulate loopback)
    if (this.localListeners.has(payload.type)) {
      this.localListeners.get(payload.type)?.forEach(cb => cb(payload));
    }
  }

  sendHeartbeat(user: User) {
    this.emit({ type: 'HEARTBEAT', user });
  }

  close() {
    this.channel.close();
    this.localListeners.clear();
  }
}

export default SocketService;
