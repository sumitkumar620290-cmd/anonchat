
import { io, Socket } from 'socket.io-client';
import { User, Message, PrivateRoom, ChatRequest } from '../types';

type SocketEvent = 
  | { type: 'HEARTBEAT'; user: User; communityTimerEnd?: number; siteTimerEnd?: number }
  | { type: 'MESSAGE'; message: Message }
  | { type: 'CHAT_REQUEST'; request: ChatRequest }
  | { type: 'CHAT_ACCEPT'; requestId: string; room: PrivateRoom }
  | { type: 'CHAT_REJOIN'; room: PrivateRoom; userId: string }
  | { type: 'INIT_STATE'; communityMessages: Message[]; communityTimerEnd: number; siteTimerEnd: number }
  | { type: 'RESET_COMMUNITY'; nextReset: number }
  | { type: 'RESET_SITE'; nextReset: number };

class SocketService {
  private socket: Socket;
  private currentUser: User;
  private channel: BroadcastChannel;

  constructor(user: User) {
    this.currentUser = user;
    this.socket = io({
      reconnectionAttempts: 5,
      timeout: 10000,
    });
    
    // BroadcastChannel for local/preview relay when server is missing
    this.channel = new BroadcastChannel('anon_chat_relay');
    
    this.socket.on('connect', () => {
      console.log('Connected to real-time server');
      this.sendHeartbeat();
    });

    this.socket.on('connect_error', () => {
      console.warn('Socket.io connection failed. Using local relay for preview.');
    });

    this.channel.onmessage = (event: MessageEvent<SocketEvent>) => {
      // Relay broadcast messages to socket listeners locally
      const data = event.data;
      // We don't relay back messages we sent to the channel ourselves to avoid loops
      // but App.tsx handles dedup anyway.
      this.socket.emit('local_relay', data);
    };
  }

  on<T>(event: string, callback: (data: T) => void) {
    this.socket.on(event, (data: T) => callback(data));
    
    // Also listen to the broadcast channel for the same event types
    this.channel.addEventListener('message', (msgEvent: MessageEvent<any>) => {
      if (msgEvent.data.type === event || (event === 'HEARTBEAT' && msgEvent.data.user)) {
        callback(msgEvent.data as T);
      }
    });
  }

  emit(data: any) {
    // Send to real server
    this.socket.emit(data.type || 'MESSAGE', data);
    
    // Also broadcast locally so other tabs see it (and for local preview)
    this.channel.postMessage(data);
  }

  sendHeartbeat() {
    this.emit({ type: 'HEARTBEAT', user: this.currentUser });
  }

  close() {
    this.socket.disconnect();
    this.channel.close();
  }
}

export default SocketService;
