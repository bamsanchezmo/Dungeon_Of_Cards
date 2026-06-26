const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function createLobbyCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  crypto.getRandomValues(new Uint8Array(4)).forEach((n) => {
    code += alphabet[n % alphabet.length];
  });
  return code;
}

export function encodeSignal(payload) {
  const bytes = textEncoder.encode(JSON.stringify(payload));
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeSignal(text) {
  const clean = text.trim().replaceAll("-", "+").replaceAll("_", "/");
  const padded = clean.padEnd(clean.length + ((4 - (clean.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(textDecoder.decode(bytes));
}

function peerConfig() {
  return {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" }
    ]
  };
}

function waitForIceGathering(peer) {
  if (peer.iceGatheringState === "complete") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      if (peer.iceGatheringState === "complete") {
        peer.removeEventListener("icegatheringstatechange", done);
        resolve();
      }
    };
    peer.addEventListener("icegatheringstatechange", done);
    setTimeout(resolve, 3500);
  });
}

export class HostPeer {
  constructor({ code, onMessage, onStatus }) {
    this.code = code;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.peer = new RTCPeerConnection(peerConfig());
    this.channel = this.peer.createDataChannel("dungeon-of-cards", { ordered: true });
    this.#wireChannel(this.channel);
    this.peer.addEventListener("connectionstatechange", () => {
      this.onStatus?.(this.peer.connectionState);
    });
  }

  async createInvite() {
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);
    await waitForIceGathering(this.peer);
    return encodeSignal({
      kind: "dungeon-cards-offer",
      code: this.code,
      sdp: this.peer.localDescription
    });
  }

  async acceptAnswer(text) {
    const payload = decodeSignal(text);
    if (payload.kind !== "dungeon-cards-answer" || payload.code !== this.code) {
      throw new Error("That answer is for a different lobby.");
    }
    await this.peer.setRemoteDescription(payload.sdp);
  }

  send(message) {
    if (this.channel?.readyState === "open") {
      this.channel.send(JSON.stringify(message));
    }
  }

  #wireChannel(channel) {
    channel.addEventListener("open", () => this.onStatus?.("connected"));
    channel.addEventListener("close", () => this.onStatus?.("closed"));
    channel.addEventListener("message", (event) => {
      this.onMessage?.(JSON.parse(event.data));
    });
  }
}

export class GuestPeer {
  constructor({ onMessage, onStatus }) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.peer = new RTCPeerConnection(peerConfig());
    this.channel = null;
    this.code = "";
    this.peer.addEventListener("datachannel", (event) => {
      this.channel = event.channel;
      this.#wireChannel(this.channel);
    });
    this.peer.addEventListener("connectionstatechange", () => {
      this.onStatus?.(this.peer.connectionState);
    });
  }

  async createAnswer(inviteText) {
    const invite = decodeSignal(inviteText);
    if (invite.kind !== "dungeon-cards-offer") {
      throw new Error("That is not a Dungeon of Cards host invite.");
    }
    this.code = invite.code;
    await this.peer.setRemoteDescription(invite.sdp);
    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);
    await waitForIceGathering(this.peer);
    return encodeSignal({
      kind: "dungeon-cards-answer",
      code: this.code,
      sdp: this.peer.localDescription
    });
  }

  send(message) {
    if (this.channel?.readyState === "open") {
      this.channel.send(JSON.stringify(message));
    }
  }

  #wireChannel(channel) {
    channel.addEventListener("open", () => this.onStatus?.("connected"));
    channel.addEventListener("close", () => this.onStatus?.("closed"));
    channel.addEventListener("message", (event) => {
      this.onMessage?.(JSON.parse(event.data));
    });
  }
}
