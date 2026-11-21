import React from 'react';

export interface CountryInfo {
  code: string;
  name: string;
}

export const INTERNATIONAL_COUNTRIES: CountryInfo[] = [
  { code: 'IDN', name: 'Indonesia' },
  { code: 'MAS', name: 'Malaysia' },
  { code: 'SGP', name: 'Singapore' },
  { code: 'BRU', name: 'Brunei Darussalam' },
  { code: 'THA', name: 'Thailand' },
  { code: 'VNM', name: 'Vietnam' },
  { code: 'PHI', name: 'Philippines' },
  { code: 'LAO', name: 'Laos' },
  { code: 'CAM', name: 'Cambodia' },
  { code: 'MYA', name: 'Myanmar' },
  { code: 'TLS', name: 'Timor-Leste' },
  { code: 'NED', name: 'Netherlands' },
  { code: 'FRA', name: 'France' },
  { code: 'GER', name: 'Germany' },
  { code: 'GBR', name: 'Great Britain' },
  { code: 'BEL', name: 'Belgium' },
  { code: 'SUI', name: 'Switzerland' },
  { code: 'ESP', name: 'Spain' },
  { code: 'TUR', name: 'Turkey' },
  { code: 'UZB', name: 'Uzbekistan' },
  { code: 'KAZ', name: 'Kazakhstan' },
  { code: 'KGZ', name: 'Kyrgyzstan' },
  { code: 'IND', name: 'India' },
  { code: 'PAK', name: 'Pakistan' },
  { code: 'JPN', name: 'Japan' },
  { code: 'KOR', name: 'South Korea' },
  { code: 'AUS', name: 'Australia' },
  { code: 'USA', name: 'United States' },
  { code: 'BRA', name: 'Brazil' },
  { code: 'EGY', name: 'Egypt' },
  { code: 'MAR', name: 'Morocco' },
];

