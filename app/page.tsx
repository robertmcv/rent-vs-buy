"use client";

import { useMemo, useState } from "react";
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
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function Home() {
  // --- Inputs ---
  const [years, setYears] = useState(10);

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

  // NEW: Investment opportunity cost
  const [investReturnPct, setInvestReturnPct] = useState(6);

  // Selected year on chart
  const [selectedYear, setSelectedYear] = useState<number>(Math.min(5, years));
  if (selectedYear > years) setSelectedYear(years);
  if (selectedYear < 1 && years >= 1) setSelectedYear(1);

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

    // --- Simulation ---
    let value = price;
    let remainingBalance = loan;

    // Buy side cumulative cash outflow
    let buyCashCum = downPayment;

    // Rent side
    let rentPaidCum = 0;

    // NEW: renter invests the down payment instead of paying it
    let renterPortfolio = downPayment;

    const data: Point[] = [];
    let breakEvenYear: number | null = null;

    // We simulate month-by-month for investing realism
    for (let y = 1; y <= yMax; y++) {
      let rentPaidThisYear = 0;
      let buyCashThisYear = 0;

      for (let m = 1; m <= 12; m++) {
        // Rent grows annually in steps (simple and understandable)
        const rentThisMonth = (Number(rentMonthly) || 0) * Math.pow(1 + rentGrowth, y - 1);

        // Owner monthly costs
        const propTaxThisMonth = (value * propTax) / 12;
        const maintThisMonth = (value * maint) / 12;
        const buyThisMonth = monthlyMortgage + propTaxThisMonth + maintThisMonth;

        rentPaidThisYear += rentThisMonth;
        buyCashThisYear += buyThisMonth;

        // Opportunity cost investing:
        // If owning costs more than renting, renter invests the difference.
        // If renting costs more, renter withdraws (negative contribution).
        const investContribution = buyThisMonth - rentThisMonth;

        // Grow renter portfolio monthly, then add contribution
        renterPortfolio = renterPortfolio * (1 + investMonthly) + investContribution;
      }

      // update cumulative totals
      rentPaidCum += rentPaidThisYear;
      buyCashCum += buyCashThisYear;

      // Update remaining mortgage balance (annual approximation; simple + stable)
      const annualMortgage = monthlyMortgage * 12;
      const annualInterest = remainingBalance * mortgageRate;
      const principalPaid = Math.max(0, annualMortgage - annualInterest);
      remainingBalance = Math.max(0, remainingBalance - principalPaid);

      // End-of-year home value
      value *= 1 + homeGrowth;

      // Equity if sold end of year (after selling costs & paying off remaining mortgage)
      const netSaleProceeds = value * (1 - sellCost) - remainingBalance;
      const equity = Math.max(0, netSaleProceeds);

      // Net costs
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

      // Breakeven: first year where buy net cost < rent net cost
      if (breakEvenYear === null && netBuyCost < rentNetCost) {
        breakEvenYear = y;
      }
    }

    const last = data[data.length - 1];
    const diff = last ? last.rentNetCost - last.netBuyCost : 0;

    const verdict =
      diff > 0
        ? `In this model (including investing), buying appears cheaper by $${money(diff)} over ${yMax} years.`
        : `In this model (including investing), renting appears cheaper by $${money(Math.abs(diff))} over ${yMax} years.`;

    const breakevenText =
      breakEvenYear !== null ? `Estimated breakeven (net): year ${breakEvenYear}.` : `No breakeven within ${yMax} years.`;

    return {
      data,
      monthlyMortgage: Math.round(monthlyMortgage),
      downPayment: Math.round(downPayment),
      breakEvenYear,
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
  ]);

  const selected =
    results.data.find((p) => p.year === selectedYear) ?? results.data[results.data.length - 1];

  const handleChartClick = (e: any) => {
    const yr = Number(e?.activeLabel);
    if (!Number.isNaN(yr) && yr >= 1 && yr <= (results.data.at(-1)?.year ?? 1)) {
      setSelectedYear(yr);
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    const rentVal = payload.find((p: any) => p.dataKey === "rentNetCost")?.value ?? 0;
    const buyVal = payload.find((p: any) => p.dataKey === "netBuyCost")?.value ?? 0;

    return (
      <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
        <div className="text-sm font-semibold mb-1">Year {label}</div>
        <div className="text-sm">
          <span className="font-medium">Rent (net):</span> ${money(rentVal)}
        </div>
        <div className="text-sm">
          <span className="font-medium">Buy (net):</span> ${money(buyVal)}
        </div>
        <div className="text-xs text-gray-500 mt-1">Click the chart to lock a year.</div>
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

  const final = results.data[results.data.length - 1];
  const finalDiff = final ? final.rentNetCost - final.netBuyCost : 0;

return (
  <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-rose-50 p-4 sm:p-6">
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Top header */}
      <div className="rounded-3xl border border-indigo-100 bg-white/80 backdrop-blur shadow-sm p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-700 to-rose-600 bg-clip-text text-transparent">
              Rent vs Buy Calculator
            </h1>
            <p className="text-zinc-600 mt-1">
              Includes <span className="font-medium text-indigo-700">investment opportunity cost</span> for renters.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Pill label="Mortgage (est)" value={`$${money(results.monthlyMortgage)}/mo`} />
            <Pill label="Down payment" value={`$${money(results.downPayment)}`} />
          </div>
        </div>
      </div>

      {/* Main layout: left inputs + right chart/verdict */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
        {/* LEFT: Inputs (vertical column) */}
        <aside className="rounded-3xl border border-indigo-100 bg-white/80 backdrop-blur shadow-sm p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-zinc-900">Inputs</h2>
            <span className="text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1">
              Assumptions
            </span>
          </div>

          <div className="mt-4 space-y-4">
            {/* Staying */}
            <SectionTitle>Timeline</SectionTitle>
            <Field label="Years staying" value={years} onChange={setYears} />

            {/* Renting */}
            <SectionTitle>Renting</SectionTitle>
            <Field label="Monthly rent ($)" value={rentMonthly} onChange={setRentMonthly} />
            <Field label="Rent increase (%/yr)" value={rentGrowthPct} onChange={setRentGrowthPct} step={0.1} />

            {/* Buying */}
            <SectionTitle>Buying</SectionTitle>
            <Field label="Home price ($)" value={homePrice} onChange={setHomePrice} />
            <Field label="Down payment (%)" value={downPct} onChange={setDownPct} step={0.1} />
            <Field label="Mortgage rate (%/yr)" value={mortgageRatePct} onChange={setMortgageRatePct} step={0.1} />
            <Field label="Amortization (years)" value={amortYears} onChange={setAmortYears} />

            {/* Ownership + investing */}
            <SectionTitle>Ownership & Investing</SectionTitle>
            <Field label="Property tax (%/yr)" value={propertyTaxPct} onChange={setPropertyTaxPct} step={0.1} />
            <Field label="Maintenance (%/yr)" value={maintenancePct} onChange={setMaintenancePct} step={0.1} />
            <Field label="Home growth (%/yr)" value={homeGrowthPct} onChange={setHomeGrowthPct} step={0.1} />
            <Field label="Selling costs (% of sale)" value={sellingCostPct} onChange={setSellingCostPct} step={0.1} />
            <Field label="Investment return (%/yr)" value={investReturnPct} onChange={setInvestReturnPct} step={0.1} />

            <div className="mt-2 rounded-2xl bg-indigo-50/70 border border-indigo-100 p-4 text-xs text-indigo-900/80 leading-relaxed">
              <div className="font-semibold text-indigo-900 mb-1">How it’s computed</div>
              Rent net cost = rent paid − renter portfolio. <br />
              Buy net cost = buy cash outflows − equity (after selling costs).
            </div>
          </div>
        </aside>

        {/* RIGHT: Chart (top) + Verdict (under) */}
        <section className="space-y-5">
          {/* Chart card */}
          <div className="rounded-3xl border border-indigo-100 bg-white/80 backdrop-blur shadow-sm p-5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-zinc-900">Net cumulative cost over time</h2>
                <p className="text-sm text-zinc-600 mt-1">
                  Click the chart to lock a year.{" "}
                  <span className="font-medium text-rose-600">Rent (net)</span> vs{" "}
                  <span className="font-medium text-indigo-700">Buy (net)</span>.
                </p>
              </div>

              <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm">
                <span className="h-2 w-2 rounded-full bg-zinc-900" />
                Selected year: <span className="font-semibold">{selected?.year ?? years}</span>
              </span>
            </div>

            <div className="mt-4 h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={results.data}
                  onClick={handleChartClick}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="4 4" />
                  <XAxis dataKey="year" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                  <Tooltip content={<CustomTooltip />} />

                  {results.breakEvenYear !== null && (
                    <ReferenceLine
                      x={results.breakEvenYear}
                      stroke="#111827"
                      strokeDasharray="6 6"
                      label={{
                        value: `Breakeven ~ yr ${results.breakEvenYear}`,
                        position: "insideTopRight",
                        fill: "#111827",
                        fontSize: 12,
                      }}
                    />
                  )}

                  {/* Rent net line */}
                  <Line
                    type="monotone"
                    dataKey="rentNetCost"
                    name="Rent (net)"
                    stroke="#e11d48" // rose
                    strokeWidth={3}
                    dot={<ClickableDot />}
                    activeDot={{ r: 7 }}
                  />

                  {/* Buy net line */}
                  <Line
                    type="monotone"
                    dataKey="netBuyCost"
                    name="Buy (net)"
                    stroke="#4338ca" // indigo
                    strokeWidth={3}
                    dot={<ClickableDot />}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
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
                Rent(net) − Buy(net) ={" "}
                <span className="font-semibold">
                  ${money(Math.abs((selected?.rentNetCost ?? 0) - (selected?.netBuyCost ?? 0)))}
                </span>{" "}
                <span className="text-zinc-600">
                  {((selected?.rentNetCost ?? 0) - (selected?.netBuyCost ?? 0)) > 0
                    ? "(buy wins by that year)"
                    : "(rent wins by that year)"}
                </span>
              </div>
            </div>
          </div>

          {/* Verdict card under chart */}
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
              <MiniStat label="Final rent net cost" value={`$${money(final?.rentNetCost ?? 0)}`} tone="rose" />
              <MiniStat label="Final buy net cost" value={`$${money(final?.netBuyCost ?? 0)}`} tone="indigo" />
              <MiniStat
                label="Difference (rent − buy)"
                value={`$${money(Math.abs(finalDiff))} ${finalDiff > 0 ? "(buy wins)" : "(rent wins)"}`}
                tone={finalDiff > 0 ? "indigo" : "rose"}
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
        className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
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
