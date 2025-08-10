// frontend/src/services/socket.js
import io from "socket.io-client";
//process.env.REACT_APP_API_URL || 
const SOCKET_URL = "https://backend-mtly.onrender.com/";//"http://localhost:5000";

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.eventListeners = new Map();
  }

  connect() {
    if (this.socket?.connected) {
      return this.socket;
    }

    console.log("Connecting to socket server:", SOCKET_URL);

    this.socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      timeout: 10000,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      reconnectionDelayMax: 5000,
      maxHttpBufferSize: 1e8
    });

    this.setupEventHandlers();
    return this.socket;
  }

  setupEventHandlers() {
    if (!this.socket) return;

    // Connection events
    this.socket.on("connect", () => {
      console.log("✅ Connected to socket server");
      this.connected = true;
      this.reconnectAttempts = 0;
      
      // Emit any queued events
      this.emitQueuedEvents();
    });

    this.socket.on("disconnect", (reason) => {
      console.log("❌ Disconnected from socket server:", reason);
      this.connected = false;
      
      // Auto-reconnect for certain disconnect reasons
      if (reason === "io server disconnect") {
        // Server initiated disconnect, manual reconnection required
        console.log("Server disconnected, attempting manual reconnection...");
        setTimeout(() => this.connect(), this.reconnectDelay);
      }
    });

    this.socket.on("connect_error", (error) => {
      console.error("❌ Socket connection error:", error);
      this.connected = false;
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error("Max reconnection attempts reached");
      }
    });

    this.socket.on("reconnect", (attemptNumber) => {
      console.log(`✅ Reconnected after ${attemptNumber} attempts`);
      this.connected = true;
      this.reconnectAttempts = 0;
    });

    this.socket.on("reconnect_attempt", (attemptNumber) => {
      console.log(`🔄 Reconnection attempt ${attemptNumber}`);
    });

    this.socket.on("reconnect_error", (error) => {
      console.error("❌ Reconnection error:", error);
    });

    this.socket.on("reconnect_failed", () => {
      console.error("❌ Failed to reconnect after maximum attempts");
      this.connected = false;
    });

    // Server messages
    this.socket.on("connected", (data) => {
      console.log("Server confirmation:", data);
    });

    // Re-attach any existing event listeners
    for (const [event, listeners] of this.eventListeners.entries()) {
      listeners.forEach(listener => {
        this.socket.on(event, listener);
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
      this.socket.emit(event, data, callback);
    } else {
      console.warn(`Cannot emit ${event}: socket not connected`);
      // Optionally queue the event for later emission
      this.queueEvent(event, data, callback);
    }
  }

  queueEvent(event, data, callback) {
    // Simple queuing mechanism - you might want to implement a more sophisticated one
    if (!this.eventQueue) {
      this.eventQueue = [];
    }
    
    this.eventQueue.push({ event, data, callback });
    
    // Limit queue size to prevent memory issues
    if (this.eventQueue.length > 100) {
      this.eventQueue.shift();
    }
  }

  emitQueuedEvents() {
    if (!this.eventQueue || this.eventQueue.length === 0) return;
    
    console.log(`Emitting ${this.eventQueue.length} queued events`);
    
    while (this.eventQueue.length > 0) {
      const { event, data, callback } = this.eventQueue.shift();
      this.emit(event, data, callback);
    }
  }

  disconnect() {
    if (this.socket) {
      console.log("Disconnecting from socket server");
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  // Utility methods
  isConnected() {
    return this.connected && this.socket?.connected;
  }

  getConnectionId() {
    return this.socket?.id;
  }

  // WhatsApp specific methods
  joinConversation(waId) {
    this.emit("join_conversation", { wa_id: waId });
  }

  leaveConversation(waId) {
    this.emit("leave_conversation", { wa_id: waId });
  }

  // Ping server to test connection
  ping(callback) {
    if (this.socket?.connected) {
      const startTime = Date.now();
      this.socket.emit("ping", (response) => {
        const latency = Date.now() - startTime;
        if (callback) callback(latency);
      });
    }
  }

  // Get connection stats
  getStats() {
    return {
      connected: this.connected,
      connectionId: this.getConnectionId(),
      reconnectAttempts: this.reconnectAttempts,
      hasQueuedEvents: this.eventQueue?.length > 0,
      eventListenerCount: Array.from(this.eventListeners.values()).reduce(
        (total, listeners) => total + listeners.length, 
        0
      )
    };
  }
}

// Create and export a singleton instance
const socketService = new SocketService();

// Auto-connect on module load
if (typeof window !== "undefined") {
  // Only auto-connect in browser environment
  socketService.connect();
}

export default socketService;