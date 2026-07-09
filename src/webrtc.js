const lobbyCodeLength = 4;
const supabaseUrl = "https://pnladhpwvtdsfkpokqde.supabase.co";
const supabaseKey = "sb_publishable_0WZ3RRYApemjOYH5G8ti7g_D8gXeZ9-";
const subscribeTimeoutMs = 15000;

export function createLobbyCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  crypto.getRandomValues(new Uint8Array(lobbyCodeLength)).forEach((n) => {
    code += alphabet[n % alphabet.length];
  });
  return code;
}

export function normalizeLobbyCode(value) {
  const text = value.trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return normalizeLobbyCode(url.searchParams.get("lobby") || url.hash.replace(/^#lobby=/, ""));
  } catch {
    return text.replace(/[^a-z0-9]/gi, "").slice(0, lobbyCodeLength).toUpperCase();
  }
}

function lobbyUrl(code) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("lobby", code);
  return url.toString();
}

function roomName(code) {
  return `dungeon-of-cards:${normalizeLobbyCode(code).toLowerCase()}`;
}

function requireSupabase() {
  if (!globalThis.supabase?.createClient) {
    throw new Error("Multiplayer service did not load. Check your connection and refresh.");
  }
  return globalThis.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    realtime: {
      params: { eventsPerSecond: 20 }
    }
  });
}

function randomPlayerId() {
  if (crypto.randomUUID) return `guest-${crypto.randomUUID()}`;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `guest-${[...bytes].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function subscribe(channel, onStatus) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Lobby service timed out. Refresh and try again."));
    }, subscribeTimeoutMs);

    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED" && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve();
        return;
      }
      if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && !settled) {
        settled = true;
        clearTimeout(timer);
        reject(error || new Error("Could not connect to the lobby service."));
        return;
      }
      if (status === "CLOSED") onStatus?.("closed");
      if (status === "CHANNEL_ERROR") onStatus?.("error", error || new Error("Lobby channel failed."));
    });
  });
}

class RealtimePeer {
  constructor({ code, role, playerId, onStatus }) {
    this.code = normalizeLobbyCode(code);
    this.role = role;
    this.id = playerId;
    this.onStatus = onStatus;
    this.client = requireSupabase();
    this.channel = null;
    this.closed = false;
    // Keep the old cleanup shape used by app.js while the transport changes underneath it.
    this.peer = { destroy: () => this.destroy() };
  }

  async destroy() {
    if (this.closed) return;
    this.closed = true;
    if (this.channel) await this.client.removeChannel(this.channel);
  }

  async broadcast(event, payload) {
    if (!this.channel || this.closed) return;
    const result = await this.channel.send({ type: "broadcast", event, payload });
    if (result !== "ok") this.onStatus?.("error", new Error("A multiplayer message could not be sent."));
  }
}

export class HostPeer extends RealtimePeer {
  constructor({ code, onMessage, onStatus, onConnection }) {
    super({ code, role: "host", playerId: "host", onStatus });
    this.onMessage = onMessage;
    this.onConnection = onConnection;
    this.connections = new Set();
    this.blocked = new Set();
    this.ready = this.#connect();
  }

  async #connect() {
    this.channel = this.client.channel(roomName(this.code), {
      config: { broadcast: { self: false, ack: true }, presence: { key: this.id } }
    });
    this.channel.on("broadcast", { event: "guest-message" }, ({ payload }) => {
      const playerId = payload?.playerId;
      if (!playerId || this.blocked.has(playerId)) return;
      if (!this.connections.has(playerId)) {
        this.connections.add(playerId);
        this.onConnection?.(playerId);
        this.onStatus?.("connected", { playerId });
      }
      this.onMessage?.(payload.message, playerId);
    });
    await subscribe(this.channel, this.onStatus);
    await this.channel.track({ role: "host", onlineAt: Date.now() });
    return this.id;
  }

  async createInvite() {
    await this.ready;
    return lobbyUrl(this.code);
  }

  send(message, targetId = "") {
    void this.broadcast("host-message", { targetId, message });
  }

  disconnect(targetId) {
    this.blocked.add(targetId);
    this.connections.delete(targetId);
    void this.broadcast("host-control", { targetId, action: "disconnect" });
  }
}

export class GuestPeer extends RealtimePeer {
  constructor({ code, playerId = randomPlayerId(), onMessage, onStatus }) {
    super({ code, role: "guest", playerId, onStatus });
    this.onMessage = onMessage;
    this.ready = this.#connect();
  }

  async #connect() {
    this.channel = this.client.channel(roomName(this.code), {
      config: { broadcast: { self: false, ack: true }, presence: { key: this.id } }
    });
    this.channel.on("broadcast", { event: "host-message" }, ({ payload }) => {
      if (payload?.targetId && payload.targetId !== this.id) return;
      this.onMessage?.(payload?.message);
    });
    this.channel.on("broadcast", { event: "host-control" }, ({ payload }) => {
      if (payload?.targetId !== this.id || payload.action !== "disconnect") return;
      void this.destroy();
      this.onStatus?.("closed");
    });
    await subscribe(this.channel, this.onStatus);
    await this.channel.track({ role: "guest", playerId: this.id, onlineAt: Date.now() });
    return this.id;
  }

  async connect() {
    await this.ready;
    this.onStatus?.("connected", { playerId: this.id });
    return this.id;
  }

  send(message) {
    void this.broadcast("guest-message", { playerId: this.id, message });
  }
}
