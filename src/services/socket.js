// frontend/src/services/socket.js
import io from "socket.io-client";

const SOCKET_URL = "https://backend-mtly.onrender.com/";
const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_ATTEMPTS = 8;
const PING_INTERVAL = 30000;
const CONNECTION_TIMEOUT = 20000;

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = MAX_RECONNECT_ATTEMPTS;
    this.reconnectDelay = RECONNECT_DELAY;
    this.eventListeners = new Map();
    this.eventQueue = [];
    this.connectionId = null;
    this.pingInterval = null;
    this.reconnectTimeout = null;
    
    // Connection state tracking
    this.connectionState = 'disconnected'; // 'connecting', 'connected', 'disconnected', 'error'
    this.lastConnectionTime = null;
    this.stats = {
      totalConnections: 0,
      totalDisconnections: 0,
      totalReconnects: 0,
      totalErrors: 0
    };
  }

  connect() {
    if (this.socket?.connected) {
      console.log("Already connected to socket server");
      return this.socket;
    }

    if (this.connectionState === 'connecting') {
      console.log("Connection already in progress");
      return;
    }

    this.connectionState = 'connecting';
    console.log("🔄 Connecting to socket server:", SOCKET_URL);

    // Clear any existing connection
    this.disconnect();

    this.socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      timeout: CONNECTION_TIMEOUT,
      forceNew: true,
      reconnection: false, // We'll handle reconnection manually
      autoConnect: false,
      upgrade: true,
      rememberUpgrade: true,
      
      // Optimized settings for stability
      pingTimeout: 60000,
      pingInterval: 25000,
      maxHttpBufferSize: 1e6, // 1MB limit
      
      // Connection attempt settings  
      randomizationFactor: 0.5,
      
      // Custom headers for better compatibility
      extraHeaders: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    this.setupEventHandlers();
    this.socket.connect();
    
    // Set connection timeout
    this.connectionTimeout = setTimeout(() => {
      if (this.connectionState === 'connecting') {
        console.error("❌ Connection timeout");
        this.handleConnectionError(new Error('Connection timeout'));
      }
    }, CONNECTION_TIMEOUT);

    return this.socket;
  }

  setupEventHandlers() {
    if (!this.socket) return;

    // Connection success
    this.socket.on("connect", () => {
      console.log("✅ Connected to socket server");
      
      this.connected = true;
      this.connectionState = 'connected';
      this.reconnectAttempts = 0;
      this.connectionId = this.socket.id;
      this.lastConnectionTime = Date.now();
      this.stats.totalConnections++;
      
      // Clear connection timeout
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      
      // Start ping mechanism
      this.startPingMechanism();
      
      // Emit any queued events
      this.emitQueuedEvents();
      
      // Notify listeners
      this.emitToListeners('connection_status', { 
        status: 'connected', 
        connectionId: this.connectionId 
      });
    });

    // Connection error
    this.socket.on("connect_error", (error) => {
      console.error("❌ Socket connection error:", error.message || error);
      this.handleConnectionError(error);
    });

    // Disconnection
    this.socket.on("disconnect", (reason, details) => {
      console.log("❌ Disconnected from socket server:", reason);
      
      this.connected = false;
      this.connectionState = 'disconnected';
      this.connectionId = null;
      this.stats.totalDisconnections++;
      
      // Stop ping mechanism
      this.stopPingMechanism();
      
      // Handle different disconnect reasons
      this.handleDisconnect(reason, details);
      
      // Notify listeners
      this.emitToListeners('connection_status', { 
        status: 'disconnected', 
        reason 
      });
    });

    // Server confirmation
    this.socket.on("connected", (data) => {
      console.log("✅ Server confirmation:", data);
    });

    // Pong response for ping
    this.socket.on("pong", (data) => {
      console.log("🏓 Pong received:", data);
    });

    // Re-attach existing event listeners
    for (const [event, listeners] of this.eventListeners.entries()) {
      listeners.forEach(listener => {
        this.socket.on(event, listener);
      });
    }
  }

  handleConnectionError(error) {
    this.connected = false;
    this.connectionState = 'error';
    this.stats.totalErrors++;
    
    // Clear connection timeout
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    
    // Attempt reconnection with exponential backoff
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(
        this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
        30000 // Max 30 seconds
      );
      
      console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
      
      this.reconnectTimeout = setTimeout(() => {
        this.connect();
      }, delay);
      
    } else {
      console.error("❌ Max reconnection attempts reached");
      this.emitToListeners('connection_status', { 
        status: 'failed', 
        error: 'Max reconnection attempts reached' 
      });
    }
  }

  handleDisconnect(reason, details) {
    const shouldReconnect = [
      'transport close',
      'transport error', 
      'ping timeout',
      'server shutting down'
    ].includes(reason);
    
    if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      console.log(`🔄 Auto-reconnecting due to: ${reason}`);
      setTimeout(() => this.connect(), this.reconnectDelay);
    }
  }

  startPingMechanism() {
    this.stopPingMechanism(); // Clear any existing interval
    
    this.pingInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit("ping", { timestamp: Date.now() });
      }
    }, PING_INTERVAL);
  }

  stopPingMechanism() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  emitToListeners(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);

    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
      if (listeners.length === 0) {
        this.eventListeners.delete(event);
      }
    }

    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  emit(event, data, callback) {
    if (this.socket?.connected) {
      try {
        this.socket.emit(event, data, callback);
      } catch (error) {
        console.error(`Error emitting ${event}:`, error);
      }
    } else {
      console.warn(`Cannot emit ${event}: socket not connected. Queuing event.`);
      this.queueEvent(event, data, callback);
    }
  }

  queueEvent(event, data, callback) {
    // Limit queue size to prevent memory issues
    if (this.eventQueue.length >= 50) {
      this.eventQueue.shift();
    }
    
    this.eventQueue.push({ 
      event, 
      data, 
      callback,
      timestamp: Date.now()
    });
  }

  emitQueuedEvents() {
    if (this.eventQueue.length === 0) return;
    
    console.log(`📤 Emitting ${this.eventQueue.length} queued events`);
    
    const currentTime = Date.now();
    const maxAge = 60000; // 1 minute max age for queued events
    
    while (this.eventQueue.length > 0) {
      const queuedEvent = this.eventQueue.shift();
      
      // Skip events that are too old
      if (currentTime - queuedEvent.timestamp > maxAge) {
        console.warn(`Skipping stale queued event: ${queuedEvent.event}`);
        continue;
      }
      
      try {
        this.emit(queuedEvent.event, queuedEvent.data, queuedEvent.callback);
      } catch (error) {
        console.error(`Error emitting queued event ${queuedEvent.event}:`, error);
      }
    }
  }

  disconnect() {
    console.log("🔌 Disconnecting from socket server");
    
    // Clear timeouts
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    
    // Stop ping mechanism
    this.stopPingMechanism();
    
    // Disconnect socket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    // Reset state
    this.connected = false;
    this.connectionState = 'disconnected';
    this.connectionId = null;
    this.reconnectAttempts = 0;
    
    // Clear event queue
    this.eventQueue = [];
  }

  // Utility methods
  isConnected() {
    return this.connected && this.socket?.connected;
  }

  getConnectionId() {
    return this.connectionId;
  }

  getConnectionState() {
    return this.connectionState;
  }

  // Reset reconnection attempts (useful for manual reconnection)
  resetReconnection() {
    this.reconnectAttempts = 0;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  // Manual reconnection
  reconnect() {
    console.log("🔄 Manual reconnection initiated");
    this.resetReconnection();
    this.disconnect();
    setTimeout(() => this.connect(), 1000);
  }

  // WhatsApp specific methods
  joinConversation(waId) {
    this.emit("join_conversation", { wa_id: waId });
  }

  leaveConversation(waId) {
    this.emit("leave_conversation", { wa_id: waId });
  }

  // Enhanced ping with callback
  ping(callback) {
    if (this.socket?.connected) {
      const startTime = Date.now();
      this.socket.emit("ping", { timestamp: startTime }, (response) => {
        const latency = Date.now() - startTime;
        if (callback) callback(null, { latency, response });
      });
      
      // Fallback timeout for ping
      setTimeout(() => {
        if (callback) callback(new Error('Ping timeout'), null);
      }, 5000);
    } else {
      if (callback) callback(new Error('Socket not connected'), null);
    }
  }

  // Health check
  healthCheck(callback) {
    if (!this.isConnected()) {
      if (callback) callback(new Error('Not connected'), null);
      return;
    }

    this.ping((error, result) => {
      if (error) {
        if (callback) callback(error, null);
        return;
      }

      const health = {
        connected: this.isConnected(),
        connectionId: this.getConnectionId(),
        connectionState: this.getConnectionState(),
        stats: this.getStats(),
        latency: result.latency,
        uptime: this.lastConnectionTime ? Date.now() - this.lastConnectionTime : 0
      };

      if (callback) callback(null, health);
    });
  }

  // Get comprehensive connection stats
  getStats() {
    return {
      ...this.stats,
      reconnectAttempts: this.reconnectAttempts,
      hasQueuedEvents: this.eventQueue.length > 0,
      queuedEventCount: this.eventQueue.length,
      eventListenerCount: Array.from(this.eventListeners.values()).reduce(
        (total, listeners) => total + listeners.length, 
        0
      ),
      lastConnectionTime: this.lastConnectionTime,
      connectionState: this.connectionState,
      connectionId: this.connectionId
    };
  }

  // Connection monitoring
  startConnectionMonitoring(onStatusChange) {
    if (onStatusChange) {
      this.on('connection_status', onStatusChange);
    }

    // Monitor connection every 30 seconds
    setInterval(() => {
      if (this.isConnected()) {
        this.ping((error, result) => {
          if (error) {
            console.warn('Connection health check failed:', error.message);
          } else {
            console.log(`Connection healthy - Latency: ${result.latency}ms`);
          }
        });
      }
    }, 30000);
  }

  // Clean up resources
  cleanup() {
    console.log("🧹 Cleaning up socket service");
    
    this.disconnect();
    this.eventListeners.clear();
    this.eventQueue = [];
    
    // Reset stats
    this.stats = {
      totalConnections: 0,
      totalDisconnections: 0,
      totalReconnects: 0,
      totalErrors: 0
    };
  }
}

// Create and export a singleton instance
const socketService = new SocketService();

// Auto-connect on module load (browser only)
if (typeof window !== "undefined") {
  // Delay auto-connect to allow for proper initialization
  setTimeout(() => {
    socketService.connect();
    
    // Start connection monitoring
    socketService.startConnectionMonitoring((status) => {
      console.log('Connection status changed:', status);
    });
  }, 1000);
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    socketService.cleanup();
  });
  
  // Handle visibility change (pause/resume connections)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      console.log('Page hidden, maintaining connection');
    } else {
      console.log('Page visible, checking connection');
      if (!socketService.isConnected()) {
        socketService.connect();
      }
    }
  });
}

export default socketService;