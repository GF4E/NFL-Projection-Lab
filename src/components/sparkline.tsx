export function Sparkline({ values, danger = false }: { values: readonly number[]; danger?: boolean }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 30 - ((value - min) / Math.max(1, max - min)) * 26;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg className="sparkline" viewBox="0 0 100 32" role="img" aria-label="Open-to-current line movement">
      <path d="M0 16H100" className="spark-grid" />
      <polyline points={points} className={danger ? "spark-stroke danger" : "spark-stroke"} />
      <circle cx="100" cy={points.split(" ").at(-1)?.split(",")[1]} r="2.6" className={danger ? "spark-dot danger" : "spark-dot"} />
    </svg>
  );
}
