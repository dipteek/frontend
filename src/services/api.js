// frontend/src/services/api.js
import axios from 'axios';

const BASE_URL = 'https://backend-mtly.onrender.com/api';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const LONG_TIMEOUT = 60000; // 60 seconds for wake-up requests
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second base delay

class ApiService {
  constructor() {
    this.axiosInstance = this.createAxiosInstance();
    this.isWakingUp = false;
    this.wakeUpPromise = null;
  }

  createAxiosInstance() {
    const instance = axios.create({
      baseURL: BASE_URL,
      timeout: DEFAULT_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      // Important: Don't transform JSON strings
      transformRequest: [(data, headers) => {
        if (headers['Content-Type'] === 'application/json') {
          return JSON.stringify(data);
        }
        return data;
      }],
      validateStatus: (status) => {
        return status >= 200 && status < 300;
      },
      // Retry configuration
      retry: MAX_RETRIES,
      retryDelay: (retryCount) => {
        return Math.min(RETRY_DELAY * Math.pow(2, retryCount), 10000);
      },
    });

    // Request interceptor for logging and wake-up handling
    instance.interceptors.request.use(
      async (config) => {
        console.log(`📤 ${config.method?.toUpperCase()} ${config.url}`, config.params || config.data || '');
        
        // Ensure backend is awake for important requests
        if (this.shouldWakeUpBackend(config)) {
          await this.ensureBackendAwake();
        }
        
        // Add timestamp to prevent caching
        if (!config.params) {
          config.params = {};
        }
        config.params._t = Date.now();
        
        return config;
      },
      (error) => {
        console.error('❌ REQUEST ERROR:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling and retries
    instance.interceptors.response.use(
      (response) => {
        console.log(`✅ ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
        return response;
      },
      async (error) => {
        const config = error.config;
        
        // Log the error
        this.logError(error);
        
        // Handle different types of errors
        if (this.isRetryableError(error) && this.shouldRetry(config)) {
          return this.retryRequest(config, error);
        }
        
        // Transform error for better UX
        const transformedError = this.transformError(error);
        return Promise.reject(transformedError);
      }
    );

    return instance;
  }

  shouldWakeUpBackend(config) {
    // Wake up backend for important operations
    const wakeUpEndpoints = ['/conversations', '/health'];
    const isWakeUpEndpoint = wakeUpEndpoints.some(endpoint => 
      config.url?.includes(endpoint)
    );
    
    return isWakeUpEndpoint && !this.isWakingUp;
  }

  async ensureBackendAwake() {
    // If already waking up, wait for the existing promise
    if (this.wakeUpPromise) {
      return this.wakeUpPromise;
    }

    this.isWakingUp = true;
    console.log('🚀 Ensuring backend is awake...');
    
    this.wakeUpPromise = this.performWakeUp();
    
    try {
      await this.wakeUpPromise;
    } finally {
      this.isWakingUp = false;
      this.wakeUpPromise = null;
    }
  }

  async performWakeUp() {
    const maxAttempts = 3;
    let attempt = 1;
    
    while (attempt <= maxAttempts) {
      try {
        console.log(`🔄 Wake-up attempt ${attempt}/${maxAttempts}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
        
        const response = await fetch(`${BASE_URL}/health`, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
          },
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          console.log('✅ Backend is awake');
          return;
        } else {
          throw new Error(`Health check returned ${response.status}`);
        }
      } catch (error) {
        console.warn(`⚠️ Wake-up attempt ${attempt} failed:`, error.message);
        
        if (attempt < maxAttempts) {
          const delay = attempt * 2000; // Progressive delay
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
        }
        
        attempt++;
      }
    }
    
    console.warn('⚠️ Backend wake-up completed (may still be sleeping)');
  }

  isRetryableError(error) {
    if (!error.response) {
      // Network errors, timeouts, etc.
      return true;
    }
    
    const status = error.response.status;
    const retryableStatuses = [408, 429, 500, 502, 503, 504];
    
    return retryableStatuses.includes(status);
  }

  shouldRetry(config) {
    const retryCount = config.retryCount || 0;
    return retryCount < MAX_RETRIES;
  }

  async retryRequest(config, originalError) {
    const retryCount = (config.retryCount || 0) + 1;
    const delay = config.retryDelay ? config.retryDelay(retryCount) : RETRY_DELAY;
    
    console.log(`🔄 Retrying request (${retryCount}/${MAX_RETRIES}) after ${delay}ms`);
    
    await this.sleep(delay);
    
    // Create new config for retry
    const retryConfig = {
      ...config,
      retryCount,
      timeout: Math.min(config.timeout * 1.5, LONG_TIMEOUT), // Increase timeout for retries
    };
    
    // Remove axios-specific properties that shouldn't be retried
    delete retryConfig.adapter;
    delete retryConfig.transformRequest;
    delete retryConfig.transformResponse;
    
    return this.axiosInstance(retryConfig);
  }

  transformError(error) {
    const transformedError = {
      message: 'An error occurred',
      status: undefined,
      statusText: undefined,
      isNetworkError: false,
      isTimeoutError: false,
      isServerError: false,
      originalError: error,
    };

    if (error.code === 'ECONNABORTED') {
      transformedError.message = `timeout of ${error.config?.timeout || 'unknown'}ms exceeded`;
      transformedError.isTimeoutError = true;
      transformedError.isNetworkError = true;
    } else if (error.code === 'ERR_NETWORK') {
      transformedError.message = 'Network error - backend may be unavailable';
      transformedError.isNetworkError = true;
    } else if (error.response) {
      // Server responded with error status
      transformedError.status = error.response.status;
      transformedError.statusText = error.response.statusText;
      transformedError.message = error.response.data?.error || 
                                error.response.data?.message || 
                                `Server error: ${error.response.status}`;
      transformedError.isServerError = true;
    } else if (error.request) {
      // Request made but no response
      transformedError.message = 'No response from server - backend may be sleeping';
      transformedError.isNetworkError = true;
    } else {
      // Something else happened
      transformedError.message = error.message || 'Unknown error occurred';
    }

    return transformedError;
  }

  logError(error) {
    const config = error.config;
    const method = config?.method?.toUpperCase() || 'UNKNOWN';
    const url = config?.url || 'unknown';
    
    if (error.code === 'ECONNABORTED') {
      console.error(`❌ TIMEOUT ${method} ${url} - ${error.message}`);
    } else if (error.code === 'ERR_NETWORK') {
      console.error(`❌ NETWORK ${method} ${url} - Backend unavailable`);
    } else if (error.response) {
      console.error(`❌ ${error.response.status} ${method} ${url} - ${error.response.statusText}`);
    } else {
      console.error(`❌ ERROR ${method} ${url} - ${error.message}`);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // HTTP Methods with enhanced error handling
  async get(url, config = {}) {
    try {
      const response = await this.axiosInstance.get(url, config);
      return response;
    } catch (error) {
      throw error;
    }
  }

  async post(url, data, config = {}) {
    try {
      const response = await this.axiosInstance.post(url, data, config);
      return response;
    } catch (error) {
      throw error;
    }
  }

  async put(url, data, config = {}) {
    try {
      const response = await this.axiosInstance.put(url, data, config);
      return response;
    } catch (error) {
      throw error;
    }
  }

  async patch(url, data, config = {}) {
    try {
      const response = await this.axiosInstance.patch(url, data, config);
      return response;
    } catch (error) {
      throw error;
    }
  }

  async delete(url, config = {}) {
    try {
      const response = await this.axiosInstance.delete(url, config);
      return response;
    } catch (error) {
      throw error;
    }
  }

  // WhatsApp specific methods with better error handling
  async getConversations() {
    try {
      console.log('📞 Fetching conversations...');
      const response = await this.get('/conversations');
      return response.data || [];
    } catch (error) {
      console.error('Failed to load conversations:', error);
      
      // Return empty array for UI to handle gracefully
      if (error.isNetworkError || error.isTimeoutError) {
        return [];
      }
      throw error;
    }
  }

  async getMessages(waId, page = 1, limit = 50) {
    try {
      console.log(`📨 Fetching messages for ${waId} (page ${page})`);
      const response = await this.get(`/conversations/${waId}/messages`, {
        params: { page, limit }
      });
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch messages for ${waId}:`, error);
      
      // Return empty result for UI to handle gracefully
      if (error.isNetworkError || error.isTimeoutError) {
        return { messages: [], pagination: { page, limit, total: 0, has_more: false } };
      }
      throw error;
    }
  }

  async sendMessage(waId, messageData) {
    try {
      console.log(`📤 Sending message to ${waId}:`, messageData);
      const response = await this.post(`/conversations/${waId}/messages`, messageData);
      return response.data;
    } catch (error) {
      console.error(`Failed to send message to ${waId}:`, error);
      throw error;
    }
  }

  async deleteConversation(waId) {
    try {
      console.log(`🗑️ Deleting conversation ${waId}`);
      const response = await this.delete(`/conversations/${waId}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to delete conversation ${waId}:`, error);
      throw error;
    }
  }

  async processWebhookFile(file) {
    try {
      console.log('📁 Processing webhook file:', file.name);
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await this.post('/process-file', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: LONG_TIMEOUT, // Longer timeout for file processing
      });
      return response.data;
    } catch (error) {
      console.error('Failed to process webhook file:', error);
      throw error;
    }
  }

  async getHealthStatus() {
    try {
      const response = await this.get('/health', {
        timeout: 15000, // Shorter timeout for health checks
      });
      return response.data;
    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  }

  // Enhanced utility methods
  isOnline() {
    return navigator.onLine;
  }

  async testConnection() {
    try {
      console.log('🔍 Testing connection...');
      const startTime = Date.now();
      await this.getHealthStatus();
      const latency = Date.now() - startTime;
      
      return {
        online: true,
        latency,
        timestamp: new Date().toISOString(),
        status: 'healthy'
      };
    } catch (error) {
      return {
        online: false,
        error: error.message,
        isTimeout: error.isTimeoutError,
        isNetwork: error.isNetworkError,
        timestamp: new Date().toISOString(),
        status: 'unhealthy'
      };
    }
  }

  async searchMessages(query, waId = null) {
    try {
      const params = { query };
      if (waId) params.wa_id = waId;
      
      const response = await this.get('/messages/search', { params });
      return response.data;
    } catch (error) {
      console.error('Message search failed:', error);
      throw error;
    }
  }

  async getConversationStats(waId) {
    try {
      const response = await this.get(`/conversations/${waId}/stats`);
      return response.data;
    } catch (error) {
      console.error(`Failed to get stats for ${waId}:`, error);
      throw error;
    }
  }

  async markAsRead(waId, messageIds = []) {
    try {
      const response = await this.patch(`/conversations/${waId}/read`, {
        message_ids: messageIds
      });
      return response.data;
    } catch (error) {
      console.error(`Failed to mark messages as read for ${waId}:`, error);
      throw error;
    }
  }

  // File upload with progress
  createUploadProgress(onProgress) {
    return {
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        if (onProgress) {
          onProgress(percentCompleted, progressEvent);
        }
      }
    };
  }

  // Request cancellation
  createCancelToken() {
    return axios.CancelToken.source();
  }

  isCancel(error) {
    return axios.isCancel(error);
  }

  // Connection monitoring
  async startConnectionMonitoring(callback) {
    const monitor = async () => {
      try {
        const result = await this.testConnection();
        if (callback) callback(result);
        
        // Log connection status
        if (result.online) {
          console.log(`💚 API connection healthy - Latency: ${result.latency}ms`);
        } else {
          console.warn('💛 API connection issues:', result.error);
        }
      } catch (error) {
        console.error('💔 API monitoring failed:', error);
        if (callback) callback({ online: false, error: error.message });
      }
    };

    // Initial check
    await monitor();
    
    // Periodic monitoring every 2 minutes
    const interval = setInterval(monitor, 120000);
    
    // Return cleanup function
    return () => clearInterval(interval);
  }

  // Batch operations with better error handling
  async batchOperation(operations) {
    const results = [];
    const errors = [];
    
    for (const [index, operation] of operations.entries()) {
      try {
        const result = await operation();
        results.push({ index, success: true, data: result });
      } catch (error) {
        console.error(`Batch operation ${index} failed:`, error);
        errors.push({ index, error });
        results.push({ index, success: false, error });
      }
    }
    
    return {
      results,
      errors,
      successCount: results.filter(r => r.success).length,
      errorCount: errors.length
    };
  }

  // Cleanup method
  cleanup() {
    console.log('🧹 Cleaning up API service');
    // Cancel any pending requests if needed
    // Reset any internal state
  }
}

// Create and export a singleton instance
const apiService = new ApiService();

// Auto-start connection monitoring in browser environment
if (typeof window !== "undefined") {
  // Start monitoring after a delay
  setTimeout(async () => {
    try {
      const stopMonitoring = await apiService.startConnectionMonitoring((status) => {
        // Emit custom event for UI components to listen to
        window.dispatchEvent(new CustomEvent('apiStatusChange', { 
          detail: status 
        }));
      });
      
      // Cleanup on page unload
      window.addEventListener('beforeunload', () => {
        stopMonitoring();
        apiService.cleanup();
      });
    } catch (error) {
      console.warn('Failed to start API monitoring:', error);
    }
  }, 2000);
}

export default apiService;

// Export individual methods for convenience
export const {
  get,
  post,
  put,
  patch,
  delete: deleteRequest,
  getConversations,
  getMessages,
  sendMessage,
  deleteConversation,
  processWebhookFile,
  getHealthStatus,
  testConnection,
  searchMessages,
  getConversationStats,
  markAsRead,
  createUploadProgress,
  createCancelToken,
  isCancel
} = apiService;