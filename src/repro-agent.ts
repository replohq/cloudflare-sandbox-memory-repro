import type { Sandbox } from "@cloudflare/sandbox";

import { DurableObject } from "cloudflare:workers";

import { getSandbox } from "@cloudflare/sandbox";

interface Env {
  Sandbox: DurableObjectNamespace<Sandbox>;
  CLOUDFLARE_R2_ACCESS_KEY_ID?: string;
  CLOUDFLARE_R2_SECRET_ACCESS_KEY?: string;
  CLOUDFLARE_R2_ENDPOINT?: string;
}

export class ReproAgent extends DurableObject<Env> {
  private sandbox: ReturnType<typeof getSandbox> | null = null;
  private sandboxId: string;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.sandboxId = `repro-sandbox-${this.ctx.id.toString().slice(0, 8)}`;
  }

  async init(): Promise<{ sandboxId: string }> {
    console.log("[ReproAgent] Getting sandbox...", { sandboxId: this.sandboxId });

    this.sandbox = getSandbox(this.env.Sandbox, this.sandboxId);

    console.log("[ReproAgent] Sandbox obtained successfully", {
      sandboxId: this.sandboxId,
    });

    return { sandboxId: this.sandboxId };
  }

  async writeFile(): Promise<{ success: boolean; sandboxId: string }> {
    if (!this.sandbox) {
      this.sandbox = getSandbox(this.env.Sandbox, this.sandboxId);
    }

    console.log("[ReproAgent] Writing file to sandbox...", {
      sandboxId: this.sandboxId,
    });

    const configContent = JSON.stringify(
      {
        test: true,
        timestamp: Date.now(),
        sandboxId: this.sandboxId,
      },
      null,
      2,
    );

    await this.sandbox.writeFile("/test-config.json", configContent);

    console.log("[ReproAgent] File written successfully", {
      sandboxId: this.sandboxId,
    });

    return { success: true, sandboxId: this.sandboxId };
  }

  async exec(
    command: string,
  ): Promise<{
    success: boolean;
    sandboxId: string;
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    if (!this.sandbox) {
      this.sandbox = getSandbox(this.env.Sandbox, this.sandboxId);
    }

    console.log("[ReproAgent] Executing command...", {
      sandboxId: this.sandboxId,
      command,
    });

    const result = await this.sandbox.exec(command);

    console.log("[ReproAgent] Command executed", {
      sandboxId: this.sandboxId,
      exitCode: result.exitCode,
    });

    return {
      success: result.success,
      sandboxId: this.sandboxId,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  async minioRcloneCheck(): Promise<{
    success: boolean;
    sandboxId: string;
    bucket: string;
    endpoint: string;
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    if (!this.sandbox) {
      this.sandbox = getSandbox(this.env.Sandbox, this.sandboxId);
    }

    const endpoint =
      this.env.CLOUDFLARE_R2_ENDPOINT ?? "http://host.docker.internal:9000";
    const accessKey = this.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? "minioadmin";
    const secretKey = this.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? "minioadmin";
    const bucket = "agent-repos";

    const result = await this.sandbox.exec(
      `rclone lsf "r2:${bucket}" --max-depth 1`,
      {
        timeout: 20_000,
        env: {
          RCLONE_CONFIG_R2_TYPE: "s3",
          RCLONE_CONFIG_R2_PROVIDER: "Minio",
          RCLONE_CONFIG_R2_ACCESS_KEY_ID: accessKey,
          RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: secretKey,
          RCLONE_CONFIG_R2_ENDPOINT: endpoint,
          RCLONE_CONFIG_R2_FORCE_PATH_STYLE: "true",
        },
      },
    );

    return {
      success: result.success,
      sandboxId: this.sandboxId,
      bucket,
      endpoint,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  async exists(path: string): Promise<{ exists: boolean; sandboxId: string }> {
    if (!this.sandbox) {
      this.sandbox = getSandbox(this.env.Sandbox, this.sandboxId);
    }

    console.log("[ReproAgent] Checking file existence...", {
      sandboxId: this.sandboxId,
      path,
    });

    const result = await this.sandbox.exists(path);

    console.log("[ReproAgent] File existence check complete", {
      sandboxId: this.sandboxId,
      path,
      exists: result.exists,
    });

    return { exists: result.exists, sandboxId: this.sandboxId };
  }
}
