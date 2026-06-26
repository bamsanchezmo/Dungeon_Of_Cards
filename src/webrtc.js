const lobbyPrefix = "dungeon-of-cards";

export function createLobbyCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  crypto.getRandomValues(new Uint8Array(4)).forEach((n) => {
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
    return text.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase();
  }
}

export function lobbyUrl(code) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("lobby", code);
  return url.toString();
}

function peerIdFor(code) {
  return `${lobbyPrefix}-${code.toLowerCase()}`;
}

function makePeer(id) {
  if (!globalThis.Peer) {
    throw new Error("Peer lobby script did not load. Check your connection and refresh.");
  }
  return new globalThis.Peer(id, {
    debug: 1,
    config: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" }
      ]
    }
  });
}

function waitForPeerOpen(peer) {
  if (peer.open) return Promise.resolve(peer.id);
  return new Promise((resolve, reject) => {
    peer.once("open", resolve);
    peer.once("error", reject);
  });
}

function waitForConnectionOpen(connection) {
  if (connection.open) return Promise.resolve(connection);
  return new Promise((resolve, reject) => {
    connection.once("open", () => resolve(connection));
    connection.once("error", reject);
  });
}

export class HostPeer {
  constructor({ code, onMessage, onStatus, onConnection }) {
    this.code = code;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.onConnection = onConnection;
    this.connections = new Map();
    this.peer = makePeer(peerIdFor(code));
    this.ready = waitForPeerOpen(this.peer);

    this.peer.on("connection", (connection) => this.#wireConnection(connection));
    this.peer.on("disconnected", () => this.onStatus?.("disconnected"));
    this.peer.on("close", () => this.onStatus?.("closed"));
    this.peer.on("error", (err) => this.onStatus?.("error", err));
  }

  async createInvite() {
    await this.ready;
    return lobbyUrl(this.code);
  }

  send(message, targetId = "") {
    if (targetId) {
      const connection = this.connections.get(targetId);
      if (connection?.open) connection.send(message);
      return;
    }
    this.connections.forEach((connection) => {
      if (connection.open) connection.send(message);
    });
  }

  disconnect(targetId) {
    const connection = this.connections.get(targetId);
    if (connection) {
      setTimeout(() => connection.close(), 250);
    }
  }

  #wireConnection(connection) {
    connection.on("open", () => {
      this.connections.set(connection.peer, connection);
      this.onConnection?.(connection.peer);
      this.onStatus?.("connected", { playerId: connection.peer });
    });
    connection.on("data", (data) => {
      this.onMessage?.(data, connection.peer);
    });
    connection.on("close", () => {
      this.connections.delete(connection.peer);
      this.onStatus?.("closed", { playerId: connection.peer });
    });
    connection.on("error", (err) => this.onStatus?.("error", err));
  }
}

export class GuestPeer {
  constructor({ code, onMessage, onStatus }) {
    this.code = code;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.peer = makePeer();
    this.connection = null;
    this.id = "";
    this.ready = waitForPeerOpen(this.peer).then((id) => {
      this.id = id;
      return id;
    });

    this.peer.on("disconnected", () => this.onStatus?.("disconnected"));
    this.peer.on("close", () => this.onStatus?.("closed"));
    this.peer.on("error", (err) => this.onStatus?.("error", err));
  }

  async connect() {
    await this.ready;
    this.connection = this.peer.connect(peerIdFor(this.code), { reliable: true });
    this.#wireConnection(this.connection);
    await waitForConnectionOpen(this.connection);
    this.onStatus?.("connected", { playerId: this.id });
    return this.id;
  }

  send(message) {
    if (this.connection?.open) {
      this.connection.send(message);
    }
  }

  #wireConnection(connection) {
    connection.on("data", (data) => {
      this.onMessage?.(data);
    });
    connection.on("close", () => this.onStatus?.("closed"));
    connection.on("error", (err) => this.onStatus?.("error", err));
  }
}
