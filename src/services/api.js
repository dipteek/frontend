// frontend/src/services/api.js
import axios from "axios";

const BASE_URL = "http://localhost:5000";

class APIService {
  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 30000, // 30 seconds
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.setupInterceptors();
    this.retryConfig = {
      retries: 3,
      retryDelay: 1000,
      retryCondition: (error) => {
        // Retry on network errors or 5xx server errors
        return !error.response || 
               (error.response.status >= 500 && error.response.status < 600) ||
               error.code === 'NETWORK_ERROR' ||
               error.code === 'TIMEOUT';
      }
    };
  }

  setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Add timestamp to prevent caching
        if (config.method === 'get') {
          config.params = {
            ...config.params,
            _t: Date.now()
          };
        }

        console.log(`📤 ${config.method.toUpperCase()} ${config.url}`, config.data || config.params);
        return config;
      },
      (error) => {
        console.error("❌ Request error:", error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        console.log(`📥 ${response.status} ${response.config.url}`, response.data);
        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        // Avoid infinite retry loops
        if (!originalRequest._retryCount) {
          originalRequest._retryCount = 0;
        }

        console.error(`❌ ${error.response?.status || 'NETWORK'} ${originalRequest.url}`, error.message);

        // Retry logic
        if (
          originalRequest._retryCount < this.retryConfig.retries &&
          this.retryConfig.retryCondition(error) &&
          !originalRequest._retry
        ) {
          originalRequest._retry = true;
          originalRequest._retryCount += 1;

          const delay = this.retryConfig.retryDelay * Math.pow(2, originalRequest._retryCount - 1);
          
          console.log(`🔄 Retrying request (${originalRequest._retryCount}/${this.retryConfig.retries}) after ${delay}ms`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.client(originalRequest);
        }

        return Promise.reject(this.enhanceError(error));
      }
    );
  }

  enhanceError(error) {
    const enhanced = {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      code: error.code,
      isNetworkError: !error.response,
      isServerError: error.response?.status >= 500,
      isClientError: error.response?.status >= 400 && error.response?.status < 500,
      data: error.response?.data,
      retryCount: error.config?._retryCount || 0
    };

    // Add user-friendly messages
    if (enhanced.isNetworkError) {
      enhanced.userMessage = "Unable to connect to the server. Please check your internet connection.";
    } else if (enhanced.isServerError) {
      enhanced.userMessage = "Server error occurred. Please try again later.";
    } else if (enhanced.status === 404) {
      enhanced.userMessage = "The requested resource was not found.";
    } else if (enhanced.status === 401) {
      enhanced.userMessage = "Authentication required.";
    } else if (enhanced.status === 403) {
      enhanced.userMessage = "Access denied.";
    } else {
      enhanced.userMessage = enhanced.data?.error || enhanced.message || "An unexpected error occurred.";
    }

    return enhanced;
  }

  // HTTP Methods
  async get(url, config = {}) {
    try {
      const response = await this.client.get(url, config);
      return response;
    } catch (error) {
      throw error;
    }
  }

  async post(url, data, config = {}) {
    try {
      const response = await this.client.post(url, data, config);
      return response;
    } catch (error) {
      throw error;
    }
  }

  async put(url, data, config = {}) {
    try {
      const response = await this.client.put(url, data, config);
      return response;
    } catch (error) {
      throw error;
    }
  }

  async patch(url, data, config = {}) {
    try {
      const response = await this.client.patch(url, data, config);
      return response;
    } catch (error) {
      throw error;
    }
  }

  async delete(url, config = {}) {
    try {
      const response = await this.client.delete(url, config);
      return response;
    } catch (error) {
      throw error;
    }
  }

  // WhatsApp specific methods
  async getConversations() {
    try {
      const response = await this.get("/api/conversations");
      return response.data || [];
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
      throw error;
    }
  }

  async getMessages(waId, page = 1, limit = 50) {
    try {
      const response = await this.get(`/api/conversations/${waId}/messages`, {
        params: { page, limit }
      });
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch messages for ${waId}:`, error);
      throw error;
    }
  }

  async sendMessage(waId, messageData) {
    try {
      const response = await this.post(`/api/conversations/${waId}/messages`, messageData);
      return response.data;
    } catch (error) {
      console.error(`Failed to send message to ${waId}:`, error);
      throw error;
    }
  }

  async deleteConversation(waId) {
    try {
      const response = await this.delete(`/api/conversations/${waId}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to delete conversation ${waId}:`, error);
      throw error;
    }
  }

  async processWebhookFile(file) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await this.post("/api/process-file", formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      console.error("Failed to process webhook file:", error);
      throw error;
    }
  }

  async getHealthStatus() {
    try {
      const response = await this.get("/api/health");
      return response.data;
    } catch (error) {
      console.error("Health check failed:", error);
      throw error;
    }
  }

  // Utility methods
  isOnline() {
    return navigator.onLine;
  }

  async testConnection() {
    try {
      const startTime = Date.now();
      await this.getHealthStatus();
      const latency = Date.now() - startTime;
      return {
        online: true,
        latency,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        online: false,
        error: error.userMessage || error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Batch operations
  async searchMessages(query, waId = null) {
    try {
      const params = { query };
      if (waId) params.wa_id = waId;
      
      const response = await this.get("/api/messages/search", { params });
      return response.data;
    } catch (error) {
      console.error("Message search failed:", error);
      throw error;
    }
  }

  async getConversationStats(waId) {
    try {
      const response = await this.get(`/api/conversations/${waId}/stats`);
      return response.data;
    } catch (error) {
      console.error(`Failed to get stats for ${waId}:`, error);
      throw error;
    }
  }

  async markAsRead(waId, messageIds = []) {
    try {
      const response = await this.patch(`/api/conversations/${waId}/read`, {
        message_ids: messageIds
      });
      return response.data;
    } catch (error) {
      console.error(`Failed to mark messages as read for ${waId}:`, error);
      throw error;
    }
  }

  // File upload helper
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
}

// Create and export singleton instance
const apiService = new APIService();

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