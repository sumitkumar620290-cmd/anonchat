
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
  const [reportedMessageIds, setReportedMessageIds] = useState<Set<string>>(new Set());

  const isOpenToPrivateRef = useRef(isOpenToPrivate);
  useEffect(() => {
    isOpenToPrivateRef.current = isOpenToPrivate;
    setCurrentUser(prev => ({ ...prev, acceptingRequests: isOpenToPrivate }));
  }, [isOpenToPrivate]);

  const [commTimerEnd, setCommTimerEnd] = useState<number>(Date.now() + 1800000);
  const [siteTimerEnd, setSiteTimerEnd] = useState<number>(Date.now() + 7200000);
  const [timeLeftStr, setTimeLeftStr] = useState('00:00');

  const [messages, setMessages] = useState<Message[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string>('community');
  const [activeRoomType, setActiveRoomType] = useState<RoomType>(RoomType.COMMUNITY);
  const [privateRooms, setPrivateRooms] = useState<Map<string, PrivateRoom>>(() => new Map());
  const [onlineUsers, setOnlineUsers] = useState<Map<string, User>>(() => new Map());

  const [activeIncomingRequest, setActiveIncomingRequest] = useState<ChatRequest | null>(null);
  const cooldowns = useRef<Map<string, number>>(new Map());
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
    }, 1000);
    return () => clearInterval(tick);
  }, [commTimerEnd]);

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
    const cooldownEnd = cooldowns.current.get(targetUser.id);
    if (cooldownEnd && Date.now() < cooldownEnd) {
      alert(`Cooldown active for ${targetUser.username}.`);
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
    cooldowns.current.set(targetUser.id, Date.now() + 180000);
    alert(`Private chat request sent to ${targetUser.username}!`);
  };

  const acceptRequest = (req: ChatRequest) => {
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
      setSiteTimerEnd(data.siteTimerEnd);
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
      if (data.request.toId === currentUser.id && isOpenToPrivateRef.current) {
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
  }, [socket, currentUser.id]);

  const activeMessages = useMemo(() => 
    messages.filter(m => m.roomId === activeRoomId && !reportedMessageIds.has(m.id)), 
    [messages, activeRoomId, reportedMessageIds]
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
      
      {/* 2. DESKTOP LEFT SIDEBAR (FIXED) */}
      <aside className="hidden md:flex flex-col w-72 bg-slate-900 border-r border-white/5 shrink-0">
        <div className="p-8 flex flex-col h-full">
          <div className="mb-10">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center font-black text-white shadow-lg">
                {currentUser.username.charAt(5)}
              </div>
              <p className="text-lg font-black tracking-tight">{currentUser.username}</p>
            </div>
            
            <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] mb-2">Rules</h4>
              <ul className="text-xs text-slate-400 space-y-3 leading-relaxed">
                <li className="flex items-start space-x-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>No login, completely anonymous.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Messages vanish after 5 mins.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Be respectful to other ghosts.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Private chat requires mutual consent.</span>
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
        <header className="z-50 h-16 md:h-18 bg-slate-900/95 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-4 md:px-8 shrink-0">
          
          {/* Left: Identity / Mobile Rules Toggle */}
          <div className="flex items-center">
            <button 
              onClick={() => setShowMobileRules(true)}
              className="flex items-center space-x-2 md:hidden"
            >
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-xs font-black">
                {currentUser.username.charAt(5)}
              </div>
              <span className="text-xs font-bold truncate max-w-[60px]">{currentUser.username}</span>
            </button>
            
            <div className="hidden md:flex items-center space-x-2 bg-slate-950/50 px-3 py-1.5 rounded-lg border border-white/5">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Live Connection</span>
            </div>
          </div>

          {/* Center: Large Private Chat Toggle */}
          <div className="flex flex-col items-center">
            <button 
              onClick={() => setIsOpenToPrivate(!isOpenToPrivate)}
              className={`flex items-center space-x-2 md:space-x-3 px-3 md:px-6 py-1.5 md:py-2.5 rounded-full border transition-all duration-300 ${
                isOpenToPrivate 
                  ? 'bg-blue-600/20 border-blue-500/50 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.2)]' 
                  : 'bg-slate-800/80 border-white/10 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <span className="text-sm md:text-lg">{isOpenToPrivate ? '🔓' : '🔒'}</span>
              <div className="flex flex-col items-start leading-none text-left">
                <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.1em]">Private Chat</span>
                <span className="text-[8px] md:text-[9px] font-bold uppercase opacity-60">({isOpenToPrivate ? 'ON' : 'OFF'})</span>
              </div>
            </button>
          </div>

          {/* Right: BMC & Timer */}
          <div className="flex items-center space-x-3 md:space-x-5">
            <div className="flex items-center space-x-2">
              <div className="hidden xs:flex flex-col items-end mr-1">
                <span className="text-[8px] text-slate-500 font-black uppercase tracking-tighter">Community Reset</span>
                <span className="text-xs md:text-base font-mono font-black text-blue-400">{timeLeftStr}</span>
              </div>
              <a 
                href={BMC_LINK} 
                target="_blank" 
                rel="noopener noreferrer"
                className="p-2 md:p-2.5 bg-slate-800 hover:bg-amber-500 text-amber-500 hover:text-white rounded-xl transition-all border border-white/5 active:scale-90"
                title="Buy Me a Coffee"
              >
                <span className="text-lg md:text-xl">☕</span>
              </a>
              <button 
                onClick={() => setShowPeers(!showPeers)}
                className="p-2 md:p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors border border-white/5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 flex overflow-hidden relative">
          
          {/* Main Chat Feed Area */}
          <div className="flex-1 flex flex-col relative bg-slate-950">
            
            {/* Room Indicator Overlay */}
            <div className="absolute top-4 left-0 right-0 z-30 flex justify-center pointer-events-none">
              <div className="flex bg-slate-900/40 backdrop-blur-md p-1 rounded-2xl border border-white/5 shadow-2xl pointer-events-auto">
                <button 
                  onClick={() => { setActiveRoomId('community'); setActiveRoomType(RoomType.COMMUNITY); }}
                  className={`px-4 md:px-6 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${
                    activeRoomType === RoomType.COMMUNITY 
                      ? 'bg-blue-600 text-white shadow-lg' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Community
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
                    Secret DM
                  </button>
                ))}
              </div>
            </div>

            {/* High-Fidelity Notification for Private Chat Requests */}
            {activeIncomingRequest && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm md:max-w-md animate-in slide-in-from-top-10 fade-in duration-500">
                <div className="bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.7)] p-5 flex items-center justify-between border border-white/20 overflow-hidden relative">
                  {/* Timer Progress Bar */}
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
                        Private Request
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

            <div className="flex-1 min-h-0 pt-20 md:pt-0">
              <ChatBox 
                messages={activeMessages} 
                currentUser={currentUser} 
                onSendMessage={handleSendMessage}
                title={activeRoomType === RoomType.COMMUNITY ? 'Global Chat' : 'Secret DM'}
                isCommunity={activeRoomType === RoomType.COMMUNITY}
                onUserClick={(userId) => {
                  const u = onlineUsers.get(userId);
                  if (u && u.acceptingRequests) {
                    if (confirm(`Send Private Chat Request to ${u.username}?`)) {
                      sendRequest(u);
                    }
                  }
                }}
                onReport={(msgId) => setReportedMessageIds(prev => new Set(prev).add(msgId))}
              />
            </div>
          </div>

          {/* PEERS SIDEBAR (Slide-in) */}
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
                {Array.from<User>(onlineUsers.values()).filter(u => u.id !== currentUser.id).map(u => (
                  <div key={u.id} className="p-3 bg-white/[0.03] border border-white/[0.05] rounded-2xl flex items-center justify-between group transition-all hover:bg-white/[0.06]">
                    <div className="min-w-0">
                      <p className="text-xs font-black truncate">{u.username}</p>
                      <div className="flex items-center space-x-1.5 mt-1">
                         <div className={`w-1 h-1 rounded-full ${u.acceptingRequests ? 'bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'bg-slate-600'}`}></div>
                         <span className="text-[9px] font-bold text-slate-500 uppercase">
                           {u.isDeciding ? 'Busy' : (u.acceptingRequests ? 'Accepting Requests' : 'DM Locked')}
                         </span>
                      </div>
                    </div>
                    {u.acceptingRequests && !u.isDeciding && (
                      <button 
                        onClick={() => sendRequest(u)}
                        className="bg-blue-600 p-2 rounded-xl text-white shadow-lg active:scale-90 transition-transform"
                        title="Send Request"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                      </button>
                    )}
                  </div>
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
                <h3 className="text-xl font-black uppercase tracking-tight">{currentUser.username}</h3>
                <p className="text-green-500 text-[10px] font-bold uppercase tracking-widest">Active Session</p>
              </div>
            </div>
            <div className="space-y-4 mb-10">
              <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">Guidelines</h4>
              <ul className="text-sm text-slate-400 space-y-3 leading-relaxed">
                <li>• No login, no persistent identity.</li>
                <li>• Community messages auto-delete every 5 mins.</li>
                <li>• Private chat needs mutual consent.</li>
                <li>• This is an 18+ space.</li>
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              <a href={BMC_LINK} target="_blank" rel="noopener noreferrer" className="w-full py-4 bg-amber-500 text-white font-black rounded-2xl text-center uppercase tracking-widest">Support with ☕</a>
              <button onClick={() => setShowMobileRules(false)} className="w-full py-4 bg-slate-800 text-slate-400 font-bold rounded-2xl">Close</button>
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
      `}</style>
    </div>
  );
};

export default App;
