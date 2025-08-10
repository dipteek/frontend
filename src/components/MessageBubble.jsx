// frontend/src/components/MessageBubble.jsx
import React from "react";

function StatusIcon({ status }) {
  if (!status) return null;
  if (status === "sent") return <span className="text-xs text-gray-400">✓</span>;
  if (status === "delivered") return <span className="text-xs text-gray-400">✓✓</span>;
  if (status === "read") return <span className="text-xs text-blue-400">✓✓</span>;
  return <span className="text-xs text-gray-400">{status}</span>;
}

export default function MessageBubble({ msg }) {
  const isOutbound = msg.direction === "outbound";
  
  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`relative max-w-[70%] px-4 py-3 rounded-2xl shadow-sm ${
        isOutbound 
          ? "bg-green-500 text-white rounded-br-md" 
          : "bg-white text-gray-800 border border-gray-200 rounded-bl-md"
      }`}>
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</div>
        <div className={`flex items-center justify-end text-xs mt-2 gap-1 ${
          isOutbound ? "text-green-100" : "text-gray-500"
        }`}>
          <span>{new Date(msg.timestamp * 1000).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}</span>
          {isOutbound && <StatusIcon status={msg.status} />}
        </div>
        
        {/* Message tail */}
        <div className={`absolute top-0 w-0 h-0 ${
          isOutbound 
            ? "right-0 -mr-2 border-l-8 border-l-green-500 border-t-8 border-t-transparent" 
            : "left-0 -ml-2 border-r-8 border-r-white border-t-8 border-t-transparent"
        }`} />
      </div>
    </div>
  );
}