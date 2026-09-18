import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRight,
  Box,
  Check,
  CircleAlert,
  Gauge,
  Loader2,
  Package,
  Thermometer,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import type { Observation, Snapshot } from "./types";

export const fmt = (value: number | null | undefined, digits = 1) =>
  value == null
    ? "—"
    : value.toLocaleString("en", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
export const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(Math.floor(seconds) % 60).padStart(2, "0")}`;
export const time = (timestamp: string) =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
export function State({ state }: { state: string }) {
  return (
    <span
      className={`status ${["running", "live", "completed", "good", "applied"].includes(state) ? "green" : ["emergency", "thermal", "disconnected", "failed", "critical"].includes(state) ? "red" : "neutral"}`}
    >
      <i />
      {state.replaceAll("_", " ")}
    </span>
  );
}
export function Panel({
  title,
  eyebrow,
  action,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Empty({
  title,
  children,
  icon = "box",
}: {
  title: string;
  children?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="empty">
      {icon === "loading" ? (
        <Loader2 className="spin" size={25} />
      ) : icon === "ok" ? (
        <Check size={25} />
      ) : (
        <Box size={25} />
      )}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Modal({
  title,
  description,
  open,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(value) => !value && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal">
          <div className="modal-head">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {description || "ConveyorLab line operations"}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={19} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function TelemetryChart({
  data,
  kind = "throughput",
}: {
  data: Observation[];
  kind?: string;
}) {
  const lines =
    kind === "temperature"
      ? [
          {
            key: "temperature",
            color: "#b36d33",
            label: "Motor temperature (°C)",
          },
        ]
      : kind === "queue"
        ? [
            { key: "queue", color: "#bd8033", label: "Queue (parcels)" },
            { key: "occupancy", color: "#5d7e90", label: "Occupancy (%)" },
          ]
        : [
            {
              key: "throughput",
              color: "#087f73",
              label: "Throughput (parcels/min)",
            },
          ];
  if (!data.length)
    return (
      <Empty title="Waiting for telemetry">
        Start the line to record sensor observations.
      </Empty>
    );
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 15, right: 18, left: -22, bottom: 0 }}
        >
          <CartesianGrid
            stroke="#e9edef"
            strokeDasharray="3 4"
            vertical={false}
          />
          <XAxis
            dataKey="simulation_time"
            tickFormatter={(v) =>
              `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, "0")}`
            }
            tickLine={false}
            axisLine={false}
            minTickGap={40}
            tick={{ fontSize: 11, fill: "#879095" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#879095" }}
            domain={[0, "auto"]}
          />
          <Tooltip
            contentStyle={{
              border: "1px solid #dce4e3",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelFormatter={(v) => `Simulation ${clock(Number(v))}`}
            formatter={(v, name) => [fmt(Number(v)), name]}
          />
          {lines.map((line) => (
            <Line
              key={line.key}
              type="linear"
              dataKey={line.key}
              name={line.label}
              stroke={line.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ConveyorDrawing({
  snapshot,
  onZone,
  selected,
}: {
  snapshot: Snapshot;
  onZone: (zone: number) => void;
  selected?: number;
}) {
  const running = snapshot.state === "running";
  return (
    <div className="twin-canvas">
      <div className="twin-corner">
        <span className="mini-label">LINE 01 / TOP VIEW</span>
        <span className="mini-label">
          FLOW DIRECTION <ArrowRight size={13} />
        </span>
      </div>
      <svg
        viewBox="0 0 1000 250"
        role="img"
        aria-label={`Conveyor with ${snapshot.metrics.inside} parcels in system. ${snapshot.state}.`}
      >
        <defs>
          <pattern
            id="engineering-grid"
            width="22"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="0.75" fill="#dce3e2" />
          </pattern>
          <pattern
            id="rollers"
            width="14"
            height="100"
            patternUnits="userSpaceOnUse"
          >
            <rect width="14" height="100" fill="#e0e6e6" />
            <path d="M7 0V100" stroke="#cad3d3" strokeWidth="1.5" />
          </pattern>
        </defs>
        <rect width="1000" height="250" fill="url(#engineering-grid)" />
        <path d="M18 119H982" stroke="#a6b9b6" strokeDasharray="4 5" />
        <text x="20" y="84" className="svg-caption">
          IN
        </text>
        <text x="963" y="84" className="svg-caption">
          OUT
        </text>
        {snapshot.zones.map((zone, index) => {
          const x = 60 + index * 296,
            width = 272;
          const reading = snapshot.observation?.zones[index];
          const blocked =
            index === 2 && snapshot.faults.some((f) => f.kind === "blockage");
          return (
            <g
              key={zone.id}
              className="zone-group"
              tabIndex={0}
              role="button"
              aria-label={`Inspect ${zone.name} zone`}
              onClick={() => onZone(index)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onZone(index);
                }
              }}
            >
              <rect
                x={x - 8}
                y="58"
                width={width + 16}
                height="137"
                rx="8"
                fill={selected === index ? "#e7f2ee" : "#f4f7f6"}
                stroke={selected === index ? "#087f73" : "#d4dddb"}
              />
              <rect
                x={x}
                y="96"
                width={width}
                height="66"
                rx="13"
                fill="url(#rollers)"
                stroke="#97aaa6"
                strokeWidth="1.2"
              />
              <rect
                x={x + 5}
                y="94"
                width={width - 10}
                height="5"
                rx="2"
                fill="#6f8883"
              />
              <rect
                x={x + 5}
                y="160"
                width={width - 10}
                height="5"
                rx="2"
                fill="#6f8883"
              />
              <circle
                cx={x + 15}
                cy="129"
                r="21"
                fill="#e7edeb"
                stroke="#9aaca7"
              />
              <circle
                cx={x + width - 15}
                cy="129"
                r="21"
                fill="#e7edeb"
                stroke="#9aaca7"
              />
              {[x + 15, x + width - 15].map((cx, j) => (
                <g
                  key={j}
                  transform={`rotate(${running ? snapshot.simulation_time * zone.speed * 90 : 0} ${cx} 129)`}
                >
                  <path
                    d={`M${cx - 12} 129H${cx + 12}M${cx} 117V141`}
                    stroke="#9aaca7"
                    strokeWidth="2"
                  />
                  <circle cx={cx} cy="129" r="4" fill="#80998f" />
                </g>
              ))}
              <text x={x + 10} y="81" className="svg-zone">
                0{index + 1} <tspan dx="8">{zone.name.toUpperCase()}</tspan>
              </text>
              <circle
                cx={x + width - 15}
                cy="77"
                r="3.5"
                fill={blocked ? "#c7674b" : running ? "#087f73" : "#9eaaa5"}
              />
              {zone.parcels.map((p) => (
                <g
                  key={p.id}
                  data-parcel={p.id}
                  transform={`translate(${x + (p.position / zone.length) * width}, 109)`}
                >
                  <rect
                    width={Math.max(12, (p.length / zone.length) * width)}
                    height="40"
                    rx="2"
                    fill="#d4b387"
                    stroke="#b59265"
                  />
                  <path
                    d={`M${((p.length / zone.length) * width) / 2} 1V39`}
                    stroke="#ecdbc2"
                    strokeWidth="4"
                  />
                  {(p.length / zone.length) * width > 23 && (
                    <text
                      x={((p.length / zone.length) * width) / 2}
                      y="26"
                      textAnchor="middle"
                      fontSize="9"
                      fill="#735d43"
                    >
                      {p.id}
                    </text>
                  )}
                </g>
              ))}
              <text x={x + 10} y="185" className="svg-readout">
                {reading?.quality === "missing"
                  ? "NO SIGNAL"
                  : `${fmt(reading?.speed ?? (snapshot.state === "idle" ? 0 : null), 2)} m/s`}
              </text>
              <text
                x={x + width - 10}
                y="185"
                textAnchor="end"
                className="svg-readout"
              >
                {zone.parcels.length} / {zone.capacity} parcels
              </text>
              {blocked && (
                <g>
                  <rect
                    x={x + width - 5}
                    y="101"
                    width="10"
                    height="55"
                    rx="2"
                    fill="#b74e38"
                  />
                  <path
                    d={`M${x + width - 5} 110l10 10m-10 0l10 10m-10 0l10 10`}
                    stroke="#f6d4a9"
                    strokeWidth="3"
                  />
                </g>
              )}
              {index < 2 && (
                <path
                  d={`M${x + width + 8} 129h9m-4-4 4 4-4 4`}
                  stroke="#8aa19b"
                  fill="none"
                  strokeWidth="1.5"
                />
              )}
            </g>
          );
        })}
        <path d="M69 223H921" stroke="#d0dad7" />
        <path d="M69 218V228M921 218V228" stroke="#9eb0a9" />
        <rect x="433" y="214" width="124" height="18" fill="#f7f9f8" />
        <text x="495" y="227" textAnchor="middle" className="svg-caption">
          {fmt(
            snapshot.config.lengths.reduce((a, b) => a + b, 0),
            1,
          )}{" "}
          m · THREE ZONES
        </text>
      </svg>
      <div className="twin-bottom">
        <span>
          <i className={running ? "dot teal" : "dot"} />
          {running ? "Belt in motion" : "Belt stationary"}
        </span>
        <span>
          <Package size={13} />
          {snapshot.waiting} in upstream buffer
        </span>
        <span>Position data · {clock(snapshot.simulation_time)}</span>
      </div>
    </div>
  );
}

export function Kpis({ snapshot }: { snapshot: Snapshot }) {
  const m = snapshot.metrics,
    o = snapshot.observation;
  const items = [
    {
      label: "Belt speed",
      value: o?.speed,
      unit: "m/s",
      digits: 2,
      detail: "Average across 3 zones",
      icon: Gauge,
    },
    {
      label: "Throughput",
      value: m.throughput,
      unit: "parcels/min",
      detail: "Rolling 60-second window",
      icon: Package,
    },
    {
      label: "Motor temperature",
      value: o?.temperature,
      unit: "°C",
      detail: `Warning at ${snapshot.config.warning} °C`,
      icon: Thermometer,
    },
    {
      label: "Belt load",
      value: o?.load,
      unit: "kg",
      detail: `${fmt(o?.load == null ? null : (o.load / (3 * snapshot.config.weight_capacity)) * 100, 0)}% of weight capacity`,
      icon: Box,
    },
    {
      label: "Queue length",
      value: m.queue,
      unit: "parcels",
      digits: 0,
      detail: `${snapshot.waiting} waiting at infeed`,
      icon: CircleAlert,
    },
    {
      label: "Completed",
      value: m.completed,
      unit: "parcels",
      digits: 0,
      detail: `${m.generated} generated this run`,
      icon: Check,
    },
  ];
  return (
    <div className="kpi-grid">
      {items.map(({ icon: Icon, ...item }) => (
        <div
          className={`kpi ${item.label === "Queue length" && m.queue >= snapshot.config.queue_threshold ? "warning-kpi" : ""}`}
          key={item.label}
        >
          <div className="kpi-label">
            {item.label}
            <Icon size={15} />
          </div>
          <div className="kpi-value">
            {fmt(item.value, item.digits ?? 1)}
            <span>{item.unit}</span>
          </div>
          <div className="kpi-detail">{item.detail}</div>
        </div>
      ))}
    </div>
  );
}
