import { Label } from "@deadlock-mods/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { Globe } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

const languages = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "ar", name: "العربية", flag: "🇸🇦" },
  { code: "pl", name: "Polski", flag: "🇵🇱" },
  { code: "gsw", name: "Schweizerdeutsch", flag: "🇨🇭" },
  { code: "th", name: "ไทย", flag: "🇹🇭" },
  { code: "tr", name: "Türkçe", flag: "🇹🇷" },
  { code: "ru", name: "Русский", flag: "🇷🇺" },
  { code: "zh-CN", name: "简体中文", flag: "🇨🇳" },
  { code: "zh-TW", name: "繁體中文", flag: "🇹🇼" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "pt-BR", name: "Português (Brasil)", flag: "🇧🇷" },
  { code: "it", name: "Italiano", flag: "🇮🇹" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
  { code: "bg", name: "Български", flag: "🇧🇬" },
];

export const LanguageSettings = () => {
  const { t, i18n } = useTranslation();

  const handleLanguageChange = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
  };

  const currentLanguage =
    languages.find((lang) => lang.code === i18n.language) || languages[0];

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div className='space-y-0.5'>
          <Label className='font-bold text-sm'>{t("settings.language")}</Label>
          <div className='text-muted-foreground text-sm'>
            {t("settings.languageDescription")}
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <Globe className='h-4 w-4 text-muted-foreground' />
          <Select
            onValueChange={handleLanguageChange}
            value={currentLanguage.code}>
            <SelectTrigger className='w-48'>
              <SelectValue>
                <div className='flex items-center gap-2'>
                  <span>{currentLanguage.flag}</span>
                  <span>{currentLanguage.name}</span>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {languages.map((language) => (
                <SelectItem key={language.code} value={language.code}>
                  <div className='flex items-center gap-2'>
                    <span>{language.flag}</span>
                    <span>{language.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};
