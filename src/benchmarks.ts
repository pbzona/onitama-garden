import * as THREE from 'three';
import type { Stage } from './render/scene.ts';
import './ui/benchmarks.css';

interface BenchmarkContext {
  stage: Stage;
  sand: THREE.Object3D;
}

interface SampleResult {
  name: string;
  description: string;
  cpuMeanMs: number;
  cpuP95Ms: number;
  gpuMeanMs: number | null;
  gpuP95Ms: number | null;
  theoreticalFps: number | null;
  deltaFromFull: number | null;
  pairedFullGpuMeanMs: number | null;
  frames: number;
}

interface BenchmarkReport {
  generatedAt: string;
  userAgent: string;
  gpu: string;
  timerQueries: boolean;
  quality: string;
  viewport: [number, number];
  drawingBuffer: [number, number];
  pixelRatio: number;
  shadowMap: [number, number];
  msaaSamples: number;
  measuredFrames: number;
  results: SampleResult[];
}

type TimerExtension = {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
};

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
};

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function mountBenchmarkSuite({ stage, sand }: BenchmarkContext) {
  document.body.classList.add('benchmark-mode');
  document.title = 'Onitama · Renderer Benchmarks';

  const renderer = stage.renderer;
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = debug
    ? String(gl.getParameter((debug as { UNMASKED_RENDERER_WEBGL: number }).UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
  const params = new URLSearchParams(location.search);
  const sandMesh = sand as THREE.Mesh;
  const sandMaterial = sandMesh.material;
  const flatSandMaterial = new THREE.MeshBasicMaterial({ color: 0xcfc1a2 });

  const root = document.createElement('main');
  root.id = 'benchmark-suite';
  root.innerHTML = `
    <section class="bench-shell">
      <header class="bench-head">
        <div>
          <div class="bench-eyebrow">Hidden diagnostic route</div>
          <h1>Renderer benchmarks</h1>
          <p>Measures this live garden with WebGL GPU timer queries. Results stay local unless you export them.</p>
        </div>
        <a class="bench-back" href="/">Return to game</a>
      </header>

      <section class="bench-meta" aria-label="Renderer configuration">
        <div><span>GPU</span><strong id="bench-gpu"></strong></div>
        <div><span>Buffer</span><strong id="bench-buffer"></strong></div>
        <div><span>Quality</span><strong id="bench-quality-label"></strong></div>
        <div><span>Shadows</span><strong id="bench-shadow"></strong></div>
        <div><span>MSAA</span><strong id="bench-msaa"></strong></div>
        <div><span>Timer queries</span><strong id="bench-timers"></strong></div>
      </section>

      <section class="bench-controls">
        <label>Quality
          <select id="bench-quality">
            <option value="high">High</option>
            <option value="low">Light</option>
          </select>
        </label>
        <label>Measured frames
          <select id="bench-frames">
            <option value="20">20 · quick</option>
            <option value="45" selected>45 · standard</option>
            <option value="90">90 · precise</option>
          </select>
        </label>
        <button id="bench-run" type="button">Run benchmark</button>
        <button id="bench-export" type="button" disabled>Export JSON</button>
      </section>

      <div class="bench-progress" aria-hidden="true"><span id="bench-progress-bar"></span></div>
      <p id="bench-status" class="bench-status">Ready. Keep this tab visible while the suite runs.</p>

      <section class="bench-results" aria-live="polite">
        <table>
          <thead><tr><th>Case</th><th>GPU mean</th><th>GPU p95</th><th>CPU submit</th><th>GPU ceiling</th><th>vs full</th></tr></thead>
          <tbody id="bench-results-body"><tr><td colspan="6" class="bench-empty">No results yet</td></tr></tbody>
        </table>
      </section>

      <details class="bench-json">
        <summary>Raw report</summary>
        <pre id="bench-raw">Run the suite to generate a report.</pre>
      </details>
      <p class="bench-note">“GPU ceiling” is 1000 ÷ mean GPU milliseconds and excludes display synchronization. Each pass delta uses interleaved full-frame controls to limit GPU clock and thermal bias; deltas are diagnostic estimates, not additive totals.</p>
    </section>`;
  document.body.appendChild(root);

  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
  $('bench-gpu').textContent = gpu;
  $('bench-buffer').textContent = `${buffer.x} × ${buffer.y} @ ${renderer.getPixelRatio().toFixed(2)} DPR`;
  $('bench-quality-label').textContent = stage.quality === 'high' ? 'High' : 'Light';
  $('bench-shadow').textContent = `${stage.sun.shadow.mapSize.x}²`;
  $('bench-msaa').textContent = `${stage.composer.renderTarget1.samples}×`;
  $('bench-timers').textContent = timer ? 'Available' : 'Unavailable';

  const qualitySelect = $('bench-quality') as HTMLSelectElement;
  qualitySelect.value = stage.quality;
  qualitySelect.addEventListener('change', () => {
    const next = new URL(location.href);
    next.searchParams.set('quality', qualitySelect.value);
    location.href = next.toString();
  });

  let latest: BenchmarkReport | null = null;
  let running = false;

  const setCaseDefaults = () => {
    stage.bloom.enabled = true;
    stage.grade.enabled = true;
    renderer.shadowMap.enabled = true;
    sandMesh.visible = true;
    sandMesh.material = sandMaterial;
  };

  const renderFrame = async (time: number, refreshShadows: boolean) => {
    let query: WebGLQuery | null = null;
    if (timer) {
      query = gl.createQuery();
      if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
    }
    const started = performance.now();
    stage.render(time, refreshShadows);
    const cpuMs = performance.now() - started;
    if (query && timer) gl.endQuery(timer.TIME_ELAPSED_EXT);

    let gpuMs: number | null = null;
    if (query && timer) {
      while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) await nextTask();
      if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) gpuMs = Number(gl.getQueryParameter(query, gl.QUERY_RESULT)) / 1e6;
      gl.deleteQuery(query);
    }
    return { cpuMs, gpuMs };
  };

  const cases = [
    {
      name: 'Full frame',
      description: 'Complete scene with cached directional shadows',
      setup: () => {},
      refreshShadows: false,
    },
    {
      name: 'Shadow refresh',
      description: 'Complete scene while rebuilding the directional shadow map',
      setup: () => {},
      refreshShadows: true,
    },
    {
      name: 'No bloom',
      description: 'Full scene with UnrealBloomPass disabled',
      setup: () => (stage.bloom.enabled = false),
      refreshShadows: false,
    },
    {
      name: 'No grading',
      description: 'Full scene without split tone, vignette, and grain',
      setup: () => (stage.grade.enabled = false),
      refreshShadows: false,
    },
    {
      name: 'Flat sand',
      description: 'Preserves sand coverage while replacing its procedural shader',
      setup: () => (sandMesh.material = flatSandMaterial),
      refreshShadows: false,
    },
    {
      name: 'No post effects',
      description: 'Scene and output conversion without bloom or grading',
      setup: () => {
        stage.bloom.enabled = false;
        stage.grade.enabled = false;
      },
      refreshShadows: false,
    },
  ];

  const run = async () => {
    if (running) return latest;
    running = true;
    const runButton = $('bench-run') as HTMLButtonElement;
    const exportButton = $('bench-export') as HTMLButtonElement;
    const status = $('bench-status');
    const progress = $('bench-progress-bar');
    const rows = $('bench-results-body');
    const frames = Number(($('bench-frames') as HTMLSelectElement).value);
    runButton.disabled = true;
    exportButton.disabled = true;
    qualitySelect.disabled = true;
    rows.innerHTML = '';
    latest = null;

    const results: SampleResult[] = [];
    try {
      for (let caseIndex = 0; caseIndex < cases.length; caseIndex++) {
        const test = cases[caseIndex];
        setCaseDefaults();
        test.setup();
        status.textContent = `Warming up: ${test.name}…`;
        for (let i = 0; i < 4; i++) await renderFrame(i / 60, test.refreshShadows);

        const cpu: number[] = [];
        const gpuSamples: number[] = [];
        const pairedFullGpu: number[] = [];
        for (let frame = 0; frame < frames; frame++) {
          status.textContent = `Measuring ${test.name}: ${frame + 1} / ${frames}`;
          progress.style.width = `${((caseIndex + (frame + 1) / frames) / cases.length) * 100}%`;
          // Interleave a full-frame control before every variant sample. GPU
          // clock scaling and thermals otherwise make sequential pass deltas
          // misleading, especially on power-efficient laptop GPUs.
          if (caseIndex > 0) {
            setCaseDefaults();
            const control = await renderFrame((frame + 4) / 60, false);
            if (control.gpuMs !== null) pairedFullGpu.push(control.gpuMs);
            test.setup();
          }
          const sample = await renderFrame((frame + 4) / 60, test.refreshShadows);
          cpu.push(sample.cpuMs);
          if (sample.gpuMs !== null) gpuSamples.push(sample.gpuMs);
        }

        const gpuMeanMs = gpuSamples.length ? mean(gpuSamples) : null;
        const pairedFullGpuMeanMs = pairedFullGpu.length ? mean(pairedFullGpu) : gpuMeanMs;
        const result: SampleResult = {
          name: test.name,
          description: test.description,
          cpuMeanMs: mean(cpu),
          cpuP95Ms: percentile(cpu, 0.95),
          gpuMeanMs,
          gpuP95Ms: gpuSamples.length ? percentile(gpuSamples, 0.95) : null,
          theoreticalFps: gpuMeanMs ? 1000 / gpuMeanMs : null,
          deltaFromFull: null,
          pairedFullGpuMeanMs,
          frames,
        };
        if (pairedFullGpuMeanMs && gpuMeanMs && test.name !== 'Full frame')
          result.deltaFromFull = ((gpuMeanMs - pairedFullGpuMeanMs) / pairedFullGpuMeanMs) * 100;
        results.push(result);
        rows.appendChild(resultRow(result));
      }

      setCaseDefaults();
      stage.render(0, false);
      latest = {
        generatedAt: new Date().toISOString(),
        userAgent: navigator.userAgent,
        gpu,
        timerQueries: !!timer,
        quality: stage.quality,
        viewport: [innerWidth, innerHeight],
        drawingBuffer: [buffer.x, buffer.y],
        pixelRatio: renderer.getPixelRatio(),
        shadowMap: [stage.sun.shadow.mapSize.x, stage.sun.shadow.mapSize.y],
        msaaSamples: stage.composer.renderTarget1.samples,
        measuredFrames: frames,
        results,
      };
      $('bench-raw').textContent = JSON.stringify(latest, null, 2);
      status.textContent = `Complete: ${cases.length * frames} measured frames across ${cases.length} cases.`;
      exportButton.disabled = false;
      return latest;
    } catch (error) {
      setCaseDefaults();
      status.textContent = `Benchmark failed: ${error instanceof Error ? error.message : String(error)}`;
      throw error;
    } finally {
      running = false;
      runButton.disabled = false;
      qualitySelect.disabled = false;
    }
  };

  const resultRow = (result: SampleResult) => {
    const tr = document.createElement('tr');
    const gpuMean = result.gpuMeanMs === null ? 'n/a' : `${result.gpuMeanMs.toFixed(2)} ms`;
    const gpuP95 = result.gpuP95Ms === null ? 'n/a' : `${result.gpuP95Ms.toFixed(2)} ms`;
    const ceiling = result.theoreticalFps === null ? 'n/a' : `${result.theoreticalFps.toFixed(1)} FPS`;
    const delta = result.deltaFromFull === null ? 'baseline' : `${result.deltaFromFull > 0 ? '+' : ''}${result.deltaFromFull.toFixed(1)}%`;
    tr.innerHTML = `<td><strong>${result.name}</strong><span>${result.description}</span></td><td>${gpuMean}</td><td>${gpuP95}</td><td>${result.cpuMeanMs.toFixed(2)} ms</td><td>${ceiling}</td><td>${delta}</td>`;
    return tr;
  };

  $('bench-run').addEventListener('click', () => void run());
  $('bench-export').addEventListener('click', () => {
    if (!latest) return;
    const blob = new Blob([JSON.stringify(latest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `onitama-benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  });

  (window as unknown as { __benchmark: { run: typeof run; latest: () => BenchmarkReport | null } }).__benchmark = {
    run,
    latest: () => latest,
  };

  setCaseDefaults();
  stage.render(0, true);
  if (params.get('autorun') === '1') void run();
}
