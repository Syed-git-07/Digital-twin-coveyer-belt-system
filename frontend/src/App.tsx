import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cpu,
  Download,
  FlaskConical,
  Gauge,
  History as HistoryIcon,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Square,
  TriangleAlert,
  Workflow,
  X,
  Zap,
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
import {
  api,
  command,
  download,
  localRead,
  localWrite,
  setCsrf,
  useLive,
} from "./api";
import {
  clock,
  ConveyorDrawing,
  Empty,
  fmt,
  Kpis,
  Modal,
  Panel,
  State,
  TelemetryChart,
  time,
} from "./components";
import type {
  Config,
  Evaluation,
  Experiment,
  Run,
  Scenario,
  Snapshot,
  User,
} from "./types";

const pages = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Simulation", icon: SlidersHorizontal },
  { name: "Predictions", icon: Activity },
  { name: "Experiments", icon: FlaskConical },
  { name: "History", icon: HistoryIcon },
  { name: "Settings", icon: Settings2 },
];
type Action = (action: string, values?: unknown) => Promise<void>;

export default function App() {
  const queryClient = useQueryClient();
  const auth = useQuery({
    queryKey: ["auth"],
    queryFn: () =>
      api<{
        setup_required: boolean;
        setup_token_required: boolean;
        user: User | null;
      }>("/auth/status"),
    retry: false,
  });
  const setUser = (user: User) => {
    setCsrf(user.csrf);
    queryClient.setQueryData(["auth"], { setup_required: false, user });
  };
  useEffect(() => {
    if (auth.data?.user) setCsrf(auth.data.user.csrf);
  }, [auth.data]);
  if (auth.isPending)
    return (
      <div className="full-center">
        <div className="brand-mark">
          <Workflow size={25} />
        </div>
        <Loader2 className="spin" />
        <p>Connecting to ConveyorLab</p>
      </div>
    );
  if (auth.error)
    return (
      <div className="full-center">
        <TriangleAlert />
        <h2>Connection unavailable</h2>
        <p>{auth.error.message}</p>
        <button className="button primary" onClick={() => auth.refetch()}>
          Try again
        </button>
      </div>
    );
  if (!auth.data?.user)
    return (
      <Login
        setup={!!auth.data?.setup_required}
        tokenRequired={!!auth.data?.setup_token_required}
        onLogin={setUser}
      />
    );
  return (
    <Workspace
      user={auth.data.user}
      onLogout={() => {
        setCsrf("");
        queryClient.clear();
      }}
    />
  );
}

