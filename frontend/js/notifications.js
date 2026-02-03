/**
 * Modern Toast Notification System
 * Replaces deprecated notify.info() with non-blocking notifications
 */

class NotificationSystem {
  constructor() {
    this.container = null;
    this.notifications = [];
    this.init();
  }

  init() {
    // Create notification container if it doesn't exist
    if (!document.getElementById('notification-container')) {
      const container = document.createElement('div');
      container.id = 'notification-container';
      container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
      `;
      document.body.appendChild(container);
      this.container = container;
    } else {
      this.container = document.getElementById('notification-container');
    }

    // Inject styles if not already present
    if (!document.getElementById('notification-styles')) {
      const style = document.createElement('style');
      style.id = 'notification-styles';
      style.textContent = `
        .toast-notification {
          pointer-events: all;
          padding: 16px 24px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 14px;
          font-weight: 500;
          max-width: 400px;
          display: flex;
          align-items: center;
          gap: 12px;
          animation: slideIn 0.3s ease-out;
          white-space: pre-wrap;
          word-break: break-word;
        }

        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes slideOut {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(400px);
            opacity: 0;
          }
        }

        .toast-notification.removing {
          animation: slideOut 0.3s ease-in;
        }

        .toast-notification.success {
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
        }

        .toast-notification.error {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: white;
        }

        .toast-notification.warning {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: white;
        }

        .toast-notification.info {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          color: white;
        }

        .toast-icon {
          font-size: 18px;
          flex-shrink: 0;
        }

        .toast-content {
          flex: 1;
        }

        .toast-close {
          background: none;
          border: none;
          color: inherit;
          cursor: pointer;
          font-size: 18px;
          padding: 0;
          opacity: 0.7;
          transition: opacity 0.2s;
          flex-shrink: 0;
        }

        .toast-close:hover {
          opacity: 1;
        }

        @media (max-width: 640px) {
          #notification-container {
            top: 10px !important;
            right: 10px !important;
            left: 10px !important;
          }

          .toast-notification {
            max-width: 100%;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }

  show(message, type = 'info', duration = 4000) {
    const id = Date.now();
    const notification = document.createElement('div');
    notification.className = `toast-notification ${type}`;
    notification.dataset.id = id;

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    const content = document.createElement('div');
    content.className = 'toast-content';
    content.textContent = message;

    notification.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span>`;
    notification.appendChild(content);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.textContent = '×';
    closeBtn.onclick = () => this.remove(id);
    notification.appendChild(closeBtn);

    this.container.appendChild(notification);
    this.notifications.push({ id, notification, timeout: null });

    if (duration > 0) {
      const timeout = setTimeout(() => this.remove(id), duration);
      this.notifications.find(n => n.id === id).timeout = timeout;
    }

    return id;
  }

  remove(id) {
    const index = this.notifications.findIndex(n => n.id === id);
    if (index !== -1) {
      const { notification, timeout } = this.notifications[index];
      if (timeout) clearTimeout(timeout);

      notification.classList.add('removing');
      setTimeout(() => {
        notification.remove();
        this.notifications.splice(index, 1);
      }, 300);
    }
  }

  success(message, duration = 3000) {
    return this.show(message, 'success', duration);
  }

  error(message, duration = 5000) {
    return this.show(message, 'error', duration);
  }

  warning(message, duration = 4000) {
    return this.show(message, 'warning', duration);
  }

  info(message, duration = 3000) {
    return this.show(message, 'info', duration);
  }

  clear() {
    this.notifications.forEach(n => this.remove(n.id));
  }
}

// Global instance
window.notify = new NotificationSystem();

// Backward compatibility functions
window.showNotification = (message, type = 'info', duration = 4000) => {
  return window.notify.show(message, type, duration);
};

window.showToast = (message, type = 'info', duration = 4000) => {
  return window.notify.show(message, type, duration);
};