const ALIAS_MAP: Record<string, CountryInfo> = {
  id: { code: 'IDN', name: 'Indonesia' },
  ina: { code: 'IDN', name: 'Indonesia' },
  idn: { code: 'IDN', name: 'Indonesia' },
  indonesia: { code: 'IDN', name: 'Indonesia' },

  my: { code: 'MAS', name: 'Malaysia' },
  mas: { code: 'MAS', name: 'Malaysia' },
  mys: { code: 'MAS', name: 'Malaysia' },
  malaysia: { code: 'MAS', name: 'Malaysia' },

  sg: { code: 'SGP', name: 'Singapore' },
  sin: { code: 'SGP', name: 'Singapore' },
  sgp: { code: 'SGP', name: 'Singapore' },
  singapore: { code: 'SGP', name: 'Singapore' },
  singapura: { code: 'SGP', name: 'Singapore' },

  bn: { code: 'BRU', name: 'Brunei Darussalam' },
  bru: { code: 'BRU', name: 'Brunei Darussalam' },
  brn: { code: 'BRU', name: 'Brunei Darussalam' },
  brunei: { code: 'BRU', name: 'Brunei Darussalam' },
  'brunei darussalam': { code: 'BRU', name: 'Brunei Darussalam' },

  th: { code: 'THA', name: 'Thailand' },
  tha: { code: 'THA', name: 'Thailand' },
  thailand: { code: 'THA', name: 'Thailand' },

  vn: { code: 'VNM', name: 'Vietnam' },
  vie: { code: 'VNM', name: 'Vietnam' },
  vnm: { code: 'VNM', name: 'Vietnam' },
  vietnam: { code: 'VNM', name: 'Vietnam' },

  ph: { code: 'PHI', name: 'Philippines' },
  phi: { code: 'PHI', name: 'Philippines' },
  phl: { code: 'PHI', name: 'Philippines' },
  philippines: { code: 'PHI', name: 'Philippines' },
  filipina: { code: 'PHI', name: 'Philippines' },

  la: { code: 'LAO', name: 'Laos' },
  lao: { code: 'LAO', name: 'Laos' },
  laos: { code: 'LAO', name: 'Laos' },

  kh: { code: 'CAM', name: 'Cambodia' },
  cam: { code: 'CAM', name: 'Cambodia' },
  khm: { code: 'CAM', name: 'Cambodia' },
  cambodia: { code: 'CAM', name: 'Cambodia' },
  kamboja: { code: 'CAM', name: 'Cambodia' },

  mm: { code: 'MYA', name: 'Myanmar' },
  mya: { code: 'MYA', name: 'Myanmar' },
  mmr: { code: 'MYA', name: 'Myanmar' },
  myanmar: { code: 'MYA', name: 'Myanmar' },

  tl: { code: 'TLS', name: 'Timor-Leste' },
  tls: { code: 'TLS', name: 'Timor-Leste' },
  'timor leste': { code: 'TLS', name: 'Timor-Leste' },
  'timor-leste': { code: 'TLS', name: 'Timor-Leste' },

  nl: { code: 'NED', name: 'Netherlands' },
  ned: { code: 'NED', name: 'Netherlands' },
  nld: { code: 'NED', name: 'Netherlands' },
  netherlands: { code: 'NED', name: 'Netherlands' },
  belanda: { code: 'NED', name: 'Netherlands' },

  fr: { code: 'FRA', name: 'France' },
  fra: { code: 'FRA', name: 'France' },
  france: { code: 'FRA', name: 'France' },
  prancis: { code: 'FRA', name: 'France' },

  de: { code: 'GER', name: 'Germany' },
  ger: { code: 'GER', name: 'Germany' },
  deu: { code: 'GER', name: 'Germany' },
  germany: { code: 'GER', name: 'Germany' },
  jerman: { code: 'GER', name: 'Germany' },

  gb: { code: 'GBR', name: 'Great Britain' },
  uk: { code: 'GBR', name: 'Great Britain' },
  gbr: { code: 'GBR', name: 'Great Britain' },
  'great britain': { code: 'GBR', name: 'Great Britain' },
  'united kingdom': { code: 'GBR', name: 'Great Britain' },
  inggris: { code: 'GBR', name: 'Great Britain' },

  be: { code: 'BEL', name: 'Belgium' },
  bel: { code: 'BEL', name: 'Belgium' },
  belgium: { code: 'BEL', name: 'Belgium' },
  belgia: { code: 'BEL', name: 'Belgium' },

  ch: { code: 'SUI', name: 'Switzerland' },
  sui: { code: 'SUI', name: 'Switzerland' },
  che: { code: 'SUI', name: 'Switzerland' },
  switzerland: { code: 'SUI', name: 'Switzerland' },
  swiss: { code: 'SUI', name: 'Switzerland' },

  es: { code: 'ESP', name: 'Spain' },
  esp: { code: 'ESP', name: 'Spain' },
  spain: { code: 'ESP', name: 'Spain' },
  spanyol: { code: 'ESP', name: 'Spain' },

  tr: { code: 'TUR', name: 'Turkey' },
  tur: { code: 'TUR', name: 'Turkey' },
  turkey: { code: 'TUR', name: 'Turkey' },
  turkiye: { code: 'TUR', name: 'Turkey' },
  turki: { code: 'TUR', name: 'Turkey' },

  uz: { code: 'UZB', name: 'Uzbekistan' },
  uzb: { code: 'UZB', name: 'Uzbekistan' },
  uzbekistan: { code: 'UZB', name: 'Uzbekistan' },

  kz: { code: 'KAZ', name: 'Kazakhstan' },
  kaz: { code: 'KAZ', name: 'Kazakhstan' },
  kazakhstan: { code: 'KAZ', name: 'Kazakhstan' },

  kg: { code: 'KGZ', name: 'Kyrgyzstan' },
  kgz: { code: 'KGZ', name: 'Kyrgyzstan' },
  kyrgyzstan: { code: 'KGZ', name: 'Kyrgyzstan' },

  in: { code: 'IND', name: 'India' },
  ind: { code: 'IND', name: 'India' },
  india: { code: 'IND', name: 'India' },

  pk: { code: 'PAK', name: 'Pakistan' },
  pak: { code: 'PAK', name: 'Pakistan' },
  pakistan: { code: 'PAK', name: 'Pakistan' },

  jp: { code: 'JPN', name: 'Japan' },
  jpn: { code: 'JPN', name: 'Japan' },
  japan: { code: 'JPN', name: 'Japan' },
  jepang: { code: 'JPN', name: 'Japan' },

  kr: { code: 'KOR', name: 'South Korea' },
  kor: { code: 'KOR', name: 'South Korea' },
  'south korea': { code: 'KOR', name: 'South Korea' },
  korea: { code: 'KOR', name: 'South Korea' },

  au: { code: 'AUS', name: 'Australia' },
  aus: { code: 'AUS', name: 'Australia' },
  australia: { code: 'AUS', name: 'Australia' },

  us: { code: 'USA', name: 'United States' },
  usa: { code: 'USA', name: 'United States' },
  'united states': { code: 'USA', name: 'United States' },
  amerika: { code: 'USA', name: 'United States' },

  br: { code: 'BRA', name: 'Brazil' },
  bra: { code: 'BRA', name: 'Brazil' },
  brazil: { code: 'BRA', name: 'Brazil' },
  brasil: { code: 'BRA', name: 'Brazil' },

  eg: { code: 'EGY', name: 'Egypt' },
  egy: { code: 'EGY', name: 'Egypt' },
  egypt: { code: 'EGY', name: 'Egypt' },
  mesir: { code: 'EGY', name: 'Egypt' },

  ma: { code: 'MAR', name: 'Morocco' },
  mar: { code: 'MAR', name: 'Morocco' },
  morocco: { code: 'MAR', name: 'Morocco' },
  maroko: { code: 'MAR', name: 'Morocco' },
};

