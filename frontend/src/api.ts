import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "./types";

let csrf = "";
export const setCsrf = (value: string) => {
  csrf = value;
};
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch("/api" + path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    ...(body === undefined
      ? {}
      : { method: "POST", body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Request failed. Please try again.",
    );
  return data;
}
export async function command(action: string, values: unknown = {}) {
  const result = await api<{ id: string; status: string; error?: string }>(
    "/commands",
    { action, values, idempotency_key: crypto.randomUUID() },
  );
  if (result.status === "rejected")
    throw new Error(result.error || "Command rejected");
  return result;
}
export function localRead<T>(key: string, fallback: T): T {
  try {
    return (
      JSON.parse(localStorage.getItem("conveyorlab:" + key) || "null") ??
      fallback
    );
  } catch {
    return fallback;
  }
}
export function localWrite(key: string, value: unknown) {
  try {
    localStorage.setItem("conveyorlab:" + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function download(
  name: string,
  content: unknown,
  type = "application/json",
) {
  const blob = new Blob(
    [typeof content === "string" ? content : JSON.stringify(content, null, 2)],
    { type },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function useLive() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [connection, setConnection] = useState("connecting");
  const ref = useRef<Snapshot | null>(null);
  useEffect(() => {
    let closed = false,
      socket: WebSocket,
      retry: ReturnType<typeof setTimeout>,
      attempts = 0,
      lastReceived = Date.now();
    const update = (snapshot: Snapshot) => {
      if (closed) return;
      ref.current = snapshot;
      setData(snapshot);
    };
    const connect = () => {
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/ws`,
      );
      socket.onopen = () => {
        attempts = 0;
        lastReceived = Date.now();
        setConnection("live");
      };
      socket.onmessage = async (event) => {
        lastReceived = Date.now();
        const message = JSON.parse(event.data);
        if (message.type === "unavailable") {
          setConnection("disconnected");
          return;
        }
        setConnection("live");
        if (
          ref.current &&
          message.type === "update" &&
          message.previous_sequence !== ref.current.sequence
        ) {
          try {
            update(await api<Snapshot>("/snapshot"));
          } catch {
            setConnection("disconnected");
          }
        } else update(message.data);
      };
      socket.onclose = () => {
        if (closed) return;
        setConnection("disconnected");
        retry = setTimeout(connect, Math.min(10000, 500 * 2 ** attempts++));
      };
      socket.onerror = () => socket.close();
    };
    connect();
    const heartbeat = setInterval(() => {
      if (Date.now() - lastReceived > 5000) {
        setConnection("stale");
        socket.close();
      }
    }, 2000);
    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(heartbeat);
      socket?.close();
    };
  }, []);
  return { data, connection };
}
