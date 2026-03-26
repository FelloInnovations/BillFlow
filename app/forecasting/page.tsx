import { ForecastingClient } from "@/components/forecasting/ForecastingClient";
import { buildForecast } from "@/lib/forecast";
import { ForecastResult } from "@/types";

const EMPTY: ForecastResult = {
  forecasts: [],
  inactiveVendors: [],
  totalForecast: 0,
  nextMonthName: "",
  computedAt: new Date().toISOString(),
};

async function getData(): Promise<ForecastResult> {
  try {
    return await buildForecast();
  } catch {
    return EMPTY;
  }
}

export default async function ForecastingPage() {
  const data = await getData();
  return <ForecastingClient initial={data} />;
}
