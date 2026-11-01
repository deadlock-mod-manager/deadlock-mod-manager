import { usePersistedStore } from "@/lib/store";
import { calculateFrenchTax, FRENCH_TAX_RATE } from "./tax";

const volumeFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 3,
});
const currencyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});
const rateFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

export function useFrenchTax() {
  const mods = usePersistedStore((state) => state.localMods);
  const tax = calculateFrenchTax(mods);

  return {
    volume: volumeFormatter.format(tax.gigabytes),
    amount: currencyFormatter.format(tax.taxEuro),
    rate: rateFormatter.format(FRENCH_TAX_RATE),
    missingSizes: tax.missingSizes,
  };
}
