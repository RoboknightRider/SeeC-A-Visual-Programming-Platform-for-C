
export interface CompilerResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

declare global {
  interface Window {
    TCC?: any;
  }
}

class TCCCompiler {
  private tcc: any = null;
  private scriptLoaded = false;

  private async loadScript(): Promise<void> {
    if (this.scriptLoaded) return;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/gh/jprendes/tcc-wasm@master/dist/tcc.js';
      script.onload = () => {
        this.scriptLoaded = true;
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async compileAndRun(code: string): Promise<CompilerResult> {
    await this.loadScript();

    if (!window.TCC) {
      throw new Error('TCC failed to initialize from CDN');
    }

    // Initialize TCC if not already done
    if (!this.tcc) {
      this.tcc = await window.TCC();
    }

    let stdout = '';
    let stderr = '';

    // Set up output redirection
    this.tcc.print = (text: string) => { stdout += text + '\n'; };
    this.tcc.printErr = (text: string) => { stderr += text + '\n'; };

    try {
      // Create a virtual file
      this.tcc.FS.writeFile('main.c', code);

      // Compile and run
      // The specific API might vary, but usually it's something like this:
      const exitCode = this.tcc.callMain(['main.c']);

      return {
        stdout,
        stderr,
        exitCode: exitCode || 0
      };
    } catch (e) {
      return {
        stdout,
        stderr: stderr + (e instanceof Error ? e.message : String(e)),
        exitCode: 1
      };
    }
  }
}

export const compiler = new TCCCompiler();
