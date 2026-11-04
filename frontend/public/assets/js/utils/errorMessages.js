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
    INSUFFICIENT_FUNDS: 'الرصيد غير كافٍ لإتمام العملية',
    INVALID_SUBMISSION_ID: 'رقم طلب الإيداع غير صالح. أعد تحميل الصفحة قبل الإرسال',
    INVALID_PAYMENT_UPLOAD: 'إيصال الدفع مطلوب. اختر صورة JPEG أو PNG أو WebP صالحة حتى 5 ميغابايت',
    INVALID_PAYMENT_METHOD: 'اختر وسيلة دفع صالحة',
    INVALID_PAYMENT_AMOUNT: 'المبلغ غير صالح. أدخل مبلغاً ضمن الحدود المعروضة بمنزلتين عشريتين كحد أقصى',
    INVALID_PAYMENT_NOTE: 'الملاحظة يجب ألا تتجاوز 500 حرف ولا تحتوي على < أو >',
    PAYMENT_SUBMISSION_EXISTS: 'يوجد طلب بهذا الرقم بالفعل. تحقق من حالته ولا ترسل طلباً جديداً.',
    PAYMENT_SUBMISSION_OUTCOME_UNKNOWN: 'لم تتأكد نتيجة الإرسال. تحقق من حالة الطلب ولا تكرر رفع الإيصال.',
    RECEIPT_STORAGE_UNAVAILABLE: 'تعذر حفظ الإيصال. تحقق من حالة الطلب ولا تكرر رفع الإيصال.',
    INVALID_RECEIPT_STORAGE: 'تعذر التحقق من حفظ الإيصال. تحقق من حالة الطلب ولا تكرر رفع الإيصال.',
    PAYMENT_SUBMISSION_UNAVAILABLE: 'خدمة إرسال الطلب غير متاحة. تحقق من حالة الطلب قبل أي محاولة جديدة.',
    RESOURCE_READ_UNAVAILABLE: 'تعذر التحقق من حالة الطلب. حاول التحقق مرة أخرى بعد دقائق.',
    storage_failure_before_dispatch: 'تعذر حفظ رقم الطلب على هذا الجهاز. لم يتم إرسال الطلب.',
    unknown_outcome: 'تم الإرسال لكن لم نتأكد من النتيجة. يرجى التحقق من الحالة.',
    duplicate_submission: 'يوجد طلب بهذا الرقم بالفعل. تحقق من حالته ولا ترسل طلباً جديداً.',
    receipt_too_large: 'الملف أكبر من 5 ميغابايت. صغّر الصورة وأعد المحاولة.',
    submission_acknowledged: 'تم إرسال طلبك بنجاح — قيد مراجعة الإدارة. لم يضف الرصيد بعد.',
    submission_recovered: 'تم إرسال طلبك بنجاح. راجع دفعاتي لمعرفة الحالة الحالية.',
    unresolved_submission: 'لا يزال قيد المعالجة. حاول مرة أخرى بعد دقائق'
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
