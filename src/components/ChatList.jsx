// // frontend/src/components/ChatList.jsx
// import React from "react";
// import { Search, MoreVertical } from "lucide-react";

// export default function ChatList({ conversations, onSelect, selectedWa }) {
//   const formatTime = (timestamp) => {
//     if (!timestamp) return "";
//     const date = new Date(timestamp * 1000);
//     const now = new Date();
//     const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
//     const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
//     if (messageDate.getTime() === today.getTime()) {
//       return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
//     } else {
//       return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
//     }
//   };

//   return (
//     <div className="h-full bg-white">
//       {/* Header */}
//       <div className="bg-green-600 text-white p-4">
//         <div className="flex items-center justify-between mb-4">
//           <h1 className="text-xl font-semibold">Chats</h1>
//           <button className="p-1 hover:bg-green-700 rounded-full transition-colors">
//             <MoreVertical size={20} />
//           </button>
//         </div>
        
//         {/* Search */}
//         <div className="relative">
//           <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
//           <input
//             type="text"
//             placeholder="Search conversations..."
//             className="w-full pl-10 pr-4 py-2 bg-white rounded-full text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-300"
//           />
//         </div>
//       </div>

//       {/* Chat List */}
//       <div className="overflow-auto flex-1">
//         {conversations.length === 0 ? (
//           <div className="flex flex-col items-center justify-center h-64 text-gray-500">
//             <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
//               <span className="text-2xl">💬</span>
//             </div>
//             <p className="text-lg mb-2">No conversations yet</p>
//             <p className="text-sm text-center px-8">
//               Your conversations will appear here when you receive messages
//             </p>
//           </div>
//         ) : (
//           conversations.map(conv => (
//             <div
//               key={conv.wa_id}
//               onClick={() => onSelect(conv)}
//               className={`p-4 flex items-center gap-3 cursor-pointer border-b border-gray-100 hover:bg-gray-50 transition-colors ${
//                 selectedWa === conv.wa_id ? 'bg-green-50 border-r-4 border-r-green-500' : ''
//               }`}
//             >
//               <div className="relative">
//                 <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-semibold shadow-md">
//                   {conv.wa_id?.slice(-2) || "??"}
//                 </div>
//                 {/* Online indicator (you can add logic for this) */}
//                 {/* <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white"></div> */}
//               </div>
              
//               <div className="flex-1 min-w-0">
//                 <div className="flex justify-between items-start mb-1">
//                   <h3 className="font-semibold text-gray-900 truncate">
//                     {conv.name || conv.wa_id || "Unknown"}
//                   </h3>
//                   <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
//                     {formatTime(conv.last_timestamp)}
//                   </span>
//                 </div>
//                 <p className="text-sm text-gray-600 truncate">
//                   {conv.last_message || "No messages yet"}
//                 </p>
//               </div>
              
//               {/* Unread indicator */}
//               {conv.unread_count > 0 && (
//                 <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
//                   <span className="text-xs text-white font-semibold">
//                     {conv.unread_count > 99 ? '99+' : conv.unread_count}
//                   </span>
//                 </div>
//               )}
//             </div>
//           ))
//         )}
//       </div>
//     </div>
//   );
// }


import React, { useState, useMemo } from "react";
import { 
  Search, 
  MoreVertical, 
  MessageCircle, 
  Archive, 
  Settings, 
  Users,
  Check,
  CheckCheck
} from "lucide-react";

// // Static data for demonstration
// const staticConversations = [
//   {
//     wa_id: "1234567890",
//     name: "John Smith",
//     last_message: "Hey, how are you doing today?",
//     last_timestamp: Math.floor(Date.now() / 1000) - 300, // 5 minutes ago
//     last_status: "read",
//     last_direction: "outbound",
//     unread_count: 0
//   },
//   {
//     wa_id: "9876543210",
//     name: "Sarah Johnson",
//     last_message: "Can you send me the report when you get a chance?",
//     last_timestamp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
//     last_status: "delivered",
//     last_direction: "inbound",
//     unread_count: 2
//   },
//   {
//     wa_id: "5551234567",
//     name: "Mike Wilson",
//     last_message: "Thanks for your help with the project! Really appreciate it.",
//     last_timestamp: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
//     last_status: "sent",
//     last_direction: "outbound",
//     unread_count: 0
//   },
//   {
//     wa_id: "7778889999",
//     name: "Emma Davis",
//     last_message: "Let's meet for coffee tomorrow morning at 9 AM",
//     last_timestamp: Math.floor(Date.now() / 1000) - 86400, // Yesterday
//     last_status: "read",
//     last_direction: "inbound",
//     unread_count: 1
//   },
//   {
//     wa_id: "1119998888",
//     name: "Alex Chen",
//     last_message: "The presentation went great! Thanks for all your support.",
//     last_timestamp: Math.floor(Date.now() / 1000) - 172800, // 2 days ago
//     last_status: "delivered",
//     last_direction: "outbound",
//     unread_count: 0
//   },
//   {
//     wa_id: "4445556666",
//     name: "Lisa Martinez",
//     last_message: "Happy birthday! Hope you have a wonderful day 🎉",
//     last_timestamp: Math.floor(Date.now() / 1000) - 259200, // 3 days ago
//     last_status: "read",
//     last_direction: "inbound",
//     unread_count: 0
//   },
//   {
//     wa_id: "3334445555",
//     name: "Team Group",
//     last_message: "Meeting scheduled for next Monday at 2 PM",
//     last_timestamp: Math.floor(Date.now() / 1000) - 432000, // 5 days ago
//     last_status: "sent",
//     last_direction: "outbound",
//     unread_count: 5
//   },
//   {
//     wa_id: "2223334444",
//     name: "",
//     last_message: "Hello, I saw your advertisement online. Are you still selling the car?",
//     last_timestamp: Math.floor(Date.now() / 1000) - 604800, // 1 week ago
//     last_status: "delivered",
//     last_direction: "inbound",
//     unread_count: 1
//   }
// ];= staticConversations

