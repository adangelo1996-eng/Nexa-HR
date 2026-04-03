import { readFileSync, existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { ServiceUnavailableException } from "@nestjs/common";
import { PKPass } from "passkit-generator";
import type { User } from "@payday/domain";

/** Icona 1×1 PNG (Wallet richiede icon.png; per produzione sostituire con asset 29/58 px). */
const FALLBACK_ICON_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

export type WalletPassEnv = {
  passTypeIdentifier: string;
  teamIdentifier: string;
  organizationName: string;
  signerCertPath: string;
  signerKeyPath: string;
  signerKeyPassphrase: string;
  wwdrCertPath: string;
};

/**
 * Directory usata per risolvere path relativi dei certificati (default: `apps/backend/certs`).
 * Override: `APPLE_WALLET_CERT_BASE_DIR`.
 */
export function getWalletCertBaseDir(): string {
  const fromEnv = process.env.APPLE_WALLET_CERT_BASE_DIR?.trim();
  if (fromEnv) {
    return resolve(fromEnv);
  }
  // dist/workforce → ../../certs oppure src/workforce → ../../certs
  return resolve(__dirname, "..", "..", "certs");
}

function resolveWalletFilePath(raw: string | undefined): string | null {
  if (!raw?.trim()) {
    return null;
  }
  const p = raw.trim();
  const base = getWalletCertBaseDir();
  const absolute = isAbsolute(p) ? resolve(p) : resolve(base, p);
  return absolute;
}

/** Nome organizzazione sul pass e nelle API badge (stesso valore di default del pass). */
export function getWalletOrganizationName(): string {
  return process.env.APPLE_WALLET_ORGANIZATION_NAME?.trim() || "Nexa HR";
}

export function loadWalletPassEnv(): WalletPassEnv | null {
  const passTypeIdentifier = process.env.APPLE_WALLET_PASS_TYPE_ID?.trim();
  const teamIdentifier = process.env.APPLE_WALLET_TEAM_ID?.trim();
  const organizationName = getWalletOrganizationName();
  const signerCertPath = process.env.APPLE_WALLET_SIGNER_CERT_PATH?.trim();
  const signerKeyPath = process.env.APPLE_WALLET_SIGNER_KEY_PATH?.trim();
  const signerKeyPassphrase = process.env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE?.trim() ?? "";
  const wwdrCertPath = process.env.APPLE_WALLET_WWDR_CERT_PATH?.trim();
  if (!passTypeIdentifier || !teamIdentifier || !signerCertPath || !signerKeyPath || !wwdrCertPath) {
    return null;
  }
  const absCert = resolveWalletFilePath(signerCertPath);
  const absKey = resolveWalletFilePath(signerKeyPath);
  const absWwdr = resolveWalletFilePath(wwdrCertPath);
  if (!absCert || !absKey || !absWwdr) {
    return null;
  }
  if (!existsSync(absCert) || !existsSync(absKey) || !existsSync(absWwdr)) {
    return null;
  }
  return {
    passTypeIdentifier,
    teamIdentifier,
    organizationName,
    signerCertPath: absCert,
    signerKeyPath: absKey,
    signerKeyPassphrase,
    wwdrCertPath: absWwdr
  };
}

export function assertWalletConfigured(): WalletPassEnv {
  const cfg = loadWalletPassEnv();
  if (!cfg) {
    throw new ServiceUnavailableException(
      "Apple Wallet non configurato: impostare APPLE_WALLET_PASS_TYPE_ID, APPLE_WALLET_TEAM_ID, " +
        "APPLE_WALLET_SIGNER_CERT_PATH, APPLE_WALLET_SIGNER_KEY_PATH, APPLE_WALLET_WWDR_CERT_PATH " +
        "(percorsi assoluti o relativi a APPLE_WALLET_CERT_BASE_DIR, default apps/backend/certs) " +
        "e opzionalmente APPLE_WALLET_SIGNER_KEY_PASSPHRASE."
    );
  }
  return cfg;
}

/**
 * Genera .pkpass con QR contenente il token NFC (16 caratteri) per timbratura POST /clock/nfc.
 */
export async function buildNexaHrEmployeeWalletPass(
  user: User,
  nfcToken: string,
  cfg: WalletPassEnv
): Promise<Buffer> {
  const signerCert = readFileSync(cfg.signerCertPath);
  const signerKey = readFileSync(cfg.signerKeyPath);
  const wwdr = readFileSync(cfg.wwdrCertPath);

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: cfg.passTypeIdentifier,
    teamIdentifier: cfg.teamIdentifier,
    organizationName: cfg.organizationName,
    description: "Badge digitale Nexa HR",
    logoText: "Nexa HR",
    foregroundColor: "rgb(26, 31, 24)",
    backgroundColor: "rgb(236, 240, 243)",
    labelColor: "rgb(77, 82, 72)",
    generic: {
      primaryFields: [
        {
          key: "employee",
          label: "Dipendente",
          value: user.fullName
        }
      ],
      secondaryFields: [
        {
          key: "email",
          label: "Email",
          value: user.email
        }
      ],
      auxiliaryFields: [
        {
          key: "company",
          label: "Azienda",
          value: user.companyId
        }
      ]
    }
  };

  const pass = new PKPass(
    {
      "pass.json": Buffer.from(JSON.stringify(passJson), "utf8"),
      "icon.png": FALLBACK_ICON_PNG,
      "icon@2x.png": FALLBACK_ICON_PNG
    },
    {
      wwdr,
      signerCert,
      signerKey,
      signerKeyPassphrase: cfg.signerKeyPassphrase || undefined
    },
    {
      serialNumber: `${user.id.slice(0, 24)}-${nfcToken.slice(0, 8)}`,
      description: "Badge digitale Nexa HR"
    }
  );

  pass.setBarcodes({
    message: nfcToken,
    format: "PKBarcodeFormatQR",
    messageEncoding: "iso-8859-1"
  });

  return pass.getAsBuffer();
}
