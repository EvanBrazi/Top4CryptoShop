export async function checkSession(expectedRole = null) {
    try {
        const res = await fetch('/api/auth/check-session', {
            method: 'GET',
            credentials: 'include'
        });

        const contentType = res.headers.get('content-type');
        if (!res.ok || res.status === 401 || contentType?.includes('text/html')) {
            window.location.href = '/401.html';
            return null;
        }

        const data = await res.json();

        if (!data.isAuthenticated || !data.user) {
            window.location.href = data.redirectTo || '/401.html';
            return null;
        }

        if (expectedRole && data.user.role !== expectedRole) {
            window.location.href = '/401.html';
            return null;
        }

        return data.user;
    } catch (err) {
        console.error('Session check failed:', err);
        window.location.href = '/401.html';
        return null;
    }
}
