
import { io, Socket } from 'socket.io-client';
import { User, Message, PrivateRoom, ChatRequest } from '../types';

type SocketEvent = 
  | { type: 'HEARTBEAT'; user: User; communityTimerEnd?: number; siteTimerEnd?: number }
  | { type: 'MESSAGE'; message: Message }
  | { type: 'CHAT_REQUEST'; request: ChatRequest }
  | { type: 'CHAT_ACCEPT'; requestId: string; room: PrivateRoom }
  | { type: 'CHAT_REJOIN'; reconnectCode: string }
  | { type: 'INIT_STATE'; communityMessages: Message[]; communityTimerEnd: number; siteTimerEnd: number }
  | { type: 'RESET_COMMUNITY'; nextReset: number }
  | { type: 'RESET_SITE'; nextReset: number }
  | { type: 'ERROR'; message: string };

class SocketService {
  private socket: Socket;
  private channel: BroadcastChannel;
  private localListeners: Map<string, Set<(data: any) => void>> = new Map();

  constructor(user: User) {
    this.socket = io({
      reconnectionAttempts: 5,
      timeout: 10000,
    });
    
    this.channel = new BroadcastChannel('anon_chat_relay_v2');
    
    this.socket.on('connect', () => {
      this.sendHeartbeat(user);
    });

    // Handle cross-tab relaying
    this.channel.onmessage = (event: MessageEvent<any>) => {
      const data = event.data;
      const eventType = data.type;
      if (this.localListeners.has(eventType)) {
        this.localListeners.get(eventType)?.forEach(cb => cb(data));
      }
      // Special case for heartbeat
      if (eventType === 'HEARTBEAT' && this.localListeners.has('HEARTBEAT')) {
        this.localListeners.get('HEARTBEAT')?.forEach(cb => cb(data));
      }
    };
  }

  on<T>(event: string, callback: (data: T) => void) {
    // Listen to real socket
    this.socket.on(event, (data: T) => callback(data));
    
    // Manage local simulation listeners
    if (!this.localListeners.has(event)) {
      this.localListeners.set(event, new Set());
    }
    this.localListeners.get(event)?.add(callback);

    // Return cleanup function
    return () => {
      this.socket.off(event, callback);
      this.localListeners.get(event)?.delete(callback);
    };
  }

  emit(data: any) {
    const payload = data.type ? data : { ...data, type: 'MESSAGE' };
    this.socket.emit(payload.type, payload);
    
    // Relay to other tabs immediately
    this.channel.postMessage(payload);
    
    // Also trigger for the current tab
    if (this.localListeners.has(payload.type)) {
      this.localListeners.get(payload.type)?.forEach(cb => cb(payload));
    }
  }

  sendHeartbeat(user: User) {
    this.emit({ type: 'HEARTBEAT', user });
  }

  close() {
    this.socket.disconnect();
    this.channel.close();
    this.localListeners.clear();
  }
}

export default SocketService;
