"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";

type Point = {
  year: number;

  // Rent side
  rentPaidCum: number;
  renterPortfolio: number;
  rentNetCost: number; // rentPaidCum - renterPortfolio

  // Buy side
  buyCashCum: number; // down + mortgage + tax + maint
  equity: number; // value after selling costs - remaining mortgage
  netBuyCost: number; // buyCashCum - equity
};

function money(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function Home() {
  // --- Inputs ---
  const [years, setYears] = useState(20);

  // Renting
  const [rentMonthly, setRentMonthly] = useState(2500);
  const [rentGrowthPct, setRentGrowthPct] = useState(3);

  // Buying
  const [homePrice, setHomePrice] = useState(600000);
  const [downPct, setDownPct] = useState(20);
  const [mortgageRatePct, setMortgageRatePct] = useState(5);
  const [amortYears, setAmortYears] = useState(25);

  // Owning costs + assumptions
  const [propertyTaxPct, setPropertyTaxPct] = useState(1);
  const [maintenancePct, setMaintenancePct] = useState(1);
  const [homeGrowthPct, setHomeGrowthPct] = useState(3);
  const [sellingCostPct, setSellingCostPct] = useState(5);

  // Investment opportunity cost
  const [investReturnPct, setInvestReturnPct] = useState(6);

  // Toggle: wealth vs cost
  const [viewMode, setViewMode] = useState<"wealth" | "cost">("wealth");

  // Selected year on chart
  const [selectedYear, setSelectedYear] = useState<number>(5);

  // Avoid ResponsiveContainer zero-size warning during build
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setSelectedYear((prev) => {
      const yMax = Math.max(1, Math.min(50, Math.floor(Number(years) || 1)));
      if (!Number.isFinite(prev)) return Math.min(5, yMax);
      return Math.max(1, Math.min(yMax, prev));
    });
  }, [years]);

  const results = useMemo(() => {
    const yMax = Math.max(1, Math.min(50, Math.floor(Number(years) || 1)));

    const rentGrowth = (Number(rentGrowthPct) || 0) / 100;
    const homeGrowth = (Number(homeGrowthPct) || 0) / 100;

    const mortgageRate = (Number(mortgageRatePct) || 0) / 100;
    const propTax = (Number(propertyTaxPct) || 0) / 100;
    const maint = (Number(maintenancePct) || 0) / 100;
    const sellCost = (Number(sellingCostPct) || 0) / 100;

    const investReturn = (Number(investReturnPct) || 0) / 100;
    const investMonthly = investReturn / 12;

    const price = Number(homePrice) || 0;
    const downPayment = ((Number(downPct) || 0) / 100) * price;
    const loan = Math.max(0, price - downPayment);

    // Monthly mortgage payment (standard fixed-rate formula)
    const r = mortgageRate / 12;
    const n = Math.max(1, (Number(amortYears) || 1) * 12);
    const monthlyMortgage =
      loan === 0
        ? 0
        : r === 0
        ? loan / n
        : (loan * r) / (1 - Math.pow(1 + r, -n));

    // --- Simulation state ---
    let value = price;
    let remainingBalance = loan;

    let buyCashCum = downPayment;
    let rentPaidCum = 0;

    // renter starts by investing down payment
    let renterPortfolio = downPayment;

    const data: Point[] = [];
    let breakEvenWealthYear: number | null = null; // equity > portfolio
    let breakEvenCostYear: number | null = null; // buyNetCost < rentNetCost

    // Month-by-month simulation for accurate amortization + investing
    for (let y = 1; y <= yMax; y++) {
      let rentPaidThisYear = 0;
      let buyCashThisYear = 0;

      for (let m = 1; m <= 12; m++) {
        // Rent grows in annual steps
        const rentThisMonth =
          (Number(rentMonthly) || 0) * Math.pow(1 + rentGrowth, y - 1);

        // Owner monthly costs based on current home value
        const propTaxThisMonth = (value * propTax) / 12;
        const maintThisMonth = (value * maint) / 12;

        // Mortgage amortization (monthly, accurate)
        const interestThisMonth = remainingBalance * (mortgageRate / 12);
        const principalThisMonth = Math.max(
          0,
          monthlyMortgage - interestThisMonth
        );
        remainingBalance = Math.max(0, remainingBalance - principalThisMonth);

        const buyThisMonth = monthlyMortgage + propTaxThisMonth + maintThisMonth;

        rentPaidThisYear += rentThisMonth;
        buyCashThisYear += buyThisMonth;

        // Renter invests the monthly difference (buy - rent).
        const investContribution = buyThisMonth - rentThisMonth;

        // Grow renter portfolio, then add contribution
        renterPortfolio =
          renterPortfolio * (1 + investMonthly) + investContribution;
      }

      rentPaidCum += rentPaidThisYear;
      buyCashCum += buyCashThisYear;

      // End-of-year home value growth
      value *= 1 + homeGrowth;

      // Equity if sold end of year
      const netSaleProceeds = value * (1 - sellCost) - remainingBalance;
      const equity = Math.max(0, netSaleProceeds);

      // Cost framing
      const rentNetCost = rentPaidCum - renterPortfolio;
      const netBuyCost = buyCashCum - equity;

      data.push({
        year: y,
        rentPaidCum: Math.round(rentPaidCum),
        renterPortfolio: Math.round(renterPortfolio),
        rentNetCost: Math.round(rentNetCost),

        buyCashCum: Math.round(buyCashCum),
        equity: Math.round(equity),
        netBuyCost: Math.round(netBuyCost),
      });

      if (breakEvenWealthYear === null && equity > renterPortfolio) {
        breakEvenWealthYear = y;
      }
      if (breakEvenCostYear === null && netBuyCost < rentNetCost) {
        breakEvenCostYear = y;
      }
    }

    const last = data[data.length - 1];

    // Final numbers
    const finalRenterWealth = last ? last.renterPortfolio : 0;
    const finalBuyerWealth = last ? last.equity : 0;
    const finalWealthDiff = finalBuyerWealth - finalRenterWealth; // + buy richer

    const finalRentNetCost = last ? last.rentNetCost : 0;
    const finalBuyNetCost = last ? last.netBuyCost : 0;
    const finalCostDiff = finalRentNetCost - finalBuyNetCost; // + buy cheaper

    const wealthVerdict =
      finalWealthDiff > 0
        ? `Wealth view: buying leaves you richer by $${money(finalWealthDiff)} after ${yMax} years.`
        : `Wealth view: renting leaves you richer by $${money(
            Math.abs(finalWealthDiff)
          )} after ${yMax} years.`;

    const costVerdict =
      finalCostDiff > 0
        ? `Cost view: buying costs less by $${money(finalCostDiff)} over ${yMax} years.`
        : `Cost view: renting costs less by $${money(
            Math.abs(finalCostDiff)
          )} over ${yMax} years.`;

    const wealthBreakevenText =
      breakEvenWealthYear !== null
        ? `Wealth breakeven (equity > portfolio): year ${breakEvenWealthYear}.`
        : `No wealth breakeven within ${yMax} years.`;

    const costBreakevenText =
      breakEvenCostYear !== null
        ? `Cost breakeven (buy net cost < rent net cost): year ${breakEvenCostYear}.`
        : `No cost breakeven within ${yMax} years.`;

    const verdict = viewMode === "wealth" ? wealthVerdict : costVerdict;
    const breakevenText =
      viewMode === "wealth" ? wealthBreakevenText : costBreakevenText;

    return {
      data,
      monthlyMortgage: Math.round(monthlyMortgage),
      downPayment: Math.round(downPayment),

      breakEvenWealthYear,
      breakEvenCostYear,

      finalRenterWealth,
      finalBuyerWealth,
      finalWealthDiff,

      finalRentNetCost,
      finalBuyNetCost,
      finalCostDiff,

      verdict,
      breakevenText,
    };
  }, [
    years,
    rentMonthly,
    rentGrowthPct,
    homePrice,
    downPct,
    mortgageRatePct,
    amortYears,
    propertyTaxPct,
    maintenancePct,
    homeGrowthPct,
    sellingCostPct,
    investReturnPct,
    viewMode,
  ]);

  const selected =
    results.data.find((p) => p.year === selectedYear) ??
    results.data[results.data.length - 1];

  const handleChartClick = (e: any) => {
    const yr = Number(e?.activeLabel);
    if (!Number.isNaN(yr) && yr >= 1 && yr <= (results.data.at(-1)?.year ?? 1)) {
      setSelectedYear(yr);
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    const rentKey = viewMode === "wealth" ? "renterPortfolio" : "rentNetCost";
    const buyKey = viewMode === "wealth" ? "equity" : "netBuyCost";

    const rentVal = payload.find((p: any) => p.dataKey === rentKey)?.value ?? 0;
    const buyVal = payload.find((p: any) => p.dataKey === buyKey)?.value ?? 0;

    return (
      <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
        <div className="text-sm font-semibold mb-1">Year {label}</div>
        <div className="text-sm">
          <span className="font-medium">
            {viewMode === "wealth" ? "Renter wealth:" : "Rent (net):"}
          </span>{" "}
          ${money(rentVal)}
        </div>
        <div className="text-sm">
          <span className="font-medium">
            {viewMode === "wealth" ? "Buyer wealth:" : "Buy (net):"}
          </span>{" "}
          ${money(buyVal)}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Click the chart to lock a year.
        </div>
      </div>
    );
  };

  const ClickableDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return null;
    const isSelected = payload?.year === selectedYear;

    return (
      <circle
        cx={cx}
        cy={cy}
        r={isSelected ? 6 : 4}
        className="cursor-pointer"
        onClick={() => setSelectedYear(payload.year)}
        stroke="white"
        strokeWidth={2}
        fill={props.stroke}
      />
    );
  };

  const breakEvenX =
    viewMode === "wealth" ? results.breakEvenWealthYear : results.breakEvenCostYear;

  // For verdict mini cards
  const miniA =
    viewMode === "wealth"
      ? { label: "Renter wealth (final)", value: results.finalRenterWealth, tone: "rose" as const }
      : { label: "Final rent net cost", value: results.finalRentNetCost, tone: "rose" as const };

  const miniB =
    viewMode === "wealth"
      ? { label: "Buyer wealth (final)", value: results.finalBuyerWealth, tone: "indigo" as const }
      : { label: "Final buy net cost", value: results.finalBuyNetCost, tone: "indigo" as const };

  const diffVal =
    viewMode === "wealth" ? results.finalWealthDiff : results.finalCostDiff;

