import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export const useLanguageListener = () => {
  const { i18n } = useTranslation();

  useEffect(() => {
    const unlisten = listen<string>('set-language', (event) => {
      const language = event.payload;
      i18n.changeLanguage(language);
    });

    return () => {
      unlisten.then((unlistenFn) => unlistenFn());
    };
  }, [i18n]);
};
