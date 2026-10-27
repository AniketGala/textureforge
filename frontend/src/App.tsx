import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteProject, getProject, listPresets, listProjects,
  type Preset, type Project
} from "./lib/api";
import {
  createDemoFrame, processImage, randomizeEffects,
  type EffectConfig, type EffectType, type ImageFrame
} from "./lib/imageEngine";
import { decodeImage, downloadPng, paintFrame } from "./lib/imageIo";
import { deleteProjectImage, getProjectImage, saveProjectImage, type StoredProjectImage } from "./lib/projectImages";
import { ProjectSaveRecoveryError } from "./lib/projectSaveErrors";
import { saveProjectWorkflow } from "./lib/saveWorkflow";

const effectInfo: Record<EffectType, { title: string; controls: { key: "amount" | "scale"; label: string; min: number; max: number; step: number; fallback: number }[] }> = {
  noise: { title: "Color noise", controls: [{ key: "amount", label: "Intensity", min: 0, max: 1, step: 0.01, fallback: 0.2 }, { key: "scale", label: "Scale", min: 0.01, max: 0.3, step: 0.01, fallback: 0.08 }] },
  grain: { title: "Film grain", controls: [{ key: "amount", label: "Intensity", min: 0, max: 1, step: 0.01, fallback: 0.2 }, { key: "scale", label: "Grain size", min: 0.01, max: 1, step: 0.01, fallback: 0.5 }] },
  contrast: { title: "Contrast", controls: [{ key: "amount", label: "Strength", min: -0.8, max: 1, step: 0.01, fallback: 0.2 }] },
  saturation: { title: "Saturation", controls: [{ key: "amount", label: "Color", min: 0, max: 2, step: 0.01, fallback: 1 }] },
  brightness: { title: "Brightness", controls: [{ key: "amount", label: "Exposure", min: -0.5, max: 0.5, step: 0.01, fallback: 0 }] },
  hue: { title: "Hue shift", controls: [{ key: "amount", label: "Rotation", min: -180, max: 180, step: 1, fallback: 0 }] },
  blur: { title: "Soft focus", controls: [{ key: "amount", label: "Radius", min: 0, max: 12, step: 1, fallback: 0 }] },
  vignette: { title: "Vignette", controls: [{ key: "amount", label: "Falloff", min: 0, max: 1, step: 0.01, fallback: 0.2 }] },
  posterize: { title: "Color levels", controls: [{ key: "amount", label: "Levels", min: 2, max: 16, step: 1, fallback: 6 }] },
  warp: { title: "Flow warp", controls: [{ key: "amount", label: "Strength", min: 0, max: 1, step: 0.01, fallback: 0.2 }, { key: "scale", label: "Frequency", min: 0.01, max: 0.4, step: 0.01, fallback: 0.08 }] },
  cellular: { title: "Cellular", controls: [{ key: "amount", label: "Blend", min: 0, max: 1, step: 0.01, fallback: 0.3 }, { key: "scale", label: "Cell size", min: 0.01, max: 0.3, step: 0.01, fallback: 0.07 }] }
};

const effectTypes = Object.keys(effectInfo) as EffectType[];
const palette: Record<string, string> = {
  marble: "swatch-marble", paper: "swatch-paper", stone: "swatch-stone",
  circuit: "swatch-circuit", frost: "swatch-frost", solar: "swatch-solar"
};

function safeCloneEffects(effects: EffectConfig[]) {
  return effects.map((effect) => ({ ...effect }));
}

