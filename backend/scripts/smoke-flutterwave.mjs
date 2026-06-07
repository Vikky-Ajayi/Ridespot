import axios from "axios";
import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const OAUTH_URL =
  "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";
const V4_BASE_URLS = {
  live: "https://f4bexperience.flutterwave.com",
  test: "https://developersandbox-api.flutterwave.com"
};

function secretAvailable(name) {
  return Boolean(process.env[name] && process.env[name].trim());
}

function providerError(error) {
  if (!axios.isAxiosError(error)) {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  return {
    status: error.response?.status ?? null,
    code: error.code ?? null,
    message:
      error.response?.data?.message ??
      error.response?.data?.error_description ??
      error.response?.data?.error ??
      error.message
  };
}

async function smokeOAuth() {
  if (!secretAvailable("FLUTTERWAVE_CLIENT_ID") || !secretAvailable("FLUTTERWAVE_CLIENT_SECRET")) {
    return { configured: false };
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.FLUTTERWAVE_CLIENT_ID,
    client_secret: process.env.FLUTTERWAVE_CLIENT_SECRET
  });

  const response = await axios.post(OAUTH_URL, body, {
    headers: { "content-type": "application/x-www-form-urlencoded" },
    timeout: 15000
  });

  return {
    configured: true,
    ok: Boolean(response.data?.access_token),
    accessToken: response.data?.access_token,
    tokenType: response.data?.token_type ?? null,
    expiresIn: response.data?.expires_in ?? null
  };
}

async function smokeV4DirectCharge(accessToken) {
  if (!accessToken) {
    return { configured: false, reason: "OAuth did not return an access token" };
  }

  const envName = process.env.FLUTTERWAVE_ENV === "test" ? "test" : "live";
  const baseUrl = V4_BASE_URLS[envName];
  const reference = `rsv4smoke${Date.now()}`;
  const paymentMethod = process.env.FLUTTERWAVE_PAYMENT_METHOD?.trim() || "opay";
  const response = await axios.post(
    `${baseUrl}/orchestration/direct-charges`,
    {
      amount: 100,
      currency: "NGN",
      reference,
      redirect_url: process.env.PAYMENT_SUCCESS_URL || "https://heyzono.com/app/profile",
      customer: {
        email: "smoke-test@heyzono.com",
        name: {
          first: "RideSpot",
          last: "Smoke"
        },
        phone: {
          country_code: "234",
          number: "8012345678"
        }
      },
      payment_method: {
        type: paymentMethod
      },
      meta: {
        smokeTest: true
      }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Trace-Id": reference,
        "X-Idempotency-Key": reference
      },
      timeout: 15000
    }
  );

  const redirectUrl = response.data?.data?.next_action?.redirect_url?.url;
  return {
    configured: true,
    ok: Boolean(redirectUrl),
    environment: envName,
    baseHost: new URL(baseUrl).host,
    paymentMethod,
    reference,
    providerCheckoutId: response.data?.data?.id ? String(response.data.data.id) : null,
    redirectHost: redirectUrl ? new URL(redirectUrl).host : null,
    status: response.data?.data?.status ?? null
  };
}

async function main() {
  const result = {
    timestamp: new Date().toISOString(),
    oauth: null,
    v4DirectCharge: null
  };

  try {
    const oauth = await smokeOAuth();
    result.oauth = { ...oauth, accessToken: undefined };
    result.v4DirectCharge = await smokeV4DirectCharge(oauth.accessToken);
  } catch (error) {
    if (!result.oauth) {
      result.oauth = { configured: true, ok: false, error: providerError(error) };
    } else {
      result.v4DirectCharge = { configured: true, ok: false, error: providerError(error) };
    }
  }

  console.log(JSON.stringify(result, null, 2));

  if (result.oauth?.configured && result.oauth.ok === false) {
    process.exitCode = 1;
  }

  if (result.v4DirectCharge?.configured && result.v4DirectCharge.ok === false) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: providerError(error) }, null, 2));
  process.exitCode = 1;
});
