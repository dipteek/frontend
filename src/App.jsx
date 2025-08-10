import React, { useEffect, useState, useCallback } from "react";
import { Wifi, WifiOff, AlertCircle, RefreshCw } from "lucide-react";
import API from "./services/api";
import ChatList from "./components/ChatList";
import ChatWindow from "./components/ChatWindow";

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  const loadConversations = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setIsRefreshing(true);
      setError(null);
      
      const res = await API.get("/api/conversations");
      const conversationsData = res.data || [];
      
      setConversations(conversationsData);
      setLastUpdate(new Date());
      
      // Auto-select first conversation only if none selected and we have conversations
      if (!selected && conversationsData.length > 0) {
        setSelected(conversationsData[0]);
      }
      
      // If currently selected conversation is not in the list anymore, deselect it
      if (selected && !conversationsData.find(c => c.wa_id === selected.wa_id)) {
        setSelected(null);
        setShowMobileChat(false);
      }
      
    } catch (err) {
      console.error("Failed to load conversations:", err);
      setError("Failed to load conversations. Please check your connection.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selected]);

  // Initial load and periodic refresh
  useEffect(() => {
    loadConversations();
    
    // Refresh conversations every 30 seconds when online
    const interval = setInterval(() => {
      if (isOnline) {
        loadConversations();
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [loadConversations, isOnline]);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Refresh conversations when coming back online
      setTimeout(() => loadConversations(), 1000);
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setError("You're offline. Some features may not work properly.");
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadConversations]);

  const handleSelectConversation = (conv) => {
    setSelected(conv);
    setShowMobileChat(true);
  };

  const handleBackToList = () => {
    setShowMobileChat(false);
    setSelected(null);
  };

  const handleRefresh = () => {
    loadConversations(true);
  };

  const handleRetry = () => {
    setError(null);
    loadConversations(true);
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-4 mx-auto">
            <span className="text-white text-2xl">💬</span>
          </div>
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading WhatsApp...</p>
          <p className="text-gray-500 text-sm mt-1">Please wait</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-white flex flex-col">
      {/* Top Status Bar */}
      {(!isOnline || error) && (
        <div className={`${
          !isOnline ? 'bg-yellow-500' : 'bg-red-500'
        } text-white p-2 text-center text-sm flex items-center justify-center gap-2`}>
          {!isOnline ? (
            <>
              <WifiOff size={16} />
              <span>You're offline. Reconnecting...</span>
            </>
          ) : (
            <>
              <AlertCircle size={16} />
              <span>{error}</span>
              <button 
                onClick={handleRetry}
                className="ml-2 underline hover:no-underline font-medium"
              >
                Retry
              </button>
            </>
          )}
        </div>
      )}

      {/* Main App Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Chat List */}
        <div className={`
          w-full md:w-[30%] md:min-w-[320px] md:max-w-[500px] 
          ${showMobileChat ? 'hidden md:flex' : 'flex'} 
          flex-col bg-white border-r border-gray-200
        `}>
          {/* Refresh Button (Desktop only) */}
          <div className="hidden md:flex items-center justify-between p-2 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {isOnline ? (
                <>
                  <Wifi size={14} className="text-green-500" />
                  <span>Connected</span>
                </>
              ) : (
                <>
                  <WifiOff size={14} className="text-red-500" />
                  <span>Offline</span>
                </>
              )}
              {lastUpdate && (
                <span>• Last updated: {lastUpdate.toLocaleTimeString()}</span>
              )}
            </div>
            
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || !isOnline}
              className="p-1.5 hover:bg-gray-200 rounded-full transition-colors disabled:opacity-50"
              title="Refresh conversations"
            >
              <RefreshCw 
                size={14} 
                className={`text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`} 
              />
            </button>
          </div>

          <ChatList 
            conversations={conversations} 
            onSelect={handleSelectConversation} 
            selectedWa={selected?.wa_id}
          />
        </div>

        {/* Main Chat Area */}
        <div className={`
          flex-1 ${showMobileChat ? 'flex' : 'hidden md:flex'} 
          flex-col bg-gray-50
        `}>
          {selected ? (
            <ChatWindow 
              key={selected.wa_id} // Force re-render when conversation changes
              waId={selected.wa_id} 
              name={selected.name || selected.wa_id} 
              onBack={handleBackToList}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-gray-50 p-8">
              {/* WhatsApp Web welcome screen */}
              <div className="max-w-md text-center">
                <div className="w-32 h-32 bg-gray-200 rounded-full flex items-center justify-center mb-8 mx-auto border-8 border-gray-100">
                  <span className="text-6xl">💬</span>
                </div>
                
                <h1 className="text-3xl font-light text-gray-700 mb-4">WhatsApp Web</h1>
                
                <p className="text-gray-500 leading-relaxed mb-6">
                  Send and receive messages without keeping your phone online.<br />
                  Use WhatsApp on up to 4 linked devices and 1 phone at the same time.
                </p>
                
                <div className="flex items-center justify-center gap-2 text-sm text-gray-400 mb-4">
                  {isOnline ? (
                    <>
                      <Wifi className="text-green-500" size={16} />
                      <span className="text-green-600">Connected</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="text-red-500" size={16} />
                      <span className="text-red-600">Offline</span>
                    </>
                  )}
                </div>
                
                {conversations.length > 0 && (
                  <p className="text-sm text-gray-400">
                    Select a chat from the sidebar to start messaging
                  </p>
                )}
                
                {conversations.length === 0 && !error && (
                  <p className="text-sm text-gray-400">
                    No conversations yet. Your chats will appear here when you receive messages.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}