export default function ChatList({ conversations , onSelect, selectedWa }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  // Filter conversations based on search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    
    return conversations.filter(conv => {
      const name = (conv.name || conv.wa_id || "").toLowerCase();
      const lastMessage = (conv.last_message || "").toLowerCase();
      const searchTerm = searchQuery.toLowerCase();
      
      return name.includes(searchTerm) || lastMessage.includes(searchTerm);
    });
  }, [conversations, searchQuery]);

  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (messageDate.getTime() === today.getTime()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (messageDate.getTime() === yesterday.getTime()) {
      return "Yesterday";
    } else if (now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
    }
  };

  const getStatusIcon = (status, direction) => {
    if (direction !== "outbound") return null;
    
    switch (status) {
      case "sent":
        return <Check size={16} className="text-gray-400" />;
      case "delivered":
        return <CheckCheck size={16} className="text-gray-400" />;
      case "read":
        return <CheckCheck size={16} className="text-blue-500" />;
      default:
        return null;
    }
  };

  const getProfileImage = (waId, name) => {
    if (!waId) return "??";
    
    if (name && name.length >= 2) {
      return name.substring(0, 2).toUpperCase();
    }
    
    return waId.slice(-2);
  };

  const truncateMessage = (message, maxLength = 35) => {
    if (!message) return "No messages yet";
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + "...";
  };

  const handleConversationSelect = (conv) => {
    if (onSelect) {
      onSelect(conv);
    } else {
      // Default behavior - just log the selection
      console.log('Selected conversation:', conv);
    }
  };

  return (
    <div className="h-full bg-white flex flex-col max-w-sm mx-auto border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 border-r border-gray-200">
        <div className="flex items-center justify-between p-4 bg-gray-100">
          <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
            <Users size={20} className="text-gray-600" />
          </div>
          
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-gray-200 rounded-full transition-colors">
              <Users size={20} className="text-gray-600" />
            </button>
            <button className="p-2 hover:bg-gray-200 rounded-full transition-colors">
              <MessageCircle size={20} className="text-gray-600" />
            </button>
            <div className="relative">
              <button 
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              >
                <MoreVertical size={20} className="text-gray-600" />
              </button>
              
              {showMenu && (
                <div className="absolute right-0 top-12 bg-white rounded-md shadow-lg border border-gray-200 py-2 z-10 min-w-[200px]">
                  <button className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3">
                    <Users size={16} />
                    New group
                  </button>
                  <button className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3">
                    <Archive size={16} />
                    Archived
                  </button>
                  <button className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3">
                    <Settings size={16} />
                    Settings
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Search */}
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search or start new chat"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-2 bg-gray-100 rounded-lg text-gray-800 placeholder-gray-500 focus:outline-none focus:bg-white focus:ring-2 focus:ring-green-500 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-auto">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 p-8">
            {searchQuery ? (
              <>
                <Search size={48} className="text-gray-300 mb-4" />
                <p className="text-lg mb-2">No chats found</p>
                <p className="text-sm text-center">
                  Try searching for a different term
                </p>
              </>
            ) : (
              <>
                <MessageCircle size={48} className="text-gray-300 mb-4" />
                <p className="text-lg mb-2">No conversations yet</p>
                <p className="text-sm text-center">
                  Your conversations will appear here when you receive messages
                </p>
              </>
            )}
          </div>
        ) : (
          filteredConversations.map(conv => (
            <div
              key={conv.wa_id}
              onClick={() => handleConversationSelect(conv)}
              className={`relative p-3 flex items-center gap-3 cursor-pointer border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                selectedWa === conv.wa_id ? 'bg-gray-100' : ''
              }`}
            >
              {/* Profile Image */}
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-semibold text-sm shadow-sm">
                  {getProfileImage(conv.wa_id, conv.name)}
                </div>
                {/* Online status indicator - you can add logic for this */}
                {/* <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div> */}
              </div>
              
              <div className="flex-1 min-w-0">
                {/* Name and Time */}
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className="font-medium text-gray-900 truncate text-[15px]">
                    {conv.name || `+${conv.wa_id}` || "Unknown"}
                  </h3>
                  <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                    {formatTime(conv.last_timestamp)}
                  </span>
                </div>
                
                {/* Last Message */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    {getStatusIcon(conv.last_status, conv.last_direction)}
                    <p className="text-sm text-gray-600 truncate">
                      {truncateMessage(conv.last_message)}
                    </p>
                  </div>
                  
                  {/* Unread Badge */}
                  {conv.unread_count > 0 && (
                    <div className="ml-2 bg-green-500 text-white text-xs rounded-full h-5 min-w-[20px] flex items-center justify-center px-1.5 font-medium">
                      {conv.unread_count > 99 ? '99+' : conv.unread_count}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Click outside handler for menu */}
      {showMenu && (
        <div 
          className="fixed inset-0 z-0" 
          onClick={() => setShowMenu(false)}
        />
      )}
    </div>
  );
}