function App() {
  const [source, setSource] = useState<ImageFrame>(() => createDemoFrame());
  const [sourceName, setSourceName] = useState("Procedural study");
  const [hasUploadedImage, setHasUploadedImage] = useState(false);
  const [sourceImageBlob, setSourceImageBlob] = useState<Blob | null>(null);
  const [sourceImageChanged, setSourceImageChanged] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 720, height: 480 });
  const [processed, setProcessed] = useState<ImageFrame>(() => createDemoFrame());
  const [effects, setEffects] = useState<EffectConfig[]>([{ type: "noise", amount: 0.12, scale: 0.5 }]);
  const [seed, setSeed] = useState(217);
  const [history, setHistory] = useState<{ effects: EffectConfig[]; seed: number }[]>([]);
  const [selectedEffect, setSelectedEffect] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>();
  const [projectName, setProjectName] = useState("Untitled texture");
  const [compareAt, setCompareAt] = useState(50);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveInProgress = useRef(false);
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const originalCanvas = useRef<HTMLCanvasElement>(null);
  const resultCanvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listPresets(), listProjects()]).then(([nextPresets, nextProjects]) => {
      if (cancelled) return;
      setPresets(nextPresets);
      setProjects(nextProjects);
      setNotice("");
      let lastProjectId: string | null = null;
      try { lastProjectId = window.localStorage.getItem("textureforge:active-project"); } catch { /* Browser storage can be disabled. */ }
      if (lastProjectId) void open({ id: lastProjectId } as Project);
    }).catch(() => {
      if (!cancelled) setNotice("Could not reach the TextureForge API. Check that the backend is running.");
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    paintFrame(originalCanvas.current, source);
  }, [source]);

  useEffect(() => {
    let cancelled = false;
    setProcessing(true);
    const timer = window.setTimeout(() => {
      try {
        const next = processImage(source, effects, seed);
        if (!cancelled) setProcessed(next);
      } catch {
        if (!cancelled) setNotice("The current effect could not be processed. Try reducing its intensity.");
      } finally {
        if (!cancelled) setProcessing(false);
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [source, effects, seed]);

  useEffect(() => {
    paintFrame(resultCanvas.current, processed);
  }, [processed]);

  const active = effects[selectedEffect];
  const selectedInfo = active ? effectInfo[active.type] : null;
  const aspect = `${source.width} / ${source.height}`;

  const remember = () => setHistory((items) => [...items.slice(-24), { effects: safeCloneEffects(effects), seed }]);

  const reloadProjects = async () => setProjects(await listProjects());

  const handleUpload = async (file?: File) => {
    if (!file) return;
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        throw new Error("Choose a PNG, JPEG, or WebP image.");
      }
      const next = await decodeImage(file);
      setSource(next);
      setSourceName(file.name);
      setSourceImageBlob(file);
      setSourceImageChanged(true);
      setHasUploadedImage(true);
      setDimensions({ width: next.width, height: next.height });
      setNotice(`${next.width} × ${next.height} image loaded. Save the project to keep its original image in this browser.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The selected image could not be opened.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const applyPreset = (preset: Preset) => {
    remember();
    setEffects(safeCloneEffects(preset.effects).map((effect) => ({ ...effect, enabled: true })));
    setSelectedEffect(0);
    setSelectedPreset(preset.id);
    setSeed((preset.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) * 97) % 2147483647);
    setNotice(`${preset.name} applied.`);
  };

  const updateEffect = (index: number, update: Partial<EffectConfig>) => {
    remember();
    setEffects((items) => items.map((effect, at) => at === index ? { ...effect, ...update } : effect));
    setSelectedPreset(null);
  };

  const addEffect = (type: EffectType) => {
    remember();
    setEffects((items) => [...items, { type, amount: effectInfo[type].controls[0].fallback, enabled: true }]);
    setSelectedEffect(effects.length);
    setSelectedPreset(null);
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setEffects(safeCloneEffects(previous.effects));
    setSeed(previous.seed);
    setHistory((items) => items.slice(0, -1));
    setSelectedEffect((index) => Math.min(index, Math.max(0, previous.effects.length - 1)));
    setSelectedPreset(null);
  };

  const reset = () => {
    remember();
    setEffects([]);
    setSeed(217);
    setSelectedEffect(0);
    setSelectedPreset(null);
    setNotice("Effects reset. The source image is unchanged.");
  };

  const randomize = () => {
    const nextSeed = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
    remember();
    setEffects(randomizeEffects(effects, nextSeed));
    setSeed(nextSeed);
    setSelectedPreset(null);
    setNotice(`Randomized with seed ${nextSeed}.`);
  };

  const exportPng = () => {
    try {
      const safeName = (projectName.trim() || "textureforge").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "");
      downloadPng(processed, `${safeName || "textureforge"}.png`);
      setNotice(`Exported full-resolution PNG · ${processed.width} × ${processed.height}.`);
    } catch {
      setNotice("PNG export failed. Try a smaller source image or another browser.");
    }
  };

  const save = async () => {
    if (saveInProgress.current) return;
    if (!projectName.trim()) { setNotice("Give this project a name before saving."); return; }
    saveInProgress.current = true;
    setSaving(true);
    try {
      const saved = await saveProjectWorkflow({
        id: activeProjectId,
        name: projectName.trim(),
        width: dimensions.width,
        height: dimensions.height,
        effects: safeCloneEffects(effects),
        randomSeed: seed
      }, sourceImageBlob ? {
        blob: sourceImageBlob,
        fileName: sourceName,
        replaceExisting: !activeProjectId || sourceImageChanged
      } : undefined);
      setActiveProjectId(saved.id);
      try { window.localStorage.setItem("textureforge:active-project", saved.id); } catch { /* Opening from the project list still works. */ }
      setProjectName(saved.name);
      setProjects((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      setSourceImageChanged(false);
      setNotice(sourceImageBlob ? "Project, original image, effects, and random seed saved in this browser." : "Project settings and random seed saved. No uploaded source image is attached to this project.");
    } catch (error) {
      if (error instanceof ProjectSaveRecoveryError) {
        setActiveProjectId(error.project.id);
        setProjectName(error.project.name);
        setProjects((items) => [error.project, ...items.filter((item) => item.id !== error.project.id)]);
        try { window.localStorage.setItem("textureforge:active-project", error.project.id); } catch { /* The project list still allows retrying. */ }
      }
      setNotice(error instanceof Error ? `Project save failed: ${error.message}` : "Project save failed. Check the API connection and try again.");
    } finally {
      saveInProgress.current = false;
      setSaving(false);
    }
  };

  async function open(project: Project) {
    try {
      const saved = await getProject(project.id);
      const latestRecipe = [...(saved.recipes ?? [])].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
      let storedImage: StoredProjectImage | undefined;
      let imageReadError: Error | undefined;
      try { storedImage = await getProjectImage(saved.id); }
      catch (error) { imageReadError = error instanceof Error ? error : new Error("Local image storage is unavailable."); }
      let restoredFrame: ImageFrame | undefined;
      if (storedImage) {
        try { restoredFrame = await decodeImage(storedImage.blob); }
        catch (error) { imageReadError = error instanceof Error ? error : new Error("The local source image could not be decoded."); }
      }
      setActiveProjectId(saved.id);
      try { window.localStorage.setItem("textureforge:active-project", saved.id); } catch { /* Opening from the project list still works. */ }
      setProjectName(saved.name);
      setDimensions({ width: restoredFrame?.width ?? saved.width, height: restoredFrame?.height ?? saved.height });
      if (restoredFrame && storedImage) {
        setSource(restoredFrame);
        setSourceImageBlob(storedImage.blob);
        setSourceImageChanged(false);
        setSourceName(storedImage.fileName);
        setHasUploadedImage(true);
      } else {
        setSource(createDemoFrame());
        setSourceImageBlob(null);
        setSourceImageChanged(false);
        setSourceName("Procedural study");
        setHasUploadedImage(false);
      }
      if (latestRecipe) {
        setEffects(safeCloneEffects(latestRecipe.effects));
        setSeed(latestRecipe.randomSeed ?? 217);
        setSelectedEffect(0);
      }
      setHistory([]);
      setSelectedPreset(null);
      setNotice(imageReadError
        ? `Settings opened, but the local image could not be restored: ${imageReadError.message}`
        : storedImage ? "Project, original image, effects, and random seed opened." : "Settings opened, but this project has no local source image. Upload the original image to continue editing it.");
    } catch {
      setNotice("Could not open this project. Check the API connection.");
    }
  }

  const remove = async (project: Project) => {
    if (!window.confirm(`Delete “${project.name}” and its saved effect settings?`)) return;
    let storedImage: StoredProjectImage | undefined;
    let storageCleanupError: Error | undefined;
    try {
      try {
        storedImage = await getProjectImage(project.id);
        await deleteProjectImage(project.id);
      } catch (error) {
        storageCleanupError = error instanceof Error ? error : new Error("Browser image storage is unavailable.");
      }
      try { await deleteProject(project.id); }
      catch (error) {
        if (!storageCleanupError && storedImage) {
          try { await saveProjectImage(project.id, storedImage.blob, storedImage.fileName); }
          catch (restoreError) {
            const restoreMessage = restoreError instanceof Error ? restoreError.message : "The browser could not restore the source image.";
            const deleteMessage = error instanceof Error ? error.message : "The API could not delete the project.";
            throw new Error(`${deleteMessage} The local source image could not be restored: ${restoreMessage}`);
          }
        }
        throw error;
      }
      if (activeProjectId === project.id) {
        setActiveProjectId(undefined);
        setProjectName("Untitled texture");
        try { window.localStorage.removeItem("textureforge:active-project"); } catch { /* Ignore unavailable browser storage. */ }
      }
      await reloadProjects();
      setNotice(storageCleanupError
        ? `Project and saved settings deleted, but the local image could not be cleaned up: ${storageCleanupError.message}`
        : "Project, saved settings, and local source image deleted.");
    } catch (error) {
      setNotice(error instanceof Error ? `Delete failed: ${error.message}` : "Delete failed. Check the API connection and try again.");
    }
  };

  const outputSummary = useMemo(() => `${processed.width} × ${processed.height}`, [processed]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="TextureForge home"><span className="brand-mark">T</span><span>texture<span className="brand-accent">forge</span></span></a>
        <div className="topbar-center"><span className="live-dot" /> IMAGE LAB <span className="topbar-divider">/</span> {activeProjectId ? "SAVED PROJECT" : "UNTITLED SESSION"}</div>
        <div className="topbar-actions"><button className="quiet-button" onClick={undo} disabled={!history.length} title="Undo last change">↶ <span>Undo</span></button><button className="quiet-button" onClick={reset}>Reset</button><button className="primary-button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save project"}</button></div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <section className="side-section">
            <div className="section-heading"><span>PROJECT</span><span className="section-count">{projects.length.toString().padStart(2, "0")}</span></div>
            <label className="field-label" htmlFor="project-name">Project name</label>
            <input id="project-name" className="text-input" value={projectName} maxLength={120} onChange={(event) => setProjectName(event.target.value)} />
            <button className="upload-card" onClick={() => fileInput.current?.click()}>
              <span className="upload-icon">↑</span><span><strong>Upload image</strong><small>PNG, JPG, WebP · up to 8192 px</small></span>
            </button>
            <input ref={fileInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleUpload(event.target.files?.[0])} />
            <div className="source-info"><span className="source-indicator" /> <span className="source-name" title={sourceName}>{sourceName}</span><span>{source.width}×{source.height}</span></div>
            <div className="privacy-note">Original images stay in this browser. Project settings are stored in the database.</div>
          </section>

          <section className="side-section saved-section">
            <div className="section-heading"><span>SAVED PROJECTS</span><button className="refresh-button" onClick={() => void reloadProjects()} aria-label="Refresh saved projects">↻</button></div>
            {projects.length === 0 ? <p className="empty-copy">Your saved projects will appear here.</p> : <div className="project-list">{projects.map((project) => (
              <div className={`project-row ${project.id === activeProjectId ? "project-row-active" : ""}`} key={project.id}>
                <button className="project-open" onClick={() => void open(project)}><span className="project-glyph">▧</span><span className="project-row-copy"><strong>{project.name}</strong><small>{project.width} × {project.height}</small></span></button>
                <button className="delete-button" onClick={() => void remove(project)} aria-label={`Delete ${project.name}`} title="Delete project">×</button>
              </div>
            ))}</div>}
          </section>

          <div className="sidebar-footer"><span className="api-status-dot" /> API · PORT 3001</div>
        </aside>

        <main className="editor-main" id="top">
          <div className="editor-heading"><div><div className="eyebrow">MATERIAL WORKSPACE <span>·</span> {hasUploadedImage ? "LOCAL IMAGE" : "GENERATIVE CANVAS"}</div><h1>Texture editor</h1><p>Build, compare, and export a material study.</p></div><div className="canvas-meta"><span className="meta-tag">{outputSummary}</span><span className="meta-tag">SEED {seed}</span></div></div>

          <section className="preset-section" aria-label="Texture presets"><div className="section-heading"><span>START WITH A PRESET</span><span className="muted-count">{presets.length} MATERIALS</span></div><div className="preset-grid">{presets.map((preset) => (
            <button key={preset.id} className={`preset-card ${selectedPreset === preset.id ? "preset-selected" : ""}`} onClick={() => applyPreset(preset)}>
              <span className={`preset-swatch ${palette[preset.id] ?? "swatch-default"}`}><i /><i /><i /></span><span className="preset-name">{preset.name}</span><span className="preset-arrow">↗</span>
            </button>
          ))}</div></section>

          <section className="canvas-panel">
            <div className="canvas-toolbar"><div className="canvas-file"><span className="file-icon">▧</span><span>{sourceName}</span><span className="file-size">{source.width} × {source.height}</span></div><div className="canvas-actions"><button className="icon-button" onClick={randomize} title="Randomize effects">⤨ <span>Randomize</span></button><button className="export-button" onClick={exportPng}>↓ <span>Export PNG</span></button></div></div>
            <div className="compare-stage" style={{ aspectRatio: aspect }}>
              <canvas ref={originalCanvas} className="compare-image original-image" aria-label="Original image preview" />
              <canvas ref={resultCanvas} className="compare-image result-image" style={{ clipPath: `inset(0 0 0 ${compareAt}%)` }} aria-label="Processed image preview" />
              <div className="compare-divider" style={{ left: `${compareAt}%` }}><span>↔</span></div>
              <span className="compare-label compare-before">BEFORE</span><span className="compare-label compare-after">AFTER</span>
              {processing && <div className="processing-pill"><span className="spinner" /> Processing</div>}
              {!hasUploadedImage && activeProjectId && <div className="reupload-pill">Source image unavailable · upload it to continue</div>}
            </div>
            <div className="comparison-control"><span>BEFORE</span><input aria-label="Before and after comparison" type="range" min="0" max="100" value={compareAt} onChange={(event) => setCompareAt(Number(event.target.value))} /><span>AFTER</span><span className="compare-value">{compareAt}%</span></div>
          </section>

          <div className="notice-line" role="status">{notice || <span>Tip: drag the divider to compare the source and processed image.</span>}</div>
        </main>

        <aside className="inspector">
          <div className="inspector-header"><div><div className="eyebrow">ADJUSTMENT STACK</div><h2>Effects</h2></div><span className="effect-count">{effects.length.toString().padStart(2, "0")}</span></div>
          <div className="effect-stack">{effects.length === 0 ? <div className="no-effects">No effects yet.<br /><span>Add one below or choose a preset.</span></div> : effects.map((effect, index) => (
            <div className={`effect-row ${index === selectedEffect ? "effect-row-selected" : ""}`} key={`${effect.type}-${index}`}>
              <button className="effect-select" onClick={() => setSelectedEffect(index)}><span className="effect-index">{String(index + 1).padStart(2, "0")}</span><span>{effectInfo[effect.type].title}</span></button>
              <button className={`effect-toggle ${effect.enabled === false ? "effect-off" : ""}`} aria-label={`${effect.enabled === false ? "Enable" : "Disable"} ${effectInfo[effect.type].title}`} onClick={() => updateEffect(index, { enabled: effect.enabled === false })}><span /></button>
              <button className="effect-remove" aria-label={`Remove ${effectInfo[effect.type].title}`} onClick={() => { remember(); setEffects((items) => items.filter((_, at) => at !== index)); setSelectedEffect(Math.max(0, Math.min(selectedEffect, effects.length - 2))); setSelectedPreset(null); }}>×</button>
            </div>
          ))}</div>
          <div className="add-effect-row"><select aria-label="Add effect" value="" onChange={(event) => { if (event.target.value) addEffect(event.target.value as EffectType); }}><option value="" disabled>＋ Add effect</option>{effectTypes.map((type) => <option value={type} key={type}>{effectInfo[type].title}</option>)}</select></div>
          {active && selectedInfo && <div className="effect-settings"><div className="settings-heading"><span>SELECTED EFFECT</span><span>{String(selectedEffect + 1).padStart(2, "0")}</span></div><h3>{selectedInfo.title}</h3>{selectedInfo.controls.map((control) => {
            const value = Number(active[control.key] ?? control.fallback);
            return <label className="slider-control" key={control.key}><span><span>{control.label}</span><strong>{control.step >= 1 ? value.toFixed(0) : value.toFixed(2)}</strong></span><input type="range" min={control.min} max={control.max} step={control.step} value={value} onChange={(event) => updateEffect(selectedEffect, { [control.key]: Number(event.target.value) })} /></label>;
          })}</div>}
          <div className="seed-control"><div className="settings-heading"><span>RANDOM SEED</span><button onClick={randomize}>ROLL ↗</button></div><div className="seed-display"><span>#{String(seed).padStart(8, "0")}</span><span className="seed-lock">LOCKED</span></div></div>
          <div className="inspector-footer"><button className="reset-link" onClick={reset}>Reset all effects</button><span>NON-DESTRUCTIVE EDIT</span></div>
        </aside>
      </div>
      <footer className="bottom-bar"><span>TEXTUREFORGE <span className="footer-dot">●</span> EDITOR</span><span>LOCAL PROCESSING · IMAGES STORED IN THIS BROWSER</span><span>PNG · FULL RESOLUTION</span></footer>
    </div>
  );
}

export default App;
