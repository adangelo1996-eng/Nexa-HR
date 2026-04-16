export class AiPrivacySessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiPrivacySessionError";
  }
}

export class AiPrivacyUnknownTokenError extends Error {
  constructor(public readonly token: string) {
    super(`Token AI non riconosciuto per questa sessione: ${token}`);
    this.name = "AiPrivacyUnknownTokenError";
  }
}
