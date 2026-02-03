/**
 * Authentication Utilities
 */

function saveUser(user, token) {
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('token', token);
}

function getUser() {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
}

function getToken() {
  return localStorage.getItem('token');
}

function resolveLoginPath() {
  const segments = window.location.pathname.split('/');
  const frontendIndex = segments.indexOf('frontend');
  if (frontendIndex !== -1) {
    const base = segments.slice(0, frontendIndex + 1).join('/') || '/';
    return `${base.replace(/\/$/, '')}/index.html`;
  }
  return 'index.html';
}

function logout() {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  window.location.href = resolveLoginPath();
}

function requireAuth(role) {
  const user = getUser();
  if (!user || (role && user.role !== role)) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}