function Login({
  setup,
  tokenRequired,
  onLogin,
}: {
  setup: boolean;
  tokenRequired: boolean;
  onLogin: (user: User) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      onLogin(await api<User>(setup ? "/auth/setup" : "/auth/login", data));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <div className="login-visual">
        <div className="brand">
          <div className="brand-mark">
            <Workflow size={24} />
          </div>
          <span>
            ConveyorLab<span className="brand-sub">LINE OPERATIONS</span>
          </span>
        </div>
        <div className="login-drawing">
          <span className="eyebrow">CONNECTED SYSTEMS / 01</span>
          <h1>
            A clear view
            <br />
            of every movement.
          </h1>
          <svg viewBox="0 0 520 260" aria-hidden="true">
            <defs>
              <pattern
                id="login-grid"
                width="25"
                height="25"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="1" cy="1" r="1" fill="#bbcfc6" />
              </pattern>
            </defs>
            <rect width="520" height="260" fill="url(#login-grid)" />
            <g transform="translate(36 115) rotate(-12 220 30)">
              <rect
                width="450"
                height="76"
                rx="38"
                fill="#dce7e1"
                stroke="#6f9585"
                strokeWidth="2"
              />
              {Array.from({ length: 19 }, (_, i) => (
                <path
                  key={i}
                  d={`M${36 + i * 21} 9V67`}
                  stroke="#adc4b9"
                  strokeWidth="3"
                />
              ))}
              <circle
                cx="38"
                cy="38"
                r="28"
                fill="#edf3ef"
                stroke="#6f9585"
                strokeWidth="2"
              />
              <circle
                cx="412"
                cy="38"
                r="28"
                fill="#edf3ef"
                stroke="#6f9585"
                strokeWidth="2"
              />
              {[95, 197, 297].map((x, i) => (
                <g key={x}>
                  <rect
                    x={x}
                    y="11"
                    width={50 + i * 7}
                    height="54"
                    rx="3"
                    fill="#d1b487"
                    stroke="#ac9066"
                  />
                  <path
                    d={`M${x + 25 + i * 3.5} 11v54`}
                    stroke="#ebd7b8"
                    strokeWidth="5"
                  />
                </g>
              ))}
            </g>
            <path d="M45 237H475" stroke="#8cac9e" strokeDasharray="4 5" />
            <text x="45" y="250" className="svg-caption">
              INFEED
            </text>
            <text x="225" y="250" className="svg-caption">
              TRANSFER
            </text>
            <text x="425" y="250" className="svg-caption">
              OUTFEED
            </text>
          </svg>
          <p>
            Monitor the line. Understand the constraint.
            <br />
            Make the next adjustment count.
          </p>
        </div>
        <div className="login-footer">
          <span>CONVEYOR DIGITAL TWIN</span>
          <span>SIMULATED TELEMETRY</span>
        </div>
      </div>
      <div className="login-form">
        <div className="login-form-inner">
          <span className="eyebrow">CONVEYORLAB WORKSPACE</span>
          <h2>{setup ? "Set up your workspace" : "Welcome back"}</h2>
          <p>
            {setup
              ? "Create the initial operator account to open line operations."
              : "Sign in to open line operations."}
          </p>
          <form onSubmit={submit}>
            <label>
              Username
              <input
                name="username"
                required
                minLength={3}
                maxLength={40}
                pattern="[a-zA-Z0-9_.\-]+"
                autoComplete="username"
                placeholder="Your username"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete={setup ? "new-password" : "current-password"}
                placeholder={setup ? "At least 8 characters" : "Your password"}
              />
            </label>
            {setup && tokenRequired && (
              <label>
                Setup token
                <input
                  name="setup_token"
                  type="password"
                  required
                  autoComplete="off"
                />
              </label>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary wide" disabled={busy}>
              {busy ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <ArrowRight size={17} />
              )}{" "}
              {setup ? "Create workspace" : "Sign in"}
            </button>
          </form>
          <div className="login-note">
            <ShieldAlert size={16} />
            <span>
              Authorized personnel only.
              <br />
              Your session is secured on this device.
            </span>
          </div>
        </div>
        <span className="login-version">ConveyorLab / v1.0</span>
      </div>
    </div>
  );
}

function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { data: s, connection } = useLive();
  const qc = useQueryClient();
  const [page, setPage] = useState(() => localRead("page", "Overview"));
  const [mobile, setMobile] = useState(false),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
      null,
    );
  const [zone, setZone] = useState<number | null>(null),
    [newRun, setNewRun] = useState(false),
    [details, setDetails] = useState(false),
    [scenario, setScenario] = useState("balanced"),
    [endConfirm, setEndConfirm] = useState(false);
  const scenarios = useQuery({
    queryKey: ["scenarios"],
    queryFn: () => api<Record<string, Scenario>>("/scenarios"),
  });
  const previousJob = useRef("");
  const operator = user.role === "operator",
    active = s && !["idle", "ended", "interrupted"].includes(s.state);
  useEffect(() => {
    localWrite("page", page);
    window.scrollTo(0, 0);
    document.title = `${page} · ConveyorLab`;
  }, [page]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    if (!s?.job) return;
    const key = s.job.id + s.job.status;
    if (key !== previousJob.current && s.job.status !== "running") {
      qc.invalidateQueries({ queryKey: ["experiments"] });
      qc.invalidateQueries({ queryKey: ["model"] });
      if (s.job.status === "failed")
        setToast({ text: s.job.error || "Job failed", error: true });
      previousJob.current = key;
    }
  }, [s?.job, qc]);
  const act: Action = async (action, values = {}) => {
    setBusy(true);
    try {
      await command(action, values);
      qc.invalidateQueries({ queryKey: ["runs"] });
      if (action === "end") {
        const archive = await api<Snapshot>("/runs/" + s!.run_id);
        const cached = localRead<Snapshot[]>("archives", []).filter(
          (r) => r.run_id !== archive.run_id,
        );
        if (
          !localWrite(
            "archives",
            [
              { ...archive, telemetry: archive.telemetry.slice(-600) },
              ...cached,
            ].slice(0, 8),
          )
        )
          setToast({
            text: "Browser storage is full. This run is still saved locally by the engine.",
            error: true,
          });
      }
      if (!["start", "resume", "pause", "speed", "new"].includes(action))
        setToast({ text: "Command applied" });
    } catch (e) {
      setToast({ text: (e as Error).message, error: true });
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const click = (action: string, values?: unknown) => {
    void act(action, values).catch(() => {});
  };
  const job = async (kind: string, values = {}) => {
    try {
      await api("/jobs/" + kind, values);
      setToast({
        text:
          kind === "training"
            ? "Training started. Live monitoring continues."
            : "Evaluation started",
      });
    } catch (e) {
      setToast({ text: (e as Error).message, error: true });
    }
  };
  const navigate = (name: string) => {
    setPage(name);
    setMobile(false);
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <Workflow size={22} />
          </div>
          <span>
            ConveyorLab<span className="brand-sub">LINE OPERATIONS</span>
          </span>
        </div>
        <div className="workspace-picker">
          <span className="workspace-icon">
            <Cpu size={17} />
          </span>
          <div>
            <strong>Conveyor workspace</strong>
            <span>Single-line system</span>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {pages.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-item ${page === name ? "selected" : ""}`}
              onClick={() => navigate(name)}
            >
              <Icon size={18} />
              <span>{name}</span>
              {page === name && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="source-note">
            <span className="dot teal" />
            <div>
              <strong>Simulated telemetry</strong>
              <span>Local simulation engine</span>
            </div>
          </div>
          <button className="nav-item" onClick={() => setDetails(true)}>
            <BookOpen size={17} />
            Model details
            <ChevronRight size={14} />
          </button>
          <div className="account">
            <span className="avatar">
              {user.username.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{user.username}</strong>
              <span>{user.role}</span>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                try {
                  await api("/auth/logout", {});
                  onLogout();
                } catch (e) {
                  setToast({ text: (e as Error).message, error: true });
                }
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className="sim-badge">
              <span className="dot teal" />
              Simulated telemetry
            </span>
            <span className="top-divider" />
            <button
              className="icon-button"
              aria-label="Open current alerts"
              onClick={() => {
                navigate("Overview");
                setTimeout(
                  () =>
                    document
                      .getElementById("alerts")
                      ?.scrollIntoView({ behavior: "smooth" }),
                  50,
                );
              }}
            >
              <Bell size={18} />
              {s?.alerts.some((a) => a.status === "active") && (
                <i className="notification-dot" />
              )}
            </button>
            <button
              className="icon-button"
              aria-label="Model details"
              onClick={() => setDetails(true)}
            >
              <CircleHelp size={18} />
            </button>
            <span className="avatar small">
              {user.username.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                LINE 01 <span>/</span> CONVEYOR SYSTEM
              </div>
              <div className="page-title">
                <h1>{page === "Overview" ? "Line overview" : page}</h1>
                {s && <State state={s.state} />}
              </div>
              <p>
                {
                  {
                    Overview:
                      "A live view of the line, from infeed to outfeed.",
                    Simulation:
                      "Control operating conditions and observe the response.",
                    Predictions:
                      "Anticipate congestion. Evaluate the next adjustment.",
                    Experiments:
                      "Compare operating strategies under the same workload.",
                    History:
                      "Recorded runs, interventions, and measured outcomes.",
                    Settings: "Operating limits and workspace preferences.",
                  }[page]
                }
              </p>
            </div>
            <div className="page-actions">
              {page === "Overview" && (
                <button
                  className="button"
                  onClick={() => {
                    if (s)
                      download(`run-${s.run_id}-summary.json`, {
                        run_id: s.run_id,
                        simulation_time_s: s.simulation_time,
                        metrics: s.metrics,
                        config: s.config,
                        provenance: "ConveyorLab simulated physical model",
                      });
                  }}
                  disabled={!s}
                >
                  <Download size={15} />
                  Export summary
                </button>
              )}
              {operator && (
                <button
                  className="button primary"
                  onClick={() => setNewRun(true)}
                  disabled={!!active}
                >
                  <Plus size={16} />
                  New run
                </button>
              )}
            </div>
          </div>
          {connection !== "live" && (
            <div className="connection-banner" role="status">
              <Loader2 className="spin" size={16} />
              {connection === "connecting"
                ? "Connecting to the simulation worker…"
                : "Live connection interrupted. Displaying the last received state; reconnecting…"}
            </div>
          )}
          {s ? (
            <>
              <div className="runbar">
                <div>
                  <span className="line-dot" />
                  <strong>
                    {scenarios.data?.[s.scenario]?.name || s.scenario}
                  </strong>
                  <span className="run-id">
                    RUN {s.run_id.slice(0, 8).toUpperCase()}
                  </span>
                </div>
                <div className="runbar-right">
                  <span>
                    <Clock3 size={13} />
                    <b data-testid="sim-clock">{clock(s.simulation_time)}</b>
                    <small>SIM</small>
                  </span>
                  <State state={connection} />
                  <span className="wall-time">{time(s.timestamp)} LOCAL</span>
                </div>
              </div>
              {page === "Overview" && (
                <Overview
                  s={s}
                  operator={operator}
                  busy={busy}
                  act={click}
                  onZone={setZone}
                  onEnd={() => setEndConfirm(true)}
                  onPredictions={() => navigate("Predictions")}
                />
              )}
              {page === "Simulation" && (
                <Simulation
                  s={s}
                  operator={operator}
                  busy={busy}
                  act={act}
                  onZone={setZone}
                  onEnd={() => setEndConfirm(true)}
                />
              )}
              {page === "Predictions" && (
                <Predictions s={s} operator={operator} act={click} job={job} />
              )}
              {page === "Experiments" && (
                <Experiments
                  s={s}
                  scenarios={scenarios.data || {}}
                  operator={operator}
                  job={job}
                />
              )}
              {page === "History" && (
                <HistoryPage scenarios={scenarios.data || {}} />
              )}
              {page === "Settings" && (
                <SettingsPage
                  s={s}
                  operator={operator}
                  act={act}
                  notify={(text) => setToast({ text })}
                />
              )}
            </>
          ) : (
            <Panel title="Line status">
              <Empty icon="loading" title="Waiting for the first snapshot">
                The dashboard will update when the worker is connected.
              </Empty>
            </Panel>
          )}
          <footer className="page-footer">
            <span>
              <Workflow size={13} />
              ConveyorLab <span className="muted">/</span>{" "}
              {user.role === "viewer"
                ? "Read-only monitoring"
                : "Line operations"}
            </span>
            <span>
              All rates use simulation time<span className="footer-dot">·</span>
              v1.0
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <TriangleAlert size={18} /> : <Check size={18} />}
          <span>{toast.text}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <Modal
        title="Create a new run"
        description="Choose a reproducible operating scenario."
        open={newRun}
        onClose={() => setNewRun(false)}
      >
        <div className="scenario-options">
          {Object.entries(scenarios.data || {}).map(([key, value]) => (
            <label
              key={key}
              className={`scenario-option ${scenario === key ? "chosen" : ""}`}
            >
              <input
                type="radio"
                name="scenario"
                value={key}
                checked={scenario === key}
                onChange={() => setScenario(key)}
              />
              <div>
                <strong>{value.name}</strong>
                <span>{value.description}</span>
              </div>
              <span className="seed">#{value.seed}</span>
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button className="button" onClick={() => setNewRun(false)}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || !!active}
            onClick={async () => {
              try {
                await act("new", { scenario });
                setNewRun(false);
                navigate("Overview");
              } catch {
                /* notification supplied by act */
              }
            }}
          >
            Create run
            <ArrowRight size={15} />
          </button>
        </div>
      </Modal>
      <Modal
        title="End this run?"
        description="The final state and telemetry will be saved to history."
        open={endConfirm}
        onClose={() => setEndConfirm(false)}
      >
        <p className="modal-copy">
          This closes the run. Start a new run to continue operating the line.
        </p>
        <div className="modal-actions">
          <button className="button" onClick={() => setEndConfirm(false)}>
            Keep running
          </button>
          <button
            className="button danger"
            disabled={busy}
            onClick={async () => {
              try {
                await act("end");
                setEndConfirm(false);
              } catch {
                /* handled */
              }
            }}
          >
            End and save run
          </button>
        </div>
      </Modal>
      <Modal
        title="Model details"
        description="Simulation assumptions and measurement boundaries."
        open={details}
        onClose={() => setDetails(false)}
      >
        <div className="model-copy">
          <p>
            Three connected conveyor zones use a 0.2-second integration step.
            Actual parcel positions, spacing, weight capacity, downstream
            service and finite buffers determine the line’s output.
          </p>
          <h3>Measurements</h3>
          <p>
            Throughput uses a rolling 60-second window, or available elapsed
            time during startup. Load is weight divided by rated weight
            capacity; occupancy is parcel count divided by zone capacity. Sensor
            noise is bounded and missing readings appear as gaps.
          </p>
          <h3>Prediction and control</h3>
          <p>
            Random forests estimate bottleneck risk and mean throughput over the
            next 60 simulation seconds. Runs are split before training. Six
            candidate speed settings are evaluated on cloned physical states;
            adjustments must pass thermal and operating constraints.
          </p>
          <h3>Local persistence</h3>
          <p>
            Preferences and recent saved results use this browser’s local
            storage. The shared engine stores run records, account sessions and
            model artifacts as local files. No database or external AI service
            is used.
          </p>
          <div className="notice">
            These are educational model assumptions. Synthetic results do not
            establish real conveyor performance without calibration.
          </div>
          <a
            className="text-link"
            href="/api/docs"
            target="_blank"
            rel="noreferrer"
          >
            API reference <ArrowRight size={14} />
          </a>
        </div>
      </Modal>
      {s && zone !== null && (
        <ZoneModal
          s={s}
          zone={zone}
          operator={operator}
          onClose={() => setZone(null)}
          act={act}
        />
      )}
    </div>
  );
}

function Controls({
  s,
  operator,
  busy,
  act,
  onEnd,
}: {
  s: Snapshot;
  operator: boolean;
  busy: boolean;
  act: (a: string, v?: unknown) => void;
  onEnd: () => void;
}) {
  if (!operator) return <span className="muted">Viewer access</span>;
  const closed = ["ended", "interrupted"].includes(s.state);
  return (
    <div className="controls">
      <label className="speed-select">
        <span className="sr-only">Simulation speed</span>
        <select
          aria-label="Simulation speed"
          value={s.simulation_speed}
          onChange={(e) => act("speed", { speed: Number(e.target.value) })}
          disabled={busy || closed}
        >
          {[1, 2, 5, 10].map((n) => (
            <option key={n} value={n}>
              {n}× speed
            </option>
          ))}
        </select>
      </label>
      {s.state === "running" ? (
        <button
          className="button compact"
          onClick={() => act("pause")}
          disabled={busy}
        >
          <Pause size={14} />
          Pause
        </button>
      ) : (
        <button
          className="button compact primary"
          disabled={busy || closed || s.state === "emergency"}
          onClick={() => act(s.state === "paused" ? "resume" : "start")}
        >
          <Play size={14} />
          {s.state === "paused" ? "Resume" : "Start line"}
        </button>
      )}
      <button
        className="button compact"
        disabled={busy || closed || s.state === "idle"}
        onClick={onEnd}
      >
        <Square size={13} />
        End run
      </button>
      <button
        className="button compact stop-button"
        title={
          s.state === "emergency"
            ? "Clear emergency latch; line stays stopped"
            : "Emergency stop"
        }
        disabled={busy || closed}
        onClick={() => act(s.state === "emergency" ? "clear_estop" : "estop")}
      >
        <ShieldAlert size={15} />
        {s.state === "emergency" ? "Clear stop" : "E-stop"}
      </button>
    </div>
  );
}

function Overview({
  s,
  operator,
  busy,
  act,
  onZone,
  onEnd,
  onPredictions,
}: {
  s: Snapshot;
  operator: boolean;
  busy: boolean;
  act: (a: string, v?: unknown) => void;
  onZone: (z: number) => void;
  onEnd: () => void;
  onPredictions: () => void;
}) {
  const [chart, setChart] = useState("throughput"),
    [range, setRange] = useState(180);
  const alerts = s.alerts.filter((a) => a.status !== "resolved");
  return (
    <>
      <Kpis snapshot={s} />
      <Panel
        title="Live conveyor"
        eyebrow="DIGITAL TWIN"
        className="conveyor-panel"
        action={<Controls {...{ s, operator, busy, act, onEnd }} />}
      >
        <ConveyorDrawing snapshot={s} onZone={onZone} />
        <div className="zone-summary">
          {s.zones.map((zone, i) => (
            <button
              className="zone-summary-item"
              key={zone.id}
              onClick={() => onZone(i)}
            >
              <span className="zone-number">0{i + 1}</span>
              <div>
                <strong>{zone.name}</strong>
                <span>
                  {s.observation?.zones[i].quality === "missing"
                    ? "Sensor signal missing"
                    : `${fmt(s.observation?.zones[i].temperature)} °C motor temperature`}
                </span>
              </div>
              <div className="occupancy-bar">
                <span
                  style={{
                    width: `${(zone.parcels.length / zone.capacity) * 100}%`,
                  }}
                />
              </div>
              <b>
                {fmt((zone.parcels.length / zone.capacity) * 100, 0)}
                <small>%</small>
              </b>
              <ChevronRight size={14} />
            </button>
          ))}
        </div>
      </Panel>
      <div className="overview-bottom">
        <Panel
          title="Live telemetry"
          action={
            <select
              aria-label="Chart time range"
              className="plain-select"
              value={range}
              onChange={(e) => setRange(Number(e.target.value))}
            >
              <option value={60}>Last minute</option>
              <option value={180}>Last 3 minutes</option>
            </select>
          }
        >
          <div className="chart-tabs">
            {["throughput", "temperature", "queue"].map((key) => (
              <button
                key={key}
                className={chart === key ? "active" : ""}
                onClick={() => setChart(key)}
              >
                {key === "queue"
                  ? "Queue & occupancy"
                  : key[0].toUpperCase() + key.slice(1)}
              </button>
            ))}
            <span>
              <i className="dot teal" />
              {chart === "temperature"
                ? "°C"
                : chart === "queue"
                  ? "parcels / %"
                  : "parcels/min"}
            </span>
          </div>
          <TelemetryChart
            data={s.telemetry.filter(
              (row) => row.simulation_time >= s.simulation_time - range,
            )}
            kind={chart}
          />
          <div className="chart-caption">
            <span>Simulation time (mm:ss)</span>
            <span>1 s sensor interval · gaps indicate missing readings</span>
          </div>
        </Panel>
        <Panel
          title="Line activity"
          action={<span className="count-pill">{alerts.length} active</span>}
        >
          <div id="alerts" className="alerts-list">
            {alerts.length ? (
              alerts
                .slice(-3)
                .reverse()
                .map((alert) => (
                  <div className="alert-item" key={alert.id}>
                    <span className={`alert-icon ${alert.severity}`}>
                      <TriangleAlert size={16} />
                    </span>
                    <div>
                      <strong>{alert.title}</strong>
                      <span>
                        {clock(alert.simulation_time)} · {alert.status}
                      </span>
                      {operator && alert.status === "active" && (
                        <button
                          className="text-link"
                          onClick={() => act("acknowledge", { id: alert.id })}
                        >
                          Acknowledge
                        </button>
                      )}
                    </div>
                  </div>
                ))
            ) : (
              <div className="all-clear">
                <span>
                  <Check size={19} />
                </span>
                <div>
                  <strong>No active alerts</strong>
                  <p>Operating conditions are within limits.</p>
                </div>
              </div>
            )}
          </div>
          <div className="operating-stats">
            <div>
              <span>Estimated power</span>
              <strong>
                {fmt(s.metrics.power, 2)} <small>kW</small>
              </strong>
            </div>
            <div>
              <span>Mean cycle time</span>
              <strong>
                {fmt(s.metrics.cycle_time)} <small>s</small>
              </strong>
            </div>
            <div>
              <span>Accumulated energy</span>
              <strong>
                {fmt(s.metrics.energy, 3)} <small>kWh</small>
              </strong>
            </div>
          </div>
          <div className="last-event">
            <span className="eyebrow">LATEST EVENT</span>
            <p>
              {s.events.at(-1)?.detail || "Run ready. Start the line to begin."}
            </p>
            <span>
              {s.events.at(-1)
                ? `${clock(s.events.at(-1)!.simulation_time)} simulation time`
                : "Awaiting operator"}
            </span>
          </div>
        </Panel>
      </div>
      <div className="prediction-strip">
        <span className="prediction-icon">
          <Activity size={21} />
        </span>
        <div>
          <span className="eyebrow">60-SECOND OUTLOOK</span>
          <strong>
            {s.prediction.status === "ready"
              ? `${fmt(s.prediction.risk! * 100, 0)}% bottleneck risk`
              : s.prediction.message}
          </strong>
        </div>
        <div className="forecast-inline">
          <span>Forecast throughput</span>
          <strong>
            {fmt(s.prediction.throughput)} <small>parcels/min</small>
          </strong>
        </div>
        <p>
          {s.recommendation?.message ||
            (s.prediction.status === "warmup"
              ? "A 30-second observation window is required."
              : "Review the forecast and evaluate operating settings.")}
        </p>
        <button className="text-link" onClick={onPredictions}>
          View predictions
          <ArrowRight size={16} />
        </button>
      </div>
    </>
  );
}

function OperatingForm({
  s,
  act,
  disabled,
  zoneOnly,
}: {
  s: Snapshot;
  act: Action;
  disabled: boolean;
  zoneOnly?: number;
}) {
  const [speeds, setSpeeds] = useState(s.config.speeds),
    [arrival, setArrival] = useState(s.config.arrival_rate),
    [service, setService] = useState(s.config.service_rate),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    setSpeeds(s.config.speeds);
    setArrival(s.config.arrival_rate);
    setService(s.config.service_rate);
  }, [
    s.run_id,
    s.config.speeds.join(","),
    s.config.arrival_rate,
    s.config.service_rate,
  ]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await act(
        "settings",
        zoneOnly == null
          ? { speeds, arrival_rate: arrival, service_rate: service }
          : { speeds },
      );
    } catch {
      /* shown by workspace */
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="operating-form">
      <div className="form-section-label">
        BELT SPEEDS <span>0.2 – 2.0 m/s</span>
      </div>
      {s.zones
        .filter((z) => zoneOnly == null || z.id === zoneOnly)
        .map((z) => (
          <label key={z.id} className="slider-label">
            <div>
              <span>
                <i className="dot teal" />
                {z.name}
              </span>
              <span className="number-unit">
                <input
                  aria-label={`${z.name} speed`}
                  type="number"
                  min="0.2"
                  max="2"
                  step="0.05"
                  value={speeds[z.id]}
                  disabled={disabled}
                  onChange={(e) =>
                    setSpeeds(
                      speeds.map((v, i) =>
                        i === z.id ? Number(e.target.value) : v,
                      ),
                    )
                  }
                />
                <small>m/s</small>
              </span>
            </div>
            <input
              aria-label={`${z.name} speed slider`}
              type="range"
              min="0.2"
              max="2"
              step="0.05"
              value={speeds[z.id]}
              disabled={disabled}
              onChange={(e) =>
                setSpeeds(
                  speeds.map((v, i) =>
                    i === z.id ? Number(e.target.value) : v,
                  ),
                )
              }
            />
          </label>
        ))}
      {zoneOnly == null && (
        <div className="field-row">
          <label>
            Arrival rate
            <span className="input-unit">
              <input
                aria-label="Arrival rate"
                type="number"
                required
                min="5"
                max="60"
                value={arrival}
                disabled={disabled}
                onChange={(e) => setArrival(Number(e.target.value))}
              />
              <small>/min</small>
            </span>
          </label>
          <label>
            Outfeed service rate
            <span className="input-unit">
              <input
                aria-label="Outfeed service rate"
                type="number"
                required
                min="2"
                max="90"
                value={service}
                disabled={disabled}
                onChange={(e) => setService(Number(e.target.value))}
              />
              <small>/min</small>
            </span>
          </label>
        </div>
      )}
      <button className="button primary wide" disabled={disabled || saving}>
        {saving ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
        Apply settings
      </button>
    </form>
  );
}

function Simulation({
  s,
  operator,
  busy,
  act,
  onZone,
  onEnd,
}: {
  s: Snapshot;
  operator: boolean;
  busy: boolean;
  act: Action;
  onZone: (z: number) => void;
  onEnd: () => void;
}) {
  const [fault, setFault] = useState("blockage");
  const disabled = !operator || ["ended", "interrupted"].includes(s.state);
  const click = (a: string, v?: unknown) => {
    void act(a, v).catch(() => {});
  };
  return (
    <>
      <Panel
        title="Conveyor controls"
        action={<Controls {...{ s, operator, busy, onEnd }} act={click} />}
      >
        <ConveyorDrawing snapshot={s} onZone={onZone} />
      </Panel>
      <div className="three-columns">
        <Panel title="Operating settings" action={<Gauge size={17} />}>
          <OperatingForm s={s} act={act} disabled={disabled} />
        </Panel>
        <Panel title="Fault injection" action={<TriangleAlert size={17} />}>
          <div className="panel-body">
            <label>
              Fault type
              <select
                value={fault}
                disabled={disabled}
                onChange={(e) => setFault(e.target.value)}
              >
                <option value="blockage">Downstream blockage</option>
                <option value="friction">Increased mechanical friction</option>
                <option value="surge">Arrival surge</option>
                <option value="heating">Motor heating fault</option>
                <option value="sensor">Sensor dropout</option>
              </select>
            </label>
            <button
              className="button wide"
              disabled={disabled || s.faults.some((f) => f.kind === fault)}
              onClick={() => click("fault", { kind: fault, active: true })}
            >
              <Zap size={15} />
              Inject fault
            </button>
            <div className="fault-list">
              {s.faults.length ? (
                s.faults.map((f) => (
                  <div className="fault-row" key={f.kind}>
                    <div>
                      <strong>{f.name}</strong>
                      <span>
                        {s.zones[f.zone].name} · {clock(f.simulation_time)}
                      </span>
                      <State state={f.severity} />
                    </div>
                    <button
                      className="button compact"
                      disabled={disabled}
                      onClick={() =>
                        click("fault", { kind: f.kind, active: false })
                      }
                    >
                      Clear
                    </button>
                  </div>
                ))
              ) : (
                <Empty icon="ok" title="No injected faults">
                  The line is using its configured conditions.
                </Empty>
              )}
            </div>
          </div>
        </Panel>
        <Panel title="Run measurements">
          <div className="measurement-list">
            {(
              [
                ["Generated", s.metrics.generated, "parcels"],
                ["Accepted", s.metrics.accepted, "parcels"],
                ["Completed", s.metrics.completed, "parcels"],
                ["Rejected", s.metrics.rejected, "parcels"],
                ["Inside system", s.metrics.inside, "parcels"],
                ["Blocked time", s.metrics.blocked, "s"],
                ["Starved time", s.metrics.starved, "s"],
                ["Energy / parcel", s.metrics.energy_per_parcel, "Wh"],
              ] as [string, number | null, string][]
            ).map(([label, value, unit]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>
                  {fmt(value, unit === "parcels" ? 0 : 1)}
                  <small> {unit}</small>
                </strong>
              </div>
            ))}
          </div>
          <div className="conservation">
            <Check size={15} />
            Parcel balance verified:{" "}
            {s.metrics.generated ===
            s.metrics.completed + s.metrics.inside + s.metrics.rejected
              ? "conserved"
              : "mismatch"}
          </div>
        </Panel>
      </div>
      <Panel
        title="Control timeline"
        action={<span className="muted">Simulation time</span>}
      >
        <EventTable s={s} />
      </Panel>
    </>
  );
}

function EventTable({ s }: { s: Snapshot }) {
  return s.events.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Simulation time</th>
            <th>Event</th>
            <th>Changed by</th>
            <th>Wall clock</th>
          </tr>
        </thead>
        <tbody>
          {s.events
            .slice(-12)
            .reverse()
            .map((event) => (
              <tr key={event.id}>
                <td className="mono">{clock(event.simulation_time)}</td>
                <td>{event.detail}</td>
                <td>{event.actor}</td>
                <td className="muted">{time(event.timestamp)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty title="No interventions recorded">
      Controls and scenario events will appear here.
    </Empty>
  );
}

function ZoneModal({
  s,
  zone,
  operator,
  onClose,
  act,
}: {
  s: Snapshot;
  zone: number;
  operator: boolean;
  onClose: () => void;
  act: Action;
}) {
  const z = s.zones[zone],
    reading = s.observation?.zones[zone];
  return (
    <Modal
      title={`0${zone + 1} / ${z.name}`}
      description="Zone readings and speed control."
      open
      onClose={onClose}
    >
      <div className="zone-modal-stats">
        <div>
          <span>Motor temperature</span>
          <strong>
            {fmt(reading?.temperature)} <small>°C</small>
          </strong>
        </div>
        <div>
          <span>Payload</span>
          <strong>
            {fmt(reading?.load)} <small>kg</small>
          </strong>
        </div>
        <div>
          <span>Occupancy</span>
          <strong>
            {z.parcels.length} <small>/ {z.capacity}</small>
          </strong>
        </div>
      </div>
      <div className="notice">
        Sensor: {reading?.quality || "awaiting observation"} · Last valid:{" "}
        {reading?.last_valid ? time(reading.last_valid) : "—"}
        <br />
        Temperature warning / shutdown: {s.config.warning} / {s.config.shutdown}{" "}
        °C · Recovery below {s.config.recovery} °C
      </div>
      <OperatingForm
        s={s}
        act={act}
        disabled={!operator || ["ended", "interrupted"].includes(s.state)}
        zoneOnly={zone}
      />
    </Modal>
  );
}

function Predictions({
  s,
  operator,
  act,
  job,
}: {
  s: Snapshot;
  operator: boolean;
  act: (a: string, v?: unknown) => void;
  job: (k: string, v?: object) => Promise<void>;
}) {
  const evaluation = useQuery({
    queryKey: ["model"],
    queryFn: () => api<Evaluation | null>("/models"),
  });
  const [importance, setImportance] = useState(false);
  const p = s.prediction,
    rec = s.recommendation,
    runningJob = s.job?.status === "running";
  return (
    <>
      <div className="prediction-kpis">
        <div className="panel forecast-card">
          <span className="kpi-label">
            Bottleneck risk
            <Activity size={18} />
          </span>
          <strong>
            {p.status === "ready" ? `${fmt(p.risk! * 100, 0)}%` : "—"}
          </strong>
          <span>
            {p.status === "ready"
              ? "Predicted probability within the forecast horizon"
              : p.message}
          </span>
        </div>
        <div className="panel forecast-card">
          <span className="kpi-label">
            Forecast throughput
            <Gauge size={18} />
          </span>
          <strong>
            {fmt(p.throughput)}
            <small>parcels/min</small>
          </strong>
          <span>Estimated mean over the next 60 seconds</span>
        </div>
        <div className="panel forecast-card">
          <span className="kpi-label">
            Forecast horizon
            <Clock3 size={18} />
          </span>
          <strong>
            60<small>seconds</small>
          </strong>
          <span>30-second feature window · simulation time</span>
        </div>
      </div>
      <div className="two-columns">
        <Panel
          title="Operating recommendation"
          eyebrow="CONSTRAINED EVALUATION"
          action={
            <span className="badge">
              {s.automatic ? "Automatic" : "Advisory mode"}
            </span>
          }
        >
          <div className="panel-body">
            {rec ? (
              <>
                <div className="recommendation-heading">
                  <span className="prediction-icon">
                    <SlidersHorizontal size={21} />
                  </span>
                  <div>
                    <h3>{rec.message}</h3>
                    <p>
                      {rec.candidates} candidates · source state{" "}
                      {rec.source_sequence} · {clock(rec.source_time)}
                    </p>
                  </div>
                </div>
                <table className="rec-table">
                  <thead>
                    <tr>
                      <th>Zone</th>
                      <th>Current</th>
                      <th>Proposed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.zones.map((z, i) => (
                      <tr key={z.id}>
                        <td>{z.name}</td>
                        <td>{fmt(rec.current.speeds[i], 2)} m/s</td>
                        <td className="teal-text">
                          {fmt(rec.proposed.speeds[i], 2)} m/s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="estimate-grid">
                  <div>
                    <span>Estimated throughput change</span>
                    <strong>
                      {fmt(rec.proposed.throughput - rec.current.throughput)}{" "}
                      <small>parcels/min</small>
                    </strong>
                  </div>
                  <div>
                    <span>Estimated energy change</span>
                    <strong>
                      {fmt(
                        (rec.proposed.energy - rec.current.energy) * 1000,
                        2,
                      )}{" "}
                      <small>Wh / 60 s</small>
                    </strong>
                  </div>
                  <div>
                    <span>Estimated motor temperature</span>
                    <strong>
                      {fmt(rec.proposed.temperature)} <small>°C</small>
                    </strong>
                  </div>
                  <div>
                    <span>Estimated queue growth</span>
                    <strong>
                      {fmt(rec.proposed.queue_growth, 0)} <small>parcels</small>
                    </strong>
                  </div>
                </div>
                <p className="muted small-copy">
                  Measured factors: completions, energy use, queue growth,
                  temperature
                  {rec.prediction_used
                    ? ", and model-predicted congestion"
                    : ""}
                  . Generated {time(rec.generated_at)}.
                </p>
                <div className="button-row">
                  <button
                    className="button primary"
                    disabled={
                      !operator ||
                      rec.status !== "available" ||
                      s.simulation_time - rec.source_time > 30
                    }
                    onClick={() => act("apply", { id: rec.id })}
                  >
                    <Check size={15} />
                    {rec.status === "applied"
                      ? "Applied"
                      : s.simulation_time - rec.source_time > 30
                        ? "Recommendation expired"
                        : "Apply recommendation"}
                  </button>
                  <button
                    className="button"
                    disabled={!operator}
                    onClick={() => act("revert")}
                  >
                    <RotateCcw size={15} />
                    Revert
                  </button>
                </div>
              </>
            ) : (
              <Empty title="Evaluate operating settings">
                Compare six speed combinations against the current physical
                state.
              </Empty>
            )}
            <div className="recommendation-actions">
              <button
                className="button"
                disabled={!operator || runningJob || s.state !== "running"}
                onClick={() => job("recommendation")}
              >
                {runningJob && s.job?.kind === "recommendation" ? (
                  <Loader2 className="spin" size={15} />
                ) : (
                  <SlidersHorizontal size={15} />
                )}
                Evaluate settings
              </button>
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={s.automatic}
                  disabled={!operator}
                  onChange={(e) =>
                    act("automatic", { enabled: e.target.checked })
                  }
                />
                Automatic adjustments
              </label>
            </div>
            <p className="small-copy muted">
              Automatic control checks once per 60 simulation seconds and
              disengages on faults or missing sensor readings.
            </p>
          </div>
        </Panel>
        <Panel
          title="Prediction model"
          action={evaluation.data && <State state="completed" />}
        >
          <div className="panel-body">
            {evaluation.data ? (
              <>
                <div className="model-version">
                  <span className="model-chip">
                    <Cpu size={24} />
                  </span>
                  <div>
                    <h3>Random forest</h3>
                    <p>
                      {evaluation.data.version} · {evaluation.data.runs}{" "}
                      independent runs
                    </p>
                  </div>
                </div>
                <div className="model-metrics">
                  {[
                    ["Precision", evaluation.data.test.precision],
                    ["Recall", evaluation.data.test.recall],
                    ["F1 score", evaluation.data.test.f1],
                    ["PR-AUC", evaluation.data.test.pr_auc],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <span>{label}</span>
                      <strong>{fmt(value as number | null, 3)}</strong>
                    </div>
                  ))}
                </div>
                <div className="measurement-list compact-list">
                  <div>
                    <span>Throughput MAE</span>
                    <strong>
                      {fmt(evaluation.data.test.throughput_mae, 2)}{" "}
                      <small>parcels/min</small>
                    </strong>
                  </div>
                  <div>
                    <span>Throughput RMSE</span>
                    <strong>
                      {fmt(evaluation.data.test.throughput_rmse, 2)}{" "}
                      <small>parcels/min</small>
                    </strong>
                  </div>
                  <div>
                    <span>Queue-growth baseline F1</span>
                    <strong>{fmt(evaluation.data.test.baseline_f1, 3)}</strong>
                  </div>
                  <div>
                    <span>Training dataset</span>
                    <strong>
                      {evaluation.data.samples.toLocaleString()}{" "}
                      <small>samples</small>
                    </strong>
                  </div>
                </div>
                <p className="small-copy muted">
                  Measured on held-out runs. {evaluation.data.split_method}
                </p>
                <div className="button-row">
                  <button
                    className="button"
                    onClick={() => setImportance(true)}
                  >
                    Model details
                    <ChevronRight size={14} />
                  </button>
                  <button
                    className="button"
                    onClick={() =>
                      download("model-evaluation.json", evaluation.data)
                    }
                  >
                    <Download size={14} />
                    Evaluation
                  </button>
                </div>
              </>
            ) : (
              <Empty
                title={
                  evaluation.error
                    ? "Evaluation unavailable"
                    : "Model unavailable"
                }
              >
                {evaluation.error
                  ? evaluation.error.message
                  : "Train a model from independent simulated runs to enable forecasts."}
              </Empty>
            )}
            <div className="training-row">
              <div>
                <strong>
                  {runningJob && s.job?.kind === "training"
                    ? "Training in progress"
                    : "Generate dataset & train"}
                </strong>
                <span>100 runs · 240 seconds each · local processing</span>
              </div>
              <button
                className="button compact"
                disabled={!operator || runningJob}
                onClick={() => job("training", { runs: 100 })}
              >
                {runningJob && s.job?.kind === "training" ? (
                  <Loader2 className="spin" size={15} />
                ) : (
                  <Play size={14} />
                )}
                Train
              </button>
            </div>
          </div>
        </Panel>
      </div>
      <Panel
        title="Prediction record"
        action={
          <span className="muted">
            Last {Math.min(s.predictions.length, 12)} forecasts
          </span>
        }
      >
        {s.predictions.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Simulation time</th>
                  <th>Bottleneck risk</th>
                  <th>Forecast throughput</th>
                  <th>Horizon</th>
                  <th>Model</th>
                </tr>
              </thead>
              <tbody>
                {s.predictions
                  .slice(-12)
                  .reverse()
                  .map((p, i) => (
                    <tr key={i}>
                      <td className="mono">{clock(p.simulation_time!)}</td>
                      <td>{fmt(p.risk! * 100, 1)}%</td>
                      <td>{fmt(p.throughput)} parcels/min</td>
                      <td>{p.horizon} s</td>
                      <td className="muted">{p.version}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No forecasts yet">
            A trained model and 30 seconds of healthy sensor observations are
            required.
          </Empty>
        )}
      </Panel>
      <Modal
        title="Model evaluation details"
        description="Held-out test results and model-level feature importance."
        open={importance}
        onClose={() => setImportance(false)}
      >
        {evaluation.data && (
          <div className="model-copy">
            <p>{evaluation.data.label}</p>
            <h3>Confusion matrix</h3>
            <table>
              <thead>
                <tr>
                  <th>Actual / predicted</th>
                  <th>No bottleneck</th>
                  <th>Bottleneck</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.data.test.confusion_matrix.map((row, i) => (
                  <tr key={i}>
                    <td>{i ? "Bottleneck" : "No bottleneck"}</td>
                    {row.map((v, j) => (
                      <td key={j}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small-copy">
              Test class distribution:{" "}
              {Object.entries(evaluation.data.test.class_distribution)
                .map(([k, v]) => `${k === "1" ? "Bottleneck" : "Clear"}: ${v}`)
                .join(" · ")}
            </p>
            <h3>Model-level feature importance</h3>
            {Object.entries(evaluation.data.importance)
              .sort((a, b) => b[1] - a[1])
              .map(([key, value]) => (
                <div className="importance-row" key={key}>
                  <span>{key.replaceAll("_", " ")}</span>
                  <div>
                    <i style={{ width: `${value * 100}%` }} />
                  </div>
                  <b>{fmt(value, 3)}</b>
                </div>
              ))}
            <p className="small-copy muted">
              Model-wide importance does not explain the cause of an individual
              prediction.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}

const comparisonMetrics: [keyof Snapshot["metrics"], string, string][] = [
  ["generated", "Generated workload", "parcels"],
  ["accepted", "Accepted", "parcels"],
  ["completed", "Completed", "parcels"],
  ["rejected", "Rejected", "parcels"],
  ["inside", "Remaining backlog", "parcels"],
  ["throughput", "Final rolling throughput", "parcels/min"],
  ["mean_queue", "Mean queue", "parcels"],
  ["max_queue", "Maximum queue", "parcels"],
  ["cycle_time", "Average cycle time", "s"],
  ["blocked", "Blocked time", "s"],
  ["max_temperature", "Peak motor temperature", "°C"],
  ["energy", "Total energy", "kWh"],
  ["energy_per_parcel", "Energy per completed parcel", "Wh"],
];
function Experiments({
  s,
  scenarios,
  operator,
  job,
}: {
  s: Snapshot;
  scenarios: Record<string, Scenario>;
  operator: boolean;
  job: (k: string, v?: object) => Promise<void>;
}) {
  const experiments = useQuery({
    queryKey: ["experiments"],
    queryFn: () => api<Experiment[]>("/experiments"),
    refetchInterval:
      s.job?.kind === "experiment" && s.job.status === "running" ? 3000 : false,
  });
  const [scenario, setScenario] = useState("balanced"),
    [duration, setDuration] = useState(300),
    [repetitions, setRepetitions] = useState(3),
    [selected, setSelected] = useState(""),
    [chart, setChart] = useState("throughput");
  const result =
    experiments.data?.find((e) => e.id === selected) || experiments.data?.[0];
  useEffect(() => {
    if (experiments.data?.length)
      localWrite("experiments", experiments.data.slice(0, 10));
  }, [experiments.data]);
  const exportCsv = () => {
    if (!result) return;
    const rows = [
      [
        "metric",
        "unit",
        "baseline",
        "optimized",
        "matched_seeds",
        "duration_s",
        "experiment_id",
      ],
      ...comparisonMetrics.map(([key, label, unit]) => [
        label,
        unit,
        result.summary.baseline[key],
        result.summary.optimized[key],
        result.seeds.join("|"),
        result.duration,
        result.id,
      ]),
    ];
    download(
      `comparison-${result.id}.csv`,
      rows.map((row) => row.join(",")).join("\r\n"),
      "text/csv",
    );
  };
  return (
    <>
      <Panel title="Matched comparison" eyebrow="BASELINE VS OPTIMIZED">
        <div className="experiment-form">
          <label>
            Operating scenario
            <select
              aria-label="Operating scenario"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
            >
              {Object.entries(scenarios).map(([key, v]) => (
                <option key={key} value={key}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Duration
            <select
              aria-label="Duration"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              {[120, 300, 600, 900].map((n) => (
                <option key={n} value={n}>
                  {n / 60} minutes
                </option>
              ))}
            </select>
          </label>
          <label>
            Matched seeds
            <select
              aria-label="Matched seeds"
              value={repetitions}
              onChange={(e) => setRepetitions(Number(e.target.value))}
            >
              {[1, 3, 5].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "pair" : "pairs"}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button primary"
            disabled={!operator || s.job?.status === "running"}
            onClick={() =>
              job("experiment", {
                scenario,
                duration,
                seeds: Array.from({ length: repetitions }, (_, i) => 42 + i),
              })
            }
          >
            {s.job?.kind === "experiment" && s.job.status === "running" ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <FlaskConical size={16} />
            )}
            Run comparison
          </button>
        </div>
        <div className="experiment-note">
          <Check size={15} />
          Same arrivals, parcel properties and fault schedule. Experiments run
          independently of the live line.
        </div>
      </Panel>
      {result ? (
        <>
          <div className="result-heading">
            <div>
              <h2>
                Comparison results{" "}
                <span className="badge">
                  {result.seeds.length} matched{" "}
                  {result.seeds.length === 1 ? "seed" : "seeds"}
                </span>
              </h2>
              <p>
                {scenarios[result.scenario]?.name} · {result.duration / 60} min
                · {new Date(result.timestamp).toLocaleString()}
              </p>
            </div>
            <div className="button-row">
              <select
                aria-label="Saved comparison"
                value={result.id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {experiments.data?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {scenarios[e.scenario]?.name} · {time(e.timestamp)}
                  </option>
                ))}
              </select>
              <button className="button" onClick={exportCsv}>
                <Download size={15} />
                CSV
              </button>
              <button
                className="button"
                onClick={() => download(`experiment-${result.id}.json`, result)}
              >
                JSON
              </button>
              <button
                className="icon-button"
                title="Rerun this comparison"
                aria-label="Rerun this comparison"
                disabled={!operator || s.job?.status === "running"}
                onClick={() =>
                  job("experiment", {
                    scenario: result.scenario,
                    duration: result.duration,
                    seeds: result.seeds,
                  })
                }
              >
                <RotateCcw size={18} />
              </button>
            </div>
          </div>
          <div className="comparison-summary">
            <div>
              <span>Completed parcels · mean change</span>
              <strong
                className={result.completed_delta_mean > 0 ? "teal-text" : ""}
              >
                {result.completed_delta_mean > 0 ? "+" : ""}
                {fmt(result.completed_delta_mean)}
                <small>parcels</small>
              </strong>
            </div>
            <div>
              <span>Between-pair standard deviation</span>
              <strong>
                {fmt(result.completed_delta_std)}
                <small>parcels</small>
              </strong>
            </div>
            <div>
              <span>Workload</span>
              <strong>
                {fmt(result.summary.baseline.generated, 1)}
                <small>arrivals / run</small>
              </strong>
            </div>
          </div>
          <div className="two-columns">
            <Panel
              title="Measured output"
              action={
                <div className="segmented">
                  <button
                    className={chart === "throughput" ? "active" : ""}
                    onClick={() => setChart("throughput")}
                  >
                    Throughput
                  </button>
                  <button
                    className={chart === "queue" ? "active" : ""}
                    onClick={() => setChart("queue")}
                  >
                    Queue
                  </button>
                </div>
              }
            >
              <div className="chart-legend">
                <span>
                  <i className="dot slate" />
                  Baseline
                </span>
                <span>
                  <i className="dot teal" />
                  Optimized
                </span>
                <small>First matched seed</small>
              </div>
              <div className="chart comparison-chart">
                <ResponsiveContainer>
                  <LineChart
                    data={result.curves}
                    margin={{ left: -15, right: 20, top: 10, bottom: 5 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 4"
                      stroke="#e5eae8"
                    />
                    <XAxis
                      dataKey="time"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip labelFormatter={(v) => `Simulation ${v} s`} />
                    <Line
                      dataKey={
                        chart === "throughput" ? "baseline" : "baseline_queue"
                      }
                      name="Baseline"
                      stroke="#91a0a8"
                      dot={false}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey={
                        chart === "throughput" ? "optimized" : "optimized_queue"
                      }
                      name="Optimized"
                      stroke="#087f73"
                      dot={false}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-caption">
                {chart === "throughput" ? "Parcels/min" : "Parcels"} ·
                simulation time (s)
              </div>
              <div className="panel-body">
                <p className="small-copy muted">{result.provenance}</p>
                <div className="notice">
                  {result.completed_delta_mean > 0
                    ? "Measured completion gain under these simulated conditions."
                    : result.completed_delta_mean < 0
                      ? "Optimized control completed fewer parcels under these conditions."
                      : "No measured change in completed parcels. Energy and queue outcomes are shown alongside."}
                </div>
              </div>
            </Panel>
            <Panel
              title="Outcome comparison"
              action={<span className="muted">Mean across seeds</span>}
            >
              <div className="table-scroll">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Baseline</th>
                      <th>Optimized</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonMetrics.map(([key, label, unit]) => (
                      <tr key={key}>
                        <td>
                          {label}
                          <small>{unit}</small>
                        </td>
                        <td>
                          {fmt(
                            result.summary.baseline[key],
                            key === "energy" ? 3 : 1,
                          )}
                        </td>
                        <td>
                          {fmt(
                            result.summary.optimized[key],
                            key === "energy" ? 3 : 1,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </>
      ) : (
        <Panel title="Comparison results">
          <Empty
            icon={
              s.job?.status === "running" && s.job.kind === "experiment"
                ? "loading"
                : "box"
            }
            title={
              s.job?.status === "running" && s.job.kind === "experiment"
                ? "Running matched simulations"
                : "No comparisons yet"
            }
          >
            {experiments.error
              ? experiments.error.message
              : "Choose a scenario and run a baseline-versus-optimized comparison."}
          </Empty>
        </Panel>
      )}
    </>
  );
}

function HistoryPage({ scenarios }: { scenarios: Record<string, Scenario> }) {
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: () => api<Run[]>("/runs"),
    refetchInterval: 10000,
  });
  const [search, setSearch] = useState(""),
    [scenario, setScenario] = useState("all"),
    [status, setStatus] = useState("all"),
    [date, setDate] = useState(""),
    [outcome, setOutcome] = useState("all"),
    [selected, setSelected] = useState<string | null>(null),
    [play, setPlay] = useState(false),
    [cursor, setCursor] = useState(0),
    [page, setPage] = useState(1);
  const detail = useQuery({
    queryKey: ["run", selected],
    queryFn: () => api<Snapshot>("/runs/" + selected),
    enabled: !!selected,
  });
  const filtered = (runs.data || localRead<Snapshot[]>("archives", [])).filter(
    (r) =>
      (r.run_id.includes(search.toLowerCase()) ||
        (scenarios[r.scenario]?.name || r.scenario)
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (scenario === "all" || r.scenario === scenario) &&
      (status === "all" || r.state === status) &&
      (!date || r.created_at.startsWith(date)) &&
      (outcome === "all" ||
        (outcome === "rejected"
          ? r.metrics.rejected > 0
          : outcome === "clear"
            ? r.metrics.rejected === 0
            : r.metrics.max_queue >= 12)),
  );
  useEffect(() => {
    setPage(1);
  }, [search, scenario, status, date, outcome]);
  useEffect(() => {
    setCursor(0);
    setPlay(false);
  }, [selected]);
  useEffect(() => {
    if (!play) return;
    const timer = setInterval(
      () =>
        setCursor((c) => {
          const max = (detail.data?.telemetry.length || 1) - 1;
          if (c >= max) {
            setPlay(false);
            return max;
          }
          return c + 1;
        }),
      100,
    );
    return () => clearInterval(timer);
  }, [play, detail.data]);
  const r = detail.data,
    observation = r?.telemetry[cursor];
  return (
    <>
      <Panel
        title="Run archive"
        action={<span className="muted">{filtered.length} runs</span>}
      >
        <div className="history-filters">
          <div className="search-input">
            <Search size={16} />
            <input
              aria-label="Search runs"
              placeholder="Search run ID or scenario…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter scenario"
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
          >
            <option value="all">All scenarios</option>
            {Object.entries(scenarios).map(([key, v]) => (
              <option key={key} value={key}>
                {v.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All states</option>
            {[
              "idle",
              "running",
              "paused",
              "ended",
              "interrupted",
              "emergency",
              "thermal",
            ].map((key) => (
              <option key={key}>{key}</option>
            ))}
          </select>
          <select
            aria-label="Filter outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            <option value="all">All outcomes</option>
            <option value="clear">No rejections</option>
            <option value="rejected">With rejections</option>
            <option value="congested">Queue reached 12+</option>
          </select>
          <input
            aria-label="Filter date (UTC)"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        {filtered.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Run / scenario</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th>Completed</th>
                    <th>Rejected</th>
                    <th>State</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice((page - 1) * 10, page * 10).map((run) => (
                    <tr key={run.run_id}>
                      <td>
                        <button
                          className="table-link"
                          onClick={() => setSelected(run.run_id)}
                        >
                          {scenarios[run.scenario]?.name || run.scenario}
                          <span className="mono">
                            {run.run_id.toUpperCase()}
                          </span>
                        </button>
                      </td>
                      <td>
                        {new Date(run.created_at).toLocaleDateString()}
                        <small>{time(run.created_at)}</small>
                      </td>
                      <td className="mono">{clock(run.simulation_time)}</td>
                      <td>{run.metrics.completed}</td>
                      <td>{run.metrics.rejected}</td>
                      <td>
                        <State state={run.state} />
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Open run ${run.run_id}`}
                          onClick={() => setSelected(run.run_id)}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                Page {page} of {Math.max(1, Math.ceil(filtered.length / 10))}
              </span>
              <button
                className="button compact"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <button
                className="button compact"
                disabled={page * 10 >= filtered.length}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <Empty title="No matching runs">
            {runs.error
              ? runs.error.message
              : "Saved runs will appear here. Adjust the filters or start a new run."}
          </Empty>
        )}
      </Panel>
      {selected && (
        <Panel
          title={
            r
              ? `${scenarios[r.scenario]?.name || r.scenario} / ${r.run_id.toUpperCase()}`
              : "Loading run"
          }
          action={
            <button
              className="icon-button"
              aria-label="Close run details"
              onClick={() => setSelected(null)}
            >
              <X size={17} />
            </button>
          }
        >
          {r ? (
            <div className="run-detail">
              <div className="report-header">
                <div>
                  <State state={r.state} />
                  <span className="muted">
                    Seed {r.config.seed} · {clock(r.simulation_time)} duration
                  </span>
                </div>
                <div className="button-row">
                  <a
                    className="button"
                    href={`/api/runs/${r.run_id}/telemetry.csv`}
                    download
                  >
                    <ArrowDownToLine size={15} />
                    Telemetry CSV
                  </a>
                  <button
                    className="button"
                    onClick={() =>
                      download(`config-${r.run_id}.json`, {
                        run_id: r.run_id,
                        config: r.config,
                        provenance: "ConveyorLab simulated run",
                      })
                    }
                  >
                    Configuration
                  </button>
                  <button
                    className="button"
                    onClick={() =>
                      download(`summary-${r.run_id}.json`, {
                        run_id: r.run_id,
                        metrics: r.metrics,
                        events: r.events,
                        alerts: r.alerts,
                        predictions: r.predictions,
                        provenance: "ConveyorLab simulated run",
                      })
                    }
                  >
                    Summary
                  </button>
                  <button className="button" onClick={() => window.print()}>
                    Print report
                  </button>
                </div>
              </div>
              <div className="playback-controls">
                <span className="badge">READ-ONLY PLAYBACK</span>
                <button
                  className="icon-button"
                  aria-label={
                    play ? "Pause playback" : "Play recorded telemetry"
                  }
                  disabled={!r.telemetry.length}
                  onClick={() => {
                    if (cursor === r.telemetry.length - 1) setCursor(0);
                    setPlay(!play);
                  }}
                >
                  {play ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <input
                  type="range"
                  aria-label="Playback position"
                  min="0"
                  max={Math.max(0, r.telemetry.length - 1)}
                  value={cursor}
                  onChange={(e) => setCursor(Number(e.target.value))}
                />
                <strong className="mono">
                  {clock(observation?.simulation_time || 0)}
                </strong>
              </div>
              <TelemetryChart
                data={r.telemetry.slice(Math.max(0, cursor - 180), cursor + 1)}
              />
              <div className="playback-readings">
                <span>
                  Throughput <b>{fmt(observation?.throughput)} /min</b>
                </span>
                <span>
                  Temperature <b>{fmt(observation?.temperature)} °C</b>
                </span>
                <span>
                  Queue <b>{fmt(observation?.queue, 0)} parcels</b>
                </span>
                <span>
                  Quality <b>{observation?.quality || "—"}</b>
                </span>
              </div>
              <div className="measurement-list report-metrics">
                {comparisonMetrics.map(([key, label, unit]) => (
                  <div key={key}>
                    <span>{label}</span>
                    <strong>
                      {fmt(r.metrics[key], key === "energy" ? 3 : 1)}{" "}
                      <small>{unit}</small>
                    </strong>
                  </div>
                ))}
              </div>
              <details className="history-config">
                <summary>Run configuration & recorded forecasts</summary>
                <div className="config-readout">
                  <span>
                    Target speeds:{" "}
                    {r.config.speeds.map((v) => fmt(v, 2)).join(" / ")} m/s
                  </span>
                  <span>
                    Arrivals: {r.config.arrival_rate} parcels/min ? Station
                    service: {r.config.service_rate} parcels/min
                  </span>
                  <span>
                    Ambient: {r.config.ambient} ?C ? Seed: {r.config.seed}
                  </span>
                </div>
                {r.predictions.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Simulation time</th>
                          <th>Bottleneck risk</th>
                          <th>Forecast throughput</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.predictions.slice(-20).map((prediction, i) => (
                          <tr key={i}>
                            <td>{clock(prediction.simulation_time!)}</td>
                            <td>{fmt(prediction.risk! * 100, 1)}%</td>
                            <td>{fmt(prediction.throughput)} parcels/min</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted small-copy">No forecasts recorded.</p>
                )}
              </details>
              <h3 className="report-section">Fault & control timeline</h3>
              <EventTable s={r} />
              <div className="report-alerts">
                <h3>Recorded alerts</h3>
                {r.alerts.length ? (
                  r.alerts.map((a) => (
                    <div key={a.id}>
                      <span>{a.title}</span>
                      <State state={a.status} />
                      <small>{clock(a.simulation_time)}</small>
                    </div>
                  ))
                ) : (
                  <p className="muted">No alerts recorded.</p>
                )}
              </div>
            </div>
          ) : (
            <Empty
              icon="loading"
              title={
                detail.error ? "Unable to load run" : "Loading recorded data"
              }
            >
              {detail.error?.message}
            </Empty>
          )}
        </Panel>
      )}
    </>
  );
}

function SettingsPage({
  s,
  operator,
  act,
  notify,
}: {
  s: Snapshot;
  operator: boolean;
  act: Action;
  notify: (text: string) => void;
}) {
  const [saving, setSaving] = useState(false),
    [motion, setMotion] = useState(() => localRead("reducedMotion", false)),
    [clear, setClear] = useState(false);
  const fields: [keyof Config, string, string, number, number, number][] = [
    ["ambient", "Ambient temperature", "°C", 0, 45, 1],
    ["recovery", "Recovery threshold", "°C", 30, 80, 1],
    ["warning", "Temperature warning", "°C", 40, 90, 1],
    ["shutdown", "Thermal shutdown", "°C", 50, 100, 1],
    ["queue_threshold", "Queue alert threshold", "parcels", 2, 80, 1],
    ["weight_capacity", "Weight capacity per zone", "kg", 20, 500, 1],
    ["buffer_capacity", "Upstream buffer", "parcels", 1, 100, 1],
    ["sensor_missing", "Sensor missing probability", "fraction", 0, 0.4, 0.01],
    ["acceleration", "Acceleration limit", "m/s²", 0.05, 2, 0.05],
    ["heating", "Heating coefficient", "°C/s", 0.01, 1, 0.01],
    ["cooling", "Cooling coefficient", "1/s", 0.002, 0.1, 0.001],
    ["spacing", "Minimum parcel spacing", "m", 0.05, 0.4, 0.05],
  ];
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const values = Object.fromEntries(
      [...new FormData(e.currentTarget)].map(([key, value]) => [
        key,
        Number(value),
      ]),
    );
    try {
      await act("settings", values);
    } catch {
      /* handled */
    } finally {
      setSaving(false);
    }
  }
  useEffect(() => {
    document.documentElement.classList.toggle("reduced-motion", motion);
    localWrite("reducedMotion", motion);
  }, [motion]);
  return (
    <div className="settings-layout">
      <Panel title="Operating limits" eyebrow="PHYSICAL MODEL">
        <form key={s.run_id} onSubmit={submit}>
          <div className="settings-fields">
            {fields.map(([key, label, unit, min, max, step]) => (
              <label key={key}>
                {label}
                <span className="input-unit">
                  <input
                    name={key}
                    type="number"
                    required
                    min={min}
                    max={max}
                    step={step}
                    defaultValue={s.config[key] as number}
                    disabled={
                      !operator || ["ended", "interrupted"].includes(s.state)
                    }
                  />
                  <small>{unit}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="settings-submit">
            <span>
              Recovery &lt; warning &lt; shutdown. Changes are audited.
            </span>
            <button
              className="button primary"
              disabled={
                !operator ||
                saving ||
                ["ended", "interrupted"].includes(s.state)
              }
            >
              <Check size={15} />
              Apply settings
            </button>
          </div>
        </form>
      </Panel>
      <div>
        <Panel title="This workspace">
          <div className="panel-body">
            <div className="preference-row">
              <div>
                <strong>Reduce motion</strong>
                <p>Simplify transitions on this device.</p>
              </div>
              <input
                aria-label="Reduce motion"
                type="checkbox"
                checked={motion}
                onChange={(e) => setMotion(e.target.checked)}
              />
            </div>
            <div className="preference-row">
              <div>
                <strong>Browser storage</strong>
                <p>Preferences, recent archives and comparisons.</p>
              </div>
              <span className="badge">Local</span>
            </div>
            <button
              className="button wide"
              onClick={() =>
                download("conveyorlab-browser-backup.json", {
                  schema_version: 1,
                  exported_at: new Date().toISOString(),
                  archives: localRead("archives", []),
                  experiments: localRead("experiments", []),
                  preferences: { reducedMotion: motion },
                })
              }
            >
              <Download size={15} />
              Export browser backup
            </button>
            <button className="button wide" onClick={() => setClear(true)}>
              <RotateCcw size={15} />
              Clear saved browser data
            </button>
            <div className="notice">
              Shared runs and model artifacts are saved locally by the engine.
              Clearing this browser does not remove those files.
            </div>
          </div>
        </Panel>
        <Panel title="System information">
          <div className="measurement-list">
            <div>
              <span>Data source</span>
              <strong>Simulated sensors</strong>
            </div>
            <div>
              <span>Simulation tick</span>
              <strong>0.2 s</strong>
            </div>
            <div>
              <span>Telemetry interval</span>
              <strong>1 s</strong>
            </div>
            <div>
              <span>Random seed</span>
              <strong>{s.config.seed}</strong>
            </div>
            <div>
              <span>Data storage</span>
              <strong>Local · no database</strong>
            </div>
            <div>
              <span>Schema</span>
              <strong>v1</strong>
            </div>
          </div>
        </Panel>
      </div>
      <Modal
        title="Clear this browser’s saved data?"
        description="This removes local preferences and cached results on this device."
        open={clear}
        onClose={() => setClear(false)}
      >
        <div className="modal-actions">
          <button className="button" onClick={() => setClear(false)}>
            Cancel
          </button>
          <button
            className="button danger"
            onClick={() => {
              Object.keys(localStorage)
                .filter((key) => key.startsWith("conveyorlab:"))
                .forEach((key) => localStorage.removeItem(key));
              setClear(false);
              notify("Browser data cleared");
            }}
          >
            Clear browser data
          </button>
        </div>
      </Modal>
    </div>
  );
}
