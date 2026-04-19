export type PaymentLocale = 'en' | 'ko';

export type PaymentApiErrorCode =
  | 'UNAUTHORIZED'
  | 'SERVER_CONFIG_ERROR'
  | 'INVALID_REQUEST_BODY'
  | 'UNSUPPORTED_PRODUCT'
  | 'MISSING_PAYMENT_ID'
  | 'PRODUCT_NOT_AVAILABLE'
  | 'PURCHASE_REQUIRED'
  | 'LICENSE_REQUIRED'
  | 'DATABASE_ERROR'
  | 'UNKNOWN_ERROR';

type PaymentCopy = {
  cart: {
    overline: string;
    title: string;
    intro: string;
    clearCart: string;
    emptyTitle: string;
    emptyDescription: string;
    browsePlugins: string;
    each: string;
    lineTotal: string;
    qty: string;
    remove: string;
    orderSummary: string;
    items: string;
    subtotal: string;
    total: string;
    checkout: string;
    emptyMessage: string;
    checkoutSoon: string;
    cartCleared: string;
  };
  orders: {
    loadFailed: string;
    detailsPartial: string;
    empty: string;
    purchased: string;
    qty: string;
    status: string;
    currency: string;
    orderNumber: string;
    transactionId: string;
    unknownProduct: string;
  };
  licenses: {
    loadFailed: string;
    empty: string;
    label: string;
    copy: string;
    copied: string;
    download: string;
    preparing: string;
    copyFailed: string;
  };
  download: {
    loginAgain: string;
    failed: string;
    urlMissing: string;
    starting: string;
  };
  common: {
    tryAgain: string;
    checkYourEmail: string;
  };
  apiErrors: Record<PaymentApiErrorCode, string>;
};

