import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { getSetting, setSettings } from "@/lib/db/queries/settings";
import {
  getProviderSetting,
  saveProviderSetting,
} from "@/lib/db/queries/provider-settings";
import { listProviderModels } from "@/lib/llm/client";
import {
  buildExpiresAt,
  buildOpenAIAuthorizeUrl,
  createPkcePair,
  exchangeOpenAICode,
  exchangeOpenAITokenForApiKey,
} from "@/lib/provider-auth";

const CALLBACK_PORT = 1455;
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_OPENAI_API_MODEL = "gpt-4o-mini";
const DEFAULT_OPENAI_OAUTH_MODEL = "gpt-5.3-codex";

interface OAuthFlowState {
  status: "pending" | "complete" | "error";
  error?: string;
  authorizeUrl?: string;
}

let callbackServer: Server | null = null;
let flowState: OAuthFlowState = { status: "pending" };
let cleanupTimer: NodeJS.Timeout | null = null;

function cleanup() {
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }

  if (callbackServer) {
    callbackServer.close();
    callbackServer = null;
  }
}

function selectPreferredModel(
  availableModels: string[],
  fallbackModel: string
): string {
  const currentModel = (getSetting("llm_model") || "").trim();

  if (currentModel && availableModels.includes(currentModel)) {
    return currentModel;
  }

  if (availableModels.includes(fallbackModel)) {
    return fallbackModel;
  }

  return availableModels[0] || fallbackModel;
}

async function persistOpenAIConnection(
  verifier: string,
  code: string
): Promise<void> {
  const tokens = await exchangeOpenAICode(code, verifier);
  const current = getProviderSetting("openai");
  const connectedAt = new Date().toISOString();

  let apiKey = current.api_key;
  let preferredModel = DEFAULT_OPENAI_OAUTH_MODEL;

  if (tokens.id_token) {
    try {
      apiKey = await exchangeOpenAITokenForApiKey(tokens.id_token);
      preferredModel = DEFAULT_OPENAI_API_MODEL;
    } catch {
      // Users without a Platform org fall back to ChatGPT backend mode.
    }
  }

  saveProviderSetting({
    ...current,
    provider: "openai",
    auth_mode: "oauth",
    api_key: apiKey,
    oauth_access_token: tokens.access_token,
    oauth_refresh_token: tokens.refresh_token ?? current.oauth_refresh_token,
    oauth_id_token: tokens.id_token ?? current.oauth_id_token,
    oauth_token_type: tokens.token_type ?? current.oauth_token_type,
    oauth_expires_at: buildExpiresAt(tokens.expires_in),
    oauth_connected_at: connectedAt,
  });

  const availableModels = (await listProviderModels("openai")).map(
    (model) => model.id
  );

  setSettings({
    llm_provider: "openai",
    llm_model: selectPreferredModel(availableModels, preferredModel),
  });
}

export function getOpenAIOAuthStatus(): OAuthFlowState {
  return { ...flowState };
}

export async function startOpenAIOAuthFlow(): Promise<string> {
  if (callbackServer) {
    cleanup();
  }

  flowState = { status: "pending" };

  const { verifier, challenge } = createPkcePair();
  const state = verifier;
  const authorizeUrl = buildOpenAIAuthorizeUrl(state, challenge);

  return new Promise<string>((resolve, reject) => {
    const server = createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || "/", `http://localhost:${CALLBACK_PORT}`);

        if (url.pathname !== "/auth/callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          flowState = { status: "error", error };
          res.writeHead(200, { "content-type": "text/html" });
          res.end(errorPage(error));
          setTimeout(cleanup, 1000);
          return;
        }

        if (!code) {
          flowState = {
            status: "error",
            error: "No authorization code received",
          };
          res.writeHead(200, { "content-type": "text/html" });
          res.end(errorPage("No authorization code received"));
          setTimeout(cleanup, 1000);
          return;
        }

        try {
          await persistOpenAIConnection(verifier, code);
          flowState = { status: "complete" };
          res.writeHead(200, { "content-type": "text/html" });
          res.end(successPage());
        } catch (oauthError) {
          const message =
            oauthError instanceof Error
              ? oauthError.message
              : String(oauthError);
          flowState = { status: "error", error: message };
          res.writeHead(200, { "content-type": "text/html" });
          res.end(errorPage(message));
        }

        setTimeout(cleanup, 1000);
      }
    );

    server.listen(CALLBACK_PORT, () => {
      callbackServer = server;
      flowState = { status: "pending", authorizeUrl };
      cleanupTimer = setTimeout(() => {
        flowState = {
          status: "error",
          error: "OAuth callback timed out (5 minutes)",
        };
        cleanup();
      }, CALLBACK_TIMEOUT_MS);
      resolve(authorizeUrl);
    });

    server.on("error", (error) => {
      cleanup();
      reject(error);
    });
  });
}

const pageStyle = `
  font-family: system-ui, -apple-system, sans-serif;
  display: flex; align-items: center; justify-content: center;
  height: 100vh; margin: 0; background: #0a0a0a; color: #fafafa;
`;

function successPage(): string {
  return `<!DOCTYPE html><html><body style="${pageStyle}">
    <div style="text-align:center">
      <div style="font-size:48px;margin-bottom:16px">&#10003;</div>
      <h1 style="margin:0 0 8px">Authentication Successful</h1>
      <p style="color:#888">You can close this tab and return to Trawl.</p>
    </div>
  </body></html>`;
}

function errorPage(error: string): string {
  return `<!DOCTYPE html><html><body style="${pageStyle}">
    <div style="text-align:center">
      <div style="font-size:48px;margin-bottom:16px">&#10007;</div>
      <h1 style="margin:0 0 8px">Authentication Failed</h1>
      <p style="color:#f87171">${error}</p>
      <p style="color:#888;margin-top:16px">You can close this tab and try again.</p>
    </div>
  </body></html>`;
}
