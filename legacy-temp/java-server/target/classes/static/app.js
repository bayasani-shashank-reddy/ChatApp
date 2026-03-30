// Global Utilities and Auth checks

const API_BASE_URL = '/api';

// Premium Toast Notification — centered, 5s auto-dismiss
function showToast(message, isError = false) {
    // Remove any existing toast first
    const existing = document.getElementById('toast');
    if (existing) { clearTimeout(existing._timeout); existing.remove(); }

    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.textContent = message;
    toast.style.cssText = [
        'position:fixed',
        'top:24px',
        'left:50%',
        'transform:translate(-50%, -20px)',
        'z-index:99999',
        'padding:14px 24px',
        'border-radius:18px',
        'font-size:0.92rem',
        'font-weight:600',
        'color:white',
        'text-align:center',
        'max-width:340px',
        'min-width:200px',
        'pointer-events:none',
        'transition:all 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28)',
        'opacity:0',
        isError
            ? 'background:linear-gradient(135deg,rgba(239,68,68,0.95),rgba(185,28,28,0.95));box-shadow:0 8px 32px rgba(239,68,68,0.4);'
            : 'background:linear-gradient(135deg,rgba(99,102,241,0.95),rgba(139,92,246,0.95));box-shadow:0 8px 32px rgba(99,102,241,0.4);'
    ].join(';');

    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translate(-50%, 0)';
    });

    toast._timeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, -20px)';
        setTimeout(() => toast.remove(), 400);
    }, 5000);
}


// Auth Utilities
const Auth = {
    getToken: () => localStorage.getItem('chat_token'),
    getUser: () => {
        const userStr = localStorage.getItem('chat_user');
        return userStr ? JSON.parse(userStr) : null;
    },
    setAuth: (token, user) => {
        localStorage.setItem('chat_token', token);
        localStorage.setItem('chat_user', JSON.stringify(user));
    },
    logout: () => {
        localStorage.removeItem('chat_token');
        localStorage.removeItem('chat_user');
        window.location.href = '/login.html';
    },
    isAuthenticated: () => !!localStorage.getItem('chat_token')
};

// Generic Fetch Wrapper with Auth Header
async function fetchApi(endpoint, methodOrOptions = 'GET', bodyData = null) {
    let options = {};
    if (typeof methodOrOptions === 'string') {
        options.method = methodOrOptions;
        if (bodyData) {
            if (bodyData instanceof FormData) {
                options.body = bodyData;
            } else {
                options.body = JSON.stringify(bodyData);
            }
        }
    } else {
        options = methodOrOptions;
    }

    const headers = { ...options.headers };
    // DO NOT set Content-Type for FormData as fetch will set it with the correct boundary
    if (!(bodyData instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const token = Auth.getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers
        });

        // Handle 401 Unauthorized globally
        if (response.status === 401) {
            Auth.logout();
            return null;
        }

        const isJson = response.headers.get('content-type')?.includes('application/json');

        // Read the body exactly once
        const bodyText = await response.text();
        let bodyData = bodyText;
        if (isJson && bodyText) {
            try {
                bodyData = JSON.parse(bodyText);
            } catch (e) {
                // Ignore parse error
            }
        }

        if (!response.ok) {
            const errorText = isJson && bodyData.message ? bodyData.message : bodyText;
            throw new Error(errorText || 'API Error');
        }

        return bodyData;

    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}
