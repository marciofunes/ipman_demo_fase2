import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  useEffect,
} from "react";
import { en, pt } from "./locales";
type Lang = "pt" | "en";
const Context = createContext({
  lang: "pt" as Lang,
  setLang: (_lang: Lang) => {},
  t: (key: string) => key,
  locale: "pt-BR",
});
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return localStorage.getItem("ipman-language") === "en" ? "en" : "pt";
    } catch {
      return "pt";
    }
  });
  useEffect(() => {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
    try {
      localStorage.setItem("ipman-language", lang);
    } catch {
      /* storage may be disabled */
    }
  }, [lang]);
  return (
    <Context.Provider
      value={{
        lang,
        setLang,
        t: (key) => (lang === "en" ? en : pt)[key] ?? key,
        locale: lang === "pt" ? "pt-BR" : "en-US",
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useI18n = () => useContext(Context);
