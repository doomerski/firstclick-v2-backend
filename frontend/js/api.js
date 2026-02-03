/**
 * API Wrapper - Fetch Utility for Backend Communication
 */

// Use local API when running on localhost; otherwise hit the same origin via /api (nginx proxy)
const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : '/api';

const api = {
  async _parseResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    const text = await response.text();
    return { error: text || 'Request failed' };
  },
  /**
   * GET request
   */
  async get(endpoint) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      }
    });
    
    if (!response.ok) {
      const error = await api._parseResponse(response);
      const err = new Error(error.error || 'Request failed');
      err.status = response.status;
      throw err;
    }
    
    return api._parseResponse(response);
  },

  /**
   * POST request
   */
  async post(endpoint, data) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      const error = await api._parseResponse(response);
      const err = new Error(error.error || 'Request failed');
      err.status = response.status;
      throw err;
    }
    
    return api._parseResponse(response);
  },

  /**
   * PATCH request
   */
  async patch(endpoint, data) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      const error = await api._parseResponse(response);
      const err = new Error(error.error || 'Request failed');
      err.status = response.status;
      throw err;
    }
    
    return api._parseResponse(response);
  },

  /**
   * DELETE request
   */
  async delete(endpoint) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      }
    });

    if (!response.ok) {
      const error = await api._parseResponse(response);
      const err = new Error(error.error || 'Request failed');
      err.status = response.status;
      throw err;
    }

    return api._parseResponse(response);
  },

  /**
   * POST with FormData (for file uploads)
   */
  async postFormData(endpoint, formData) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` })
        // Note: Don't set Content-Type for FormData - browser sets it automatically
      },
      body: formData
    });
    
    if (!response.ok) {
      const error = await api._parseResponse(response);
      const err = new Error(error.error || 'Request failed');
      err.status = response.status;
      throw err;
    }
    
    return api._parseResponse(response);
  }
};
