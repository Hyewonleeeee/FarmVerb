import { normalizeCountryName } from '@/lib/ui/country';

const NAME_ALLOWED_PATTERN = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KEYBOARD_SPAM_PATTERNS = new Set([
  'asdf',
  'qwer',
  'zxcv',
  'asdfgh',
  'qwerty',
  'zxcvbn',
  'sjfajksfkas'
]);

export type PasswordChecklist = {
  minLength: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  specialChar: boolean;
};

export type SignupValidationResult = {
  normalizedFirstName: string;
  normalizedLastName: string;
  normalizedName: string;
  normalizedEmail: string;
  normalizedCountry: string;
  firstNameValid: boolean;
  lastNameValid: boolean;
  nameValid: boolean;
  emailValid: boolean;
  passwordValid: boolean;
  passwordChecklist: PasswordChecklist;
  passwordStrength: 'Weak' | 'Fair' | 'Good' | 'Strong';
  firstNameError: string | null;
  lastNameError: string | null;
  nameError: string | null;
  emailError: string | null;
  passwordError: string | null;
};

function collapseWhitespace(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function titleCaseName(value: string) {
  return value
    .split(' ')
    .map((word) =>
      word
        .split(/(['-])/)
        .map((part) => {
          if (part === "'" || part === '-') {
            return part;
          }

          if (!part) {
            return part;
          }

          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join('')
    )
    .join(' ');
}

export function normalizeSignupName(rawName: string) {
  return titleCaseName(collapseWhitespace(rawName));
}

function isKeyboardSpamName(compactName: string) {
  const normalized = compactName.toLowerCase();

  if (KEYBOARD_SPAM_PATTERNS.has(normalized)) {
    return true;
  }

  if (/([a-z])\1{3,}/i.test(normalized)) {
    return true;
  }

  const letters = (normalized.match(/[a-z]/g) ?? []).length;
  const vowelCount = (normalized.match(/[aeiouy]/g) ?? []).length;

  if (letters >= 4 && vowelCount === 0) {
    return true;
  }

  if (letters >= 8 && vowelCount / letters < 0.2) {
    return true;
  }

  return false;
}

export function validateSignupName(rawName: string) {
  const normalizedName = normalizeSignupName(rawName);
  const compactName = normalizedName.replace(/[\s'-]/g, '');

  if (!normalizedName || normalizedName.length < 2 || normalizedName.length > 50) {
    return {
      normalizedName,
      valid: false,
      error: 'Please enter your real name in English.'
    };
  }

  if (!NAME_ALLOWED_PATTERN.test(normalizedName)) {
    return {
      normalizedName,
      valid: false,
      error: 'Please enter your real name in English.'
    };
  }

  if (isKeyboardSpamName(compactName)) {
    return {
      normalizedName,
      valid: false,
      error: 'Please enter your real name in English.'
    };
  }

  return {
    normalizedName,
    valid: true,
    error: null
  };
}

export function combineSignupName(firstName: string, lastName: string) {
  return [normalizeSignupName(firstName), normalizeSignupName(lastName)].filter(Boolean).join(' ').trim();
}

export function normalizeSignupEmail(rawEmail: string) {
  return collapseWhitespace(rawEmail).toLowerCase();
}

export function validateSignupEmail(rawEmail: string) {
  const normalizedEmail = normalizeSignupEmail(rawEmail);

  if (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail)) {
    return {
      normalizedEmail,
      valid: false,
      error: 'Please enter a valid email address.'
    };
  }

  return {
    normalizedEmail,
    valid: true,
    error: null
  };
}

export function getPasswordChecklist(password: string): PasswordChecklist {
  return {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    specialChar: /[^A-Za-z0-9]/.test(password)
  };
}

export function getPasswordStrength(checklist: PasswordChecklist): 'Weak' | 'Fair' | 'Good' | 'Strong' {
  const score = Object.values(checklist).filter(Boolean).length;

  if (score <= 2) {
    return 'Weak';
  }

  if (score === 3) {
    return 'Fair';
  }

  if (score === 4) {
    return 'Good';
  }

  return 'Strong';
}

export function validateSignupPassword(password: string) {
  const checklist = getPasswordChecklist(password);
  const valid = Object.values(checklist).every(Boolean);

  return {
    checklist,
    strength: getPasswordStrength(checklist),
    valid,
    error: valid ? null : 'Please complete the password requirements below.'
  };
}

export function validateSignupPayload(input: {
  firstName?: string;
  lastName?: string;
  name: string;
  email: string;
  password: string;
  country?: string;
}) {
  const fallbackParts = collapseWhitespace(input.name).split(' ').filter(Boolean);
  const firstNameInput = collapseWhitespace(input.firstName ?? fallbackParts[0] ?? '');
  const lastNameInput = collapseWhitespace(input.lastName ?? fallbackParts.slice(1).join(' '));
  const firstName = validateSignupName(firstNameInput);
  const lastName = validateSignupName(lastNameInput);
  const email = validateSignupEmail(input.email);
  const password = validateSignupPassword(input.password);
  const normalizedCountry = normalizeCountryName(input.country ?? '');
  const normalizedName = combineSignupName(firstName.normalizedName, lastName.normalizedName);

  return {
    valid: firstName.valid && lastName.valid && email.valid && password.valid,
    normalized: {
      firstName: firstName.normalizedName,
      lastName: lastName.normalizedName,
      name: normalizedName,
      email: email.normalizedEmail,
      country: normalizedCountry
    },
    errors: {
      firstName: firstName.error,
      lastName: lastName.error,
      name: firstName.error ?? lastName.error,
      email: email.error,
      password: password.error
    },
    passwordChecklist: password.checklist,
    passwordStrength: password.strength,
    normalizedFirstName: firstName.normalizedName,
    normalizedLastName: lastName.normalizedName,
    normalizedName,
    firstNameValid: firstName.valid,
    lastNameValid: lastName.valid,
    nameValid: firstName.valid && lastName.valid,
    emailValid: email.valid,
    passwordValid: password.valid,
    firstNameError: firstName.error,
    lastNameError: lastName.error,
    nameError: firstName.error ?? lastName.error,
    emailError: email.error,
    passwordError: password.error
  };
}
