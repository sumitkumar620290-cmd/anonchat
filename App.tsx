
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, Message, PrivateRoom, ChatRequest, RoomType } from './types';
import { generateId, generateUsername, generateReconnectCode } from './utils/helpers';
import SocketService from './services/socketService';
import ChatBox from './components/ChatBox';

interface InitStatePayload {
  communityMessages: Message[];
  communityTimerEnd: number;
  siteTimerEnd: number;
}

interface HeartbeatPayload {
  user: User;
  communityTimerEnd?: number;
  siteTimerEnd?: number;
}

interface MessagePayload {
  message: Message;
}

interface ResetCommunityPayload {
  nextReset: number;
}

interface ChatRequestPayload {
  request: ChatRequest;
}

interface ChatAcceptPayload {
  requestId: string;
  room: PrivateRoom;
}

const App: React.FC = () => {
  // UI States
  const [isAgeVerified, setIsAgeVerified] = useState<boolean | null>(null);
  const [showMobileRules, setShowMobileRules] = useState(false);
  const [showPeers, setShowPeers] = useState(false);
  
  const [currentUser, setCurrentUser] = useState<User>(() => ({
    id: generateId(),
    username: generateUsername(),
    lastActive: Date.now(),
    acceptingRequests: false, 
    isDeciding: false
  }));

  const [isOpenToPrivate, setIsOpenToPrivate] = useState(false);
  const [reportedMessageIds] = useState<Set<string>>(new Set());
  const [hiddenUserIds, setHiddenUserIds] = useState<Set<string>>(new Set());
  const [sentRequestIds, setSentRequestIds] = useState<Set<string>>(new Set());
  
  // Profile Action Popup State
  const [userPopup, setUserPopup] = useState<{ userId: string, username: string } | null>(null);

  const isOpenToPrivateRef = useRef(isOpenToPrivate);
  useEffect(() => {
    isOpenToPrivateRef.current = isOpenToPrivate;
    setCurrentUser(prev => ({ ...prev, acceptingRequests: isOpenToPrivate }));
  }, [isOpenToPrivate]);

  const [commTimerEnd, setCommTimerEnd] = useState<number>(Date.now() + 1800000);
  const [timeLeftStr, setTimeLeftStr] = useState('00:00');

  const [messages, setMessages] = useState<Message[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string>('community');
  const [activeRoomType, setActiveRoomType] = useState<RoomType>(RoomType.COMMUNITY);
  const [privateRooms, setPrivateRooms] = useState<Map<string, PrivateRoom>>(() => new Map());
  const [onlineUsers, setOnlineUsers] = useState<Map<string, User>>(() => new Map());

  const [activeIncomingRequest, setActiveIncomingRequest] = useState<ChatRequest | null>(null);
  const requestExpiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const socket = useMemo(() => new SocketService(currentUser), []);

  useEffect(() => {
    const hb = setInterval(() => {
      socket.sendHeartbeat();
    }, 5000);
    return () => clearInterval(hb);
  }, [socket]);

  useEffect(() => {
    const tick = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, commTimerEnd - now);
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeftStr(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
      
      // If timer hits zero locally, clear community messages
      if (diff === 0 && activeRoomType === RoomType.COMMUNITY) {
          setMessages(prev => prev.filter(m => m.roomId !== 'community'));
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [commTimerEnd, activeRoomType]);

  const handleSendMessage = (text: string) => {
    const msg: Message = {
      id: generateId(),
      senderId: currentUser.id,
      senderName: currentUser.username,
      text,
      timestamp: Date.now(),
      roomId: activeRoomId
    };
    
    setMessages(prev => {
      if (prev.find(m => m.id === msg.id)) return prev;
      return [...prev, msg];
    });

    socket.emit({ type: 'MESSAGE', message: msg });
  };

  const sendRequest = (targetUser: User) => {
    if (targetUser.id === currentUser.id) return;
    if (sentRequestIds.has(targetUser.id)) return;
    if (privateRooms.size > 0) {
      alert("You can only have one active private chat.");
      return;
    }
    if (!targetUser.acceptingRequests || targetUser.isDeciding) return;
    
    socket.emit({
      type: 'CHAT_REQUEST',
      request: {
        id: generateId(),
        fromId: currentUser.id,
        fromName: currentUser.username,
        toId: targetUser.id,
        timestamp: Date.now()
      }
    });
    
    setSentRequestIds(prev => new Set(prev).add(targetUser.id));
    alert(`Private chat request sent to ${targetUser.username}!`);
    setUserPopup(null);
  };

  const acceptRequest = (req: ChatRequest) => {
    if (privateRooms.size > 0) {
      alert("You already have an active private chat.");
      setActiveIncomingRequest(null);
      setCurrentUser(prev => ({ ...prev, isDeciding: false }));
      return;
    }
    if (requestExpiryTimer.current) clearTimeout(requestExpiryTimer.current);
    const room: PrivateRoom = {
      id: generateId(),
      participants: [req.fromId, req.toId],
      reconnectCode: generateReconnectCode(),
      createdAt: Date.now(),
      expiresAt: Date.now() + 1800000
    };
    socket.emit({ type: 'CHAT_ACCEPT', requestId: req.id, room });
    setActiveIncomingRequest(null);
    setCurrentUser(prev => ({ ...prev, isDeciding: false }));
  };

  useEffect(() => {
    socket.on<InitStatePayload>('INIT_STATE', (data) => {
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const newMessages = (data.communityMessages || []).filter(m => !existingIds.has(m.id));
        return [...prev, ...newMessages];
      });
      setCommTimerEnd(data.communityTimerEnd);
    });

    socket.on<HeartbeatPayload>('HEARTBEAT', (data) => {
      setOnlineUsers(prev => {
        const next = new Map(prev);
        next.set(data.user.id, { ...data.user, lastActive: Date.now() });
        return next;
      });
      if (data.communityTimerEnd) setCommTimerEnd(data.communityTimerEnd);
    });

    socket.on<MessagePayload>('MESSAGE', (data) => {
      setMessages(prev => {
        if (prev.find(m => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
    });

    socket.on<ResetCommunityPayload>('RESET_COMMUNITY', (data) => {
      setMessages(prev => prev.filter(m => m.roomId !== 'community'));
      setCommTimerEnd(data.nextReset);
    });

    socket.on('RESET_SITE', () => {
      window.location.reload();
    });

    socket.on<ChatRequestPayload>('CHAT_REQUEST', (data) => {
      if (data.request.toId === currentUser.id && isOpenToPrivateRef.current && privateRooms.size === 0) {
        setCurrentUser(prev => {
          if (prev.isDeciding) return prev;
          setActiveIncomingRequest(data.request);
          if (requestExpiryTimer.current) clearTimeout(requestExpiryTimer.current);
          requestExpiryTimer.current = setTimeout(() => {
            setActiveIncomingRequest(null);
            setCurrentUser(p => ({ ...p, isDeciding: false }));
          }, 30000);
          return { ...prev, isDeciding: true };
        });
      }
    });

    socket.on<ChatAcceptPayload>('CHAT_ACCEPT', (data) => {
      setPrivateRooms(prev => {
        const next = new Map(prev);
        next.set(data.room.id, data.room);
        return next;
      });
      if (data.room.participants.includes(currentUser.id)) {
        setActiveRoomId(data.room.id);
        setActiveRoomType(RoomType.PRIVATE);
      }
    });

    return () => socket.close();
  }, [socket, currentUser.id, privateRooms.size]);

  const activeMessages = useMemo(() => 
    messages.filter(m => 
      m.roomId === activeRoomId && 
      !reportedMessageIds.has(m.id) &&
      !hiddenUserIds.has(m.senderId)
    ), 
    [messages, activeRoomId, reportedMessageIds, hiddenUserIds]
  );

  const [showReconnectModal, setShowReconnectModal] = useState(false);
  const [reconnectInput, setReconnectInput] = useState('');

  const BMC_LINK = "https://www.buymeacoffee.com";

  // AGE MODAL UI
  if (isAgeVerified === null) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full p-8 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl animate-in zoom-in-95">
          <div className="text-4xl mb-4">🔞</div>
          <h2 className="text-2xl font-black mb-4 uppercase tracking-tighter">Are you 18+?</h2>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">
            This space is for 18+ conversations only. By entering, you confirm you are of legal age.
          </p>
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => setIsAgeVerified(true)}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl transition-all uppercase tracking-widest active:scale-95 shadow-xl shadow-blue-900/20"
            >
              Yes, I am 18+
            </button>
            <button 
              onClick={() => setIsAgeVerified(false)}
              className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold rounded-2xl transition-all"
            >
              No
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isAgeVerified === false) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full p-8 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl">
          <div className="text-4xl mb-4">⛔</div>
          <h2 className="text-2xl font-black mb-4 uppercase tracking-tighter">Access Denied</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            This space is for 18+ conversations only. Come back when you're older!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] w-screen overflow-hidden bg-slate-950 text-slate-100 selection:bg-blue-500/30">
      
      {/* DESKTOP LEFT SIDEBAR */}
      <aside className="hidden md:flex flex-col w-72 bg-slate-900 border-r border-white/5 shrink-0">
        <div className="p-8 flex flex-col h-full">
          <div className="mb-10">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center font-black text-white shadow-lg">
                {currentUser.username.charAt(5)}
              </div>
              <div>
                <p className="text-lg font-black tracking-tight leading-none">Ghost Talk</p>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Temporary Conversations</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] mb-2">Rules</h4>
              <ul className="text-xs text-slate-400 space-y-3 leading-relaxed">
                <li className="flex items-start space-x-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>No login. Completely anonymous.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Be respectful to other ghosts.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Private chat requires mutual consent.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>No spamming or illegal activity.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Abuse may result in instant session removal.</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-auto space-y-3">
            <button 
              onClick={() => setShowReconnectModal(true)}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-slate-300 flex items-center justify-center space-x-2 border border-white/5"
            >
              <span>🔑</span>
              <span>Rejoin Session</span>
            </button>
            <a 
              href={BMC_LINK} 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-full py-4 bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center space-x-2 border border-amber-500/20"
            >
              <span>☕</span>
              <span>Buy Me a Coffee</span>
            </a>
          </div>
        </div>
      </aside>

      {/* RIGHT MAIN AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* HEADER */}
        <header className="z-50 h-16 md:h-20 bg-slate-900/95 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-3 md:px-8 shrink-0">
          
          <div className="flex items-center min-w-0">
            <button 
              onClick={() => setShowMobileRules(true)}
              className="flex items-center space-x-2 md:hidden"
            >
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-xs font-black shrink-0">
                {currentUser.username.charAt(5)}
              </div>
              <span className="text-[10px] font-black tracking-widest uppercase truncate max-w-[50px]">Ghost</span>
            </button>
            
            <div className="hidden md:flex items-center space-x-2 bg-slate-950/50 px-3 py-1.5 rounded-lg border border-white/5">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Live</span>
            </div>
          </div>

          {/* Center: BMC (mobile) + Private Chat Toggle */}
          <div className="flex items-center space-x-1.5 md:space-x-3">
            <a 
              href={BMC_LINK} 
              target="_blank" 
              rel="noopener noreferrer"
              className="md:hidden p-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-full border border-amber-500/20 transition-all active:scale-95"
              title="Support with a coffee"
            >
              <span className="text-xs">☕</span>
            </a>
            
            <button 
              onClick={() => setIsOpenToPrivate(!isOpenToPrivate)}
              className={`flex items-center space-x-2 md:space-x-3 px-2.5 md:px-6 py-1.5 md:py-2.5 rounded-full border transition-all duration-300 ${
                isOpenToPrivate 
                  ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(59,130,246,0.2)] border-blue-400' 
                  : 'bg-slate-800 border-white/10 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span className="text-[9px] md:text-xs font-black uppercase tracking-widest leading-none">Private Chat</span>
              <span className="text-[8px] opacity-60 font-bold uppercase leading-none">{isOpenToPrivate ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          {/* Right: Global Timer & Peers */}
          <div className="flex items-center space-x-1.5 md:space-x-4">
            {/* GLOBAL RESET TIMER BOX - PC, Phone, Tablet */}
            <div className="flex items-center bg-blue-600/10 border border-blue-500/20 rounded-lg overflow-hidden h-8 md:h-10">
              <div className="bg-blue-600 px-1.5 md:px-3 h-full flex items-center">
                <span className="text-[8px] md:text-[10px] font-black uppercase text-white tracking-tighter leading-none">Global</span>
              </div>
              <div className="px-2 md:px-3 h-full flex items-center min-w-[44px] md:min-w-[64px] justify-center">
                <span className="text-[10px] md:text-sm font-mono font-black text-blue-400 leading-none tabular-nums glow-blue">{timeLeftStr}</span>
              </div>
            </div>
            
            <button 
              onClick={() => setShowPeers(!showPeers)}
              className="p-2 md:p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors border border-white/5 relative"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              {onlineUsers.size > 1 && (
                <span className="absolute -top-1 -right-1 bg-blue-600 text-[8px] font-black w-3.5 h-3.5 md:w-4 md:h-4 rounded-full flex items-center justify-center border-2 border-slate-900">
                  {onlineUsers.size - 1}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 flex overflow-hidden relative">
          <div className="flex-1 flex flex-col relative bg-slate-950">
            {/* Room Indicator */}
            <div className="absolute top-4 left-0 right-0 z-30 flex justify-center pointer-events-none">
              <div className="flex bg-slate-900/60 backdrop-blur-xl p-1 rounded-2xl border border-white/10 shadow-2xl pointer-events-auto">
                <button 
                  onClick={() => { setActiveRoomId('community'); setActiveRoomType(RoomType.COMMUNITY); }}
                  className={`px-4 md:px-6 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${
                    activeRoomType === RoomType.COMMUNITY 
                      ? 'bg-blue-600 text-white shadow-lg' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Global
                </button>
                {Array.from<PrivateRoom>(privateRooms.values()).map(room => (
                  <button 
                    key={room.id}
                    onClick={() => { setActiveRoomId(room.id); setActiveRoomType(RoomType.PRIVATE); }}
                    className={`px-4 md:px-6 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ml-1 ${
                      activeRoomId === room.id 
                        ? 'bg-indigo-600 text-white shadow-lg' 
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Secret Chat
                  </button>
                ))}
              </div>
            </div>

            {/* Notification */}
            {activeIncomingRequest && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm md:max-w-md animate-in slide-in-from-top-10 fade-in duration-500">
                <div className="bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.7)] p-5 flex items-center justify-between border border-white/20 overflow-hidden relative">
                  <div className="absolute top-0 left-0 h-1.5 bg-blue-100/50 w-full"></div>
                  <div className="absolute top-0 left-0 h-1.5 bg-blue-600 animate-[timer_30s_linear_forwards]"></div>
                  
                  <div className="flex items-center space-x-5 min-w-0">
                    <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-indigo-700 text-white rounded-full flex items-center justify-center shrink-0 font-black text-3xl shadow-2xl ring-4 ring-white relative overflow-hidden group">
                      <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                      <span className="relative z-10">!</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-slate-900 text-sm font-black uppercase tracking-tight truncate leading-tight">
                        {activeIncomingRequest.fromName}
                      </p>
                      <p className="text-slate-500 text-[9px] font-bold uppercase tracking-[0.2em] mt-1 leading-none">
                        Wants Private Chat
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2 shrink-0">
                    <button 
                      onClick={() => { setActiveIncomingRequest(null); setCurrentUser(p => ({ ...p, isDeciding: false })); }} 
                      className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-colors"
                    >
                      Ignore
                    </button>
                    <button 
                      onClick={() => acceptRequest(activeIncomingRequest)} 
                      className="px-7 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-[0_15px_30px_-5px_rgba(37,99,235,0.4)] active:scale-95 transition-all"
                    >
                      Join
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Profile Action Popup */}
            {userPopup && (
              <div className="fixed inset-0 z-[80] flex items-center justify-center p-6 md:absolute md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2">
                <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm md:hidden" onClick={() => setUserPopup(null)}></div>
                <div className="relative bg-slate-900 border border-white/10 p-6 md:p-8 rounded-[2rem] w-full max-w-xs shadow-2xl animate-in zoom-in-95 duration-200">
                  <h4 className="text-center font-black text-xl mb-6 truncate">{userPopup.username}</h4>
                  <div className="space-y-3">
                    <button 
                      disabled={sentRequestIds.has(userPopup.userId) || privateRooms.size > 0}
                      onClick={() => {
                        const target = onlineUsers.get(userPopup.userId);
                        if (target) sendRequest(target);
                      }}
                      className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-20 disabled:cursor-not-allowed text-white font-black rounded-2xl text-xs uppercase tracking-widest transition-all active:scale-95"
                    >
                      {sentRequestIds.has(userPopup.userId) ? 'Request Sent' : 'Start Private Chat'}
                    </button>
                    <button 
                      onClick={() => {
                        setHiddenUserIds(prev => new Set(prev).add(userPopup.userId));
                        setUserPopup(null);
                      }}
                      className="w-full py-4 bg-slate-800 hover:bg-red-900/20 hover:text-red-400 text-slate-400 font-bold rounded-2xl text-[10px] uppercase tracking-widest transition-all"
                    >
                      Report User
                    </button>
                    <button 
                      onClick={() => setUserPopup(null)}
                      className="w-full py-3 text-slate-600 font-bold uppercase text-[9px] tracking-widest"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 min-h-0 pt-20 md:pt-0">
              <ChatBox 
                messages={activeMessages} 
                currentUser={currentUser} 
                onSendMessage={handleSendMessage}
                title={activeRoomType === RoomType.COMMUNITY ? 'Global' : 'Secret'}
                isCommunity={activeRoomType === RoomType.COMMUNITY}
                onUserClick={(userId, username) => setUserPopup({ userId, username })}
              />
            </div>
          </div>

          {/* PEERS SIDEBAR */}
          <aside className={`
            fixed inset-y-0 right-0 z-[70] w-64 md:w-72 bg-slate-900 border-l border-white/5 transform transition-transform duration-500 ease-in-out
            ${showPeers ? 'translate-x-0 shadow-2xl' : 'translate-x-full'}
          `}>
            <div className="h-full flex flex-col p-6">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-black text-white/50 uppercase text-[10px] tracking-widest">Active Ghosts</h3>
                <button onClick={() => setShowPeers(false)} className="text-slate-500 hover:text-white">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                {Array.from<User>(onlineUsers.values())
                  .filter(u => u.id !== currentUser.id && !hiddenUserIds.has(u.id))
                  .map(u => (
                  <button 
                    key={u.id} 
                    onClick={() => setUserPopup({ userId: u.id, username: u.username })}
                    className="w-full text-left p-4 bg-white/[0.03] border border-white/[0.05] rounded-2xl flex items-center justify-between group transition-all hover:bg-white/[0.06]"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-black truncate">{u.username}</p>
                      <div className="flex items-center space-x-1.5 mt-1">
                         <div className={`w-1 h-1 rounded-full ${u.acceptingRequests ? 'bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'bg-slate-600'}`}></div>
                         <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
                           {u.isDeciding ? 'Busy' : (u.acceptingRequests ? 'Unlocked' : 'Locked')}
                         </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </main>
      </div>

      {/* MOBILE RULES PANEL */}
      {showMobileRules && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-end md:hidden">
          <div className="w-full bg-slate-900 rounded-t-[2.5rem] p-8 border-t border-white/10 animate-in slide-in-from-bottom-full duration-300">
            <div className="w-12 h-1.5 bg-slate-800 rounded-full mx-auto mb-8"></div>
            <div className="flex items-center space-x-4 mb-8">
              <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center font-black text-2xl text-white">
                {currentUser.username.charAt(5)}
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">Ghost Talk</h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">Session: {currentUser.username}</p>
              </div>
            </div>
            <div className="space-y-4 mb-10">
              <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">Guidelines</h4>
              <ul className="text-sm text-slate-400 space-y-3 leading-relaxed">
                <li>• No login. Completely anonymous.</li>
                <li>• Be respectful to other ghosts.</li>
                <li>• Private chat requires mutual consent.</li>
                <li>• No spamming or illegal activity.</li>
                <li>• Abuse may result in instant session removal.</li>
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => {
                  setShowMobileRules(false);
                  setShowReconnectModal(true);
                }}
                className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-2xl text-center uppercase tracking-widest flex items-center justify-center space-x-2 border border-white/5"
              >
                <span>🔑</span>
                <span>Rejoin Session</span>
              </button>
              <a href={BMC_LINK} target="_blank" rel="noopener noreferrer" className="w-full py-4 bg-amber-500 text-white font-black rounded-2xl text-center uppercase tracking-widest">Support with ☕</a>
              <button onClick={() => setShowMobileRules(false)} className="w-full py-4 bg-slate-800/50 text-slate-500 font-bold rounded-2xl">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* REJOIN MODAL */}
      {showReconnectModal && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl flex items-center justify-center z-[100] p-4">
          <div className="bg-slate-900 p-8 md:p-12 rounded-[2.5rem] w-full max-sm border border-white/5 shadow-2xl">
            <div className="text-center mb-10">
              <div className="w-20 h-20 bg-blue-600/10 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-6 border border-blue-600/20">🔑</div>
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Secret Key</h3>
              <p className="text-[10px] text-slate-500 font-bold mt-2 uppercase tracking-[0.2em]">Verify session ownership</p>
            </div>
            <input 
              type="text" 
              maxLength={6}
              value={reconnectInput}
              onChange={(e) => setReconnectInput(e.target.value.toUpperCase())}
              className="w-full bg-slate-950/80 border-2 border-slate-800 rounded-2xl p-6 text-3xl text-center font-mono font-black tracking-[0.4em] text-blue-400 mb-8 focus:border-blue-500 outline-none transition-all placeholder:text-slate-800"
              placeholder="••••••"
            />
            <button 
              onClick={() => {
                const room = Array.from<PrivateRoom>(privateRooms.values()).find(r => r.reconnectCode === reconnectInput);
                if (room) {
                  setActiveRoomId(room.id);
                  setActiveRoomType(RoomType.PRIVATE);
                  setShowReconnectModal(false);
                } else {
                  alert("Session Key Invalid.");
                }
              }} 
              className="w-full py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black uppercase tracking-widest transition-all active:scale-95"
            >
              Restore Session
            </button>
            <button onClick={() => setShowReconnectModal(false)} className="w-full py-4 mt-2 text-slate-500 font-bold uppercase text-[10px]">Cancel</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes timer { from { width: 100%; } to { width: 0%; } }
        .glow-blue { text-shadow: 0 0 10px rgba(59, 130, 246, 0.5); }
      `}</style>
    </div>
  );
};

export default App;
