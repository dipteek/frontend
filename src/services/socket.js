// frontend/src/services/socket.js
import io from "socket.io-client";

const SOCKET_URL = "https://backend-mtly.onrender.com/";
const RECONNECT_DELAY = 1000;
const MAX_RECONNECT_ATTEMPTS = 10;
const PING_INTERVAL = 25000;
const CONNECTION_TIMEOUT = 30000;
const HEARTBEAT_TIMEOUT = 60000;

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
    this.connectionTimeout = null;
    this.heartbeatInterval = null;
    
    // Connection state tracking
    this.connectionState = 'disconnected';
    this.lastConnectionTime = null;
    this.lastSuccessfulPing = null;
    this.stats = {
      totalConnections: 0,
      totalDisconnections: 0,
      totalReconnects: 0,
      totalErrors: 0,
      avgLatency: 0,
      connectionUptime: 0
    };

    // Wake-up mechanism for sleeping backends
    this.wakeUpAttempts = 0;
    this.maxWakeUpAttempts = 3;
    this.isWakingUp = false;
  }

  async connect() {
    if (this.socket?.connected) {
      console.log("✅ Already connected to socket server");
      return this.socket;
    }

    if (this.connectionState === 'connecting') {
      console.log("⏳ Connection already in progress");
      return;
    }

    this.connectionState = 'connecting';
    console.log("🔄 Connecting to socket server:", SOCKET_URL);

    // Try to wake up backend first if needed
    await this.ensureBackendAwake();

    // Clear any existing connection
    this.disconnect();

    this.socket = io(SOCKET_URL, {
      // Transport configuration
      transports: ["websocket", "polling"],
      upgrade: true,
      rememberUpgrade: false, // Don't remember to avoid stuck connections
      
      // Timeout settings
      timeout: CONNECTION_TIMEOUT,
      
      // Connection settings
      forceNew: true,
      autoConnect: false,
      reconnection: false, // Manual reconnection for better control
      
      // Heartbeat settings - crucial for detecting dead connections
      pingTimeout: HEARTBEAT_TIMEOUT,
      pingInterval: PING_INTERVAL,
      
      // Buffer settings
      maxHttpBufferSize: 1e6,
      
      // Polling settings for better fallback
      pollingTimeout: 30000,
      
      // Custom headers
      extraHeaders: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Connection': 'keep-alive'
      },

      // Additional options for reliability
      withCredentials: false,
      timestampRequests: true,
      timestampParam: 't'
    });

    this.setupEventHandlers();
    
    // Set connection timeout
    this.connectionTimeout = setTimeout(() => {
      if (this.connectionState === 'connecting') {
        console.error("❌ Connection timeout after", CONNECTION_TIMEOUT, "ms");
        this.handleConnectionError(new Error('Connection timeout'));
      }
    }, CONNECTION_TIMEOUT);

    // Attempt connection
    try {
      this.socket.connect();
    } catch (error) {
      console.error("❌ Failed to initiate connection:", error);
      this.handleConnectionError(error);
    }

    return this.socket;
  }

  async ensureBackendAwake() {
    if (this.isWakingUp) {
      console.log("⏳ Already attempting to wake backend");
      return;
    }

    this.isWakingUp = true;
    console.log("🚀 Checking if backend is awake...");

    try {
      // Quick health check to wake up the backend
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(`${SOCKET_URL}api/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        console.log("✅ Backend is awake");
        this.wakeUpAttempts = 0;
      } else {
        throw new Error(`Backend returned ${response.status}`);
      }
    } catch (error) {
      console.warn("⚠️ Backend wake-up failed:", error.message);
      this.wakeUpAttempts++;
      
      if (this.wakeUpAttempts < this.maxWakeUpAttempts) {
        console.log(`🔄 Retrying wake-up (${this.wakeUpAttempts}/${this.maxWakeUpAttempts})...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.ensureBackendAwake();
      }
    } finally {
      this.isWakingUp = false;
    }
  }

  setupEventHandlers() {
    if (!this.socket) return;

    // Connection success
    this.socket.on("connect", () => {
      console.log("✅ Connected to socket server");
      
      this.connected = true;
      this.connectionState = 'connected';
      this.reconnectAttempts = 0;
      this.wakeUpAttempts = 0;
      this.connectionId = this.socket.id;
      this.lastConnectionTime = Date.now();
      this.lastSuccessfulPing = Date.now();
      this.stats.totalConnections++;
      
      // Clear connection timeout
      this.clearConnectionTimeout();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      // Emit queued events
      this.emitQueuedEvents();
      
      // Notify listeners
      this.emitToListeners('connection_status', { 
        status: 'connected', 
        connectionId: this.connectionId,
        uptime: this.getUptime()
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
      
      // Stop health monitoring
      this.stopHealthMonitoring();
      
      // Handle different disconnect reasons
      this.handleDisconnect(reason, details);
      
      // Notify listeners
      this.emitToListeners('connection_status', { 
        status: 'disconnected', 
        reason,
        willReconnect: this.shouldReconnect(reason)
      });
    });

    // Heartbeat responses
    this.socket.on("pong", (data) => {
      this.lastSuccessfulPing = Date.now();
      console.log("🏓 Pong received, connection healthy");
    });

    // Server confirmation
    this.socket.on("connected", (data) => {
      console.log("✅ Server confirmation:", data);
    });

    // Error handling
    this.socket.on("error", (error) => {
      console.error("❌ Socket error:", error);
      this.stats.totalErrors++;
    });

    // Re-attach existing event listeners
    for (const [event, listeners] of this.eventListeners.entries()) {
      listeners.forEach(listener => {
        this.socket.on(event, listener);
      });
    }
  }

  shouldReconnect(reason) {
    const reconnectableReasons = [
      'transport close',
      'transport error',
      'ping timeout',
      'server shutting down',
      'io server disconnect',
      'io client disconnect'
    ];
    
    return reconnectableReasons.includes(reason) || 
           reason === 'transport error' || 
           !reason; // Unknown reason, try to reconnect
  }

  handleConnectionError(error) {
    this.connected = false;
    this.connectionState = 'error';
    this.stats.totalErrors++;
    
    this.clearConnectionTimeout();
    
    const errorMessage = error.message || error.toString();
    console.error("❌ Connection error:", errorMessage);
    
    // Specific handling for different error types
    if (errorMessage.includes('timeout')) {
      console.log("🕐 Connection timed out, backend might be sleeping");
    }
    
    // Attempt reconnection with exponential backoff
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.stats.totalReconnects++;
      
      const delay = Math.min(
        this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
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
        error: 'Max reconnection attempts reached',
        canRetry: true
      });
    }
  }

  handleDisconnect(reason, details) {
    if (this.shouldReconnect(reason) && this.reconnectAttempts < this.maxReconnectAttempts) {
      console.log(`🔄 Auto-reconnecting due to: ${reason}`);
      
      // Immediate reconnection for certain reasons
      const immediateReconnectReasons = ['transport close', 'transport error'];
      const delay = immediateReconnectReasons.includes(reason) ? 1000 : this.reconnectDelay;
      
      setTimeout(() => this.connect(), delay);
    }
  }

  startHealthMonitoring() {
    this.stopHealthMonitoring(); // Clear any existing monitoring
    
    // Ping mechanism
    this.pingInterval = setInterval(() => {
      if (this.socket?.connected) {
        const startTime = Date.now();
        this.socket.emit("ping", { timestamp: startTime });
        
        // Check if we haven't received a pong in too long
        if (this.lastSuccessfulPing && Date.now() - this.lastSuccessfulPing > HEARTBEAT_TIMEOUT) {
          console.warn("💔 Heartbeat timeout, connection may be dead");
          this.socket.disconnect();
        }
      }
    }, PING_INTERVAL);

    // Connection health check
    this.heartbeatInterval = setInterval(() => {
      if (this.connected && this.lastSuccessfulPing) {
        const timeSinceLastPing = Date.now() - this.lastSuccessfulPing;
        if (timeSinceLastPing > HEARTBEAT_TIMEOUT) {
          console.error("💀 Connection appears dead, forcing reconnection");
          this.socket?.disconnect();
        }
      }
    }, HEARTBEAT_TIMEOUT / 2);
  }

  stopHealthMonitoring() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  clearConnectionTimeout() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
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
        return true;
      } catch (error) {
        console.error(`Error emitting ${event}:`, error);
        return false;
      }
    } else {
      console.warn(`Cannot emit ${event}: socket not connected. Queuing event.`);
      this.queueEvent(event, data, callback);
      return false;
    }
  }

  queueEvent(event, data, callback) {
    // Limit queue size to prevent memory issues
    if (this.eventQueue.length >= 100) {
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
    const maxAge = 300000; // 5 minutes max age for queued events
    
    const validEvents = this.eventQueue.filter(queuedEvent => 
      currentTime - queuedEvent.timestamp <= maxAge
    );
    
    this.eventQueue = []; // Clear the queue
    
    validEvents.forEach(queuedEvent => {
      try {
        this.emit(queuedEvent.event, queuedEvent.data, queuedEvent.callback);
      } catch (error) {
        console.error(`Error emitting queued event ${queuedEvent.event}:`, error);
      }
    });
  }

  disconnect() {
    console.log("🔌 Disconnecting from socket server");
    
    // Clear all timeouts and intervals
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    this.clearConnectionTimeout();
    this.stopHealthMonitoring();
    
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
    this.wakeUpAttempts = 0;
    this.isWakingUp = false;
    
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

  getUptime() {
    return this.lastConnectionTime ? Date.now() - this.lastConnectionTime : 0;
  }

  // Reset reconnection attempts (useful for manual reconnection)
  resetReconnection() {
    this.reconnectAttempts = 0;
    this.wakeUpAttempts = 0;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  // Manual reconnection
  async reconnect() {
    console.log("🔄 Manual reconnection initiated");
    this.resetReconnection();
    this.disconnect();
    
    // Wait a moment before reconnecting
    await new Promise(resolve => setTimeout(resolve, 1000));
    return this.connect();
  }

  // WhatsApp specific methods
  joinConversation(waId) {
    return this.emit("join_conversation", { wa_id: waId });
  }

  leaveConversation(waId) {
    return this.emit("leave_conversation", { wa_id: waId });
  }

  // Enhanced ping with callback and latency measurement
  ping(callback) {
    if (!this.socket?.connected) {
      if (callback) callback(new Error('Socket not connected'), null);
      return;
    }

    const startTime = Date.now();
    let responded = false;
    
    const timeout = setTimeout(() => {
      if (!responded && callback) {
        responded = true;
        callback(new Error('Ping timeout'), null);
      }
    }, 10000);
    
    this.socket.emit("ping", { timestamp: startTime }, (response) => {
      if (!responded) {
        responded = true;
        clearTimeout(timeout);
        const latency = Date.now() - startTime;
        
        // Update stats
        this.stats.avgLatency = this.stats.avgLatency 
          ? (this.stats.avgLatency + latency) / 2 
          : latency;
          
        if (callback) callback(null, { latency, response });
      }
    });
  }

  // Comprehensive health check
  async healthCheck() {
    return new Promise((resolve, reject) => {
      if (!this.isConnected()) {
        reject(new Error('Not connected'));
        return;
      }

      this.ping((error, result) => {
        if (error) {
          reject(error);
          return;
        }

        const health = {
          connected: this.isConnected(),
          connectionId: this.getConnectionId(),
          connectionState: this.getConnectionState(),
          stats: this.getStats(),
          latency: result.latency,
          uptime: this.getUptime(),
          lastSuccessfulPing: this.lastSuccessfulPing,
          timeSinceLastPing: this.lastSuccessfulPing ? Date.now() - this.lastSuccessfulPing : null
        };

        resolve(health);
      });
    });
  }

  // Get comprehensive connection stats
  getStats() {
    return {
      ...this.stats,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      hasQueuedEvents: this.eventQueue.length > 0,
      queuedEventCount: this.eventQueue.length,
      eventListenerCount: Array.from(this.eventListeners.values()).reduce(
        (total, listeners) => total + listeners.length, 
        0
      ),
      lastConnectionTime: this.lastConnectionTime,
      connectionState: this.connectionState,
      connectionId: this.connectionId,
      uptime: this.getUptime(),
      wakeUpAttempts: this.wakeUpAttempts,
      isWakingUp: this.isWakingUp
    };
  }

  // Connection monitoring with enhanced status reporting
  startConnectionMonitoring(onStatusChange) {
    if (onStatusChange) {
      this.on('connection_status', onStatusChange);
    }

    // Monitor connection health every minute
    setInterval(async () => {
      if (this.isConnected()) {
        try {
          const health = await this.healthCheck();
          console.log(`💚 Connection healthy - Latency: ${health.latency}ms, Uptime: ${Math.floor(health.uptime/1000)}s`);
        } catch (error) {
          console.warn('💛 Connection health check failed:', error.message);
        }
      } else if (this.connectionState === 'disconnected' && this.reconnectAttempts === 0) {
        console.log('🔄 Connection lost, attempting to reconnect...');
        this.connect();
      }
    }, 60000);
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
      totalErrors: 0,
      avgLatency: 0,
      connectionUptime: 0
    };
  }
}

// Create and export a singleton instance
const socketService = new SocketService();

// Enhanced auto-initialization for browser environment
if (typeof window !== "undefined") {
  // Delay auto-connect to allow for proper initialization
  let initTimeout = setTimeout(async () => {
    console.log("🚀 Initializing socket connection...");
    
    try {
      await socketService.connect();
      
      // Start connection monitoring with status updates
      socketService.startConnectionMonitoring((status) => {
        console.log('🔄 Connection status changed:', status);
        
        // Emit custom event for UI to listen to
        window.dispatchEvent(new CustomEvent('socketStatusChange', { 
          detail: status 
        }));
      });
      
    } catch (error) {
      console.error("❌ Failed to initialize socket connection:", error);
    }
  }, 1000);
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    clearTimeout(initTimeout);
    socketService.cleanup();
  });
  
  // Handle visibility change for better mobile support
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      console.log('📱 Page hidden, maintaining connection...');
    } else {
      console.log('📱 Page visible, checking connection...');
      if (!socketService.isConnected() && socketService.reconnectAttempts === 0) {
        socketService.connect();
      }
    }
  });
  
  // Handle online/offline events
  window.addEventListener('online', () => {
    console.log('🌐 Network back online, reconnecting...');
    socketService.resetReconnection();
    socketService.connect();
  });
  
  window.addEventListener('offline', () => {
    console.log('📡 Network offline, will reconnect when back online');
  });
}

export default socketService;