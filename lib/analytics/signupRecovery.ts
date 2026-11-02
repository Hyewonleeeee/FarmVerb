export type SignupAnalyticsChannel = 'ga4' | 'google_ads';

export type PendingSignupConversion = {
  eventId: string;
  method: 'email_otp';
  ga4Pending: boolean;
  googleAdsPending: boolean;
};

export type SignupRecoveryResult = {
  state: 'none' | 'reserved' | 'retry';
  conversion?: PendingSignupConversion;
};
