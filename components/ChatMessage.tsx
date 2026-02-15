
import React from 'react';
import { Message } from '../types';

interface ChatMessageProps {
  message: Message;
  specialistName: string;
  avatar: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, specialistName, avatar }) => {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex w-full mb-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] items-end gap-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {!isUser && (
          <div className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden shadow-sm mb-1">
            <img 
              src={avatar} 
              alt={specialistName} 
              className="w-full h-full object-cover"
            />
          </div>
        )}
        
        <div className={`relative px-3 pt-2 pb-1 rounded-2xl shadow-sm text-[14.5px] leading-[1.4] ${
          isUser 
            ? 'bg-[#DCF8C6] text-[#202124] rounded-tr-none border-t border-r border-white/20' 
            : 'bg-white text-[#202124] rounded-tl-none border-t border-l border-black/5'
        }`}>
          <p className="whitespace-pre-wrap font-medium">{message.content}</p>
          
          <div className={`flex items-center justify-end gap-1 mt-1 opacity-60 text-[10px]`}>
            <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            {isUser && (
              <svg className="w-3.5 h-3.5 text-[#34B7F1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>

          {/* Rabicho do balão */}
          <div className={`absolute top-0 w-3 h-3 ${
            isUser 
            ? '-right-1.5 bg-[#DCF8C6] [clip-path:polygon(0%_0%,0%_100%,100%_0%)]' 
            : '-left-1.5 bg-white [clip-path:polygon(100%_0%,100%_100%,0%_0%)]'
          }`}></div>
        </div>
      </div>
    </div>
  );
};
