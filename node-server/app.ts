import {
  convertToModelMessages,
  generateObject,
  generateText,
  smoothStream,
  stepCountIs,
  streamObject,
  streamText,
  tool,
  UIMessage,
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import dotenv from "dotenv";
import {
  createEventStream,
  defineHandler,
  defineMiddleware,
  H3,
  handleCors,
  readBody,
  readValidatedBody,
  serve,
} from "h3";
import { z } from "zod";

// env
dotenv.config();

// bigModel model
const bigModel = createOpenAICompatible({
  name: "bigModel",
  baseURL: "https://open.bigmodel.cn/api/paas/v4/",
  apiKey: process.env.BIG_MODEL_API_KEY,
  includeUsage: true,
});

// hunyuan model
const hunyuan = createOpenAICompatible({
  name: "hunyuan",
  baseURL: "https://api.hunyuan.cloud.tencent.com/v1",
  apiKey: process.env.OPENAI_API_KEY,
  includeUsage: true,
});

const app = new H3();

// middleware for /chat
app.use(
  "/*",
  defineMiddleware((event, next) => {
    // cors
    const corsRes = handleCors(event, {
      origin: "*",
      preflight: {
        statusCode: 204,
      },
      methods: "*",
    });
    if (corsRes !== false) return corsRes;
    next();
  })
);

// routes
app.post(
  "/chat",
  defineHandler(async (event) => {
    // ai sdk
    const body: { messages: UIMessage[] } | undefined = await readBody(event);
    const messages = body?.messages ?? [];
    const result = streamText({
      // model: hunyuan("hunyuan-turbos-latest"),
      model: bigModel("glm-4.5-flash"),
      // providerOptions: { hunyuan: { stream: true } },
      system: `
You are a helpful writer. You should generate an article according to user's need.
Important:
- You should first generate outline.
- Then call askForConfirmation tool to ask user to confirm.
- Second, generate draft.
- Then call askForConfirmation tool to ask user to confirm.
- Finally, generate final article.
`,
      messages: convertToModelMessages(messages),
      stopWhen: stepCountIs(100),
      tools: {
        // server-side tool with execute function:
        generateOutline: tool({
          description: `
Generate an outline for the blog.
Important:
- After generate outline, you should call askForConfirmation tool to ask user to confirm.
`,
          inputSchema: z.object({
            title: z.string().describe("The title of the blog."),
            tone: z
              .string()
              .describe(
                "The tone of the blog, e.g. professional, casual, humorous."
              )
              .default("casual"),
          }),
          outputSchema: z.object({
            outline: z.string().describe("The outline of the blog."),
          }),
          async *execute({ title, tone }) {
            const res = streamText({
              model: hunyuan("hunyuan-lite"),
              prompt: `
Generate an outline for a blog with the title "${title}" and the tone "${tone}".
Important:
- The outline should have 2 to 3 points.
- Return the outline by bullet points.
- Keep the outline concise and brief.
`,
            });
            let outline = "";
            for await (const s of res.textStream) {
              outline += s;
              yield { status: "loading" as const, text: s, outline };
            }
            yield { status: "success" as const, outline };
          },
        }),
        generateDraft: tool({
          description: `
Generate a draft for the blog.
Important:
- After generate draft, you should call askForConfirmation tool to ask user to confirm.
`,
          inputSchema: z.object({
            outline: z
              .string()
              .describe("The outline bullet points of the blog."),
            title: z.string().describe("The title of the blog."),
            tone: z
              .string()
              .describe(
                "The tone of the blog, e.g. professional, casual, humorous."
              )
              .default("casual"),
          }),
          outputSchema: z.object({
            draft: z
              .string()
              .min(0)
              .max(200)
              .describe("The draft of the blog."),
          }),
          async *execute({ outline, title, tone }) {
            const res = streamText({
              model: hunyuan("hunyuan-lite"),
              prompt: `
Generate an article draft about ${title} in ${tone} tone with the following outline.
Important:
- The article should be around 200 words.
- Do not use bullet points.
Outline:
${outline}
`,
            });
            let draft = "";
            for await (const s of res.textStream) {
              draft += s;
              yield { status: "loading" as const, text: s, draft };
            }
            yield { status: "success" as const, draft };
          },
        }),
        // client-side tool
        askForConfirmation: tool({
          description: `
Ask user for confirmation after calling tool.
`,
          inputSchema: z.object({}),
        }),
        showFinalAnswer: tool({
          description: `
Show final answer to user.
`,
          inputSchema: z.object({
            message: z.string(),
          }),
        }),
      },
    });
    return result.toUIMessageStreamResponse();
  })
);

serve(app, { port: 3000 });
