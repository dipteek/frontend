import React, { useEffect, useRef, useState, useCallback } from "react";
import { 
  Send, 
  Phone, 
  Video, 
  MoreVertical, 
  ArrowLeft, 
  Search,
  Paperclip,
  Mic,
  Smile,
  Check,
  CheckCheck
} from "lucide-react";
import API from "../services/api";
import socket from "../services/socket";

export default function ChatWindow({ waId, name, onBack }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const scrollRef = useRef();
  const inputRef = useRef();

  // Load messages when waId changes
  useEffect(() => {
    if (!waId) return;
    
    setIsLoading(true);
    setMessages([]);
    
    API.get(`/api/conversations/${waId}/messages`)
      .then(res => {
        const messagesData = res.data?.messages || res.data || [];
        setMessages(messagesData);
        scrollToBottom();
      })
      .catch(err => {
        console.error("Failed to load messages:", err);
        setMessages([]);
      })
      .finally(() => setIsLoading(false));
  }, [waId]);

  // Socket event handlers
  useEffect(() => {
    socket.connect();
    
    const handleNewMessage = (msg) => {
      if (msg.wa_id === waId) {
        setMessages(prev => {
          // Avoid duplicates
          const exists = prev.find(m => m._id === msg._id);
          if (exists) return prev;
          return [...prev, msg];
        });
        scrollToBottom();
      }
    };
    
    const handleMessageUpdate = (update) => {
      setMessages(prev => 
        prev.map(m => 
          m._id === update._id 
            ? { ...m, status: update.status }
            : m
        )
      );
    };

    socket.on("message:new", handleNewMessage);
    socket.on("message:update", handleMessageUpdate);
    
    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("message:update", handleMessageUpdate);
    };
  }, [waId]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 100);
  }, []);

  const handleSend = async () => {
    if (!text.trim()) return;
    
    const messageText = text.trim();
    setText("");
    setIsTyping(true);
    
    try {
      const res = await API.post(`/api/conversations/${waId}/messages`, { 
        text: messageText,
        type: "text"
      });
      
      // Message will be added via socket event
      scrollToBottom();
    } catch (err) {
      console.error("Failed to send message:", err);
      // Re-add text on error
      setText(messageText);
    } finally {
      setIsTyping(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false
    });
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "sent":
        return <Check size={16} className="text-gray-400" />;
      case "delivered":
        return <CheckCheck size={16} className="text-gray-400" />;
      case "read":
        return <CheckCheck size={16} className="text-blue-400" />;
      default:
        return <Check size={16} className="text-gray-300" />;
    }
  };

  const groupMessagesByDate = (messages) => {
    const groups = {};
    messages.forEach(msg => {
      const date = new Date(msg.timestamp * 1000);
      const dateKey = date.toDateString();
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(msg);
    });
    return groups;
  };

  const formatDateHeader = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    
    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString([], { 
        weekday: 'long',
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    }
  };

  const MessageBubble = ({ msg, isLast }) => {
    const isOutbound = msg.direction === "outbound";
    
    return (
      <div className={`flex ${isOutbound ? "justify-end" : "justify-start"} mb-1`}>
        <div className={`relative max-w-[65%] px-3 py-2 rounded-lg shadow-sm ${
          isOutbound 
            ? "bg-green-500 text-white" 
            : "bg-white text-gray-800 border border-gray-200"
        } ${isOutbound ? "rounded-br-sm" : "rounded-bl-sm"}`}>
          
          {/* Message content */}
          <div className="whitespace-pre-wrap text-[14px] leading-relaxed break-words">
            {msg.text}
          </div>
          
          {/* Time and status */}
          <div className={`flex items-center justify-end text-xs mt-1 gap-1 ${
            isOutbound ? "text-green-100" : "text-gray-500"
          }`}>
            <span className="text-[11px]">{formatTime(msg.timestamp)}</span>
            {isOutbound && getStatusIcon(msg.status)}
          </div>
          
          {/* Message tail */}
          {isLast && (
            <div className={`absolute bottom-0 w-0 h-0 ${
              isOutbound 
                ? "right-0 transform translate-x-1 border-l-8 border-l-green-500 border-b-8 border-b-transparent" 
                : "left-0 transform -translate-x-1 border-r-8 border-r-white border-b-8 border-b-transparent"
            }`} />
          )}
        </div>
      </div>
    );
  };

  if (!waId) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 text-gray-500">
        <div className="w-32 h-32 bg-gray-200 rounded-full flex items-center justify-center mb-6">
          <span className="text-6xl">💬</span>
        </div>
        <h2 className="text-2xl font-light text-gray-700 mb-2">WhatsApp Web</h2>
        <p className="text-center max-w-md text-sm leading-relaxed">
          Send and receive messages without keeping your phone online.<br />
          Use WhatsApp on up to 4 linked devices and 1 phone at the same time.
        </p>
      </div>
    );
  }

  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={onBack}
              className=" hover:bg-gray-200 rounded-full transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            
            <div 
              onClick={() => setShowContactInfo(true)}
              className="flex items-center gap-3 cursor-pointer hover:bg-gray-200 rounded-lg p-1 -m-1 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-semibold text-sm">
                {waId?.slice(-2) || "??"}
              </div>
              
              <div>
                <div className="font-medium text-gray-900 text-[16px]">
                  {name || `+${waId}` || "Unknown"}
                </div>
                <div className="text-gray-500 text-xs">
                  {isTyping ? "typing..." : "click here for contact info"}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button className="p-2.5 hover:bg-gray-200 rounded-full transition-colors">
              <Search size={20} className="text-gray-600" />
            </button>
            <button className="p-2.5 hover:bg-gray-200 rounded-full transition-colors">
              <Video size={20} className="text-gray-600" />
            </button>
            <button className="p-2.5 hover:bg-gray-200 rounded-full transition-colors">
              <Phone size={20} className="text-gray-600" />
            </button>
            <button className="p-2.5 hover:bg-gray-200 rounded-full transition-colors">
              <MoreVertical size={20} className="text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={scrollRef} 
        className="flex-1 overflow-auto px-4 py-2"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cg fill-opacity='0.03'%3E%3Cpolygon fill='%23000' points='50 0 60 40 100 50 60 60 50 100 40 60 0 50 40 40'/%3E%3C/g%3E%3C/svg%3E")`,
          backgroundSize: '100px 100px'
        }}
      >
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500 border-t-transparent"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mb-4">
              <span className="text-3xl">💬</span>
            </div>
            <p className="text-lg mb-2 font-light">No messages here yet...</p>
            <p className="text-sm text-center">Send a message to start the conversation</p>
          </div>
        ) : (
          Object.entries(messageGroups).map(([dateString, msgs]) => (
            <div key={dateString}>
              {/* Date separator */}
              <div className="flex justify-center my-4">
                <div className="bg-white px-3 py-1 rounded-full text-xs text-gray-600 shadow-sm border">
                  {formatDateHeader(dateString)}
                </div>
              </div>
              
              {/* Messages for this date */}
              {msgs.map((msg, index) => {
                const nextMsg = msgs[index + 1];
                const isLastInSequence = !nextMsg || nextMsg.direction !== msg.direction;
                return (
                  <MessageBubble 
                    key={msg._id} 
                    msg={msg} 
                    isLast={isLastInSequence}
                  />
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Input Area */}
      <div className="bg-gray-100 border-t border-gray-200 px-4 py-3">
        <div className="flex items-end gap-2">
          <button className="p-2.5 hover:bg-gray-200 rounded-full transition-colors">
            <Smile size={20} className="text-gray-600" />
          </button>
          
          <button className="p-2.5 hover:bg-gray-200 rounded-full transition-colors">
            <Paperclip size={20} className="text-gray-600" />
          </button>
          
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              className="w-full px-4 py-3 bg-white rounded-xl resize-none focus:outline-none max-h-32 min-h-[48px] text-[15px] leading-tight"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message"
              rows={1}
              disabled={isTyping}
              style={{
                height: 'auto',
                minHeight: '48px',
                maxHeight: '120px'
              }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
            />
          </div>
          
          {text.trim() ? (
            <button
              onClick={handleSend}
              disabled={isTyping}
              className="p-2.5 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors disabled:opacity-50"
            >
              <Send size={20} />
            </button>
          ) : (
            <button className="p-2.5 hover:bg-gray-200 rounded-full transition-colors">
              <Mic size={20} className="text-gray-600" />
            </button>
          )}
        </div>
      </div>

      {/* Contact Info Modal (simplified) */}
      {showContactInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-medium mb-4">Contact Info</h3>
            <div className="text-center mb-4">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-semibold text-xl mx-auto mb-3">
                {waId?.slice(-2) || "??"}
              </div>
              <h4 className="font-medium">{name || "Unknown"}</h4>
              <p className="text-gray-600 text-sm">+{waId}</p>
            </div>
            <button
              onClick={() => setShowContactInfo(false)}
              className="w-full bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}