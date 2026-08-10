import OpenAI from "openai";
import { z } from "zod";
import { requireApiFeature } from "@/lib/tenant";

const chatRequestSchema = z.object({ message: z.string().trim().min(1).max(2_000) });

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  return new OpenAI({ apiKey });
}

export async function POST(req: Request) {
  try {
    const { user, response } = await requireApiFeature("ai_coach");
    if (!user) return response;
    const { message } = chatRequestSchema.parse(await req.json());

    const completion = await getClient().chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "user",
          content: message,
        },
      ],
    });

    return Response.json({
      reply: completion.choices[0].message.content,
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: error instanceof z.ZodError ? "Invalid message." : "Something went wrong" },
      { status: 500 }
    );
  }
}