const diffTone: "indigo" | "rose" = diffVal > 0 ? "indigo" : "rose";

const miniC =
  viewMode === "wealth"
    ? {
        label: "Difference (buy − rent)",
        value: `${diffVal > 0 ? "" : "-"}$${money(Math.abs(diffVal))} ${
          diffVal > 0 ? "(buy richer)" : "(rent richer)"
        }`,
        tone: diffTone,
      }
    : {
        label: "Difference (rent − buy)",
        value: `${diffVal > 0 ? "" : "-"}$${money(Math.abs(diffVal))} ${
          diffVal > 0 ? "(buy cheaper)" : "(rent cheaper)"
        }`,
        tone: diffTone,
      };


  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-rose-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        {/* Header */}
        <div className="rounded-3xl border border-indigo-100 bg-white/80 backdrop-blur shadow-sm p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-700 to-rose-600 bg-clip-text text-transparent">
                Rent vs Buy Calculator
              </h1>
              <p className="text-zinc-600 mt-1">
                Toggle between <span className="font-medium text-indigo-700">Wealth</span> (who ends richer) and{" "}
                <span className="font-medium text-rose-700">Cost</span> (who paid less net).
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Pill label="Mortgage (est)" value={`$${money(results.monthlyMortgage)}/mo`} />
              <Pill label="Down payment" value={`$${money(results.downPayment)}`} />
            </div>
          </div>
        </div>

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
          {/* LEFT: Inputs */}
          <aside className="rounded-3xl border border-indigo-100 bg-white/80 backdrop-blur shadow-sm p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-zinc-900">Inputs</h2>
              <span className="text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1">
                Assumptions
              </span>
            </div>

            <div className="mt-4 space-y-4">
              <SectionTitle>Timeline</SectionTitle>
              <Field label="Years staying" value={years} onChange={setYears} />

              <SectionTitle>Renting</SectionTitle>
              <Field label="Monthly rent ($)" value={rentMonthly} onChange={setRentMonthly} />
              <Field label="Rent increase (%/yr)" value={rentGrowthPct} onChange={setRentGrowthPct} step={0.1} />

              <SectionTitle>Buying</SectionTitle>
              <Field label="Home price ($)" value={homePrice} onChange={setHomePrice} />
              <Field label="Down payment (%)" value={downPct} onChange={setDownPct} step={0.1} />
              <Field label="Mortgage rate (%/yr)" value={mortgageRatePct} onChange={setMortgageRatePct} step={0.1} />
              <Field label="Amortization (years)" value={amortYears} onChange={setAmortYears} />

              <SectionTitle>Ownership & Investing</SectionTitle>
              <Field label="Property tax (%/yr)" value={propertyTaxPct} onChange={setPropertyTaxPct} step={0.1} />
              <Field label="Maintenance (%/yr)" value={maintenancePct} onChange={setMaintenancePct} step={0.1} />
              <Field label="Home growth (%/yr)" value={homeGrowthPct} onChange={setHomeGrowthPct} step={0.1} />
              <Field label="Selling costs (% of sale)" value={sellingCostPct} onChange={setSellingCostPct} step={0.1} />
              <Field label="Investment return (%/yr)" value={investReturnPct} onChange={setInvestReturnPct} step={0.1} />

              <div className="mt-2 rounded-2xl bg-indigo-50/70 border border-indigo-100 p-4 text-xs text-indigo-900/80 leading-relaxed">
                <div className="font-semibold text-indigo-900 mb-1">Cashflow diagram</div>
                <pre className="whitespace-pre-wrap leading-relaxed">{`RENT (wealth)
Down payment + monthly (Buy − Rent) → Investment Portfolio

BUY (wealth)
Down payment + monthly costs → Home Equity`}</pre>
                <div className="mt-2 text-zinc-500">
                  “Wealth” compares ending assets. “Cost” compares net spending after ending asset.
                </div>
              </div>
            </div>
          </aside>

          {/* RIGHT: Chart + Verdict */}
          <section className="space-y-5">
            {/* Chart */}
            <div className="rounded-3xl border border-indigo-100 bg-white/80 backdrop-blur shadow-sm p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-zinc-900">
                    {viewMode === "wealth" ? "Ending wealth over time" : "Net cumulative cost over time"}
                  </h2>
                  <p className="text-sm text-zinc-600 mt-1">
                    Click the chart to lock a year.{" "}
                    <span className="font-medium text-rose-600">
                      {viewMode === "wealth" ? "Renter wealth" : "Rent (net)"}
                    </span>{" "}
                    vs{" "}
                    <span className="font-medium text-indigo-700">
                      {viewMode === "wealth" ? "Buyer wealth" : "Buy (net)"}
                    </span>
                    .
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setViewMode("wealth")}
                    className={`rounded-full px-3 py-1 text-sm border ${
                      viewMode === "wealth"
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-zinc-700 border-zinc-200"
                    }`}
                  >
                    Wealth view
                  </button>

                  <button
                    onClick={() => setViewMode("cost")}
                    className={`rounded-full px-3 py-1 text-sm border ${
                      viewMode === "cost"
                        ? "bg-rose-600 text-white border-rose-600"
                        : "bg-white text-zinc-700 border-zinc-200"
                    }`}
                  >
                    Cost view
                  </button>

                  <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm">
                    <span className="h-2 w-2 rounded-full bg-zinc-900" />
                    Selected year: <span className="font-semibold">{selected?.year ?? years}</span>
                  </span>
                </div>
              </div>

              <div className="mt-4 h-[360px]">
                {mounted ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={results.data} onClick={handleChartClick} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 4" />
                      <XAxis dataKey="year" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                      <Tooltip content={<CustomTooltip />} />

                      {breakEvenX !== null && (
                        <ReferenceLine
                          x={breakEvenX}
                          stroke="#111827"
                          strokeDasharray="6 6"
                          label={{
                            value:
                              viewMode === "wealth"
                                ? `Wealth breakeven ~ yr ${breakEvenX}`
                                : `Cost breakeven ~ yr ${breakEvenX}`,
                            position: "insideTopRight",
                            fill: "#111827",
                            fontSize: 12,
                          }}
                        />
                      )}

                      <Line
                        type="monotone"
                        dataKey={viewMode === "wealth" ? "renterPortfolio" : "rentNetCost"}
                        name={viewMode === "wealth" ? "Renter wealth" : "Rent (net)"}
                        stroke="#e11d48"
                        strokeWidth={3}
                        dot={<ClickableDot />}
                        activeDot={{ r: 7 }}
                      />

                      <Line
                        type="monotone"
                        dataKey={viewMode === "wealth" ? "equity" : "netBuyCost"}
                        name={viewMode === "wealth" ? "Buyer wealth" : "Buy (net)"}
                        stroke="#4338ca"
                        strokeWidth={3}
                        dot={<ClickableDot />}
                        activeDot={{ r: 7 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full w-full rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center text-sm text-zinc-500">
                    Loading chart…
                  </div>
                )}
              </div>

              {/* Click details */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-6 gap-4">
                <Stat title={`Year ${selected?.year ?? years}`} value="Selected point" subtle />
                <Stat title="Rent paid (cum)" value={`$${money(selected?.rentPaidCum ?? 0)}`} />
                <Stat title="Renter portfolio" value={`$${money(selected?.renterPortfolio ?? 0)}`} />
                <Stat title="Rent net cost" value={`$${money(selected?.rentNetCost ?? 0)}`} />
                <Stat title="Buy cash outflow (cum)" value={`$${money(selected?.buyCashCum ?? 0)}`} />
                <Stat title="Equity (est)" value={`$${money(selected?.equity ?? 0)}`} />
                <Stat title="Buy net cost" value={`$${money(selected?.netBuyCost ?? 0)}`} />

                <div className="md:col-span-6 rounded-2xl bg-zinc-50 border border-zinc-100 p-4 text-sm text-zinc-700">
                  <span className="font-semibold">At year {selected?.year ?? years}:</span>{" "}
                  {viewMode === "wealth" ? (
                    <>
                      Buyer wealth − Renter wealth ={" "}
                      <span className="font-semibold">
                        ${money(Math.abs((selected?.equity ?? 0) - (selected?.renterPortfolio ?? 0)))}
                      </span>{" "}
                      <span className="text-zinc-600">
                        {(selected?.equity ?? 0) - (selected?.renterPortfolio ?? 0) > 0
                          ? "(buy ends richer by that year)"
                          : "(rent ends richer by that year)"}
                      </span>
                    </>
                  ) : (
                    <>
                      Rent(net) − Buy(net) ={" "}
                      <span className="font-semibold">
                        ${money(Math.abs((selected?.rentNetCost ?? 0) - (selected?.netBuyCost ?? 0)))}
                      </span>{" "}
                      <span className="text-zinc-600">
                        {(selected?.rentNetCost ?? 0) - (selected?.netBuyCost ?? 0) > 0
                          ? "(buy is cheaper by that year)"
                          : "(rent is cheaper by that year)"}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Verdict */}
            <div className="rounded-3xl border border-indigo-100 bg-white/80 backdrop-blur shadow-sm p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-zinc-900">Verdict</h2>
                  <p className="mt-2 text-lg font-semibold leading-relaxed text-zinc-900">
                    {results.verdict}
                  </p>
                  <div className="mt-2 text-sm text-zinc-600">{results.breakevenText}</div>
                </div>

                <div className="hidden sm:block">
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-rose-600 shadow-sm" />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <MiniStat
                  label={miniA.label}
                  value={`$${money(miniA.value)}`}
                  tone={miniA.tone}
                />
                <MiniStat
                  label={miniB.label}
                  value={`$${money(miniB.value)}`}
                  tone={miniB.tone}
                />
                <MiniStat
                  label={miniC.label}
                  value={miniC.value}
                  tone={miniC.tone}
                />
              </div>

              <div className="mt-4 text-xs text-zinc-500">
                Tip: “Investment return” and “Home growth” swing results the most.
              </div>
            </div>

            <p className="text-xs text-zinc-500 text-center pb-2">
              Educational estimates only. Small changes in assumptions can flip results.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="pt-2">
      <div className="text-xs font-semibold tracking-wide text-indigo-700 uppercase">
        {children}
      </div>
      <div className="mt-2 h-px w-full bg-gradient-to-r from-indigo-200 via-zinc-100 to-rose-200" />
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 shadow-sm">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className="text-sm font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "indigo" | "rose";
}) {
  const toneClasses =
    tone === "indigo"
      ? "border-indigo-100 bg-indigo-50/60 text-indigo-900"
      : "border-rose-100 bg-rose-50/60 text-rose-900";

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-zinc-800">{label}</label>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        step={step ?? 1}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
      />
    </div>
  );
}

function Stat({
  title,
  value,
  subtle,
}: {
  title: string;
  value: string;
  subtle?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${subtle ? "bg-white" : "bg-white"}`}>
      <div className="text-xs text-zinc-500">{title}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

