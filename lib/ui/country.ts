type CountryOption = {
  code: string;
  name: string;
  flag: string;
};

const FALLBACK_COUNTRY_CODES = [
  'AR',
  'AU',
  'AT',
  'BE',
  'BR',
  'CA',
  'CL',
  'CN',
  'CO',
  'CZ',
  'DK',
  'EG',
  'FI',
  'FR',
  'DE',
  'GR',
  'HK',
  'HU',
  'IN',
  'ID',
  'IE',
  'IL',
  'IT',
  'JP',
  'KR',
  'MY',
  'MX',
  'NL',
  'NZ',
  'NG',
  'NO',
  'PH',
  'PL',
  'PT',
  'RO',
  'RU',
  'SA',
  'SG',
  'ZA',
  'ES',
  'SE',
  'CH',
  'TW',
  'TH',
  'TR',
  'UA',
  'AE',
  'GB',
  'US',
  'VN'
] as const;

function toFlagEmoji(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) {
    return '🌍';
  }

  const first = code.charCodeAt(0) + 127397;
  const second = code.charCodeAt(1) + 127397;
  return String.fromCodePoint(first, second);
}

function createCountryOptions(): CountryOption[] {
  const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });

  const getSupportedCountryCodes = () => {
    const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;

    if (typeof supportedValuesOf === 'function') {
      try {
        const codes = supportedValuesOf('region').filter((code) => /^[A-Z]{2}$/.test(code));
        if (codes.length > 0) {
          return codes;
        }
      } catch {
        // Use fallback list when supportedValuesOf is unavailable.
      }
    }

    return [...FALLBACK_COUNTRY_CODES];
  };

  return getSupportedCountryCodes()
    .map((code) => {
      const label = displayNames.of(code) ?? code;
      return {
        code,
        name: label,
        flag: toFlagEmoji(code)
      };
    })
    .filter((country) => country.name && country.name !== country.code)
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

export const COUNTRY_OPTIONS = createCountryOptions();

export const DEFAULT_COUNTRY_NAME = COUNTRY_OPTIONS.find((country) => country.code === 'KR')?.name ?? 'South Korea';

export function normalizeCountryName(rawValue: string | null | undefined) {
  const normalizedRaw = (rawValue ?? '').trim();

  if (!normalizedRaw) {
    return DEFAULT_COUNTRY_NAME;
  }

  const byCode = COUNTRY_OPTIONS.find((country) => country.code.toLowerCase() === normalizedRaw.toLowerCase());
  if (byCode) {
    return byCode.name;
  }

  const byName = COUNTRY_OPTIONS.find((country) => country.name.toLowerCase() === normalizedRaw.toLowerCase());
  if (byName) {
    return byName.name;
  }

  return normalizedRaw;
}