export function resolveCountryInfo(countryInput?: string, contingentFallback?: string): CountryInfo {
  const raw = (countryInput || '').trim();
  if (raw) {
    const key = raw.toLowerCase();
    if (ALIAS_MAP[key]) return ALIAS_MAP[key];
    // Partial match against known countries
    for (const [alias, info] of Object.entries(ALIAS_MAP)) {
      if (alias.length >= 4 && key.includes(alias)) return info;
    }
    const cleanCode = raw
      .replace(/[^a-zA-Z]/g, '')
      .slice(0, 3)
      .toUpperCase();
    return {
      code: cleanCode.length >= 2 ? cleanCode : 'INT',
      name: raw,
    };
  }

  const cont = (contingentFallback || '').trim().toLowerCase();
  if (cont) {
    for (const [alias, info] of Object.entries(ALIAS_MAP)) {
      if (alias.length >= 4 && cont.includes(alias)) return info;
    }
  }

  return { code: 'IDN', name: 'Indonesia' };
}

export function CountryFlag({
  code,
  name,
  className = 'w-10 h-7',
}: {
  code: string;
  name?: string;
  className?: string;
}) {
  const upper = code.toUpperCase();
  const title = name || upper;

  const renderSvgContent = () => {
    switch (upper) {
      case 'IDN':
        return (
          <>
            <rect width="36" height="12" fill="#CE1126" />
            <rect y="12" width="36" height="12" fill="#FFFFFF" />
          </>
        );
      case 'MAS':
        return (
          <>
            {Array.from({ length: 14 }).map((_, i) => (
              <rect
                key={i}
                y={(i * 24) / 14}
                width="36"
                height={24 / 14 + 0.1}
                fill={i % 2 === 0 ? '#CC0001' : '#FFFFFF'}
              />
            ))}
            <rect width="19" height="13.7" fill="#010066" />
            <circle cx="8.2" cy="6.85" r="4.1" fill="#FFCC00" />
            <circle cx="9.6" cy="6.85" r="3.4" fill="#010066" />
            <circle cx="12.5" cy="6.85" r="2.1" fill="#FFCC00" />
          </>
        );
      case 'SGP':
        return (
          <>
            <rect width="36" height="12" fill="#EF3340" />
            <rect y="12" width="36" height="12" fill="#FFFFFF" />
            <circle cx="8.2" cy="6" r="3.8" fill="#FFFFFF" />
            <circle cx="9.7" cy="6" r="3.2" fill="#EF3340" />
            <circle cx="11.2" cy="4.2" r="0.65" fill="#FFFFFF" />
            <circle cx="13.1" cy="5.5" r="0.65" fill="#FFFFFF" />
            <circle cx="12.4" cy="7.7" r="0.65" fill="#FFFFFF" />
            <circle cx="10.1" cy="7.7" r="0.65" fill="#FFFFFF" />
            <circle cx="9.5" cy="5.5" r="0.65" fill="#FFFFFF" />
          </>
        );
      case 'BRU':
        return (
          <>
            <rect width="36" height="24" fill="#F7E017" />
            <polygon points="0,3.5 36,14.5 36,20.5 0,9.5" fill="#FFFFFF" />
            <polygon points="0,8 36,19 36,24 0,13" fill="#111111" />
            <circle cx="18" cy="12" r="4.2" fill="#CF1126" />
          </>
        );
      case 'THA':
        return (
          <>
            <rect width="36" height="24" fill="#A51931" />
            <rect y="4" width="36" height="16" fill="#F4F5F8" />
            <rect y="8" width="36" height="8" fill="#2D2A4A" />
          </>
        );
      case 'VNM':
        return (
          <>
            <rect width="36" height="24" fill="#DA251D" />
            <polygon
              points="18,5 19.8,10.3 25.4,10.3 20.9,13.5 22.6,18.8 18,15.6 13.4,18.8 15.1,13.5 10.6,10.3 16.2,10.3"
              fill="#FFFF00"
            />
          </>
        );
      case 'PHI':
        return (
          <>
            <rect width="36" height="12" fill="#0038A8" />
            <rect y="12" width="36" height="12" fill="#CE1126" />
            <polygon points="0,0 16,12 0,24" fill="#FFFFFF" />
            <circle cx="5.8" cy="12" r="2.5" fill="#FCD116" />
            <circle cx="2" cy="3.5" r="0.8" fill="#FCD116" />
            <circle cx="2" cy="20.5" r="0.8" fill="#FCD116" />
            <circle cx="12.5" cy="12" r="0.8" fill="#FCD116" />
          </>
        );
      case 'LAO':
        return (
          <>
            <rect width="36" height="24" fill="#CE1126" />
            <rect y="6" width="36" height="12" fill="#002868" />
            <circle cx="18" cy="12" r="4.5" fill="#FFFFFF" />
          </>
        );
      case 'CAM':
        return (
          <>
            <rect width="36" height="24" fill="#032EA1" />
            <rect y="6" width="36" height="12" fill="#E00025" />
            <path d="M12,16 L12,11 L14,11 L15,9 L18,7.5 L21,9 L22,11 L24,11 L24,16 Z" fill="#FFFFFF" />
          </>
        );
      case 'MYA':
        return (
          <>
            <rect width="36" height="8" fill="#FECB00" />
            <rect y="8" width="36" height="8" fill="#34B233" />
            <rect y="16" width="36" height="8" fill="#EA2839" />
            <polygon
              points="18,5.5 19.6,10.3 24.6,10.3 20.6,13.2 22.1,18 18,15 13.9,18 15.4,13.2 11.4,10.3 16.4,10.3"
              fill="#FFFFFF"
            />
          </>
        );
      case 'TLS':
        return (
          <>
            <rect width="36" height="24" fill="#DC241F" />
            <polygon points="0,0 18,12 0,24" fill="#FFC726" />
            <polygon points="0,0 12,12 0,24" fill="#000000" />
            <polygon points="4.5,9 5.3,11.2 7.5,11.2 5.7,12.5 6.4,14.8 4.5,13.4 2.6,14.8 3.3,12.5 1.5,11.2 3.7,11.2" fill="#FFFFFF" />
          </>
        );
      case 'NED':
        return (
          <>
            <rect width="36" height="8" fill="#AE1C28" />
            <rect y="8" width="36" height="8" fill="#FFFFFF" />
            <rect y="16" width="36" height="8" fill="#21468B" />
          </>
        );
      case 'FRA':
        return (
          <>
            <rect width="12" height="24" fill="#0055A4" />
            <rect x="12" width="12" height="24" fill="#FFFFFF" />
            <rect x="24" width="12" height="24" fill="#EF4135" />
          </>
        );
      case 'GER':
        return (
          <>
            <rect width="36" height="8" fill="#000000" />
            <rect y="8" width="36" height="8" fill="#DD0000" />
            <rect y="16" width="36" height="8" fill="#FFCE00" />
          </>
        );
      case 'BEL':
        return (
          <>
            <rect width="12" height="24" fill="#000000" />
            <rect x="12" width="12" height="24" fill="#FAE042" />
            <rect x="24" width="12" height="24" fill="#ED2939" />
          </>
        );
      case 'GBR':
        return (
          <>
            <rect width="36" height="24" fill="#012169" />
            <path d="M0,0 L36,24 M36,0 L0,24" stroke="#FFFFFF" strokeWidth="4" />
            <path d="M0,0 L36,24 M36,0 L0,24" stroke="#C8102E" strokeWidth="2" />
            <rect x="15" width="6" height="24" fill="#FFFFFF" />
            <rect y="9" width="36" height="6" fill="#FFFFFF" />
            <rect x="16.2" width="3.6" height="24" fill="#C8102E" />
            <rect y="10.2" width="36" height="3.6" fill="#C8102E" />
          </>
        );
      case 'SUI':
        return (
          <>
            <rect width="36" height="24" fill="#DA291C" />
            <rect x="15.5" y="5" width="5" height="14" fill="#FFFFFF" />
            <rect x="11" y="9.5" width="14" height="5" fill="#FFFFFF" />
          </>
        );
      case 'ESP':
        return (
          <>
            <rect width="36" height="6" fill="#AA151B" />
            <rect y="6" width="36" height="12" fill="#F1BF00" />
            <rect y="18" width="36" height="6" fill="#AA151B" />
          </>
        );
      case 'TUR':
        return (
          <>
            <rect width="36" height="24" fill="#E30A17" />
            <circle cx="14.5" cy="12" r="5.5" fill="#FFFFFF" />
            <circle cx="16" cy="12" r="4.4" fill="#E30A17" />
            <polygon points="21,12 24.5,10.5 23.2,14 23.2,10 24.5,13.5" fill="#FFFFFF" />
          </>
        );
      case 'UZB':
        return (
          <>
            <rect width="36" height="7.5" fill="#0099B5" />
            <rect y="7.5" width="36" height="1" fill="#CE1126" />
            <rect y="8.5" width="36" height="7" fill="#FFFFFF" />
            <rect y="15.5" width="36" height="1" fill="#CE1126" />
            <rect y="16.5" width="36" height="7.5" fill="#1EB53A" />
            <circle cx="6" cy="3.8" r="2.2" fill="#FFFFFF" />
            <circle cx="6.8" cy="3.8" r="1.8" fill="#0099B5" />
          </>
        );
      case 'KAZ':
        return (
          <>
            <rect width="36" height="24" fill="#00AFCA" />
            <circle cx="18" cy="11" r="4.2" fill="#FEC50C" />
            <rect x="2" y="2" width="2" height="20" fill="#FEC50C" />
          </>
        );
      case 'KGZ':
        return (
          <>
            <rect width="36" height="24" fill="#E8112D" />
            <circle cx="18" cy="12" r="5" fill="#FFEF00" />
          </>
        );
      case 'IND':
        return (
          <>
            <rect width="36" height="8" fill="#FF9933" />
            <rect y="8" width="36" height="8" fill="#FFFFFF" />
            <rect y="16" width="36" height="8" fill="#138808" />
            <circle cx="18" cy="12" r="2.8" fill="none" stroke="#000080" strokeWidth="1" />
          </>
        );
      case 'PAK':
        return (
          <>
            <rect width="10" height="24" fill="#FFFFFF" />
            <rect x="10" width="26" height="24" fill="#01411C" />
            <circle cx="22.5" cy="12" r="5" fill="#FFFFFF" />
            <circle cx="24" cy="11.2" r="4.2" fill="#01411C" />
          </>
        );
      case 'JPN':
        return (
          <>
            <rect width="36" height="24" fill="#FFFFFF" />
            <circle cx="18" cy="12" r="6" fill="#BC002D" />
          </>
        );
      case 'KOR':
        return (
          <>
            <rect width="36" height="24" fill="#FFFFFF" />
            <circle cx="18" cy="12" r="5.5" fill="#CD2E3A" />
            <path d="M12.5,12 A5.5,5.5 0 0,0 23.5,12 Z" fill="#0047A0" />
          </>
        );
      case 'AUS':
        return (
          <>
            <rect width="36" height="24" fill="#00008B" />
            <rect width="16" height="12" fill="#012169" />
            <rect x="6.5" width="3" height="12" fill="#FFFFFF" />
            <rect y="4.5" width="16" height="3" fill="#FFFFFF" />
            <rect x="7.2" width="1.6" height="12" fill="#C8102E" />
            <rect y="5.2" width="16" height="1.6" fill="#C8102E" />
            <circle cx="26" cy="7" r="1.4" fill="#FFFFFF" />
            <circle cx="28" cy="14" r="1.4" fill="#FFFFFF" />
            <circle cx="23" cy="17" r="1.2" fill="#FFFFFF" />
          </>
        );
      case 'USA':
        return (
          <>
            {Array.from({ length: 13 }).map((_, i) => (
              <rect
                key={i}
                y={(i * 24) / 13}
                width="36"
                height={24 / 13 + 0.1}
                fill={i % 2 === 0 ? '#B22234' : '#FFFFFF'}
              />
            ))}
            <rect width="16" height="13" fill="#3C3B6E" />
            <circle cx="4" cy="3.5" r="0.8" fill="#FFFFFF" />
            <circle cx="8" cy="3.5" r="0.8" fill="#FFFFFF" />
            <circle cx="12" cy="3.5" r="0.8" fill="#FFFFFF" />
            <circle cx="6" cy="6.5" r="0.8" fill="#FFFFFF" />
            <circle cx="10" cy="6.5" r="0.8" fill="#FFFFFF" />
            <circle cx="4" cy="9.5" r="0.8" fill="#FFFFFF" />
            <circle cx="8" cy="9.5" r="0.8" fill="#FFFFFF" />
            <circle cx="12" cy="9.5" r="0.8" fill="#FFFFFF" />
          </>
        );
      case 'BRA':
        return (
          <>
            <rect width="36" height="24" fill="#009C3B" />
            <polygon points="18,3 33,12 18,21 3,12" fill="#FFDF00" />
            <circle cx="18" cy="12" r="4.5" fill="#002776" />
          </>
        );
      case 'EGY':
        return (
          <>
            <rect width="36" height="8" fill="#CE1126" />
            <rect y="8" width="36" height="8" fill="#FFFFFF" />
            <rect y="16" width="36" height="8" fill="#000000" />
            <circle cx="18" cy="12" r="2.2" fill="#C09300" />
          </>
        );
      case 'MAR':
        return (
          <>
            <rect width="36" height="24" fill="#C1272D" />
            <polygon
              points="18,7 19.6,11.6 24.4,11.6 20.5,14.4 22,19 18,16.2 14,19 15.5,14.4 11.6,11.6 16.4,11.6"
              fill="none"
              stroke="#006233"
              strokeWidth="1.2"
            />
          </>
        );
      default:
        return (
          <>
            <rect width="36" height="24" fill="#0F172A" />
            <circle cx="18" cy="12" r="7.5" fill="none" stroke="#FACC15" strokeWidth="1.4" />
            <ellipse cx="18" cy="12" rx="3.8" ry="7.5" fill="none" stroke="#FACC15" strokeWidth="1.1" />
            <line x1="10.5" y1="12" x2="25.5" y2="12" stroke="#FACC15" strokeWidth="1.1" />
          </>
        );
    }
  };

  return (
    <svg
      viewBox="0 0 36 24"
      role="img"
      aria-label={`Bendera ${title}`}
      className={`${className} rounded-[4px] overflow-hidden ring-1 ring-white/30 shadow-sm shrink-0`}
    >
      {renderSvgContent()}
    </svg>
  );
}
