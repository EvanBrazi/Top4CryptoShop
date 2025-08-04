// نظام إدارة المستخدم المعدل
var currentUser = {
        name: 'زائر',
        email: null,
        balance: 0.00,
        theme: 'day'
    };

function setUserName() {

}

function setUserEmail() {

}

function setUserBalance(balance) {
    currentUser.balance = balance;
}

function getUserBalance() {
    return currentUser.balance;
}

function loadUser() {
    try {
    console.log('userData loadUser')
        const userData = localStorage.getItem('user');

        if (!userData) {
            setDefaultUser();
            return;
        }

        const parsedUser = JSON.parse(userData);

        if (validateUser(parsedUser)) {
            currentUser = {
                ...currentUser,
                ...parsedUser
            };
        } else {
            console.warn('بيانات المستخدم غير صالحة، يتم استخدام البيانات الافتراضية');
            setDefaultUser();
        }

        updateUserProfile();
    } catch (error) {
        console.error('خطأ في تحميل بيانات المستخدم:', error);
        setDefaultUser();
        updateUserProfile();
    }
}

function validateUser(user) {
    try {
        if (!user || typeof user !== 'object') return false;

        const validatedUser = {
            name: typeof user.name === 'string' ? user.name : 'زائر',
            email: user.email && typeof user.email === 'string' ? user.email : null,
            balance: typeof user.balance === 'number' ? user.balance : 0,
            theme: ['day', 'night'].includes(user.theme) ? user.theme : 'day'
        };

        currentUser = validatedUser;
        return true;
    } catch (e) {
        console.error('خطأ في التحقق من صحة المستخدم:', e);
        return false;
    }
}

function setDefaultUser() {
currentUser.name = 'Evan Barzi';
currentUser.email = 'leporejamesw0@gmail.com';
currentUser.balance = 99999.99;
currentUser.theme = 'day';
localStorage.setItem('user', JSON.stringify(currentUser));
}

function updateUserProfile() {
    try {
        const usernameDisplay = document.getElementById('username-display');
        if (usernameDisplay) {
            usernameDisplay.textContent = currentUser.name || 'زائر';
        }

        const balanceDisplay = document.getElementById('balance-display');
        const topBalanceDisplay = document.getElementById('top-balance-display');

        if (balanceDisplay) {
            balanceDisplay.textContent = currentUser.balance?.toFixed(2) || '0.00';
        }

        if (topBalanceDisplay) {
            topBalanceDisplay.textContent = currentUser.balance?.toFixed(2) || '0.00';
        }

        const profileImg = document.getElementById('profile-img');
        if (profileImg) {
            profileImg.onerror = () => {
                profileImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDExQzE0LjIwOTEgMTEgMTYgOS4yMDkxIDE2IDdDMTYgNC43OTA4NiAxNC4yMDkxIDMgMTIgM0M5Ljc5MDg2IDMgOCA0Ljc5MDg2IDggN0M4IDkuMjA5MTQgOS43OTA4NiAxMSAxMiAxMVoiIGZpbGw9IiNjY2MiLz4KPHBhdGggZD0iTTEyIDIxQzE2Ljk3MDYgMjEgMjEgMTYuOTcwNiAyMSAxMkMyMSA3LjAyOTQ0IDE2Ljk3MDYgMyAxMiAzQzcuMDI5NDQgMyAzIDcuMDI5NDQgMyAxMkMzIDE2Ljk3MDYgNy4wMjk0NCAyMSAxMiAyMVoiIHN0cm9rZT0iI2NjYyIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjwvc3ZnPg==';
            };

            if (currentUser.email) {
                const emailHash = md5(currentUser.email.trim().toLowerCase());
                profileImg.src = `https://www.gravatar.com/avatar/${emailHash}?d=404&s=160`;
            } else {
                const name = encodeURIComponent(currentUser.name || 'زائر');
                profileImg.src = `https://ui-avatars.com/api/?name=${name}&background=random`;
            }
        }
    } catch (error) {
        console.error('خطأ في تحديث واجهة المستخدم:', error);
    }
}

function logout() {
    if (!confirm('هل أنت متأكد من تسجيل الخروج؟')) return;

    try {
        localStorage.removeItem('user');
        sessionStorage.removeItem('userSession');
        setDefaultUser();
        updateUserProfile();
        showToast('تم تسجيل الخروج بنجاح', 'success');
        setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
        console.error('حدث خطأ أثناء تسجيل الخروج:', err);
        showToast('حدث خطأ أثناء تسجيل الخروج. يرجى المحاولة مرة أخرى.', 'error');
    }
}

function saveUser() {
    try {
        localStorage.setItem('user', JSON.stringify(currentUser));
    } catch (error) {
        console.error('خطأ في حفظ بيانات المستخدم:', error);
        showToast('حدث خطأ في حفظ بيانات المستخدم', 'error');
    }
}
export {loadUser, validateUser, setUserBalance, setDefaultUser, logout, saveUser};