'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type CountryOption = {
  code: string;
  name: string;
  flag: string;
};

type CountrySelectProps = {
  id: string;
  value: string;
  onChange: (nextCountry: string) => void;
  disabled?: boolean;
  placeholder?: string;
  readonlyStyle?: boolean;
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

const COUNTRY_OPTIONS = createCountryOptions();

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

export default function CountrySelect({
  id,
  value,
  onChange,
  disabled = false,
  placeholder = 'Select country',
  readonlyStyle = false
}: CountrySelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedCountry = useMemo(() => {
    const normalizedValue = value.trim().toLowerCase();
    if (!normalizedValue) {
      return null;
    }

    return (
      COUNTRY_OPTIONS.find((country) => country.name.toLowerCase() === normalizedValue) ??
      COUNTRY_OPTIONS.find((country) => country.code.toLowerCase() === normalizedValue) ??
      null
    );
  }, [value]);

  const filteredCountries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return COUNTRY_OPTIONS;
    }

    return COUNTRY_OPTIONS.filter((country) => {
      return (
        country.name.toLowerCase().includes(normalizedQuery) ||
        country.code.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!rootRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      return;
    }

    window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
  }, [isOpen]);

  const buttonLabel = (selectedCountry?.name ?? value.trim()) || placeholder;
  const buttonFlag = selectedCountry?.flag ?? '🌍';

  return (
    <div className={`country-select ${disabled ? 'is-disabled' : ''}`} ref={rootRef}>
      <button
        type="button"
        id={id}
        className={`auth-input country-select-trigger ${readonlyStyle ? 'mypage-readonly' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${id}-listbox`}
        onClick={() => {
          if (disabled) {
            return;
          }
          setIsOpen((prev) => !prev);
        }}
        disabled={disabled}
      >
        <span className="country-select-value-wrap">
          <span className="country-select-flag" aria-hidden="true">
            {buttonFlag}
          </span>
          <span className="country-select-value">{buttonLabel}</span>
        </span>
        <span className="country-select-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {isOpen ? (
        <div className="country-select-menu" role="dialog" aria-label="Country selector">
          <input
            ref={searchInputRef}
            className="auth-input country-select-search"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search country"
            aria-label="Search country"
          />

          <div id={`${id}-listbox`} role="listbox" className="country-select-list" aria-label="Country options">
            {filteredCountries.length === 0 ? (
              <p className="country-select-empty">No matching countries</p>
            ) : (
              filteredCountries.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  role="option"
                  className={`country-select-option ${selectedCountry?.code === country.code ? 'is-selected' : ''}`}
                  aria-selected={selectedCountry?.code === country.code}
                  onClick={() => {
                    onChange(country.name);
                    setIsOpen(false);
                  }}
                >
                  <span className="country-select-flag" aria-hidden="true">
                    {country.flag}
                  </span>
                  <span className="country-select-option-name">{country.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
