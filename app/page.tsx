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
  rentCum: number; // cumulative rent paid
  buyCashCum: number; // cumulative buy cash outflow (down + mortgage + tax + maint)
  equity: number; // estimated equity if sold at end of that year (after selling costs)
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

  // Selected point on chart (click to lock)
  const [selectedYear, setSelectedYear] = useState<number>(Math.min(5, years));

  // Keep selectedYear in range if years changes
  if (selectedYear > years) {
    // This runs during render; safe enough for this simple app, but we can also move it into useEffect if you prefer.
    setSelectedYear(years);
  }
  if (selectedYear < 1 && years >= 1) {
    setSelectedYear(1);
  }

  const results = useMemo(() => {
    const yMax = Math.max(1, Math.min(50, Math.floor(Number(years) || 1)));

    const rentGrowth = (Number(rentGrowthPct) || 0) / 100;
    const homeGrowth = (Number(homeGrowthPct) || 0) / 100;
    const rate = (Number(mortgageRatePct) || 0) / 100;
    const propTax = (Number(propertyTaxPct) || 0) / 100;
    const maint = (Number(maintenancePct) || 0) / 100;
    const sellCost = (Number(sellingCostPct) || 0) / 100;

    const downPayment = (Number(downPct) || 0) / 100 * (Number(homePrice) || 0);
    const loan = Math.max(0, (Number(homePrice) || 0) - downPayment);

    // Monthly mortgage payment (standard fixed-rate formula)
    const r = rate / 12;
    const n = Math.max(1, (Number(amortYears) || 1) * 12);

    const monthlyMortgage =
      loan === 0
        ? 0
        : r === 0
          ? loan / n
          : (loan * r) / (1 - Math.pow(1 + r, -n));

    // Simulate year by year
    let rentCum = 0;
    let buyCashCum = downPayment; // upfront outflow
    let remainingBalance = loan;
    let value = Number(homePrice) || 0;

    const data: Point[] = [];
    let breakEvenYear: number | null = null;

    for (let y = 1; y <= yMax; y++) {
      // Rent
      const annualRent = (Number(rentMonthly) || 0) * 12 * Math.pow(1 + rentGrowth, y - 1);
      rentCum += annualRent;

      // Buy cash outflows (very simplified but useful)
      const annualMortgage = monthlyMortgage * 12;
      const annualPropTax = value * propTax;
      const annualMaint = value * maint;

      buyCashCum += annualMortgage + annualPropTax + annualMaint;

      // Approx remaining balance (annual approximation)
      // Interest approx on beginning-of-year balance; principal = payment - interest.
      const annualInterest = remainingBalance * rate;
      const principalPaid = Math.max(0, annualMortgage - annualInterest);
      remainingBalance = Math.max(0, remainingBalance - principalPaid);

      // End-of-year home value
      value *= 1 + homeGrowth;

      // Equity if sold end of this year (after selling costs, after paying mortgage balance)
      const netSaleProceeds = value * (1 - sellCost) - remainingBalance;
      const equity = Math.max(0, netSaleProceeds);

      const netBuyCost = buyCashCum - equity;

      data.push({
        year: y,
        rentCum: Math.round(rentCum),
        buyCashCum: Math.round(buyCashCum),
        equity: Math.round(equity),
        netBuyCost: Math.round(netBuyCost),
      });

      if (breakEvenYear === null && netBuyCost < rentCum) {
        breakEvenYear = y;
      }
    }

    const last = data[data.length - 1];
    const diff = last ? last.rentCum - last.netBuyCost : 0;

    const verdict =
      diff > 0
        ? `Buying appears cheaper by $${money(diff)} over ${yMax} years (net of equity).`
        : `Renting appears cheaper by $${money(Math.abs(diff))} over ${yMax} years (net of equity).`;

    const breakevenText =
      breakEvenYear !== null
        ? `Estimated breakeven: year ${breakEvenYear}.`
        : `No breakeven within ${yMax} years.`;

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
  ]);

  const selected = results.data.find((p) => p.year === selectedYear) ?? results.data[results.data.length - 1];

  const final = results.data[results.data.length - 1];
  const finalDiff = final ? final.rentCum - final.netBuyCost : 0;

  // Chart click handler: lock selected year
  const handleChartClick = (e: any) => {
    const yr = Number(e?.activeLabel);
    if (!Number.isNaN(yr) && yr >= 1 && yr <= (results.data.at(-1)?.year ?? 1)) {
      setSelectedYear(yr);
    }
  };

  // Custom tooltip (still useful on hover)
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const yr = label;
    const rentVal = payload.find((p: any) => p.dataKey === "rentCum")?.value ?? 0;
    const buyVal = payload.find((p: any) => p.dataKey === "netBuyCost")?.value ?? 0;

    return (
      <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
        <div className="text-sm font-semibold mb-1">Year {yr}</div>
        <div className="text-sm">
          <span className="font-medium">Rent:</span> ${money(rentVal)}
        </div>
        <div className="text-sm">
          <span className="font-medium">Buy (net):</span> ${money(buyVal)}
        </div>
        <div className="text-xs text-gray-500 mt-1">Click the chart to lock a year.</div>
      </div>
    );
  };

  // Make dots clickable by setting selectedYear via click on active point too
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

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-50 to-white p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="rounded-3xl border bg-white shadow-sm p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Rent vs Buy Calculator</h1>
              <p className="text-zinc-600 mt-1">
                Click a point on the chart to see cumulative totals and the breakeven year.
              </p>
            </div>
            <div className="text-sm text-zinc-600">
              <span className="font-medium text-zinc-900">Mortgage (est):</span>{" "}
              ${money(results.monthlyMortgage)}/mo
              <span className="mx-2 text-zinc-300">|</span>
              <span className="font-medium text-zinc-900">Down payment:</span>{" "}
              ${money(results.downPayment)}
            </div>
          </div>
        </div>

        {/* Inputs + Verdict */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Inputs */}
          <div className="rounded-3xl border bg-white shadow-sm p-6 lg:col-span-2">
            <h2 className="text-xl font-semibold mb-4">Inputs</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Years staying" value={years} onChange={setYears} />
              <Field label="Monthly rent ($)" value={rentMonthly} onChange={setRentMonthly} />
              <Field label="Rent increase (%/yr)" value={rentGrowthPct} onChange={setRentGrowthPct} step={0.1} />
              <Field label="Home price ($)" value={homePrice} onChange={setHomePrice} />

              <Field label="Down payment (%)" value={downPct} onChange={setDownPct} step={0.1} />
              <Field label="Mortgage rate (%/yr)" value={mortgageRatePct} onChange={setMortgageRatePct} step={0.1} />
              <Field label="Amortization (years)" value={amortYears} onChange={setAmortYears} />

              <Field label="Property tax (%/yr)" value={propertyTaxPct} onChange={setPropertyTaxPct} step={0.1} />
              <Field label="Maintenance (%/yr)" value={maintenancePct} onChange={setMaintenancePct} step={0.1} />
              <Field label="Home growth (%/yr)" value={homeGrowthPct} onChange={setHomeGrowthPct} step={0.1} />

              <Field label="Selling costs (% of sale)" value={sellingCostPct} onChange={setSellingCostPct} step={0.1} />
            </div>

            <p className="text-xs text-zinc-500 mt-4">
              Notes: Buy line is <span className="font-medium">net cost</span> = cash outflows − estimated equity (after selling costs).
              This is a simplified model, not financial advice.
            </p>
          </div>

          {/* Verdict card */}
          <div className="rounded-3xl border bg-white shadow-sm p-6">
            <h2 className="text-xl font-semibold">Verdict</h2>
            <p className="mt-2 text-lg font-medium leading-relaxed">{results.verdict}</p>
            <div className="mt-3 text-sm text-zinc-600">{results.breakevenText}</div>

            <div className="mt-5 rounded-2xl bg-zinc-50 p-4 space-y-2">
              <div className="text-sm">
                <span className="text-zinc-600">Final (year {results.data.at(-1)?.year ?? years}) rent paid:</span>{" "}
                <span className="font-semibold">${money(final?.rentCum ?? 0)}</span>
              </div>
              <div className="text-sm">
                <span className="text-zinc-600">Final buy net cost:</span>{" "}
                <span className="font-semibold">${money(final?.netBuyCost ?? 0)}</span>
              </div>
              <div className="text-sm">
                <span className="text-zinc-600">Difference (rent − buy):</span>{" "}
                <span className="font-semibold">
                  ${money(Math.abs(finalDiff))}{" "}
                  <span className="text-zinc-600 font-normal">
                    {finalDiff > 0 ? "(buy wins)" : "(rent wins)"}
                  </span>
                </span>
              </div>
            </div>

            <div className="mt-5 text-xs text-zinc-500">
              Tip: Try changing mortgage rate and years staying — that’s where outcomes usually flip.
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="rounded-3xl border bg-white shadow-sm p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Cumulative cost over time</h2>
              <p className="text-sm text-zinc-600 mt-1">
                Click the chart to lock a year. Rent is <span className="font-medium text-red-600">red</span>, buy (net) is{" "}
                <span className="font-medium text-blue-600">blue</span>.
              </p>
            </div>

            <div className="text-sm">
              <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 bg-white">
                <span className="h-2 w-2 rounded-full bg-zinc-900" />
                Selected year: <span className="font-semibold">{selected?.year ?? years}</span>
              </span>
            </div>
          </div>

          <div className="mt-4 h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={results.data} onClick={handleChartClick} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" />
                <XAxis dataKey="year" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
                />
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

                {/* Rent line (red) */}
                <Line
                  type="monotone"
                  dataKey="rentCum"
                  name="Rent (cumulative)"
                  stroke="#dc2626"
                  strokeWidth={3}
                  dot={<ClickableDot />}
                  activeDot={{ r: 7 }}
                />

                {/* Buy net line (blue) */}
                <Line
                  type="monotone"
                  dataKey="netBuyCost"
                  name="Buy (net cost)"
                  stroke="#2563eb"
                  strokeWidth={3}
                  dot={<ClickableDot />}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Click details */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-5 gap-4">
            <Stat title={`Year ${selected?.year ?? years}`} value="Selected point" subtle />

            <Stat title="Rent paid (cum)" value={`$${money(selected?.rentCum ?? 0)}`} />
            <Stat title="Buy cash outflow (cum)" value={`$${money(selected?.buyCashCum ?? 0)}`} />
            <Stat title="Equity (est)" value={`$${money(selected?.equity ?? 0)}`} />
            <Stat title="Buy net cost" value={`$${money(selected?.netBuyCost ?? 0)}`} />

            <div className="md:col-span-5 rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-700">
              <span className="font-semibold">At year {selected?.year ?? years}:</span>{" "}
              Rent − Buy(net) ={" "}
              <span className="font-semibold">
                ${money(Math.abs((selected?.rentCum ?? 0) - (selected?.netBuyCost ?? 0)))}
              </span>{" "}
              <span className="text-zinc-600">
                {((selected?.rentCum ?? 0) - (selected?.netBuyCost ?? 0)) > 0 ? "(buy wins by that year)" : "(rent wins by that year)"}
              </span>
              <div className="text-xs text-zinc-500 mt-1">
                Buy(net) = down payment + mortgage + property tax + maintenance − (home value after growth − selling costs − remaining mortgage).
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-zinc-500 text-center pb-2">
          Educational estimates only. Small changes in assumptions can flip results.
        </p>
      </div>
    </main>
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
