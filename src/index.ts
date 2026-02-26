import type { Sandbox } from "@cloudflare/sandbox";

import { ReproAgent } from "./repro-agent";

export { Sandbox } from "@cloudflare/sandbox";
export { ReproAgent } from "./repro-agent";

interface Env {
  Sandbox: DurableObjectNamespace<Sandbox>;
  ReproAgent: DurableObjectNamespace<ReproAgent>;
  WORKSPACE_REPO: R2Bucket;
  CLOUDFLARE_R2_ENDPOINT?: string;
  CLOUDFLARE_R2_ACCESS_KEY_ID?: string;
  CLOUDFLARE_R2_SECRET_ACCESS_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname.startsWith("/do/")) {
        return await handleDoRequest(env, url.pathname);
      }

      return new Response(
        JSON.stringify({
          name: "sandbox-repro",
          description:
            "Repro of Sandbox writeFile startup failures via Durable Object flow",
          endpoints: {
            "/do/init": "GET - Initialize sandbox (from Durable Object)",
            "/do/write": "GET - Write file (from Durable Object)",
            "/do/exec": "GET - Execute command (from Durable Object)",
            "/do/minio-check": "GET - Check MinIO access from sandbox via rclone",
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      console.error("Error in worker:", {
        pathname: url.pathname,
        error: errorMessage,
        stack: errorStack,
      });

      return new Response(
        JSON.stringify({
          error: errorMessage,
          stack: errorStack,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};

async function handleDoRequest(env: Env, pathname: string): Promise<Response> {
  const doId = env.ReproAgent.idFromName("repro-agent-singleton");
  const doStub = env.ReproAgent.get(doId);

  if (pathname === "/do/init") {
    const result = await doStub.init();
    return new Response(
      JSON.stringify({
        success: true,
        message: "Sandbox initialized via Durable Object",
        mode: "durable-object",
        ...result,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  if (pathname === "/do/write") {
    const result = await doStub.writeFile();
    return new Response(
      JSON.stringify({
        message: "File written via Durable Object",
        mode: "durable-object",
        ...result,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  if (pathname === "/do/exec") {
    const result = await doStub.exec("echo 'hello from sandbox via DO'");
    return new Response(
      JSON.stringify({
        message: "Command executed via Durable Object",
        mode: "durable-object",
        ...result,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  if (pathname === "/do/minio-check") {
    const result = await doStub.minioRcloneCheck();
    return new Response(
      JSON.stringify(
        {
          message: "MinIO check via rclone from Durable Object",
          mode: "durable-object",
          ...result,
        },
        null,
        2,
      ),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      error: "Unknown DO endpoint",
      availableEndpoints: ["/do/init", "/do/write", "/do/exec", "/do/minio-check"],
    }),
    { status: 404, headers: { "Content-Type": "application/json" } },
  );
}
