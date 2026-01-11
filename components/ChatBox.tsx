
import React, { useState, useEffect, useRef } from 'react';
import { Message, User } from '../types';
import { formatTime } from '../utils/helpers';

interface ChatBoxProps {
  messages: Message[];
  currentUser: User;
  onSendMessage: (text: string) => void;
  title: string;
  isCommunity?: boolean;
  onUserClick?: (userId: string) => void;
  onReport?: (msgId: string) => void;
}

const ChatBox: React.FC<ChatBoxProps> = ({ messages, currentUser, onSendMessage, title, isCommunity, onUserClick, onReport }) => {
  const [inputText, setInputText] = useState('');
  const [visibleMessages, setVisibleMessages] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleMessages]);

  useEffect(() => {
    const filterMessages = () => {
      if (!isCommunity) {
        setVisibleMessages(messages);
        return;
      }
      const now = Date.now();
      // Only show messages from the last 5 minutes for community chat
      setVisibleMessages(messages.filter(m => now - m.timestamp < 300000));
    };
    filterMessages();
    const interval = setInterval(filterMessages, 1000);
    return () => clearInterval(interval);
  }, [messages, isCommunity]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 relative">
      
      {/* Background Watermark - Positioned Lower for clarity */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-end pb-32 md:pb-48 opacity-[0.03] select-none z-0">
        <h2 className="text-[12vw] font-black uppercase tracking-tighter leading-none mb-4">AnonChat</h2>
        <div className="text-center space-y-2">
          <p className="text-xl md:text-2xl font-black uppercase tracking-[0.5em]">Messages delete after 5m</p>
          <p className="text-lg md:text-xl font-black uppercase tracking-[0.3em]">Community resets every 30m</p>
        </div>
      </div>

      {/* Messaging Thread */}
      <div 
        ref={scrollRef} 
        className="flex-1 overflow-y-auto px-4 md:px-12 py-6 md:py-10 space-y-6 md:space-y-8 scroll-smooth custom-scrollbar z-10"
      >
        {visibleMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-start pt-20 md:pt-32 space-y-6 opacity-30 select-none text-center">
            <div className="w-24 h-24 bg-slate-800/50 rounded-[2rem] flex items-center justify-center text-5xl shadow-inner border border-white/5">🌌</div>
            <div className="space-y-1">
              <p className="text-xl font-black uppercase tracking-[0.5em] text-white">QUIET FEED</p>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Voices vanish here. Say something.</p>
            </div>
          </div>
        )}

        {visibleMessages.map((msg, idx) => {
          const isOwn = msg.senderId === currentUser.id;
          const prevMsg = visibleMessages[idx - 1];
          const isCompact = prevMsg && prevMsg.senderId === msg.senderId && (msg.timestamp - prevMsg.timestamp < 120000);

          return (
            <div 
              key={msg.id} 
              className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${isCompact ? 'mt-1 md:mt-1.5' : 'mt-6 md:mt-8'} group`}
            >
              {!isCompact && (
                <div className={`flex items-center space-x-3 mb-2.5 px-1 ${isOwn ? 'flex-row-reverse space-x-reverse' : ''}`}>
                  <button 
                    onClick={() => isCommunity && !isOwn && onUserClick?.(msg.senderId)}
                    className={`text-[10px] font-black uppercase tracking-widest transition-colors ${isCommunity && !isOwn ? 'text-blue-400 hover:text-blue-300 underline decoration-blue-500/30 underline-offset-4' : 'text-slate-500'}`}
                  >
                    {msg.senderName}
                  </button>
                  <span className="text-[9px] font-bold text-slate-800 tracking-tighter">{formatTime(msg.timestamp)}</span>
                </div>
              )}
              
              <div 
                className={`relative group max-w-[88%] md:max-w-[70%] p-4 md:p-5 rounded-[1.5rem] md:rounded-[2rem] text-sm md:text-base leading-relaxed animate-in fade-in slide-in-from-bottom-3 duration-500 ${
                  isOwn 
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-tr-none shadow-2xl shadow-blue-950/40' 
                    : 'bg-slate-900 border border-white/[0.04] text-slate-200 rounded-tl-none shadow-xl'
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                
                {!isOwn && (
                  <button 
                    onClick={() => onReport?.(msg.id)}
                    className="absolute -right-10 top-1/2 -translate-y-1/2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity p-2 text-slate-700 hover:text-red-500 hidden md:block"
                    title="Report Message"
                  >
                    🚩
                  </button>
                )}
              </div>

              {!isOwn && !isCompact && (
                <button 
                  onClick={() => onReport?.(msg.id)}
                  className="mt-2 text-[8px] font-black text-slate-800 uppercase tracking-[0.2em] md:hidden"
                >
                  Report Message
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Compact Input Area */}
      <div className="p-3 md:p-5 bg-slate-900/80 backdrop-blur-3xl border-t border-white/5 z-20">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex items-center space-x-3">
          <div className="relative flex-1">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
              placeholder="Type a message..."
              rows={1}
              className="w-full bg-slate-950/50 border border-white/10 rounded-2xl md:rounded-3xl px-4 md:px-6 py-2.5 md:py-3.5 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-slate-100 placeholder-slate-600 resize-none transition-all shadow-inner block"
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
          </div>
          
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-20 disabled:cursor-not-allowed text-white w-11 h-11 md:w-12 md:h-12 rounded-full font-black transition-all flex items-center justify-center shrink-0 shadow-lg shadow-blue-600/30 active:scale-90"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatBox;
