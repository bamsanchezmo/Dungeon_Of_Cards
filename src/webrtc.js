const lobbyPrefix = "dungeon-of-cards";
const lobbyCodeLength = 8;
const turnSecret = "openrelayprojectsecret";

export function createLobbyCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
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

async function makePeer(id) {
  if (!globalThis.Peer) {
    throw new Error("Peer lobby script did not load. Check your connection and refresh.");
  }
  const iceServers = await createIceServers();
  return new globalThis.Peer(id, {
    debug: 1,
    host: "0.peerjs.com",
    port: 443,
    path: "/",
    secure: true,
    config: {
      iceServers,
      iceCandidatePoolSize: 8
    }
  });
}

async function createIceServers() {
  const servers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.relay.metered.ca:80" }
  ];
  try {
    const credentials = await createTurnCredentials();
    servers.push(
      { urls: "turn:staticauth.openrelay.metered.ca:80", ...credentials },
      { urls: "turn:staticauth.openrelay.metered.ca:80?transport=tcp", ...credentials },
      { urls: "turn:staticauth.openrelay.metered.ca:443", ...credentials },
      { urls: "turns:staticauth.openrelay.metered.ca:443?transport=tcp", ...credentials }
    );
  } catch {
    servers.push(
      { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
      { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" }
    );
  }
  return servers;
}

async function createTurnCredentials() {
  const username = String(Math.floor(Date.now() / 1000) + 24 * 60 * 60);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(turnSecret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(username));
  const credential = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return { username, credential };
}

function waitForPeerOpen(peer) {
  if (peer.open) return Promise.resolve(peer.id);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Lobby server timed out. Try refreshing the host tab and sharing a new link.")), 12000);
    peer.once("open", (id) => {
      clearTimeout(timer);
      resolve(id);
    });
    peer.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitForConnectionOpen(connection) {
  if (connection.open) return Promise.resolve(connection);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Connection timed out. Keep the host tab open and try the link again.")), 20000);
    connection.once("open", () => {
      clearTimeout(timer);
      resolve(connection);
    });
    connection.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export class HostPeer {
  constructor({ code, onMessage, onStatus, onConnection }) {
    this.code = code;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.onConnection = onConnection;
    this.connections = new Map();
    this.peer = null;
    this.ready = makePeer(peerIdFor(code)).then((peer) => {
      this.peer = peer;
      peer.on("connection", (connection) => this.#wireConnection(connection));
      peer.on("disconnected", () => this.onStatus?.("disconnected"));
      peer.on("close", () => this.onStatus?.("closed"));
      peer.on("error", (err) => this.onStatus?.("error", err));
      return waitForPeerOpen(peer);
    });
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
    this.peer = null;
    this.connection = null;
    this.id = "";
    this.ready = makePeer().then((peer) => {
      this.peer = peer;
      peer.on("disconnected", () => this.onStatus?.("disconnected"));
      peer.on("close", () => this.onStatus?.("closed"));
      peer.on("error", (err) => this.onStatus?.("error", err));
      return waitForPeerOpen(peer).then((id) => {
        this.id = id;
        return id;
      });
    });
  }

  async connect() {
    await this.ready;
    this.connection = this.peer.connect(peerIdFor(this.code), { serialization: "json" });
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
