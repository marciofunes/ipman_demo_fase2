import { useI18n } from '../i18n';
/** Adapter to the host language provider, including interpolation. */
export function useTranslation() {
  const { t: translate } = useI18n();
  return {
    t: (key: string, values: Record<string, string | number> = {}) =>
      translate(key).replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name] ?? '')),
  };
}
export function useFormat() {
  const { locale } = useI18n();
  const num = (value: number, digits = 1) =>
    value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return {
    num,
    int: (v: number) => num(v, 0),
    time: (v: number) => new Date(v).toLocaleTimeString(locale, { hour12: false }),
    shortTime: (v: number) =>
      new Date(v).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    date: (v: number) => new Date(v).toLocaleDateString(locale),
  };
}
