
import { User, Message, PrivateRoom, ChatRequest } from '../types';
import { generateId } from '../utils/helpers';

/**
 * Since this environment doesn't provide a persistent Node.js backend,
 * we use BroadcastChannel to simulate a WebSocket-like behavior 
 * that works across different browser tabs/windows.
 */

type SocketEvent = 
  | { type: 'HEARTBEAT'; user: User }
  | { type: 'MESSAGE'; message: Message }
  | { type: 'CHAT_REQUEST'; request: ChatRequest }
  | { type: 'CHAT_ACCEPT'; requestId: string; room: PrivateRoom }
  | { type: 'CHAT_REJOIN'; room: PrivateRoom; userId: string };

class SocketEmulator {
  private channel: BroadcastChannel;
  // Properly typed listeners map to support various event data types and avoid 'Function' which loses type info.
  private listeners: Map<string, Array<(data: any) => void>> = new Map();
  private currentUser: User;

  constructor(user: User) {
    this.currentUser = user;
    this.channel = new BroadcastChannel('anon_chat_v1');
    this.channel.onmessage = (event: MessageEvent<SocketEvent>) => {
      this.handleIncoming(event.data);
    };
  }

  private handleIncoming(data: SocketEvent) {
    const callbacks = this.listeners.get(data.type);
    if (callbacks) {
      callbacks.forEach(cb => cb(data));
    }
  }

  // Generic 'on' method without default 'any' to ensure that call-site provides type information or relies on inference.
  on<T>(event: string, callback: (data: T) => void) {
    const current = this.listeners.get(event) || [];
    this.listeners.set(event, [...current, callback]);
  }

  emit(data: SocketEvent) {
    // Also trigger locally for own events
    this.handleIncoming(data);
    this.channel.postMessage(data);
  }

  // Helper to send heartbeat
  sendHeartbeat() {
    this.emit({ type: 'HEARTBEAT', user: this.currentUser });
  }

  close() {
    this.channel.close();
  }
}

export default SocketEmulator;
