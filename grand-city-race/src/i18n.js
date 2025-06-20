import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import de from './locales/de.json';

// try to load a saved language, default to 'en'
const savedLang = localStorage.getItem('lang') || 'de';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      de: { translation: de },
    },
    lng: savedLang,
    fallbackLng: 'de',
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });

export default i18n;