const PAYMENT_COPY: Record<PaymentLocale, PaymentCopy> = {
  en: {
    cart: {
      overline: 'Shopping',
      title: 'Cart',
      intro: 'Review your selected products before checkout.',
      clearCart: 'Clear Cart',
      emptyTitle: 'No items in your cart yet.',
      emptyDescription: 'Your selected products will appear here.',
      browsePlugins: 'Browse Plugins',
      each: 'each',
      lineTotal: 'Line Total',
      qty: 'Qty',
      remove: 'Remove',
      orderSummary: 'Order Summary',
      items: 'Items',
      subtotal: 'Subtotal',
      total: 'Total',
      checkout: 'Checkout',
      emptyMessage: 'Your cart is empty.',
      checkoutSoon: 'Checkout is coming soon.',
      cartCleared: 'Cart cleared.'
    },
    orders: {
      loadFailed: 'Could not load purchase history right now.',
      detailsPartial: 'Detailed item rows are unavailable right now. Showing fallback order data.',
      empty: 'No purchases yet. Your purchased products will appear here after checkout.',
      purchased: 'Purchased',
      qty: 'Qty',
      status: 'Status',
      currency: 'Currency',
      orderNumber: 'Order',
      transactionId: 'TX',
      unknownProduct: 'Unknown product'
    },
    licenses: {
      loadFailed: 'Could not load licenses right now.',
      empty: 'No licenses yet.',
      label: 'License',
      copy: 'Copy',
      copied: 'Copied',
      download: 'Download',
      preparing: 'Preparing...',
      copyFailed: 'Could not copy the license key.'
    },
    download: {
      loginAgain: 'Please log in again.',
      failed: 'Download failed.',
      urlMissing: 'Download URL not found.',
      starting: 'Download starting...'
    },
    common: {
      tryAgain: 'Try again',
      checkYourEmail: 'Check your email'
    },
    apiErrors: {
      UNAUTHORIZED: 'You need to log in to continue.',
      SERVER_CONFIG_ERROR: 'Server configuration is missing.',
      INVALID_REQUEST_BODY: 'Invalid request body.',
      UNSUPPORTED_PRODUCT: 'This product is not supported yet.',
      MISSING_PAYMENT_ID: 'Payment information is missing.',
      PRODUCT_NOT_AVAILABLE: 'Product not available.',
      PURCHASE_REQUIRED: 'Purchase required for this product.',
      LICENSE_REQUIRED: 'License required for this product.',
      DATABASE_ERROR: 'A temporary server error occurred.',
      UNKNOWN_ERROR: 'Something went wrong. Please try again.'
    }
  },
  ko: {
    cart: {
      overline: '쇼핑',
      title: '장바구니',
      intro: '결제 전에 선택한 상품을 확인해 주세요.',
      clearCart: '장바구니 비우기',
      emptyTitle: '장바구니가 비어 있습니다.',
      emptyDescription: '선택한 상품이 여기에 표시됩니다.',
      browsePlugins: '플러그인 보기',
      each: '개당',
      lineTotal: '합계',
      qty: '수량',
      remove: '삭제',
      orderSummary: '주문 요약',
      items: '상품 수',
      subtotal: '소계',
      total: '총액',
      checkout: '결제하기',
      emptyMessage: '장바구니가 비어 있습니다.',
      checkoutSoon: '결제 기능은 곧 제공됩니다.',
      cartCleared: '장바구니를 비웠습니다.'
    },
    orders: {
      loadFailed: '구매 내역을 불러오지 못했습니다.',
      detailsPartial: '상세 품목 정보를 불러오지 못해 기본 주문 정보를 표시합니다.',
      empty: '아직 구매 내역이 없습니다. 결제 후 이곳에 표시됩니다.',
      purchased: '구매됨',
      qty: '수량',
      status: '상태',
      currency: '통화',
      orderNumber: '주문번호',
      transactionId: '거래ID',
      unknownProduct: '알 수 없는 상품'
    },
    licenses: {
      loadFailed: '라이선스를 불러오지 못했습니다.',
      empty: '아직 라이선스가 없습니다.',
      label: '라이선스',
      copy: '복사',
      copied: '복사됨',
      download: '다운로드',
      preparing: '준비 중...',
      copyFailed: '라이선스 키를 복사하지 못했습니다.'
    },
    download: {
      loginAgain: '다시 로그인해 주세요.',
      failed: '다운로드에 실패했습니다.',
      urlMissing: '다운로드 URL을 찾을 수 없습니다.',
      starting: '다운로드를 시작합니다...'
    },
    common: {
      tryAgain: '다시 시도',
      checkYourEmail: '이메일을 확인해 주세요'
    },
    apiErrors: {
      UNAUTHORIZED: '로그인이 필요합니다.',
      SERVER_CONFIG_ERROR: '서버 설정이 올바르지 않습니다.',
      INVALID_REQUEST_BODY: '요청 형식이 올바르지 않습니다.',
      UNSUPPORTED_PRODUCT: '아직 지원되지 않는 상품입니다.',
      MISSING_PAYMENT_ID: '결제 정보가 누락되었습니다.',
      PRODUCT_NOT_AVAILABLE: '상품을 사용할 수 없습니다.',
      PURCHASE_REQUIRED: '구매 후 이용 가능합니다.',
      LICENSE_REQUIRED: '라이선스가 필요합니다.',
      DATABASE_ERROR: '일시적인 서버 오류가 발생했습니다.',
      UNKNOWN_ERROR: '문제가 발생했습니다. 다시 시도해 주세요.'
    }
  }
};

const PAYMENT_API_ERROR_EN: Record<PaymentApiErrorCode, string> = {
  UNAUTHORIZED: 'Unauthorized',
  SERVER_CONFIG_ERROR: 'Server configuration error',
  INVALID_REQUEST_BODY: 'Invalid request body',
  UNSUPPORTED_PRODUCT: 'Unsupported product',
  MISSING_PAYMENT_ID: 'Missing payment id',
  PRODUCT_NOT_AVAILABLE: 'Product not available',
  PURCHASE_REQUIRED: 'Purchase required for this product.',
  LICENSE_REQUIRED: 'License required for this product.',
  DATABASE_ERROR: 'Database error',
  UNKNOWN_ERROR: 'Unknown error'
};

export function resolvePaymentLocale(input: string | null | undefined): PaymentLocale {
  if (!input) {
    return 'en';
  }

  return input.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export function getPaymentCopy(locale: PaymentLocale) {
  return PAYMENT_COPY[locale];
}

export function getPaymentApiErrorMessage(code: PaymentApiErrorCode) {
  return PAYMENT_API_ERROR_EN[code];
}
