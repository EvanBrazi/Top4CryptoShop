// Display-only mapping. Preserve backend codes; never expose raw server messages.
export const SUPPORT = Object.freeze({
    whatsapp: '+963980217649',
    whatsappDigits: '963980217649'
});
const RATE_LIMIT_MESSAGE = 'طلبات كثيرة. يرجى الانتظار قبل المحاولة مجدداً';
export const GENERIC_ERROR_MESSAGE = 'حدث خطأ غير متوقع. يرجى إعادة المحاولة';
export const ERROR_MESSAGES = Object.freeze({
    USER_USERNAME_TAKEN: 'اسم المستخدم مستخدم بالفعل، جرب اسماً آخر',
    USER_EMAIL_TAKEN: 'البريد الإلكتروني مسجل بالفعل',
    USER_PHONE_TAKEN: 'رقم الهاتف مسجل بالفعل',
    INVALID_LOGIN: 'اسم المستخدم أو كلمة المرور غير صحيحة',
    AUTH_FORBIDDEN: `هذا الحساب معلق مؤقتاً. لطلب إعادة التفعيل، تواصل مع الدعم عبر واتساب: ${SUPPORT.whatsapp}`,
    CSRF_INVALID: 'انتهت صلاحية الجلسة. يرجى إعادة المحاولة',
    RATE_LIMIT: RATE_LIMIT_MESSAGE,
    RATE_LIMITED: RATE_LIMIT_MESSAGE,
    AUTH_RATE_LIMITED: RATE_LIMIT_MESSAGE,
    FINANCIAL_RATE_LIMITED: RATE_LIMIT_MESSAGE,
    INVALID_PURCHASE_INPUT: 'بيانات الشراء غير صالحة. تحقق من المنتج والكمية',
    PRODUCT_UNAVAILABLE: 'المنتج غير متوفر',
    INVALID_USERNAME: 'اسم المستخدم يجب أن يكون بين 3 و30 حرفًا، باستخدام الحروف الإنجليزية والأرقام والشرطة السفلية',
    INVALID_EMAIL: 'صيغة البريد الإلكتروني غير صحيحة',
    INVALID_PASSWORD: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل، وتحتوي على حرف كبير وصغير ورقم ورمز، ولا تتجاوز 72 بايت',
    INVALID_PHONE: 'يرجى إدخال رقم هاتف صحيح بصيغة دولية',
    NETWORK_ERROR: 'تعذر الاتصال بالخادم. يرجى التحقق من نتيجة العملية قبل إعادة المحاولة',
    MISSING_CREDENTIALS: 'يرجى تسجيل الدخول للمتابعة',
    PAYMENT_ALREADY_DECIDED: 'تم اتخاذ قرار بشأن هذه الدفعة بالفعل',
    IDEMPOTENCY_CONFLICT: 'تعارض في مفتاح العملية. راجع العملية الأصلية ولا تنشئ عملية جديدة',
    INSUFFICIENT_FUNDS: 'الرصيد غير كافٍ لإتمام العملية'
});
// TODO(C6): When financialErrors exposes reason, map MIN_CHARGE / NOT_FOUND / QUANTITY.
const ERROR_FIELDS = Object.freeze({
    USER_USERNAME_TAKEN: 'usernameError',
    INVALID_USERNAME: 'usernameError',
    USER_EMAIL_TAKEN: 'emailError',
    INVALID_EMAIL: 'emailError',
    USER_PHONE_TAKEN: 'phoneError',
    INVALID_PASSWORD: 'passwordError',
    INVALID_PHONE: 'phoneError'
});
function errorCode(result) {
    if (typeof result === 'string') return result;
    if (typeof result?.code === 'string') return result.code;
    return typeof result?.error === 'string' ? result.error : '';
}
export function getErrorMessage(result, fallback = GENERIC_ERROR_MESSAGE) {
    if (result?.status === 429) return RATE_LIMIT_MESSAGE;
    const code = errorCode(result);
    return Object.hasOwn(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] :
        (typeof fallback === 'string' ? fallback : GENERIC_ERROR_MESSAGE);
}
export function getErrorField(result) {
    if (result?.status === 429) return 'generalError';
    const code = errorCode(result);
    return Object.hasOwn(ERROR_FIELDS, code) ? ERROR_FIELDS[code] : 'generalError';
}
