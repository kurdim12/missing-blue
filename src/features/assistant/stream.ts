// SSE client for POST /api/assistant (server/assistant.ts). fetch + ReadableStream (EventSource cannot POST).
// Offline-safe: a network failure calls onEvent("error", ...) and resolves; it never throws into the screen.
import type { Bi } from "../../i18n";

export type AssistantSource = "live" | "recorded" | "unavailable";
export type Suggestion = { id: string; en: string; ar: string; recorded?: { en: boolean; ar: boolean } };
export type AssistantInfo = { live: boolean; model: string; tools: string[]; suggestions: Suggestion[]; recorded_label: Bi };
export type HistoryItem = { role: "user" | "assistant"; content: string };

export async function askStream(
  body: { question: string; lang: "en" | "ar"; suggestion_id?: string; history?: HistoryItem[]; mode?: "auto" | "recorded" },
  onEvent: (event: string, data: any) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (e) {
    if (signal?.aborted) return;
    onEvent("error", {
      message: {
        en: "Cannot reach the Missing Blue server (offline?). Start it with: npx tsx server/index.ts",
        ar: "تعذّر الوصول إلى خادم الأزرق المفقود (دون اتصال؟). شغّله بالأمر: npx tsx server/index.ts",
      },
    });
    return;
  }
  if (!res.ok || !res.body) {
    let msg: Bi = { en: `The server returned HTTP ${res.status}.`, ar: `أعاد الخادم الرمز HTTP ${res.status}.` };
    try {
      const j = await res.json();
      if (j?.message?.en) msg = j.message;
    } catch {
      /* keep the generic message */
    }
    onEvent("error", { message: msg });
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let cut: number;
      while ((cut = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        let event = "message";
        const data: string[] = [];
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
        }
        if (!data.length) continue;
        try {
          onEvent(event, JSON.parse(data.join("\n")));
        } catch {
          /* a torn event is skipped */
        }
      }
    }
  } catch {
    if (!signal?.aborted)
      onEvent("error", { message: { en: "The answer stream was interrupted.", ar: "انقطع بث الإجابة." } });
  }
}
