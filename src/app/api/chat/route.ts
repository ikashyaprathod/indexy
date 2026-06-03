import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
    try {
        const { messages } = await req.json();

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return Response.json({ error: "Messages are required" }, { status: 400 });
        }

        const response = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 2048,
            system: "You are a helpful AI assistant on Indexy — a Google index checking tool. Be concise and friendly.",
            messages: messages.map((m: { role: string; content: string }) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
            })),
        });

        const text = response.content
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("");

        return Response.json({ reply: text });
    } catch (err: unknown) {
        console.error("Chat API error:", err);
        const message = err instanceof Error ? err.message : "Chat failed";
        return Response.json({ error: message }, { status: 500 });
    }
}
