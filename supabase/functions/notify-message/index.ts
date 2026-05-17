import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SERVICE_ACCOUNT = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT") ?? "{}");
const FCM_PROJECT_ID = SERVICE_ACCOUNT.project_id as string;

// ── Generate OAuth2 access token from Firebase service account ──────────────
async function getFCMAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encode = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const header  = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss:   SERVICE_ACCOUNT.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud:   "https://oauth2.googleapis.com/token",
    iat:   now,
    exp:   now + 3600,
  };

  const signingInput = `${encode(header)}.${encode(payload)}`;

  const pemKey = SERVICE_ACCOUNT.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const keyBytes = Uint8Array.from(atob(pemKey), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${signingInput}.${sigB64}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const { access_token } = await resp.json();
  return access_token as string;
}

// ── Send FCM notification via v1 API ────────────────────────────────────────
async function sendFCM(token: string, title: string, body: string, data: Record<string, string>) {
  const accessToken = await getFCMAccessToken();
  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data,
          android: {
            priority: "high",
            notification: {
              channel_id: "messages",
              click_action: "FLUTTER_NOTIFICATION_CLICK",
            },
          },
        },
      }),
    },
  );
  return resp.json();
}

// ── Edge Function handler ────────────────────────────────────────────────────
serve(async (req) => {
  try {
    if (!SERVICE_ACCOUNT?.client_email || !SERVICE_ACCOUNT?.private_key) {
      console.error("FIREBASE_SERVICE_ACCOUNT secret is missing or invalid JSON");
      return new Response("misconfigured", { status: 500 });
    }

    const payload = await req.json();
    const record = payload.record ?? payload;
    console.log("record fields:", Object.keys(record).join(", "));
    console.log("sender_id:", record.sender_id, "receiver_id:", record.receiver_id, "group_id:", record.group_id);

    const isGroup = !!record.group_id;
    const recipientId: string = isGroup ? null : record.receiver_id;

    if (!recipientId && !isGroup) {
      return new Response("no recipient", { status: 200 });
    }

    if (!record.sender_id) {
      console.error("sender_id missing from record");
      return new Response("no sender_id", { status: 200 });
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get sender display name
    const { data: sender, error: senderErr } = await db
      .from("profiles")
      .select("full_name, username")
      .eq("id", record.sender_id)
      .maybeSingle();
    if (senderErr) console.error("profiles query error:", senderErr.message);
    console.log("sender row:", JSON.stringify(sender));
    const senderName = sender?.full_name || sender?.username || "Unknown";

    let title = senderName;
    let body  = record.content || (record.image_url ? "📷 Photo" : "");
    let route = "/chat";
    let targetId = recipientId;
    let targetName = senderName;

    let tokenRows: { token: string }[] = [];

    if (!isGroup) {
      // DM: notify recipient
      const { data } = await db
        .from("push_tokens")
        .select("token")
        .eq("user_id", recipientId);
      tokenRows = data ?? [];
    } else {
      // Group message: notify all members except sender
      const groupId = record.group_id;

      const { data: group, error: groupErr } = await db
        .from("groups")
        .select("name")
        .eq("id", groupId)
        .maybeSingle();
      if (groupErr) console.error("groups query error:", groupErr.message);
      console.log("group row:", JSON.stringify(group));

      title      = group?.name || "Group";
      body       = `${senderName}: ${body}`;
      route      = "/group-chat";
      targetId   = groupId;
      targetName = group?.name || "";

      const { data: members } = await db
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId)
        .neq("user_id", record.sender_id);

      const memberIds = (members ?? []).map((m: any) => m.user_id);
      if (memberIds.length === 0) {
        return new Response("no members", { status: 200 });
      }

      const { data } = await db
        .from("push_tokens")
        .select("token")
        .in("user_id", memberIds);
      tokenRows = data ?? [];
    }

    if (tokenRows.length === 0) {
      return new Response("no push tokens", { status: 200 });
    }

    const data = { route, targetId, targetName };
    // Send in parallel
    await Promise.allSettled(
      tokenRows.map((row) =>
        sendFCM(row.token, title, body, data as Record<string, string>)
      ),
    );

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 });
  }
});
