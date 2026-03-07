import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSetting, setSettings } from "@/lib/db/queries/settings";
import {
  getProviderSetting,
  saveProviderSetting,
} from "@/lib/db/queries/provider-settings";
import { listProviderModels } from "@/lib/llm/client";
import {
  buildExpiresAt,
  exchangeAnthropicCode,
} from "@/lib/provider-auth";

export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().min(1, "Authorization code is required"),
});

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

export async function POST(request: NextRequest) {
  const payload = bodySchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const rawCode = payload.data.code.trim();
  const hashIndex = rawCode.indexOf("#");

  if (hashIndex === -1) {
    return NextResponse.json(
      { error: "Invalid code format. Expected code#state from Anthropic." },
      { status: 400 }
    );
  }

  const authCode = rawCode.slice(0, hashIndex);
  const verifier = rawCode.slice(hashIndex + 1);

  if (!authCode || !verifier) {
    return NextResponse.json(
      { error: "Invalid code format. Both code and state must be present." },
      { status: 400 }
    );
  }

  try {
    const tokens = await exchangeAnthropicCode(authCode, verifier, verifier);
    const current = getProviderSetting("anthropic");

    saveProviderSetting({
      ...current,
      provider: "anthropic",
      auth_mode: "oauth",
      oauth_access_token: tokens.access_token,
      oauth_refresh_token: tokens.refresh_token ?? current.oauth_refresh_token,
      oauth_token_type: tokens.token_type ?? current.oauth_token_type,
      oauth_expires_at: buildExpiresAt(tokens.expires_in),
      oauth_connected_at: new Date().toISOString(),
    });

    const availableModels = (await listProviderModels("anthropic")).map(
      (model) => model.id
    );

    setSettings({
      llm_provider: "anthropic",
      llm_model: selectPreferredModel(
        availableModels,
        "claude-sonnet-4-20250514"
      ),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
